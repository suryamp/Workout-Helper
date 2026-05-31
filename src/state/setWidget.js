// ══════════════════════════════════════════
//  src/state/setWidget.js
//  In-memory set state map + all mutations.
//  Also owns renderSetWidget since it is the sole consumer of setState.
// ══════════════════════════════════════════

import { getSmartTimer, startTimer } from '../ui/timer.js';
import { openWeightModal }           from '../ui/modals.js';

// ── State map ───────────────────────────
// Keyed by uid (`${day}-${stepIdx}-${partIdx}`).
const _state = {};

export function getState(uid) { return _state[uid]; }

/**
 * Initialise state for a set widget if it doesn't already exist.
 * Idempotent — calling it again on the same uid is a no-op.
 *
 * @param {string} uid
 * @param {number} numSets
 * @param {number} suggestedWeight
 * @param {number} targetReps
 * @param {string} exKey           — exercise key, used by getSmartTimer
 * @param {string} exName          — display name, used by the weight modal title
 */
export function initSetState(uid, numSets, suggestedWeight, targetReps, exKey, exName) {
  if (_state[uid]) return;
  _state[uid] = {
    exKey,
    exName,
    weight: suggestedWeight || 0,
    targetReps,
    pills: Array.from({ length: numSets }, () => ({ reps: null, locked: false })),
  };
}

/**
 * Delete all state entries for a given day prefix.
 * Called by abandonSession() before resetting the carousel.
 * @param {string} day
 */
export function clearDayState(day) {
  for (const key of Object.keys(_state)) {
    if (key.startsWith(day + '-')) delete _state[key];
  }
}

// ── Pill interactions ───────────────────

/**
 * Tap a pill to enter reps (starts at targetReps, decrements on each tap,
 * wraps back to targetReps at 0).
 */
export function tapPill(uid, pillIdx) {
  const s = getState(uid);
  if (!s) return;
  const pill   = s.pills[pillIdx];
  const target = s.targetReps;
  if (pill.reps === null || pill.reps === 0) {
    pill.reps = target;
  } else {
    pill.reps -= 1;
  }
  renderSetWidget(uid);
}

/**
 * Lock the first unlocked pending pill, record its weight, and start the rest timer.
 */
export function lockNextSet(uid) {
  const s = getState(uid);
  if (!s) return;
  const pill = s.pills.find(p => p.reps !== null && !p.locked);
  if (!pill) return;
  pill.weight = s.weight || 0;
  pill.locked = true;
  startTimer(getSmartTimer(s.exKey || '', pill.reps, s.targetReps));
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

  const weightLbl   = s.weight ? `${s.weight} lbs` : 'Set Wgt';
  const weightEmpty = !s.weight;

  const pillsHTML = s.pills.map((pill, i) => {
    let cls   = 'set-pill';
    let label = '';
    if (pill.reps === null) {
      cls   += ' pill-empty';
      label  = `<span class="pill-num">${i + 1}</span>`;
    } else if (pill.locked) {
      cls   += ' pill-locked';
      label  = `<span class="pill-num">${pill.reps}</span>`;
    } else {
      cls   += ' pill-pending';
      label  = `<span class="pill-num">${pill.reps}</span>`;
    }
    return `<button class="${cls}" onclick="tapPill('${uid}',${i})" aria-label="Set ${i + 1}">${label}</button>`;
  }).join('');

  const hasPending = s.pills.some(p => p.reps !== null && !p.locked);
  const allLocked  = s.pills.every(p => p.locked);

  container.innerHTML = `
    <div class="sw-weight-row">
      <button class="weight-chip${weightEmpty ? ' weight-chip-empty' : ''}" onclick="openWeightModal('${uid}')">
        <span class="weight-chip-val">${weightLbl}</span>
      </button>
      ${allLocked ? `<span class="sets-done-badge">✓ done</span>` : ''}
    </div>
    <div class="sw-pills">${pillsHTML}</div>
    ${!allLocked ? `
    <button class="btn-new-set${hasPending ? ' btn-new-set-ready' : ''}"
            onclick="lockNextSet('${uid}')"
            ${hasPending ? '' : 'disabled'}>
      Start New Set
    </button>` : ''}
  `;
}
