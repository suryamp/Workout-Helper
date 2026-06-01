// ══════════════════════════════════════════
//  src/telemetry.js
//  Structured event capture for debugging and error tracking.
//
//  Design constraints:
//    - localStorage-backed so it works even when IDB is unavailable.
//    - Circular buffer (MAX_ENTRIES) so storage never grows unbounded.
//    - Non-blocking: capture() is synchronous and never throws.
//    - No external service: data stays on-device.
//
//  Usage:
//    initTelemetry()                    — wire global error handlers (call once in boot)
//    capture(Events.IDB_FAILURE, {...}) — record a structured event
//    getLog()                           — retrieve entries for debugging
//    clearLog()                         — clear the log
// ══════════════════════════════════════════

const STORAGE_KEY = 'wt_telemetry';
const MAX_ENTRIES = 100;

export const Events = Object.freeze({
  ERROR:              'error',
  IDB_INIT_FAILURE:   'idb_init_failure',
  IDB_WRITE_FAILURE:  'idb_write_failure',
  SESSION_BACKUP:     'session_backup',
  SESSION_RECOVERED:  'session_recovered',
  RECOVERY_FAILED:    'recovery_failed',
  SESSION_STARTED:    'session_started',
  SESSION_COMPLETED:  'session_completed',
  SESSION_ABANDONED:  'session_abandoned',
  LEVEL_UP:           'level_up',
});

/**
 * Wire up global error handlers. Call once during app boot, before initDB().
 * Captures unhandled exceptions and unhandled promise rejections.
 */
export function initTelemetry() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (e) => {
    capture(Events.ERROR, {
      message: e.message,
      source:  e.filename,
      line:    e.lineno,
      stack:   e.error?.stack?.slice(0, 500),
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    capture(Events.ERROR, {
      message: String(e.reason?.message ?? e.reason),
      stack:   e.reason?.stack?.slice(0, 500),
      type:    'unhandledrejection',
    });
  });
}

/**
 * Record a structured event. Silent on all errors — telemetry must never
 * interfere with the application's happy path.
 *
 * @param {string} event  — one of Events.*
 * @param {object} [data] — arbitrary context (keep small)
 */
export function capture(event, data = {}) {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries = _read();
    entries.push({
      event,
      data,
      ts: Date.now(),
    });
    // Trim oldest entries to stay within the cap.
    const trimmed = entries.length > MAX_ENTRIES
      ? entries.slice(entries.length - MAX_ENTRIES)
      : entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — best effort, drop silently.
  }
}

/**
 * Return all captured telemetry entries, oldest first.
 * @returns {{ event: string, data: object, ts: number }[]}
 */
export function getLog() {
  return _read();
}

/** Clear all telemetry entries. */
export function clearLog() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function _read() {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
