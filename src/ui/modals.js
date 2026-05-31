// ══════════════════════════════════════════
//  src/ui/modals.js
//  Three modals: weight, custom timer, restart.
//  Each init function creates the DOM element once.
//  open/close handlers are exported for use in render HTML
//  and re-exported onto window.* in main.js.
// ══════════════════════════════════════════

import { applyWeightFromModal } from '../state/setWidget.js';

// ── Weight modal ────────────────────────

export function initWeightModal() {
  const modal = document.createElement('div');
  modal.id        = 'weight-modal';
  modal.className = 'wmodal-overlay';
  modal.innerHTML = `
    <div class="wmodal-box">
      <div class="wmodal-title" id="weight-modal-title">Weight</div>
      <div class="wmodal-sub">lbs</div>
      <input class="wmodal-input" id="weight-modal-input" type="number"
             inputmode="decimal" placeholder="0" step="2.5">
      <div class="wmodal-note">Plate math coming soon</div>
      <div class="wmodal-actions">
        <button class="wmodal-btn wmodal-cancel"  onclick="closeWeightModal(false)">Cancel</button>
        <button class="wmodal-btn wmodal-confirm" onclick="closeWeightModal(true)">Save</button>
      </div>
    </div>
  `;
  modal.addEventListener('click',   e => { if (e.target === modal) closeWeightModal(false); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Enter')  closeWeightModal(true);
    if (e.key === 'Escape') closeWeightModal(false);
  });
  document.body.appendChild(modal);
}

/**
 * Open the weight modal for `uid`, pre-filling the current weight.
 * @param {string} uid
 * @param {{ weight: number, exName?: string }} state  — the widget's state slice
 */
export function openWeightModal(uid, state) {
  const modal = document.getElementById('weight-modal');
  const input = document.getElementById('weight-modal-input');
  const title = document.getElementById('weight-modal-title');
  title.textContent = state?.exName || 'Weight';
  input.value       = state?.weight || '';
  modal.dataset.uid = uid;
  modal.classList.add('open');
  setTimeout(() => input.focus(), 80);
}

export function closeWeightModal(save) {
  const modal = document.getElementById('weight-modal');
  const uid   = modal.dataset.uid;
  if (save && uid) {
    applyWeightFromModal(uid, document.getElementById('weight-modal-input').value);
  }
  modal.classList.remove('open');
}

// ── Custom timer modal ──────────────────

export function initCustomTimerModal() {
  const modal = document.createElement('div');
  modal.id        = 'custom-timer-modal';
  modal.className = 'wmodal-overlay';
  modal.innerHTML = `
    <div class="wmodal-box">
      <div class="wmodal-title">Custom Timer</div>
      <div class="wmodal-sub">seconds</div>
      <input class="wmodal-input" id="custom-timer-input" type="number"
             inputmode="numeric" placeholder="120" min="1">
      <div class="wmodal-actions">
        <button class="wmodal-btn wmodal-cancel"  onclick="closeCustomTimerModal(false)">Cancel</button>
        <button class="wmodal-btn wmodal-confirm" onclick="closeCustomTimerModal(true)">Start</button>
      </div>
    </div>
  `;
  modal.addEventListener('click',   e => { if (e.target === modal) closeCustomTimerModal(false); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Enter')  closeCustomTimerModal(true);
    if (e.key === 'Escape') closeCustomTimerModal(false);
  });
  document.body.appendChild(modal);
}

// ── Restart modal ───────────────────────

export function initRestartModal() {
  const modal = document.createElement('div');
  modal.id        = 'restart-modal';
  modal.className = 'wmodal-overlay';
  modal.innerHTML = `
    <div class="wmodal-box">
      <div class="wmodal-title">Restart Workout?</div>
      <div class="wmodal-sub">This will clear your progress for this session</div>
      <div class="wmodal-actions">
        <button class="wmodal-btn wmodal-cancel"                onclick="closeRestartModal(false)">Cancel</button>
        <button class="wmodal-btn wmodal-confirm wmodal-danger" onclick="closeRestartModal(true)">Restart</button>
      </div>
    </div>
  `;
  modal.addEventListener('click',   e => { if (e.target === modal) closeRestartModal(false); });
  modal.addEventListener('keydown', e => { if (e.key === 'Escape') closeRestartModal(false); });
  document.body.appendChild(modal);
}

export function openRestartModal(day) {
  const modal     = document.getElementById('restart-modal');
  modal.dataset.day = day;
  modal.classList.add('open');
}

export function closeRestartModal(confirm) {
  const modal = document.getElementById('restart-modal');
  const day   = modal.dataset.day;
  modal.classList.remove('open');
  // Circular dep avoided: restartDay is wired in main.js via window.restartDay.
  if (confirm && day) window.restartDay(day);
}
