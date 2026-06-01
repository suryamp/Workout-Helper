// ══════════════════════════════════════════
//  src/state/session.js
//  Session lifecycle: start, complete, abandon, stale reconciliation,
//  next-day rotation.  No DOM access.
// ══════════════════════════════════════════

import { getLogicalDay, endOfLogicalDay } from '../utils/time.js';
import { capture, Events }                from '../telemetry.js';
import { DAY_ROTATION }                   from '../data/days.js';
import {
  getActiveSessions,
  putActiveSession,
  deleteActiveSession,
  getCompletedSessions,
  putCompletedSession,
  completeSession  as dbCompleteSession,
  abandonSession   as dbAbandonSession,
} from '../db/index.js';
import { clearDayState } from './setWidget.js';

// ── Session start ───────────────────────

/**
 * Begin a session for `day` if one hasn't already started today.
 * @param {string} day  e.g. 'heavy-a'
 */
export async function maybeStartSession(day) {
  const sessions   = await getActiveSessions();
  const logicalDay = getLogicalDay();
  if (sessions[logicalDay]) return;
  await putActiveSession({ logicalDay, day, startedAt: Date.now(), completedAt: null });
  capture(Events.SESSION_STARTED, { day });
}

// ── Session complete ────────────────────

/**
 * Mark today's active session completed and flush it to IDB.
 *
 * @param {string} day
 */
export async function completeSession(day) {
  const sessions   = await getActiveSessions();
  const logicalDay = getLogicalDay();
  const session    = sessions[logicalDay];
  // Already completed or no session started — nothing to do.
  if (!session || session.completedAt) return;
  session.completedAt = Date.now();
  // dbCompleteSession flushes staged set-logs + moves active→completed atomically.
  await dbCompleteSession(day, session);
}

// ── Session abandon ─────────────────────

/**
 * Discard all in-progress data for `day` and remove the active session.
 * @param {string} day
 */
export async function abandonSession(day) {
  clearDayState(day);
  dbAbandonSession(day);              // clears the in-memory pending buffer
  const logicalDay = getLogicalDay();
  await deleteActiveSession(logicalDay);
  capture(Events.SESSION_ABANDONED, { day });
}

// ── Stale-session reconciliation ────────

/**
 * On app open, find any active sessions started on a *different* logical day
 * and close them automatically (completedAt = 23:59:59 of the day they started).
 * Safe to call on every visibility:visible event.
 */
export async function reconcileStaleSessions() {
  const sessions = await getActiveSessions();
  const todayKey = getLogicalDay();
  for (const [logicalDay, session] of Object.entries(sessions)) {
    if (getLogicalDay(session.startedAt) !== todayKey) {
      session.completedAt = endOfLogicalDay(session.startedAt);
      await putCompletedSession(session);
      await deleteActiveSession(logicalDay);
    }
  }
}

// ── Next-day rotation ───────────────────

/**
 * Return the day key that should be highlighted on load.
 * Derived from the last completed session; defaults to 'heavy-a'.
 *
 * @returns {Promise<string>}
 */
export async function getNextDay() {
  const completed = await getCompletedSessions();   // newest-first
  if (completed.length === 0) return 'heavy-a';

  const lastDay = completed[0].day;
  const idx     = DAY_ROTATION.indexOf(lastDay);
  if (idx === -1) {
    console.warn(
      `[session] Last completed day "${lastDay}" is not in DAY_ROTATION. ` +
      `Defaulting to heavy-a. If you renamed a day, update DAY_ROTATION to match.`
    );
    return 'heavy-a';
  }
  return DAY_ROTATION[(idx + 1) % DAY_ROTATION.length];
}
