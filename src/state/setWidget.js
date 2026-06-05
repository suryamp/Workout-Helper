// ══════════════════════════════════════════
//  src/state/setWidget.js
//  In-memory set state map + all mutations.
//  Also owns renderSetWidget since it is the sole consumer of setState.
// ══════════════════════════════════════════

import { getSmartTimer, startTimer } from '../ui/timer.js';
import { openWeightModal }           from '../ui/modals.js';
import { getUnit }                   from '../utils/settings.js';

// ── State map ───────────────────────────
// Keyed by uid (`${day}-${stepIdx}-${partIdx}`).
const _state = {};

export function getState(uid) { return _state[uid]; }

/**
 * Initialise state for a set widget if it doesn't already exist.
 * Idempotent — calling it again on the same uid is a no-op.
 */
export function initSetState(uid, numSets, suggestedWeight, targetReps, exKey, exName) {
  if (_state[uid]) return;
  _state[uid] = {
    exKey,
    exName,
    weight:          suggestedWeight || 0,
    suggestedWeight: suggestedWeight || 0,
    targetReps,
    pills: Array.from({ length: numSets }, () => ({ reps: null, locked: false })),
  };
}

/**
 * Delete all state entries and cancel all pending debounce timers for a day.
 * Called by abandonSession() before resetting the carousel.
 * @param {string} day
 */
export function clearDayState(day) {
  for (const key of Object.keys(_debounceTimers)) {
    if (key.startsWith(day + '-')) {
      clearTimeout(_debounceTimers[key]);
      delete _debounceTimers[key];
    }
  }
  for (const key of Object.keys(_state)) {
    if (key.startsWith(day + '-')) delete _state[key];
  }
}

// ── Pill debounce ───────────────────────
// Keyed by `${uid}-${pillIdx}`. Fires _lockPill after DEBOUNCE_MS of
// inactivity on a given pill. Reset on every tap; cleared on unlock.

const _debounceTimers = {};
const DEBOUNCE_MS = 1500;

function _lockPill(uid, pillIdx) {
  const s = getState(uid);
  if (!s) return;
  const pill = s.pills[pillIdx];
  if (pill.locked || pill.reps === null) return;
  pill.weight = s.weight || 0;
  pill.locked = true;
  delete _debounceTimers[`${uid}-${pillIdx}`];
  navigator.vibrate?.(30);
  const { sec, overtimeSec } = getSmartTimer(s.exKey || '', pill.reps, s.targetReps);
  startTimer(sec, overtimeSec);
  renderSetWidget(uid);
}

// ── Pill interactions ───────────────────

/**
 * Tap a pill:
 *   - If locked → unlock it and clear its debounce so the user can re-edit.
 *   - If unlocked → cycle reps (target → target-1 → … → 0 → target) and
 *     reset the per-pill debounce. The debounce fires _lockPill after
 *     DEBOUNCE_MS of inactivity, starting the rest timer automatically.
 */
export function tapPill(uid, pillIdx) {
  const s = getState(uid);
  if (!s) return;
  const pill   = s.pills[pillIdx];
  const target = s.targetReps;
  const tkey   = `${uid}-${pillIdx}`;

  if (pill.locked) {
    pill.locked = false;
    clearTimeout(_debounceTimers[tkey]);
    delete _debounceTimers[tkey];
  } else {
    if (pill.reps === null || pill.reps === 0) {
      pill.reps = target;
    } else {
      pill.reps -= 1;
    }
    clearTimeout(_debounceTimers[tkey]);
    _debounceTimers[tkey] = setTimeout(() => _lockPill(uid, pillIdx), DEBOUNCE_MS);
  }

  renderSetWidget(uid);
}

// ── Weight modal bridge ─────────────────

export function applyWeightFromModal(uid, value) {
  const val = parseFloat(value);
  if (!isNaN(val)) {
    getState(uid).weight = val;
    renderSetWidget(uid);
  }
}

// ── Widget rendering ────────────────────

export function renderSetWidget(uid) {
  const s = getState(uid);
  if (!s) return;
  const container = document.getElementById('sw-' + uid);
  if (!container) return;

  const weightLbl   = s.weight ? `${s.weight} ${getUnit()}` : 'Set Wgt';
  const weightEmpty = !s.weight;

  const pillsHTML = s.pills.map((pill, i) => {
    let cls = 'set-pill';
    if (pill.reps === null) {
      cls += ' pill-empty';
    } else if (pill.locked) {
      cls += ' pill-locked';
    } else {
      cls += ' pill-pending';
    }
    // Empty pills show targetReps (e.g. 5,5,5) so the user knows
    // what they're aiming for before tapping.
    const display = pill.reps === null ? s.targetReps : pill.reps;
    return `<button class="${cls}" onclick="tapPill('${uid}',${i})" aria-label="Set ${i + 1}">
      <span class="pill-num">${display}</span>
    </button>`;
  }).join('');

  container.innerHTML = `
    <div class="sw-row">
      <button class="weight-chip${weightEmpty ? ' weight-chip-empty' : ''}" onclick="openWeightModal('${uid}')">
        <span class="weight-chip-val">${weightLbl}</span>
      </button>
      <div class="sw-pills">${pillsHTML}</div>
    </div>
  `;
}
