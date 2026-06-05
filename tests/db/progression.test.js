import { describe, test, expect, beforeEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { initDB, _resetDB, STORE_LOGS, _requireDB } from '../../src/db/connection.js';
import { getProgressionData, computeVolume } from '../../src/db/logs.js';
import { EXERCISES } from '../../src/data/exercises.js';

// Helper: write a raw set-log directly to the STORE_LOGS store.
// This bypasses stageSetLog so tests can control exactly what history exists.
async function insertLog({ exerciseKey, sets, date = new Date().toISOString(), seeded = false }) {
  const db  = _requireDB();
  const now = new Date(date);
  await new Promise((resolve, reject) => {
    const txn   = db.transaction(STORE_LOGS, 'readwrite');
    const store = txn.objectStore(STORE_LOGS);
    store.add({
      exerciseKey,
      exerciseName: EXERCISES[exerciseKey]?.displayName ?? exerciseKey,
      uid:          `test-${Date.now()}-${Math.random()}`,
      day:          'test',
      sets,
      date:         now.toISOString(),
      dateDisplay:  now.toLocaleString(),
      seeded,
    });
    txn.oncomplete = resolve;
    txn.onerror    = () => reject(txn.error);
  });
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  _resetDB();
  await initDB();
});

const KEY = 'barbell_bench_press'; // successesNeeded:1, increment:5, targetReps:5

describe('getProgressionData — new user / no real history', () => {
  test('returns defaultWeight as suggestedWeight when no real logs exist', async () => {
    // Seed records are written by initDB() but filtered out by _getRecentLogs.
    // The fallback should return ex.defaultWeight directly.
    const { suggestedWeight } = await getProgressionData(KEY);
    expect(suggestedWeight).toBe(EXERCISES[KEY].defaultWeight);
  });

  test('levelUp is false when there is no real history', async () => {
    const { levelUp } = await getProgressionData(KEY);
    expect(levelUp).toBe(false);
  });

  test('returns null suggestedWeight for an exercise with no progression config', async () => {
    // Find an exercise without a progression block (none currently, but guard anyway)
    const { suggestedWeight, levelUp } = await getProgressionData('nonexistent_key');
    expect(suggestedWeight).toBeNull();
    expect(levelUp).toBe(false);
  });
});

describe('getProgressionData — streak detection', () => {
  const goodSets = () => [
    { weight: '150', reps: '5' },
    { weight: '150', reps: '5' },
    { weight: '150', reps: '5' },
    { weight: '150', reps: '5' },
    { weight: '150', reps: '5' },
  ];

  test('levels up after one successful session (successesNeeded: 1)', async () => {
    await insertLog({ exerciseKey: KEY, sets: goodSets() });
    const { levelUp, suggestedWeight } = await getProgressionData(KEY);
    expect(levelUp).toBe(true);
    expect(suggestedWeight).toBe(150 + EXERCISES[KEY].progression.increment); // 155
  });

  test('reports the correct new weight after level-up', async () => {
    await insertLog({ exerciseKey: KEY, sets: goodSets() });
    const { suggestedWeight, prevWeight, increment } = await getProgressionData(KEY);
    expect(prevWeight).toBe(150);
    expect(increment).toBe(5);
    expect(suggestedWeight).toBe(155);
  });

  test('does not level up when reps fell short of target', async () => {
    await insertLog({
      exerciseKey: KEY,
      sets: [
        { weight: '150', reps: '4' }, // one rep short
        { weight: '150', reps: '5' },
        { weight: '150', reps: '5' },
        { weight: '150', reps: '5' },
        { weight: '150', reps: '5' },
      ],
    });
    const { levelUp } = await getProgressionData(KEY);
    expect(levelUp).toBe(false);
  });

  test('streak breaks on a failed session — no level-up despite earlier success', async () => {
    // Use barbell_shrugs which needs successesNeeded:2
    const SHRUGS = 'barbell_shrugs'; // successesNeeded:2, targetReps:10
    const good10 = Array(4).fill({ weight: '100', reps: '10' });
    const fail   = Array(4).fill({ weight: '100', reps: '8'  });

    // Older session first: success
    await insertLog({ exerciseKey: SHRUGS, sets: good10, date: '2025-01-01T10:00:00' });
    // Newer session: failure — breaks the streak
    await insertLog({ exerciseKey: SHRUGS, sets: fail,   date: '2025-01-02T10:00:00' });

    const { levelUp } = await getProgressionData(SHRUGS);
    expect(levelUp).toBe(false);
  });

  test('shows streak badge when streak > 0 but not yet enough for level-up', async () => {
    const SHRUGS = 'barbell_shrugs';
    const good10 = Array(4).fill({ weight: '100', reps: '10' });
    await insertLog({ exerciseKey: SHRUGS, sets: good10 }); // streak = 1 of 2 needed
    const { badge, levelUp } = await getProgressionData(SHRUGS);
    expect(levelUp).toBe(false);
    expect(badge).toContain('Streak 1/2');
  });

  test('seed records are excluded from streak computation', async () => {
    // Seed records written by initDB have reps = targetReps - 1.
    // They should never contribute to a streak.
    const { levelUp } = await getProgressionData(KEY);
    expect(levelUp).toBe(false); // seed alone is not enough
  });

  test('does not level up when increment is 0 (bodyweight exercise)', async () => {
    // copenhagen_planks has increment:0
    const PLANKS = 'copenhagen_planks';
    const fullSets = Array(3).fill({ weight: '0', reps: '20' });
    await insertLog({ exerciseKey: PLANKS, sets: fullSets });
    const { levelUp } = await getProgressionData(PLANKS);
    expect(levelUp).toBe(false);
  });
});

describe('computeVolume', () => {
  test('sums weight × reps across all sets and logs', () => {
    const logs = [
      { sets: [{ weight: '100', reps: '5' }, { weight: '100', reps: '5' }] },
      { sets: [{ weight: '50', reps: '10' }] },
    ];
    expect(computeVolume(logs)).toBe(1500); // 500 + 500 + 500
  });

  test('returns 0 for an empty log array', () => {
    expect(computeVolume([])).toBe(0);
  });

  test('returns 0 for bodyweight sets (weight "0")', () => {
    expect(computeVolume([{ sets: [{ weight: '0', reps: '10' }] }])).toBe(0);
  });

  test('returns 0 for logs with empty sets array', () => {
    expect(computeVolume([{ sets: [] }])).toBe(0);
  });

  test('handles non-numeric weight and reps without throwing', () => {
    expect(computeVolume([{ sets: [{ weight: '', reps: '' }] }])).toBe(0);
  });

  test('handles mixed valid and zero-weight sets', () => {
    const logs = [{ sets: [{ weight: '100', reps: '5' }, { weight: '0', reps: '10' }] }];
    expect(computeVolume(logs)).toBe(500);
  });
});
