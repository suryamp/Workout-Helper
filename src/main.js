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

import { initDB }                        from './db/index.js';
import { EXERCISES }                     from './data/exercises.js';
import { DAYS }                          from './data/days.js';
import { stageSetLog }                   from './db/index.js';
import {
  maybeStartSession,
  abandonSession,
  reconcileStaleSessions,
  getNextDay,
}                                        from './state/session.js';
import { getState, clearDayState }       from './state/setWidget.js';
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
import { tapPill, lockNextSet }          from './state/setWidget.js';
import { deleteEntry }                   from './ui/history.js';
import { showPage, setActiveTab }        from './ui/nav.js';

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

    const sets = s.pills
      .filter(p => p.locked)
      .map(p => ({ weight: String(p.weight ?? s.weight ?? 0), reps: String(p.reps) }));

    const pendingPill = s.pills.find(p => p.reps !== null && !p.locked);
    if (pendingPill) sets.push({ weight: String(s.weight || 0), reps: String(pendingPill.reps) });
    if (sets.length === 0) return;

    stageSetLog(day, {
      exerciseKey:  key,
      exerciseName: EXERCISES[key]?.displayName ?? key,
      uid,
      sets,
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

(async () => {
  await initDB();

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
  lockNextSet,
  // History
  deleteEntry,
});
