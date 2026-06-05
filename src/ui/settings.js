// ══════════════════════════════════════════
//  src/ui/settings.js
//  Renders the Settings page and owns all toggle interactions.
// ══════════════════════════════════════════

import {
  getSetting, setSetting, getUnit, applyTheme, applyColorblind, applyReduceMotion,
  SETTING_THEME, SETTING_UNITS, SETTING_COLORBLIND, SETTING_REDUCE_MOTION,
} from '../utils/settings.js';
import { acquireWakeLock, releaseWakeLock, SETTING_WAKE_LOCK } from '../utils/wakeLock.js';

function _toggle(id, checked, handler) {
  return `<label class="toggle-wrap" aria-label="${id}">
    <input type="checkbox" onchange="${handler}(this.checked)"${checked ? ' checked' : ''}>
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
  </label>`;
}

function _row(label, value, toggleHtml) {
  return `<div class="settings-row">
    <div class="settings-row-info">
      <div class="settings-row-label">${label}</div>
      <div class="settings-row-value">${value}</div>
    </div>
    ${toggleHtml}
  </div>`;
}

export function renderSettings() {
  const cnt = document.getElementById('cnt-settings');
  if (!cnt) return;

  const isLight     = getSetting(SETTING_THEME,         'dark') === 'light';
  const wakeOn      = getSetting(SETTING_WAKE_LOCK,      'on')  === 'on';
  const colorblind  = getSetting(SETTING_COLORBLIND,     'off') === 'on';
  const reduceMot   = getSetting(SETTING_REDUCE_MOTION,  'off') === 'on';
  const isKg        = getUnit() === 'kg';

  cnt.innerHTML = `
    <div class="sec-label">Appearance</div>
    <div class="settings-card">
      ${_row('Theme', isLight ? 'Light' : 'Dark',
        _toggle('Toggle theme', isLight, 'settingsToggleTheme'))}
      ${_row('Keep Screen On', wakeOn ? 'On' : 'Off',
        _toggle('Toggle wake lock', wakeOn, 'settingsToggleWakeLock'))}
    </div>

    <div class="sec-label">Accessibility</div>
    <div class="settings-card">
      ${_row('Colorblind Mode', colorblind ? 'On — blue/orange palette' : 'Off',
        _toggle('Toggle colorblind mode', colorblind, 'settingsToggleColorblind'))}
      ${_row('Reduce Motion', reduceMot ? 'On' : 'Off — also auto-applies from OS',
        _toggle('Toggle reduce motion', reduceMot, 'settingsToggleReduceMotion'))}
    </div>

    <div class="sec-label">Units</div>
    <div class="settings-card">
      ${_row('Weight Unit', isKg ? 'Kilograms (kg)' : 'Pounds (lbs)',
        _toggle('Toggle units', isKg, 'settingsToggleUnits'))}
    </div>
    <p class="settings-note">Changing the unit label does not convert stored weights.</p>

    <div class="sec-label">Data</div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Force Update</div>
          <div class="settings-row-value">Clear cached files and reload fresh</div>
        </div>
        <button class="settings-action-btn" onclick="settingsForceUpdate()">Update</button>
      </div>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Factory Reset</div>
          <div class="settings-row-value">Permanently wipe all workout history</div>
        </div>
        <button class="settings-danger-btn" onclick="settingsFactoryReset()">Reset</button>
      </div>
    </div>`;
}

export function settingsToggleTheme(isLight) {
  setSetting(SETTING_THEME, isLight ? 'light' : 'dark');
  applyTheme();
  renderSettings();
}

export async function settingsToggleWakeLock(on) {
  setSetting(SETTING_WAKE_LOCK, on ? 'on' : 'off');
  if (on) await acquireWakeLock();
  else releaseWakeLock();
  renderSettings();
}

export function settingsToggleColorblind(on) {
  setSetting(SETTING_COLORBLIND, on ? 'on' : 'off');
  applyColorblind();
  renderSettings();
}

export function settingsToggleReduceMotion(on) {
  setSetting(SETTING_REDUCE_MOTION, on ? 'on' : 'off');
  applyReduceMotion();
  renderSettings();
}

export async function settingsToggleUnits(isKg) {
  setSetting(SETTING_UNITS, isKg ? 'kg' : 'lbs');
  renderSettings();
  await window._rerenderAllDays?.();
}

export async function settingsForceUpdate() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.unregister();
  }
  location.reload();
}

export async function settingsFactoryReset() {
  if (!confirm('This will permanently delete all workout history and settings. This cannot be undone.')) return;
  localStorage.clear();
  const req = indexedDB.deleteDatabase('WorkoutDB');
  req.onsuccess = () => location.reload();
  req.onerror   = () => location.reload();
  req.onblocked = () => location.reload();
}
