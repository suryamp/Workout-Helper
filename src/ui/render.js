// ══════════════════════════════════════════
//  src/ui/render.js
//  Renders the full workout day page (carousel, progress bar,
//  nav buttons, done screen).  Reads state, writes innerHTML.
// ══════════════════════════════════════════

import { EXERCISES }                     from '../data/exercises.js';
import { DAYS }                          from '../data/days.js';
import { getProgressionData }            from '../db/index.js';
import { initSetState, renderSetWidget, getState } from '../state/setWidget.js';
import { completeSession }               from '../state/session.js';
import { REST_DEFAULTS }                 from '../ui/timer.js';

// ── Carousel index ──────────────────────
const _carouselIdx = {};
export function getVirtualIdx(day)    { return _carouselIdx[day] ?? -1; }
export function setVirtualIdx(day, i) { _carouselIdx[day] = i; }

// ── Helpers ─────────────────────────────

function exName(key) { return EXERCISES[key]?.displayName ?? key; }

function getRestTimes(key) { return EXERCISES[key]?.rest ?? REST_DEFAULTS; }

/** Total estimated minutes remaining from `currentIdx` onward. */
export function minsRemaining(day, currentIdx) {
  return DAYS[day].steps.slice(currentIdx).reduce((sum, step) => {
    const keys = Array.isArray(step) ? step : [step];
    const mins = Math.max(...keys.map(k => EXERCISES[k]?.estMinutes ?? 5));
    return sum + mins;
  }, 0);
}

// ── Timer HTML fragment ─────────────────

export function timerHTML() {
  return `<div class="timer-card">
    <div class="timer-lbl">Rest Timer</div>
    <div class="timer-display done">0:00</div>
    <div class="timer-presets-wrap">
      <div class="timer-presets">
        <button class="t-pre" onclick="startTimer(${REST_DEFAULTS.easy})">90s<small>easy win</small></button>
        <button class="t-pre" onclick="startTimer(${REST_DEFAULTS.hard})">3 min<small>hard set</small></button>
        <button class="t-pre" onclick="startTimer(${REST_DEFAULTS.failed})">5 min<small>failed</small></button>
        <button class="t-pre" onclick="customTimer()">Custom<small>manual</small></button>
      </div>
    </div>
  </div>`;
}

// ── Warm-up slide ───────────────────────

function warmupSlide() {
  return `<div class="warmup-slide-card">
    <div class="warmup-title">Warm-Up</div>
    <div class="warmup-row"><span class="wn">Hip Flexor Stretch</span><span class="ws">30–45s/side</span></div>
    <div class="warmup-row"><span class="wn">Banded Clamshells</span><span class="ws">2×15/side</span></div>
    <div class="warmup-row"><span class="wn">Banded TKEs</span><span class="ws">2×15–20/side</span></div>
    <div class="warmup-row"><span class="wn">Goblet Squat w/ Pause</span><span class="ws">2×5 (3s)</span></div>
  </div>`;
}

// ── Exercise card inner HTML ────────────

async function exCardInner(key, uid) {
  const ex  = EXERCISES[key];
  const vid = ex.video === 'placeholder' ? null : `https://www.youtube.com/watch?v=${ex.video}`;

  const prog       = await getProgressionData(key);
  const targetReps = ex.progression?.targetReps ?? 10;
  const numSets    = ex.sets ?? 3;

  const badgeHTML = prog.badge
    ? `<div class="weight-badge${prog.badge.includes('🚀') ? ' pending' : ''}"> · ${prog.badge}</div>`
    : '';

  const levelUpHTML = prog.levelUp ? `
    <div class="levelup-banner">
      <span class="levelup-icon">⬆</span>
      <span class="levelup-text">New weight: <strong>${prog.suggestedWeight} lbs</strong></span>
      <span class="levelup-delta">+${prog.increment} lbs</span>
    </div>` : '';

  // Pass exKey and exName so initSetState stores them; lockNextSet uses exKey
  // for getSmartTimer, and the weight modal uses exName for its title.
  initSetState(uid, numSets, prog.suggestedWeight, targetReps, key, ex.displayName);

  return `
    <div class="ex-header">
      <div class="ex-meta">
        <div class="ex-name">${ex.displayName}</div>
        <div class="ex-sets-lbl">${numSets} sets · ${targetReps} reps${badgeHTML}</div>
        ${ex.notes ? `<div class="ex-notes">${ex.notes}</div>` : ''}
      </div>
      ${vid
        ? `<a href="${vid}" target="_blank" class="yt-btn">▶</a>`
        : `<span class="yt-btn" style="opacity:.35;cursor:default">▶</span>`}
    </div>
    ${levelUpHTML}
    <div id="sw-${uid}"></div>
  `;
}

// ── Build one slide ─────────────────────

async function buildSlide(step, day, stepIdx) {
  const isSuperset = Array.isArray(step);
  const uid0 = `${day}-${stepIdx}-0`;

  if (isSuperset) {
    const uid1 = `${day}-${stepIdx}-1`;
    const [inner0, inner1] = await Promise.all([
      exCardInner(step[0], uid0),
      exCardInner(step[1], uid1),
    ]);
    return `<div class="ss-box">
      <div class="ss-label-wrap"><span class="ss-label">⚡ Superset</span></div>
      <div class="ss-inner-card">${inner0}</div>
      <div class="ss-divider"></div>
      <div class="ss-inner-card">${inner1}</div>
    </div>`;
  } else {
    const inner = await exCardInner(step, uid0);
    return `<div class="ex-card">${inner}</div>`;
  }
}

// ── initWidgets (called after innerHTML is set) ──

export function initWidgets(step, day, stepIdx) {
  const items = Array.isArray(step) ? step : [step];
  items.forEach((_, part) => {
    renderSetWidget(`${day}-${stepIdx}-${part}`);
  });
}

// ── renderDay ───────────────────────────

export async function renderDay(day) {
  const cnt = document.getElementById('cnt-' + day);
  if (!cnt) return;

  const data  = DAYS[day];
  const steps = data.steps;
  const vidx  = getVirtualIdx(day);
  const total = steps.length;

  let html = timerHTML();

  // ── Warmup ──────────────────────────────
  if (data.warmup && vidx < 0) {
    const firstStep = steps[0];
    const firstName = Array.isArray(firstStep)
      ? exName(firstStep[0]) + ' + …'
      : exName(firstStep);
    html += `<div class="progress-bar-wrap">
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:0%"></div></div>
      <div class="progress-count">Warm Up</div>
    </div>`;
    html += `<div class="slides-viewport"><div class="slides-track">
      <div class="slide">${warmupSlide()}</div>
    </div></div>`;
    html += `<div class="next-up-bar"><span class="next-up-label">Next up</span><span class="next-up-name">${firstName}</span></div>`;
    html += `<div class="action-row">
      <button class="btn-back" disabled>← Prev</button>
      <div></div>
      <button class="btn-save" onclick="advanceDay('${day}')">Next →</button>
    </div>`;
    cnt.innerHTML = html;
    return;
  }

  const idx = Math.max(0, vidx);

  // ── Done ─────────────────────────────────
  if (idx >= total) {
    await completeSession(day);

    // Only check progression for exercises where the user confirmed at least
    // one set this session. Skipped exercises (no locked pills) are excluded
    // so prior-session streaks on untouched exercises don't appear here.
    const completedKeys = steps.flatMap((step, stepIdx) => {
      const items = Array.isArray(step) ? step : [step];
      return items.filter((_, partIdx) => {
        const s = getState(`${day}-${stepIdx}-${partIdx}`);
        return s?.pills.some(p => p.locked);
      });
    });
    const progData = await Promise.all(completedKeys.map(k => getProgressionData(k)));
    const levelUps = completedKeys
      .map((k, i) => ({ key: k, name: exName(k), ...progData[i] }))
      .filter(e => e.levelUp);

    let levelUpHTML = '';
    if (levelUps.length > 0) {
      const title = levelUps.length === 1
        ? '⬆ New weight unlocked'
        : `⬆ ${levelUps.length} new weights unlocked`;
      const rows = levelUps.map(lu => `
        <div class="warmup-row">
          <span class="wn">${lu.name}</span>
          <span class="ws">${lu.prevWeight} → ${lu.suggestedWeight} lbs</span>
        </div>`).join('');
      levelUpHTML = `<div class="warmup-slide-card levelup-summary">
        <div class="warmup-title">${title}</div>
        ${rows}
      </div>`;
    }

    html += `<div class="day-done">
      <div class="done-big">🎉</div>
      <div class="done-msg">${data.label} complete!<br>You showed up. That's the job.</div>
      ${levelUpHTML}
      <button class="restart-btn" onclick="openRestartModal('${day}')">Restart Workout</button>
    </div>`;
    cnt.innerHTML = html;
    return;
  }

  // ── Progress bar ─────────────────────────
  const barTotal = data.warmup ? total + 1 : total;
  const barIdx   = data.warmup ? idx + 1 : idx;
  const mins     = minsRemaining(day, idx);
  html += `<div class="progress-bar-wrap">
    <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${(barIdx / barTotal) * 100}%"></div></div>
    <div class="progress-count">${idx + 1} / ${total} · ~${mins} min</div>
  </div>`;

  // ── Slide ────────────────────────────────
  const slideHtml = await buildSlide(steps[idx], day, idx);
  html += `<div class="slides-viewport" id="vp-${day}"><div class="slides-track" id="track-${day}">`;
  html += `<div class="slide">${slideHtml}</div>`;
  html += `</div></div>`;

  // ── Next-up banner ───────────────────────
  const nextStep = idx + 1 < total ? steps[idx + 1] : null;
  if (nextStep) {
    const nextName = Array.isArray(nextStep)
      ? exName(nextStep[0]) + ' + ' + exName(nextStep[1])
      : exName(nextStep);
    html += `<div class="next-up-bar"><span class="next-up-label">Next up</span><span class="next-up-name">${nextName}</span></div>`;
  }

  // ── Action row ───────────────────────────
  const isLast    = idx === total - 1;
  const canGoBack = data.warmup ? vidx > -1 : idx > 0;
  html += `<div class="action-row">
    <button class="btn-back" onclick="goBack('${day}')"${canGoBack ? '' : ' disabled'}>← Prev</button>
    <div></div>
    <button class="btn-save${isLast ? ' last-item' : ''}" onclick="saveAndAdvance('${day}')">
      ${isLast ? '✓ Finish' : 'Next →'}
    </button>
  </div>`;

  // ── Optional finisher (heavy days only) ──
  if (isLast && (day === 'heavy-a' || day === 'heavy-b')) {
    html += `<div class="fin-card">
      <div class="fin-title">Optional Finisher</div>
      <div class="fin-row">Farmer Carries<span>3×40–50m</span></div>
      <div class="fin-row">Vest Walk<span>20–30 min</span></div>
      <div class="fin-row">Sandbag Bear Hug Carry<span>when available</span></div>
    </div>`;
  }

  cnt.innerHTML = html;
  initWidgets(steps[idx], day, idx);
}
