// ══════════════════════════════════════════
//  src/ui/timer.js
//  Rest timer: countdown, DOM updates, preset selection.
// ══════════════════════════════════════════

import { EXERCISES } from '../data/exercises.js';

const REST_DEFAULTS = { easy: 90, hard: 180, failed: 300 };

// ── Module state ────────────────────────
let _interval      = null;
let _timerEnd      = null;
let _remaining     = 0;
let _customSec     = 120;
let _presetsVisible = false;

// Two-phase timer state.
// Phase 1 (green): the easy rest window.
// Phase 2 (red):   the extra window before hitting hard rest total.
//   _overtimeSec = hard - easy; 0 means no phase 2 (failed sets, manual presets).
let _overtimeSec = 0;
let _inOvertime  = false;

// ── Core timer ──────────────────────────

/**
 * Start a countdown.
 *
 * When overtimeSec > 0, the timer runs two phases:
 *   Phase 1: sec seconds, green.
 *   Phase 2: overtimeSec seconds, red — starts automatically when phase 1 hits 0.
 *
 * Manual preset buttons pass only sec (overtimeSec defaults to 0 = single phase).
 *
 * @param {number} sec
 * @param {number} [overtimeSec=0]
 */
export function startTimer(sec, overtimeSec = 0) {
  stopTimer();
  _timerEnd    = Date.now() + sec * 1000;
  _overtimeSec = overtimeSec;
  _inOvertime  = false;
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

  // Phase transition: phase 1 hit 0 and phase 2 is configured.
  if (_remaining === 0 && !_inOvertime && _overtimeSec > 0) {
    _inOvertime  = true;
    _timerEnd    = Date.now() + _overtimeSec * 1000;
    _remaining   = _overtimeSec;
    _updateAllTimers();
    return;
  }

  _updateAllTimers();
  if (_remaining === 0 && _interval) stopTimer();
}

function _updateAllTimers() {
  const m   = Math.floor(_remaining / 60);
  const s   = _remaining % 60;
  const txt = `${m}:${s.toString().padStart(2, '0')}`;

  // Phase 2 stays red even at 0:00 so the user sees they're in overtime.
  // Phase 1 stays green throughout — color only changes at the phase boundary.
  const mod = _inOvertime ? ' overtime' : '';

  document.querySelectorAll('.timer-display').forEach(el => {
    el.textContent = txt;
    el.className   = 'timer-display' + mod;
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
 * Return the rest timer configuration for a set.
 *
 * When the user hit their target reps, we can't know if it felt easy or hard,
 * so we return a two-phase timer: phase 1 = easy window (green), phase 2 =
 * the remaining time to reach hard rest (red). The user moves on whenever
 * they're ready — no manual preset selection needed.
 *
 * For missed sets we know it was hard/failed, so we return a single phase.
 *
 * @param {string} key
 * @param {number} enteredReps
 * @param {number} [targetReps]
 * @returns {{ sec: number, overtimeSec: number }}
 */
export function getSmartTimer(key, enteredReps, targetReps) {
  const ex     = EXERCISES[key];
  const rest   = ex?.rest ?? REST_DEFAULTS;
  const target = targetReps ?? ex?.progression?.targetReps;

  if (target === undefined || enteredReps === null || enteredReps === undefined) {
    return { sec: rest.hard, overtimeSec: 0 };
  }
  if (enteredReps === 0 || enteredReps < target - 1) {
    return { sec: rest.failed, overtimeSec: 0 };
  }
  if (enteredReps === target - 1) {
    return { sec: rest.hard, overtimeSec: 0 };
  }
  // Hit target or exceeded — two-phase: easy then (hard - easy) overtime.
  return { sec: rest.easy, overtimeSec: rest.hard - rest.easy };
}

export { REST_DEFAULTS };
