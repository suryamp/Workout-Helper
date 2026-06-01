// ══════════════════════════════════════════
//  src/db/recovery.js
//  Last-resort session recovery from localStorage backup.
//
//  When completeSession()'s IDB transaction fails, it writes the session
//  and its staged logs to localStorage under BACKUP_KEY before re-throwing.
//  On the next startup, recoverIfNeeded() reads that backup and replays it
//  to IDB.  On success the backup is cleared; on failure it is kept so the
//  next startup can try again.
//
//  This module deliberately has no import from sessions.js to avoid circular
//  dependencies.  It accesses IDB directly via connection.js helpers.
// ══════════════════════════════════════════

import { capture, Events } from '../telemetry.js';
import {
  STORE_LOGS,
  STORE_ACTIVE,
  STORE_COMPLETED,
  _requireDB,
} from './connection.js';

export const BACKUP_KEY = 'wt_session_backup';

/**
 * Check localStorage for a backed-up session from a previous failed
 * completeSession() call and, if one exists, replay it to IDB atomically.
 *
 * Safe to call on every startup: is a no-op when no backup exists.
 * Keeps the backup intact on failure so subsequent startups can retry.
 *
 * @returns {Promise<boolean>} true if no backup existed OR recovery succeeded
 */
export async function recoverIfNeeded() {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) return true;

  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    // Corrupt backup — can't recover, discard it.
    localStorage.removeItem(BACKUP_KEY);
    capture(Events.RECOVERY_FAILED, { reason: 'corrupt_backup' });
    return false;
  }

  try {
    const { day, session, logs } = backup;
    const db = _requireDB();

    await new Promise((resolve, reject) => {
      const txn = db.transaction(
        [STORE_LOGS, STORE_ACTIVE, STORE_COMPLETED],
        'readwrite'
      );

      const logStore       = txn.objectStore(STORE_LOGS);
      const activeStore    = txn.objectStore(STORE_ACTIVE);
      const completedStore = txn.objectStore(STORE_COMPLETED);

      for (const entry of logs) logStore.add(entry);
      activeStore.delete(session.logicalDay);
      completedStore.put(session);

      txn.oncomplete = resolve;
      txn.onerror    = () => reject(txn.error);
      txn.onabort    = () => reject(txn.error ?? new Error('recovery transaction aborted'));
    });

    localStorage.removeItem(BACKUP_KEY);
    capture(Events.SESSION_RECOVERED, { day, logicalDay: backup.session?.logicalDay });
    console.info(`[recovery] Recovered backed-up session for day "${day}".`);
    return true;
  } catch (err) {
    // Keep the backup — we'll try again next startup.
    capture(Events.RECOVERY_FAILED, { reason: err.message });
    console.warn('[recovery] Failed to recover backed-up session:', err);
    return false;
  }
}
