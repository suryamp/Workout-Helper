// ══════════════════════════════════════════
//  src/utils/time.js
//  Pure time helpers shared by session.js and db/index.js.
//  No imports. No side-effects.
//
//  Logical day boundary: 3 am.
//  A workout at 11 pm and one at 2:45 am share the same logical day.
//  3:01 am starts a new one.
// ══════════════════════════════════════════

/**
 * Return the YYYY-MM-DD logical-day key for a given timestamp.
 * Shifts back 3 hours so midnight–2:59 am belongs to the previous calendar day.
 *
 * @param {number} [ms=Date.now()]
 * @returns {string}  e.g. "2025-06-01"
 */
export function getLogicalDay(ms = Date.now()) {
  const d  = new Date(ms - 3 * 60 * 60 * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Return the timestamp (ms) of the last millisecond of the logical day
 * that contains `ms`.  Used to synthesize a completedAt for stale sessions.
 *
 * @param {number} ms
 * @returns {number}
 */
export function endOfLogicalDay(ms) {
  const shifted = ms - 3 * 60 * 60 * 1000;
  const d       = new Date(shifted);
  const next    = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return next.getTime() + 3 * 60 * 60 * 1000 - 1;
}
