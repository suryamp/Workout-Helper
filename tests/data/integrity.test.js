import { describe, test, expect } from 'vitest';
import { EXERCISES } from '../../src/data/exercises.js';
import { DAYS, DAY_ROTATION, DAY_LABELS } from '../../src/data/days.js';

// Data integrity tests guard against silent breakage when exercises or days
// are added, renamed, or removed. They act as a compile-time-style check
// for the schema contracts documented in ARCHITECTURE.md.

describe('EXERCISES schema', () => {
  const entries = Object.entries(EXERCISES);

  test('every exercise has a displayName string', () => {
    entries.forEach(([key, ex]) => {
      expect(typeof ex.displayName, key).toBe('string');
      expect(ex.displayName.length, key).toBeGreaterThan(0);
    });
  });

  test('every exercise has a positive sets count', () => {
    entries.forEach(([key, ex]) => {
      expect(typeof ex.sets, key).toBe('number');
      expect(ex.sets, key).toBeGreaterThan(0);
    });
  });

  test('every exercise with a progression block has required progression fields', () => {
    entries.forEach(([key, ex]) => {
      if (!ex.progression) return;
      const { increment, successesNeeded, targetReps } = ex.progression;
      expect(typeof increment,       `${key}.progression.increment`).toBe('number');
      expect(typeof successesNeeded, `${key}.progression.successesNeeded`).toBe('number');
      expect(typeof targetReps,      `${key}.progression.targetReps`).toBe('number');
      expect(successesNeeded, key).toBeGreaterThan(0);
      expect(targetReps, key).toBeGreaterThan(0);
    });
  });

  test('defaultWeight is a non-negative number on every exercise', () => {
    entries.forEach(([key, ex]) => {
      if (ex.defaultWeight == null) return;
      expect(typeof ex.defaultWeight, key).toBe('number');
      expect(ex.defaultWeight, key).toBeGreaterThanOrEqual(0);
    });
  });

  test('rest timings are ordered: easy <= hard <= failed', () => {
    entries.forEach(([key, ex]) => {
      if (!ex.rest) return;
      expect(ex.rest.easy,  `${key}.rest.easy`)  .toBeGreaterThan(0);
      expect(ex.rest.hard,  `${key}.rest.hard`)  .toBeGreaterThanOrEqual(ex.rest.easy);
      expect(ex.rest.failed,`${key}.rest.failed`).toBeGreaterThanOrEqual(ex.rest.hard);
    });
  });
});

describe('DAYS schema', () => {
  const dayEntries = Object.entries(DAYS);

  test('every step key in every day exists in EXERCISES', () => {
    dayEntries.forEach(([dayKey, day]) => {
      day.steps.forEach((step, idx) => {
        const keys = Array.isArray(step) ? step : [step];
        keys.forEach(k => {
          expect(EXERCISES[k], `DAYS['${dayKey}'].steps[${idx}] key '${k}'`).toBeDefined();
        });
      });
    });
  });

  test('superset steps contain exactly 2 exercise keys', () => {
    dayEntries.forEach(([dayKey, day]) => {
      day.steps.forEach((step, idx) => {
        if (Array.isArray(step)) {
          expect(step.length, `DAYS['${dayKey}'].steps[${idx}] superset`).toBe(2);
        }
      });
    });
  });

  test('every day has a non-empty label', () => {
    dayEntries.forEach(([key, day]) => {
      expect(typeof day.label, key).toBe('string');
      expect(day.label.length, key).toBeGreaterThan(0);
    });
  });

  test('every day has at least one step', () => {
    dayEntries.forEach(([key, day]) => {
      expect(day.steps.length, key).toBeGreaterThan(0);
    });
  });

  test('DAY_ROTATION contains only keys that exist in DAYS', () => {
    DAY_ROTATION.forEach(key => {
      expect(DAYS[key], `DAY_ROTATION key '${key}'`).toBeDefined();
    });
  });

  test('DAY_ROTATION has no duplicates', () => {
    expect(new Set(DAY_ROTATION).size).toBe(DAY_ROTATION.length);
  });

  test('DAY_LABELS has an entry for every key in DAYS', () => {
    Object.keys(DAYS).forEach(key => {
      expect(DAY_LABELS[key], `DAY_LABELS['${key}']`).toBeDefined();
    });
  });
});
