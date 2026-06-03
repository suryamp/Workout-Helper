import { getSetting } from './settings.js';

export const SETTING_WAKE_LOCK = 'wh_wake_lock';

let _lock = null;

export async function acquireWakeLock() {
  if (getSetting(SETTING_WAKE_LOCK, 'on') !== 'on') return;
  if (!('wakeLock' in navigator)) return;
  if (_lock) return;
  try {
    _lock = await navigator.wakeLock.request('screen');
    _lock.addEventListener('release', () => { _lock = null; });
  } catch { /* denied or page is hidden */ }
}

export function releaseWakeLock() {
  _lock?.release().catch(() => {});
  _lock = null;
}
