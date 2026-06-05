import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  getSetting, setSetting, getUnit,
  applyTheme, applyColorblind, applyReduceMotion,
  SETTING_THEME, SETTING_UNITS, SETTING_COLORBLIND, SETTING_REDUCE_MOTION,
} from '../../src/utils/settings.js';

// Minimal document mock so apply* functions can run in Node.
let _mockDataset;
beforeEach(() => {
  localStorage.clear();
  _mockDataset = {};
  globalThis.document = {
    documentElement: { dataset: _mockDataset },
    querySelector:   () => null,
  };
});
afterEach(() => {
  delete globalThis.document;
});

// ── getSetting / setSetting ────────────────────────────────────────────────

describe('getSetting', () => {
  test('returns the default when the key is not set', () => {
    expect(getSetting('wh_unknown', 'fallback')).toBe('fallback');
  });

  test('returns the stored value when the key exists', () => {
    localStorage.setItem('wh_test', 'hello');
    expect(getSetting('wh_test', 'fallback')).toBe('hello');
  });
});

describe('setSetting', () => {
  test('writes to localStorage and is immediately readable', () => {
    setSetting('wh_test', 'world');
    expect(localStorage.getItem('wh_test')).toBe('world');
  });

  test('overwrites an existing value', () => {
    setSetting('wh_test', 'first');
    setSetting('wh_test', 'second');
    expect(localStorage.getItem('wh_test')).toBe('second');
  });
});

// ── getUnit ────────────────────────────────────────────────────────────────

describe('getUnit', () => {
  test('defaults to "lbs" when not set', () => {
    expect(getUnit()).toBe('lbs');
  });

  test('returns "kg" when explicitly set', () => {
    setSetting(SETTING_UNITS, 'kg');
    expect(getUnit()).toBe('kg');
  });

  test('returns "lbs" when reset to lbs', () => {
    setSetting(SETTING_UNITS, 'kg');
    setSetting(SETTING_UNITS, 'lbs');
    expect(getUnit()).toBe('lbs');
  });
});

// ── applyTheme ─────────────────────────────────────────────────────────────

describe('applyTheme', () => {
  test('defaults to dark theme when not set', () => {
    applyTheme();
    expect(_mockDataset.theme).toBe('dark');
  });

  test('applies light theme when set', () => {
    setSetting(SETTING_THEME, 'light');
    applyTheme();
    expect(_mockDataset.theme).toBe('light');
  });

  test('applies dark theme when explicitly set to dark', () => {
    setSetting(SETTING_THEME, 'dark');
    applyTheme();
    expect(_mockDataset.theme).toBe('dark');
  });
});

// ── applyColorblind ────────────────────────────────────────────────────────

describe('applyColorblind', () => {
  test('does not set dataset.colorblind when off (default)', () => {
    applyColorblind();
    expect('colorblind' in _mockDataset).toBe(false);
  });

  test('sets dataset.colorblind when on', () => {
    setSetting(SETTING_COLORBLIND, 'on');
    applyColorblind();
    expect('colorblind' in _mockDataset).toBe(true);
  });

  test('removes dataset.colorblind when turned back off', () => {
    _mockDataset.colorblind = '';
    setSetting(SETTING_COLORBLIND, 'off');
    applyColorblind();
    expect('colorblind' in _mockDataset).toBe(false);
  });
});

// ── applyReduceMotion ──────────────────────────────────────────────────────

describe('applyReduceMotion', () => {
  test('does not set dataset.reduceMotion when off (default)', () => {
    applyReduceMotion();
    expect('reduceMotion' in _mockDataset).toBe(false);
  });

  test('sets dataset.reduceMotion when on', () => {
    setSetting(SETTING_REDUCE_MOTION, 'on');
    applyReduceMotion();
    expect('reduceMotion' in _mockDataset).toBe(true);
  });

  test('removes dataset.reduceMotion when turned back off', () => {
    _mockDataset.reduceMotion = '';
    setSetting(SETTING_REDUCE_MOTION, 'off');
    applyReduceMotion();
    expect('reduceMotion' in _mockDataset).toBe(false);
  });
});
