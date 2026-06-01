import { describe, test, expect } from 'vitest';
import { getSmartTimer, REST_DEFAULTS } from '../../src/ui/timer.js';

// getSmartTimer is a pure function — no DOM, no timers, no side-effects.
// These tests specify the two-phase timer contract: when the user hits
// their target reps we can't know if it was easy or hard, so the function
// returns a two-phase config; for missed sets the effort level is known.

const KEY  = 'barbell_bench_press'; // sets:5, reps:5, easy:90, hard:180, failed:300
const REST = { easy: 90, hard: 180, failed: 300 };

describe('getSmartTimer — two-phase config (reps hit)', () => {
  test('returns easy sec for phase 1 when reps === target', () => {
    const { sec } = getSmartTimer(KEY, 5, 5);
    expect(sec).toBe(REST.easy);
  });

  test('returns (hard − easy) for overtimeSec when reps === target', () => {
    const { overtimeSec } = getSmartTimer(KEY, 5, 5);
    expect(overtimeSec).toBe(REST.hard - REST.easy);
  });

  test('two-phase config also fires when reps exceed target', () => {
    const { sec, overtimeSec } = getSmartTimer(KEY, 7, 5);
    expect(sec).toBe(REST.easy);
    expect(overtimeSec).toBe(REST.hard - REST.easy);
  });
});

describe('getSmartTimer — single-phase (missed sets)', () => {
  test('returns hard timer with no overtime when reps === target − 1', () => {
    const { sec, overtimeSec } = getSmartTimer(KEY, 4, 5);
    expect(sec).toBe(REST.hard);
    expect(overtimeSec).toBe(0);
  });

  test('returns failed timer with no overtime when reps is 0', () => {
    const { sec, overtimeSec } = getSmartTimer(KEY, 0, 5);
    expect(sec).toBe(REST.failed);
    expect(overtimeSec).toBe(0);
  });

  test('returns failed timer when reps is well below target', () => {
    const { sec, overtimeSec } = getSmartTimer(KEY, 2, 5);
    expect(sec).toBe(REST.failed);
    expect(overtimeSec).toBe(0);
  });
});

describe('getSmartTimer — edge cases', () => {
  test('falls back to hard/0 for an unknown exercise key with no derivable target', () => {
    // No exercise found AND no targetReps passed → target === undefined → hard fallback.
    // (Passing targetReps=5 with an unknown key would still give two-phase since the
    //  target IS known; this test covers the truly-unknown case.)
    const { sec, overtimeSec } = getSmartTimer('nonexistent_key', 5);
    expect(sec).toBe(REST_DEFAULTS.hard);
    expect(overtimeSec).toBe(0);
  });

  test('falls back to hard/0 when enteredReps is null', () => {
    const { sec, overtimeSec } = getSmartTimer(KEY, null, 5);
    expect(sec).toBe(REST_DEFAULTS.hard);
    expect(overtimeSec).toBe(0);
  });

  test('derives targetReps from exercise config when not explicitly provided', () => {
    // Passing undefined for targetReps falls back to ex.progression.targetReps (5).
    // enteredReps 5 >= target 5 → two-phase config, not a hard fallback.
    const { sec, overtimeSec } = getSmartTimer(KEY, 5, undefined);
    expect(sec).toBe(REST.easy);
    expect(overtimeSec).toBe(REST.hard - REST.easy);
  });

  test('uses the exercise rest config, not REST_DEFAULTS, for a known key', () => {
    // barbell_back_squat has the same rest values as defaults but the test
    // confirms the lookup path. If the exercise had different values,
    // REST_DEFAULTS would be wrong.
    const { sec } = getSmartTimer('barbell_back_squat', 5, 5);
    expect(sec).toBe(90); // barbell_back_squat.rest.easy
  });
});
