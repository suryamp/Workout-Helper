// ══════════════════════════════════════════
//  src/db/index.js — IndexedDB layer for Workout Tracker
//
//  Public API (all async):
//    initDB()                          → Promise<IDBDatabase>
//    getProgressionData(exerciseKey)   → Promise<ProgressionResult>
//    stageSetLog(day, entry)           → void  (synchronous, in-memory)
//    completeSession(day, session)     → Promise<void>
//    abandonSession(day)               → void  (synchronous, in-memory)
//    getActiveSessions()               → Promise<Record<string, Session>>
//    putActiveSession(session)         → Promise<void>
//    deleteActiveSession(logicalDay)   → Promise<void>
//    getCompletedSessions()            → Promise<Session[]>
//    putCompletedSession(session)      → Promise<void>
//    getHistory(opts?)                 → Promise<SetLog[]>
//    deleteHistoryEntry(id)            → Promise<void>
// ══════════════════════════════════════════

import { getLogicalDay as _getLogicalDay } from '../utils/time.js';
import { EXERCISES }                       from '../data/exercises.js';

// ─── Schema constants ────────────────────────────────────────────────────────

const DB_NAME      = 'WorkoutDB';
const SCHEMA_VER   = 1;

// Object store names
const STORE_LOGS      = 'setLogs';       // one document per exercise-per-session
const STORE_ACTIVE    = 'activeSessions';
const STORE_COMPLETED = 'completedSessions';

// ─── Module-level state ──────────────────────────────────────────────────────

/** @type {IDBDatabase|null} */
let _db = null;

/**
 * In-memory accumulator: set-logs for the workout currently in progress.
 * Keyed by `${day}-${stepIdx}-${partIdx}` (uid). Flushed atomically in
 * completeSession(); discarded by abandonSession().
 * @type {Record<string, object>}
 */
const _pending = {};

// ─── initDB ─────────────────────────────────────────────────────────────────

/**
 * Open (or create) the database and seed defaults for new installs.
 * Safe to call multiple times — returns the same cached connection.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VER);

    req.onblocked = () => {
      console.warn('[WorkoutDB] upgrade blocked — another tab may be open');
    };

    // ── onupgradeneeded: schema migrations ─────────────────────────────────
    //
    //  To add schema v2 in future:
    //    1. Bump SCHEMA_VER to 2.
    //    2. Add an `if (event.oldVersion < 2) { ... }` block below the v1
    //       block — never modify the v1 block, so users upgrading from v1
    //       only run the v2 delta.
    //    3. Use `event.target.transaction` (the implicit upgrade txn) for
    //       any store/index creation; IDB will chain them in one atomic upgrade.
    //
    req.onupgradeneeded = (event) => {
      const db  = event.target.result;
      const txn = event.target.transaction; // the implicit upgrade transaction

      // ── v1 schema ──────────────────────────────────────────────────────
      if (event.oldVersion < 1) {
        // setLogs store
        //
        //  Primary key: auto-increment integer `id`
        //    (stable across exercise renames / deletes — history is never
        //    corrupted if an exercise is renamed or removed from EXERCISES)
        //
        //  Indexes:
        //    by_exercise_date  — compound [exerciseKey, date]  → supports
        //                        "last N logs for exercise X" efficiently.
        //    by_day            — single field                  → supports
        //                        "all logs for session day Y".
        //    by_date           — single field                  → supports
        //                        global newest-first listing.
        //    by_seeded         — single field (sparse)         → filter out
        //                        seed entries from the history view.
        //
        //  NOTE: exerciseKey is stored verbatim at log-time. If an exercise
        //  is later renamed in EXERCISES, old logs retain the old key but
        //  remain queryable. A future exercise-CRUD feature should issue a
        //  cursor update across old keys on rename, but old logs will never
        //  be silently lost.
        //
        const logStore = db.createObjectStore(STORE_LOGS, {
          keyPath:       'id',
          autoIncrement: true,
        });
        logStore.createIndex('by_exercise_date', ['exerciseKey', 'date'], { unique: false });
        logStore.createIndex('by_day',    'day',    { unique: false });
        logStore.createIndex('by_date',   'date',   { unique: false });
        logStore.createIndex('by_seeded', 'seeded', { unique: false });

        // activeSessions store
        //  Primary key: `logicalDay` (YYYY-MM-DD string, the shifted date key).
        //  At most one active session per logical day.
        db.createObjectStore(STORE_ACTIVE, { keyPath: 'logicalDay' });

        // completedSessions store
        //  Primary key: `startedAt` (ms timestamp, unique per session).
        //  Index by completedAt for sorting. Capped at 365 entries via
        //  completeSession().
        const cStore = db.createObjectStore(STORE_COMPLETED, { keyPath: 'startedAt' });
        cStore.createIndex('by_completedAt', 'completedAt', { unique: false });

        // Seed one synthetic set-log per exercise so that getProgressionData()
        // has a lastWeight to suggest on a fresh install.
        // Dated 7 days in the past so real entries always sort newer.
        _seedDefaultWeights(txn);
      }

      // ── v2 delta would go here ─────────────────────────────────────────
      // if (event.oldVersion < 2) { ... }
    };

    req.onsuccess = (event) => {
      _db = event.target.result;

      _db.onversionchange = () => {
        _db.close();
        _db = null;
        console.warn('[WorkoutDB] version change — connection closed');
      };

      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── Seed helpers (called inside onupgradeneeded) ────────────────────────────

/**
 * Write one synthetic set-log per exercise into the upgrade transaction.
 *
 * @param {IDBTransaction} txn  — the implicit upgrade transaction
 */
function _seedDefaultWeights(txn) {
  const store       = txn.objectStore(STORE_LOGS);
  const seedDate    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // ISO string so the by_exercise_date compound index sorts correctly.
  const dateISO     = seedDate.toISOString();
  // Locale string preserved for display.
  const dateDisplay = seedDate.toLocaleString();

  for (const [key, ex] of Object.entries(EXERCISES)) {
    if (!ex.progression || ex.defaultWeight == null) continue;
    const w          = ex.defaultWeight;
    const numSets    = ex.sets ?? 3;
    const targetReps = ex.progression.targetReps;
    const sets = Array.from({ length: numSets }, () => ({
      weight: String(w),
      reps:   String(targetReps - 1),   // one below target → no false streak
    }));

    store.add({
      exerciseKey:  key,
      exerciseName: ex.displayName,
      uid:          `seed-${key}`,
      day:          'seed',
      sets,
      date:         dateISO,
      dateDisplay,
      seeded:       true,
    });
  }
}

// ─── Low-level IDB helpers ───────────────────────────────────────────────────

/**
 * Open a readwrite transaction on `storeName`, pass the store to `fn`,
 * and return a promise that resolves when the transaction commits.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @param {(store: IDBObjectStore) => void} fn
 */
function _idbWrite(db, storeName, fn) {
  return new Promise((resolve, reject) => {
    const txn   = db.transaction(storeName, 'readwrite');
    const store = txn.objectStore(storeName);
    try {
      fn(store);
    } catch (err) {
      txn.abort();
      return reject(err);
    }
    txn.oncomplete = () => resolve();
    txn.onerror    = () => reject(txn.error);
    txn.onabort    = () => reject(txn.error ?? new Error('Transaction aborted'));
  });
}

/**
 * Wrap a single IDB request in a Promise.
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function _promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Convenience: return the cached db or throw if initDB() was not awaited. */
function _requireDB() {
  if (!_db) throw new Error('[WorkoutDB] call initDB() first');
  return _db;
}

// ─── getProgressionData ──────────────────────────────────────────────────────

/**
 * Read the last N set-logs for `exerciseKey` and compute the suggested weight,
 * streak badge, and level-up flag.
 *
 * @param {string} exerciseKey
 * @returns {Promise<{
 *   suggestedWeight: number|null,
 *   badge: string|null,
 *   levelUp: boolean,
 *   prevWeight?: number,
 *   increment?: number
 * }>}
 */
export async function getProgressionData(exerciseKey) {
  const FALLBACK = { suggestedWeight: null, badge: null, levelUp: false };

  const ex = EXERCISES[exerciseKey];
  if (!ex?.progression) return FALLBACK;

  const db  = _requireDB();
  const cfg = ex.progression;

  // Fetch enough entries to evaluate the streak.
  const FETCH_LIMIT = Math.max(10, cfg.successesNeeded + 5);
  const entries     = await _getRecentLogs(db, exerciseKey, FETCH_LIMIT);
  if (entries.length === 0) return FALLBACK;

  const lastWeight = _sessionWeight(entries[0]);
  const targetReps = cfg.targetReps;

  let streak = 0;
  for (const entry of entries) {
    const allGood  = entry.sets.every(s => parseInt(s.reps) >= targetReps);
    const weightOk = _sessionWeight(entry) >= lastWeight;
    if (allGood && weightOk) streak++;
    else break;
  }

  const needed = cfg.successesNeeded;
  if (streak >= needed && cfg.increment > 0) {
    const newW = lastWeight + cfg.increment;
    return {
      suggestedWeight: newW,
      badge:      `${newW} lbs (${cfg.increment}↑)`,
      levelUp:    true,
      prevWeight: lastWeight,
      increment:  cfg.increment,
    };
  } else if (streak > 0 && needed > 1) {
    return { suggestedWeight: lastWeight, badge: `${lastWeight} lbs · Streak ${streak}/${needed} 🚀`, levelUp: false };
  } else {
    return { suggestedWeight: lastWeight, badge: lastWeight > 0 ? `${lastWeight} lbs` : null, levelUp: false };
  }
}

/**
 * Return the most recent `limit` non-seeded set-logs for `exerciseKey`,
 * newest-first.  Uses the `by_exercise_date` compound index with a key range
 * so IDB does the filtering — no full table scan.
 *
 * @param {IDBDatabase} db
 * @param {string}      exerciseKey
 * @param {number}      limit
 * @returns {Promise<object[]>}
 */
function _getRecentLogs(db, exerciseKey, limit) {
  return new Promise((resolve, reject) => {
    const txn   = db.transaction(STORE_LOGS, 'readonly');
    const index = txn.objectStore(STORE_LOGS).index('by_exercise_date');

    // IDB compound key range for a single exerciseKey: bound on first component only.
    // Lower bound: [exerciseKey, ""] (empty string sorts before any ISO date)
    // Upper bound: [exerciseKey, "\uffff"] (high surrogate sorts after any date)
    const range = IDBKeyRange.bound(
      [exerciseKey, ''],
      [exerciseKey, '\uffff']
    );

    const results = [];
    // prev = descending cursor so we get newest-first.
    const req = index.openCursor(range, 'prev');

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor || results.length >= limit) return resolve(results);
      const entry = cursor.value;
      // Skip seed entries for progression logic — they should never start a streak.
      if (!entry.seeded) results.push(entry);
      cursor.continue();
    };

    req.onerror = () => reject(req.error);
  });
}

/** Canonical weight for an entry: minimum across all sets. */
function _sessionWeight(entry) {
  if (!entry.sets?.length) return 0;
  return Math.min(...entry.sets.map(s => parseFloat(s.weight) || 0));
}

// ─── In-session accumulation ─────────────────────────────────────────────────

/**
 * Buffer a set-log entry for the current workout.  Called by saveAndAdvance()
 * on each Next→ tap instead of writing to IDB immediately.
 *
 * Calling this multiple times with the same `uid` overwrites the previous
 * entry — so going Back and re-advancing is safe (no duplicates).
 *
 * @param {string} day
 * @param {{
 *   exerciseKey: string,
 *   exerciseName: string,
 *   uid: string,
 *   sets: {weight:string, reps:string}[]
 * }} entry
 */
export function stageSetLog(day, entry) {
  if (!entry.sets?.length) return;
  const now = new Date();
  _pending[entry.uid] = {
    exerciseKey:  entry.exerciseKey,
    exerciseName: entry.exerciseName,
    uid:          entry.uid,
    day,
    sets:         entry.sets,
    date:         now.toISOString(),
    dateDisplay:  now.toLocaleString(),
    seeded:       false,
  };
}

/**
 * Discard all pending set-logs for `day` (called by abandonSession()).
 * @param {string} day
 */
export function abandonSession(day) {
  for (const uid of Object.keys(_pending)) {
    if (uid.startsWith(day + '-')) delete _pending[uid];
  }
}

/**
 * Atomically flush all staged set-logs for `day` to IDB, write the completed
 * session record, and remove the active session — all in one transaction
 * spanning all three stores.
 *
 * @param {string} day          — e.g. 'heavy-a'
 * @param {{
 *   logicalDay: string,
 *   day: string,
 *   startedAt: number,
 *   completedAt: number
 * }} session
 * @returns {Promise<void>}
 */
export async function completeSession(day, session) {
  const db      = _requireDB();
  const toFlush = Object.values(_pending).filter(e => e.day === day);

  await new Promise((resolve, reject) => {
    const txn = db.transaction(
      [STORE_LOGS, STORE_ACTIVE, STORE_COMPLETED],
      'readwrite'
    );

    const logStore       = txn.objectStore(STORE_LOGS);
    const activeStore    = txn.objectStore(STORE_ACTIVE);
    const completedStore = txn.objectStore(STORE_COMPLETED);

    // 1. Write all staged set-logs for this session.
    for (const entry of toFlush) {
      logStore.add(entry);   // autoIncrement assigns `id`
    }

    // 2. Move session from active → completed.
    activeStore.delete(session.logicalDay);
    completedStore.put(session);

    // 3. Cap completedSessions at 365.
    //    We do this after the put so the count includes the new entry.
    const countReq = completedStore.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count > 365) {
        const oldest  = completedStore.index('by_completedAt').openCursor(null, 'next');
        let toDelete  = count - 365;
        oldest.onsuccess = (e) => {
          const cur = e.target.result;
          if (!cur || toDelete === 0) return;
          cur.delete();
          toDelete--;
          cur.continue();
        };
      }
    };

    txn.oncomplete = () => {
      // Clear the pending buffer for this day only after a successful commit.
      for (const uid of Object.keys(_pending)) {
        if (uid.startsWith(day + '-')) delete _pending[uid];
      }
      resolve();
    };
    txn.onerror = () => reject(txn.error);
    txn.onabort = () => reject(txn.error ?? new Error('completeSession: transaction aborted'));
  });
}

// ─── Active sessions ─────────────────────────────────────────────────────────

/**
 * Return all active sessions as an object keyed by logicalDay.
 * @returns {Promise<Record<string, object>>}
 */
export async function getActiveSessions() {
  const db    = _requireDB();
  const txn   = db.transaction(STORE_ACTIVE, 'readonly');
  const store = txn.objectStore(STORE_ACTIVE);
  const all   = await _promisify(store.getAll());
  return Object.fromEntries(all.map(s => [s.logicalDay, s]));
}

/**
 * Upsert an active session.
 * @param {{ logicalDay: string, day: string, startedAt: number, completedAt: null }} session
 */
export async function putActiveSession(session) {
  const db = _requireDB();
  await _idbWrite(db, STORE_ACTIVE, store => store.put(session));
}

/**
 * Remove an active session by its logical day key.
 * @param {string} logicalDay
 */
export async function deleteActiveSession(logicalDay) {
  const db = _requireDB();
  await _idbWrite(db, STORE_ACTIVE, store => store.delete(logicalDay));
}

// ─── Completed sessions ──────────────────────────────────────────────────────

/**
 * Return completed sessions newest-first (sorted by completedAt descending).
 * @returns {Promise<object[]>}
 */
export async function getCompletedSessions() {
  const db    = _requireDB();
  const txn   = db.transaction(STORE_COMPLETED, 'readonly');
  const index = txn.objectStore(STORE_COMPLETED).index('by_completedAt');
  const all   = await _promisify(index.getAll());
  return all.sort((a, b) => b.completedAt - a.completedAt);
}

/**
 * Upsert a completed session.  (Used by reconcileStaleSessions().)
 * @param {object} session
 */
export async function putCompletedSession(session) {
  const db = _requireDB();
  // Ensure logicalDay is populated (reconcileStaleSessions may omit it).
  const logicalDay = session.logicalDay ?? _getLogicalDay(session.startedAt);
  await _idbWrite(db, STORE_COMPLETED, store => store.put({ logicalDay, ...session }));
}

// ─── History (set-logs) ──────────────────────────────────────────────────────

/**
 * Return set-log entries for the history screen.
 *
 * @param {{
 *   includeSeeded?: boolean,   // default false
 *   limit?:         number,    // default 40
 *   exerciseKey?:   string,    // filter to one exercise (optional)
 * }} [opts]
 * @returns {Promise<object[]>}  newest-first
 */
export async function getHistory({ includeSeeded = false, limit = 40, exerciseKey } = {}) {
  const db    = _requireDB();
  const txn   = db.transaction(STORE_LOGS, 'readonly');
  const store = txn.objectStore(STORE_LOGS);

  let results;

  if (exerciseKey) {
    results = await _getRecentLogs(db, exerciseKey, limit + (includeSeeded ? 0 : 10));
    if (!includeSeeded) results = results.filter(e => !e.seeded);
    results = results.slice(0, limit);
  } else {
    results = await new Promise((resolve, reject) => {
      const index = store.index('by_date');
      const items = [];
      const req   = index.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return resolve(items);
        const entry = cursor.value;
        if (includeSeeded || !entry.seeded) {
          items.push(entry);
          if (items.length >= limit) return resolve(items);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  return results;
}

/**
 * Delete a single set-log entry by its IDB primary key.
 *
 * @param {number} id — the autoIncrement primary key stored in entry.id
 */
export async function deleteHistoryEntry(id) {
  const db = _requireDB();
  await _idbWrite(db, STORE_LOGS, store => store.delete(id));
}