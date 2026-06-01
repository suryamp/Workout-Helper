// ══════════════════════════════════════════
//  src/db/logs.js
//  Set-log queries: progression data computation and workout history.
// ══════════════════════════════════════════

import { EXERCISES }                              from '../data/exercises.js';
import { STORE_LOGS, STORE_COMPLETED, _requireDB, _idbWrite, _promisify } from './connection.js';

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
  if (entries.length === 0) {
    // No real history yet — seed the suggested weight from the exercise definition
    // so the weight chip is pre-filled on a fresh install.
    const w = ex.defaultWeight;
    return { suggestedWeight: w || null, badge: w ? `${w} lbs` : null, levelUp: false };
  }

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

// ─── Session history ─────────────────────────────────────────────────────────

/**
 * Return the `limit` most-recent completed sessions, each bundled with their
 * set-logs (fetched via the by_session index — no join needed) and pre-computed
 * total volume.
 *
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ session: object, logs: object[], volume: number }[]>}
 */
export async function getSessionHistory({ limit = 20 } = {}) {
  const db         = _requireDB();
  const txn        = db.transaction([STORE_LOGS, STORE_COMPLETED], 'readonly');
  const logIndex   = txn.objectStore(STORE_LOGS).index('by_session');
  const sessIndex  = txn.objectStore(STORE_COMPLETED).index('by_completedAt');

  const sessions = await _promisify(sessIndex.getAll());
  sessions.sort((a, b) => b.completedAt - a.completedAt);
  const recent = sessions.slice(0, limit);

  const results = await Promise.all(recent.map(async session => {
    const logs = await _promisify(
      db.transaction(STORE_LOGS, 'readonly')
        .objectStore(STORE_LOGS)
        .index('by_session')
        .getAll(IDBKeyRange.only(session.startedAt))
    );
    const volume = computeVolume(logs);
    return { session, logs, volume };
  }));

  return results;
}

/**
 * Return all set-logs for a single session.
 * @param {number} sessionId — session.startedAt
 * @returns {Promise<object[]>}
 */
export async function getLogsForSession(sessionId) {
  const db = _requireDB();
  return _promisify(
    db.transaction(STORE_LOGS, 'readonly')
      .objectStore(STORE_LOGS)
      .index('by_session')
      .getAll(IDBKeyRange.only(sessionId))
  );
}

/**
 * Atomically delete a completed session and all its set-logs.
 * @param {number} startedAt — session primary key / sessionId
 */
export async function deleteSession(startedAt) {
  const db = _requireDB();
  await new Promise((resolve, reject) => {
    const txn        = db.transaction([STORE_LOGS, STORE_COMPLETED], 'readwrite');
    const logStore   = txn.objectStore(STORE_LOGS);
    const sessStore  = txn.objectStore(STORE_COMPLETED);

    // Delete all logs for this session via cursor on the by_session index.
    const req = logStore.index('by_session').openCursor(IDBKeyRange.only(startedAt));
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };

    sessStore.delete(startedAt);

    txn.oncomplete = resolve;
    txn.onerror    = () => reject(txn.error);
    txn.onabort    = () => reject(txn.error ?? new Error('deleteSession: aborted'));
  });
}

/**
 * Total lifted volume for a set of logs: sum of weight × reps across all sets.
 * Bodyweight exercises (weight 0) are excluded from the total.
 * @param {object[]} logs
 * @returns {number}
 */
export function computeVolume(logs) {
  return logs.reduce((total, log) =>
    total + log.sets.reduce((sum, s) =>
      sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)
    , 0)
  , 0);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

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
    // Upper bound: [exerciseKey, "￿"] (high surrogate sorts after any date)
    const range = IDBKeyRange.bound(
      [exerciseKey, ''],
      [exerciseKey, '￿']
    );

    const results = [];
    const req     = index.openCursor(range, 'prev');

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
