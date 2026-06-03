export const SETTING_THEME         = 'wh_theme';
export const SETTING_UNITS         = 'wh_units';
export const SETTING_COLORBLIND    = 'wh_colorblind';
export const SETTING_REDUCE_MOTION = 'wh_reduce_motion';

export function getSetting(key, def) {
  return localStorage.getItem(key) ?? def;
}

export function setSetting(key, val) {
  localStorage.setItem(key, val);
}

export function getUnit() {
  return getSetting(SETTING_UNITS, 'lbs');
}

export function applyTheme() {
  const theme = getSetting(SETTING_THEME, 'dark');
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#f4f4f7' : '#0a0a0f';
}

export function applyColorblind() {
  if (getSetting(SETTING_COLORBLIND, 'off') === 'on') {
    document.documentElement.dataset.colorblind = '';
  } else {
    delete document.documentElement.dataset.colorblind;
  }
}

export function applyReduceMotion() {
  if (getSetting(SETTING_REDUCE_MOTION, 'off') === 'on') {
    document.documentElement.dataset.reduceMotion = '';
  } else {
    delete document.documentElement.dataset.reduceMotion;
  }
}
