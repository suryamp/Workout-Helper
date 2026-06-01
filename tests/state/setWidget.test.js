// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock timer.js so startTimer/getSmartTimer don't need a DOM or real intervals.
vi.mock('../../src/ui/timer.js', () => ({
  getSmartTimer: vi.fn().mockReturnValue({ sec: 90, overtimeSec: 90 }),
  startTimer:    vi.fn(),
}));

// Mock modals.js — openWeightModal is referenced in rendered HTML onclick attrs
// and imported by setWidget.js.
vi.mock('../../src/ui/modals.js', () => ({
  openWeightModal: vi.fn(),
}));

import {
  initSetState,
  getState,
  clearDayState,
  tapPill,
} from '../../src/state/setWidget.js';
import { startTimer } from '../../src/ui/timer.js';

const DAY = 'test';
const UID = 'test-0-0';

function setup(numSets = 3, targetReps = 5) {
  document.body.innerHTML = `<div id="sw-${UID}"></div>`;
  initSetState(UID, numSets, 100, targetReps, 'barbell_bench_press', 'Bench Press');
}

beforeEach(() => {
  clearDayState(DAY);
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initSetState', () => {
  test('creates state with the correct number of pills', () => {
    setup(4);
    expect(getState(UID).pills.length).toBe(4);
  });

  test('initialises all pills as empty (reps: null, locked: false)', () => {
    setup();
    const { pills } = getState(UID);
    expect(pills.every(p => p.reps === null && !p.locked)).toBe(true);
  });

  test('stores suggestedWeight, targetReps, exKey, and exName', () => {
    setup();
    const s = getState(UID);
    expect(s.weight).toBe(100);
    expect(s.targetReps).toBe(5);
    expect(s.exKey).toBe('barbell_bench_press');
    expect(s.exName).toBe('Bench Press');
  });

  test('is idempotent — a second call with different args does not overwrite', () => {
    setup(3, 5);
    initSetState(UID, 5, 200, 10, 'squat', 'Squat');
    const s = getState(UID);
    expect(s.pills.length).toBe(3); // original
    expect(s.weight).toBe(100);     // original
  });
});

describe('tapPill — rep cycling', () => {
  test('first tap sets reps to targetReps', () => {
    setup(3, 5);
    tapPill(UID, 0);
    expect(getState(UID).pills[0].reps).toBe(5);
  });

  test('second tap decrements reps by 1', () => {
    setup(3, 5);
    tapPill(UID, 0);
    tapPill(UID, 0);
    expect(getState(UID).pills[0].reps).toBe(4);
  });

  test('reps wrap from 0 back to targetReps', () => {
    setup(3, 3);
    tapPill(UID, 0); // 3
    tapPill(UID, 0); // 2
    tapPill(UID, 0); // 1
    tapPill(UID, 0); // 0
    expect(getState(UID).pills[0].reps).toBe(0);
    tapPill(UID, 0); // wraps → 3
    expect(getState(UID).pills[0].reps).toBe(3);
  });

  test('each pill is independent — tapping pill 1 does not affect pill 2', () => {
    setup(3, 5);
    tapPill(UID, 0);
    tapPill(UID, 0);
    expect(getState(UID).pills[0].reps).toBe(4);
    expect(getState(UID).pills[1].reps).toBeNull();
  });
});

describe('tapPill — debounce and auto-lock', () => {
  test('pill is not locked before the debounce fires', () => {
    setup();
    tapPill(UID, 0);
    vi.advanceTimersByTime(1400);
    expect(getState(UID).pills[0].locked).toBe(false);
  });

  test('pill locks and startTimer is called after 1500 ms of inactivity', () => {
    setup();
    tapPill(UID, 0);
    vi.advanceTimersByTime(1500);
    expect(getState(UID).pills[0].locked).toBe(true);
    expect(startTimer).toHaveBeenCalledOnce();
  });

  test('tapping again before the debounce resets the countdown', () => {
    setup(3, 5);
    tapPill(UID, 0);         // starts debounce
    vi.advanceTimersByTime(1000); // 1000 ms elapsed
    tapPill(UID, 0);         // resets debounce
    vi.advanceTimersByTime(1000); // only 1000 ms since last tap — not yet
    expect(getState(UID).pills[0].locked).toBe(false);
    vi.advanceTimersByTime(500);  // now 1500 ms since last tap
    expect(getState(UID).pills[0].locked).toBe(true);
  });

  test('each pill has its own independent debounce', () => {
    setup(3, 5);
    tapPill(UID, 0);
    vi.advanceTimersByTime(700);
    tapPill(UID, 1); // second pill starts its own 1500 ms countdown
    vi.advanceTimersByTime(800); // pill 0 fires (1500 ms total), pill 1 not yet
    expect(getState(UID).pills[0].locked).toBe(true);
    expect(getState(UID).pills[1].locked).toBe(false);
    vi.advanceTimersByTime(700); // pill 1 now fires
    expect(getState(UID).pills[1].locked).toBe(true);
  });

  test('locked pill weight is snapshotted from s.weight at lock time', () => {
    setup();
    tapPill(UID, 0);
    vi.advanceTimersByTime(1500);
    expect(getState(UID).pills[0].weight).toBe(100);
  });
});

describe('tapPill — unlock', () => {
  test('tapping a locked pill sets locked to false', () => {
    setup();
    tapPill(UID, 0);
    vi.advanceTimersByTime(1500); // lock it
    expect(getState(UID).pills[0].locked).toBe(true);
    tapPill(UID, 0);              // unlock it
    expect(getState(UID).pills[0].locked).toBe(false);
  });

  test('unlocking a pill does not immediately re-lock it', () => {
    setup();
    tapPill(UID, 0);
    vi.advanceTimersByTime(1500); // lock
    tapPill(UID, 0);              // unlock — clears the debounce timer
    vi.advanceTimersByTime(1500); // no new debounce was started on unlock
    expect(getState(UID).pills[0].locked).toBe(false);
  });

  test('reps are preserved after unlock so user can see what was locked', () => {
    setup(3, 5);
    tapPill(UID, 0);  // sets reps to 5
    tapPill(UID, 0);  // decrements to 4
    vi.advanceTimersByTime(1500);
    expect(getState(UID).pills[0].reps).toBe(4);
    tapPill(UID, 0); // unlock
    expect(getState(UID).pills[0].reps).toBe(4); // unchanged
  });
});

describe('clearDayState', () => {
  test('removes all state for the given day prefix', () => {
    initSetState('monday-0-0', 3, 80, 5, 'bench', 'Bench');
    initSetState('monday-1-0', 3, 60, 8, 'row', 'Row');
    initSetState('tuesday-0-0', 3, 40, 12, 'curl', 'Curl');

    clearDayState('monday');

    expect(getState('monday-0-0')).toBeUndefined();
    expect(getState('monday-1-0')).toBeUndefined();
    expect(getState('tuesday-0-0')).toBeDefined();
  });

  test('cancels pending debounce timers so locked pills do not fire after abandon', () => {
    document.body.innerHTML += '<div id="sw-monday-0-0"></div>';
    initSetState('monday-0-0', 3, 80, 5, 'bench', 'Bench');
    tapPill('monday-0-0', 0); // starts debounce
    clearDayState('monday');
    vi.advanceTimersByTime(2000); // debounce would have fired here
    // startTimer should NOT have been called
    expect(startTimer).not.toHaveBeenCalled();
  });
});
