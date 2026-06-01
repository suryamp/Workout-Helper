// ══════════════════════════════════════════
//  src/main.js
//  App entry point.
//  1. Boot sequence (initDB → modals → reconcile → render → nav).
//  2. saveAndAdvance / advanceDay / goBack / restartDay workflow.
//  3. window.* exports — the SINGLE authoritative list of globals required
//     by inline onclick= attributes in rendered HTML.
//
//  IMPORTANT: If you add a new inline onclick= handler in render.js,
//  setWidget.js, or anywhere else, its function MUST be added to the
//  Object.assign(window, { ... }) block at the bottom of this file.
//  That block is the only place globals are declared — keep it that way.
// ══════════════════════════════════════════

import { initDB, recoverIfNeeded }       from './db/index.js';
import { initTelemetry, capture, Events } from './telemetry.js';
import { EXERCISES }                     from './data/exercises.js';
import { DAYS }                          from './data/days.js';
import { stageSetLog }                   from './db/index.js';
import {
  maybeStartSession,
  abandonSession,
  reconcileStaleSessions,
  getNextDay,
}                                        from './state/session.js';
import { getState }                       from './state/setWidget.js';
import {
  getVirtualIdx,
  setVirtualIdx,
  renderDay,
}                                        from './ui/render.js';
import {
  startTimer,
  customTimer,
  closeCustomTimerModal,
  getSmartTimer,
}                                        from './ui/timer.js';
import {
  initWeightModal,
  initCustomTimerModal,
  initRestartModal,
  openWeightModal  as _openWeightModal,
  closeWeightModal,
  openRestartModal,
  closeRestartModal,
}                                        from './ui/modals.js';
import { tapPill }                              from './state/setWidget.js';
import { deleteSession, shareSession }         from './ui/history.js';
import { openSessionDetail, closeSessionDetail } from './ui/sessionDetail.js';
import { showPage, setActiveTab }              from './ui/nav.js';
import { shareText, buildShareText }           from './ui/share.js';

// ── Save + Advance ──────────────────────

async function saveAndAdvance(day) {
  const vidx  = getVirtualIdx(day);
  const idx   = Math.max(0, vidx);
  const step  = DAYS[day].steps[idx];
  const items = Array.isArray(step) ? step : [step];

  items.forEach((key, part) => {
    const uid = `${day}-${idx}-${part}`;
    const s   = getState(uid);
    if (!s) return;

    // Save every pill the user touched (locked or mid-debounce) so that
    // tapping Next right after a tap doesn't silently drop that set.
    const sets = s.pills
      .filter(p => p.reps !== null)
      .map(p => ({ weight: String(p.weight ?? s.weight ?? 0), reps: String(p.reps) }));
    if (sets.length === 0) return;

    stageSetLog(day, {
      exerciseKey:     key,
      exerciseName:    EXERCISES[key]?.displayName ?? key,
      uid,
      sets,
      suggestedWeight: s.suggestedWeight ?? null,
    });
  });

  await advanceDay(day);
}

async function advanceDay(day) {
  const vidx = getVirtualIdx(day);
  if (vidx <= 0) await maybeStartSession(day);
  setVirtualIdx(day, vidx + 1);
  await renderDay(day);
}

async function goBack(day) {
  const vidx    = getVirtualIdx(day);
  const newVidx = vidx - 1;
  if (!DAYS[day].warmup && newVidx < 0) return;
  setVirtualIdx(day, newVidx);
  await renderDay(day);
}

async function restartDay(day) {
  await abandonSession(day);
  setVirtualIdx(day, DAYS[day].warmup ? -1 : 0);
  await renderDay(day);
}

// openWeightModal needs the state object; bridge it here.
function openWeightModal(uid) {
  _openWeightModal(uid, getState(uid));
}

// ── Boot ────────────────────────────────

function _showStorageError(err) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:100vh;padding:32px;text-align:center;font-family:inherit;
                background:var(--bg,#0a0a0f);color:var(--text,#f0f0f5);">
      <div style="font-size:40px;margin-bottom:16px;">⚠️</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Storage unavailable</div>
      <div style="font-size:14px;color:#9090aa;margin-bottom:24px;max-width:320px;">
        Your browser's storage could not be opened. This can happen in private
        browsing mode on some devices. Your workout data will not be saved in
        this session.
      </div>
      <button onclick="location.reload()"
        style="background:#c8f043;color:#0a0a0f;border:none;border-radius:10px;
               padding:12px 28px;font-weight:700;font-size:15px;cursor:pointer;">
        Retry
      </button>
    </div>`;
}

(async () => {
  initTelemetry();

  try {
    await initDB();
  } catch (err) {
    capture(Events.IDB_INIT_FAILURE, { error: err?.message });
    _showStorageError(err);
    return;
  }

  // Replay any session that failed to commit on a previous run.
  await recoverIfNeeded();

  initWeightModal();
  initCustomTimerModal();
  initRestartModal();

  await reconcileStaleSessions();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') await reconcileStaleSessions();
  });

  const nextDay = await getNextDay();

  const allDays = ['heavy-a', 'heavy-b', 'acc-a', 'acc-b'];
  allDays.forEach(day => setVirtualIdx(day, DAYS[day].warmup ? -1 : 0));
  await Promise.all(allDays.map(day => renderDay(day)));

  await showPage(nextDay, null);
  setActiveTab(nextDay);
})();

// ══════════════════════════════════════════
//  window.* — globals required by onclick= in rendered HTML strings.
//  Keep this list explicit and minimal.
//  This is the ONLY place window globals are assigned in the whole app.
// ══════════════════════════════════════════
Object.assign(window, {
  // Navigation
  showPage,
  // Workout flow
  saveAndAdvance,
  advanceDay,
  goBack,
  // Session
  restartDay,
  openRestartModal,
  closeRestartModal,
  // Weight modal
  openWeightModal,
  closeWeightModal,
  // Custom timer modal
  closeCustomTimerModal,
  // Timer presets
  startTimer,
  customTimer,
  // Set widget
  tapPill,
  // History + share
  deleteSession,
  shareSession,
  openSessionDetail,
  closeSessionDetail,
  shareDoneScreen: async (encodedPayload) => {
    const { session, logs, levelUps } = JSON.parse(decodeURIComponent(encodedPayload));
    const text   = buildShareText(session, logs, levelUps);
    const result = await shareText(text);
    if (result === 'copied') {
      const toast = document.createElement('div');
      toast.className   = 'share-toast';
      toast.textContent = 'Copied!';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
  },
});
