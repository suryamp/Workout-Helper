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

import { applyTheme, applyColorblind, applyReduceMotion } from './utils/settings.js';
import { acquireWakeLock, releaseWakeLock }               from './utils/wakeLock.js';
import { initDB, recoverIfNeeded }       from './db/index.js';
import { initTelemetry, capture, Events, getLog, clearLog } from './telemetry.js';
import { EXERCISES }                     from './data/exercises.js';
import { DAYS }                          from './data/days.js';
import { stageSetLog, getSessionHistory } from './db/index.js';
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
import { renderHome }                          from './ui/home.js';
import { initMenu, openMenu, closeMenu }       from './ui/menu.js';
import {
  renderSettings,
  settingsToggleTheme,
  settingsToggleWakeLock,
  settingsToggleColorblind,
  settingsToggleReduceMotion,
  settingsToggleUnits,
  settingsFactoryReset,
}                                              from './ui/settings.js';

// Apply all saved display preferences before any rendering.
applyTheme();
applyColorblind();
applyReduceMotion();

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

// ── Home + navigation ────────────────────

async function startDay(day) {
  await showPage(day, null);
}

async function showHome() {
  const nextDay = await getNextDay();
  await renderHome(nextDay);
  await showPage('home', null);
}

// ── Menu item handlers ───────────────────

async function menuHistory() {
  closeMenu();
  await showPage('history', null);
}

async function menuTrends() {
  closeMenu();
  const cnt = document.getElementById('cnt-trends');
  if (cnt) cnt.innerHTML = `<div class="sec-label">Trends</div><div class="empty">Coming soon.</div>`;
  await showPage('trends', null);
}

async function menuSettings() {
  closeMenu();
  renderSettings();
  await showPage('settings', null);
}

async function menuDebug() {
  closeMenu();
  _renderDebugPage();
  await showPage('debug', null);
}

function _renderDebugPage() {
  const cnt = document.getElementById('cnt-debug');
  if (!cnt) return;
  const entries = getLog();
  if (entries.length === 0) {
    cnt.innerHTML = `
      <div class="sec-label">Debug Log</div>
      <div class="empty">No telemetry entries.</div>`;
    return;
  }
  const rows = entries.slice().reverse().map(e => `
    <div class="debug-entry">
      <div class="debug-event">${e.event}</div>
      <div class="debug-ts">${new Date(e.ts).toLocaleString()}</div>
      <pre class="debug-data">${JSON.stringify(e.data, null, 2)}</pre>
    </div>`).join('');
  cnt.innerHTML = `
    <div class="sec-label">Debug Log</div>
    <button class="menu-item-btn debug-clear-btn" onclick="clearDebugLog()">Clear Log</button>
    <div class="debug-entries">${rows}</div>`;
}

function clearDebugLog() {
  clearLog();
  _renderDebugPage();
}

async function menuExport() {
  closeMenu();
  const data = await getSessionHistory({ limit: 365 });
  const blob  = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `workout-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function menuAbout() {
  closeMenu();
  const cnt = document.getElementById('cnt-about');
  if (cnt) cnt.innerHTML = `
    <div class="sec-label">About</div>
    <div class="about-card">
      <div class="about-app-name">Workout Tracker</div>
      <div class="about-app-desc">A mobile-first PWA for tracking a 4-day strength program.</div>
    </div>
    <div class="about-card">
      <div class="about-section-title">The Program</div>
      <div class="about-row"><span class="about-key">Heavy A</span><span class="about-val">Squat · Bench · Row focus</span></div>
      <div class="about-row"><span class="about-key">Acc A</span><span class="about-val">Cable · Accessory work</span></div>
      <div class="about-row"><span class="about-key">Heavy B</span><span class="about-val">OHP · Deadlift · Press focus</span></div>
      <div class="about-row"><span class="about-key">Acc B</span><span class="about-val">Rotator · Core · Curls</span></div>
    </div>
    <div class="about-card">
      <div class="about-section-title">Progression</div>
      <div class="about-body">Weight increases automatically when you hit your target reps for the required number of consecutive sessions. Compounds move up after one success; accessories need two or three in a row.</div>
    </div>
    <div class="about-card">
      <div class="about-section-title">Your Data</div>
      <div class="about-body">Everything is stored locally on this device using IndexedDB. No account, no server, no tracking. Use Export Data in this menu to back up your sessions as JSON.</div>
      <div class="about-row" style="margin-top:10px"><span class="about-key">Day boundary</span><span class="about-val">3 AM cutoff</span></div>
      <div class="about-row"><span class="about-key">History kept</span><span class="about-val">Last 365 sessions</span></div>
    </div>`;
  await showPage('about', null);
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
  initMenu();

  await reconcileStaleSessions();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await reconcileStaleSessions();
      acquireWakeLock(); // re-acquire after browser auto-releases on page hide
    }
  });

  const nextDay = await getNextDay();

  const allDays = ['heavy-a', 'heavy-b', 'acc-a', 'acc-b'];
  allDays.forEach(day => setVirtualIdx(day, DAYS[day].warmup ? -1 : 0));
  await Promise.all(allDays.map(day => renderDay(day)));

  await renderHome(nextDay);
  await showPage('home', null);
  acquireWakeLock();
})();

async function _rerenderAllDays() {
  const days = ['heavy-a', 'heavy-b', 'acc-a', 'acc-b'];
  await Promise.all(days.map(day => renderDay(day)));
}

// ══════════════════════════════════════════
//  window.* — globals required by onclick= in rendered HTML strings.
//  Keep this list explicit and minimal.
//  This is the ONLY place window globals are assigned in the whole app.
// ══════════════════════════════════════════
Object.assign(window, {
  // Navigation
  showPage,
  showHome,
  startDay,
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
  // Menu
  openMenu,
  closeMenu,
  menuHistory,
  menuTrends,
  menuSettings,
  menuDebug,
  menuExport,
  menuAbout,
  clearDebugLog,
  // Settings
  settingsToggleTheme,
  settingsToggleWakeLock,
  settingsToggleColorblind,
  settingsToggleReduceMotion,
  settingsToggleUnits,
  settingsFactoryReset,
  _rerenderAllDays,
});
