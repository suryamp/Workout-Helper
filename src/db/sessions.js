// ══════════════════════════════════════════
//  src/db/sessions.js
//  In-session set-log staging buffer, atomic session flush, and all
//  active/completed session CRUD.
//
//  The _pending buffer accumulates set-logs during a workout.  It is
//  flushed atomically to IDB by completeSession() in a single transaction
//  spanning setLogs + activeSessions + completedSessions.
// ══════════════════════════════════════════

import { getLogicalDay as _getLogicalDay } from '../utils/time.js';
import { capture, Events }                from '../telemetry.js';
import { BACKUP_KEY }                     from './recovery.js';
import {
  STORE_LOGS,
  STORE_ACTIVE,
  STORE_COMPLETED,
  _requireDB,
  _idbWrite,
  _promisify,
} from './connection.js';

// ─── In-session accumulation ─────────────────────────────────────────────────

/**
 * In-memory accumulator: set-logs for the workout currently in progress.
 * Keyed by `${day}-${stepIdx}-${partIdx}` (uid). Flushed atomically in
 * completeSession(); discarded by abandonSession().
 * @type {Record<string, object>}
 */
const _pending = {};

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
  }).catch(err => {
    // IDB transaction failed — back up to localStorage so recoverIfNeeded()
    // can replay this session on the next startup. Data is never silently lost.
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        day,
        session,
        logs: toFlush,
        ts:   Date.now(),
      }));
      capture(Events.SESSION_BACKUP, { day, error: err?.message });
    } catch { /* localStorage also unavailable — nothing we can do */ }
    throw err;
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
