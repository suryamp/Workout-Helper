// ══════════════════════════════════════════
//  src/db/connection.js
//  IDBDatabase singleton, schema definition, seeding, and low-level helpers.
//  All other db/ modules import _requireDB, _idbWrite, _promisify, and the
//  STORE_* constants from here rather than opening their own connections.
// ══════════════════════════════════════════

import { EXERCISES } from '../data/exercises.js';

// ─── Schema constants ────────────────────────────────────────────────────────

const DB_NAME    = 'WorkoutDB';
const SCHEMA_VER = 1;

export const STORE_LOGS      = 'setLogs';
export const STORE_ACTIVE    = 'activeSessions';
export const STORE_COMPLETED = 'completedSessions';

// ─── Singleton ───────────────────────────────────────────────────────────────

/** @type {IDBDatabase|null} */
let _db = null;

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
      const txn = event.target.transaction;

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
  const dateISO     = seedDate.toISOString();
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
export function _idbWrite(db, storeName, fn) {
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
export function _promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Return the cached db or throw if initDB() was not awaited. */
export function _requireDB() {
  if (!_db) throw new Error('[WorkoutDB] call initDB() first');
  return _db;
}
