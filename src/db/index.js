// ══════════════════════════════════════════
//  src/db/index.js — Public API barrel
//
//  All callers outside db/ import from here.
//  Internal sub-modules:
//    connection.js — IDB singleton, schema, helpers
//    sessions.js   — staging buffer, session CRUD, atomic flush
//    logs.js       — progression data, history queries
// ══════════════════════════════════════════

export { initDB }                           from './connection.js';

export {
  stageSetLog,
  abandonSession,
  completeSession,
  getActiveSessions,
  putActiveSession,
  deleteActiveSession,
  getCompletedSessions,
  putCompletedSession,
}                                           from './sessions.js';

export {
  getProgressionData,
  getHistory,
  deleteHistoryEntry,
  getSessionHistory,
  getLogsForSession,
  deleteSession,
  computeVolume,
}                                           from './logs.js';

export { recoverIfNeeded }                  from './recovery.js';
