// ══════════════════════════════════════════
//  src/ui/timer.js
//  Rest timer: countdown, DOM updates, preset selection.
// ══════════════════════════════════════════

import { EXERCISES } from '../data/exercises.js';

const REST_DEFAULTS = { easy: 90, hard: 180, failed: 300 };

// ── Module state ────────────────────────
let _interval  = null;
let _timerEnd  = null;
let _remaining = 0;
let _customSec = 120;
let _presetsVisible = false;

// ── Core timer ──────────────────────────

export function startTimer(sec) {
  stopTimer();
  _timerEnd = Date.now() + sec * 1000;
  _tick();
  _interval = setInterval(_tick, 500);
}

export function stopTimer() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function _tick() {
  if (_timerEnd) {
    _remaining = Math.max(0, Math.round((_timerEnd - Date.now()) / 1000));
  }
  _updateAllTimers();
  if (_remaining === 0 && _interval) stopTimer();
}

function _updateAllTimers() {
  const m   = Math.floor(_remaining / 60);
  const s   = _remaining % 60;
  const txt = `${m}:${s.toString().padStart(2, '0')}`;
  document.querySelectorAll('.timer-display').forEach(el => {
    el.textContent  = txt;
    el.className    = 'timer-display' + (
      _remaining <= 10 && _remaining > 0 ? ' urgent' :
      _remaining === 0                   ? ' done'   : ''
    );
  });
}

// ── Preset visibility ───────────────────

export function toggleTimerPresets() {
  _presetsVisible = !_presetsVisible;
  document.querySelectorAll('.timer-presets-wrap').forEach(el => {
    el.classList.toggle('hidden', !_presetsVisible);
  });
}

// ── Custom timer modal ──────────────────

export function customTimer() { _openCustomTimerModal(); }

function _openCustomTimerModal() {
  const modal = document.getElementById('custom-timer-modal');
  const input = document.getElementById('custom-timer-input');
  input.value = _customSec;
  modal.classList.add('open');
  setTimeout(() => { input.focus(); input.select(); }, 80);
}

export function closeCustomTimerModal(start) {
  const modal = document.getElementById('custom-timer-modal');
  if (start) {
    const val = parseInt(document.getElementById('custom-timer-input').value);
    if (!isNaN(val) && val > 0) { _customSec = val; startTimer(_customSec); }
  }
  modal.classList.remove('open');
}

// ── Smart timer selection ───────────────

/**
 * Choose rest duration based on reps hit vs. target.
 * @param {string} key          exercise key
 * @param {number} enteredReps
 * @param {number} [targetReps]
 * @returns {number}  seconds
 */
export function getSmartTimer(key, enteredReps, targetReps) {
  const ex     = EXERCISES[key];
  const rest   = ex?.rest ?? REST_DEFAULTS;
  const target = targetReps ?? ex?.progression?.targetReps;
  if (target === undefined) return rest.hard;
  if (enteredReps === null || enteredReps === undefined) return rest.hard;
  if (enteredReps === 0)              return rest.failed;
  if (enteredReps >= target)          return rest.easy;
  if (enteredReps >= target - 1)      return rest.hard;
  return rest.failed;
}

export { REST_DEFAULTS };
