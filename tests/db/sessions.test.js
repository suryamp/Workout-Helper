import { describe, test, expect, beforeEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { initDB, _resetDB, STORE_LOGS, STORE_ACTIVE, STORE_COMPLETED, _requireDB } from '../../src/db/connection.js';
import {
  stageSetLog,
  abandonSession,
  completeSession,
  getActiveSessions,
  putActiveSession,
  deleteActiveSession,
  getCompletedSessions,
} from '../../src/db/sessions.js';
import { getHistory, getSessionDetails } from '../../src/db/logs.js';
import { getLog }                        from '../../src/telemetry.js';
import { getLogicalDay, endOfLogicalDay } from '../../src/utils/time.js';

// Pull session-level functions under test via session.js (business logic layer)
import {
  maybeStartSession,
  reconcileStaleSessions,
  getNextDay,
  completeSession as sessionCompleteSession,
} from '../../src/state/session.js';

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  localStorage.clear();
  _resetDB();
  await initDB();
});

// ─── Low-level session CRUD ───────────────────────────────────────────────────

describe('stageSetLog + completeSession (db layer)', () => {
  test('staged logs are flushed to STORE_LOGS on completeSession', async () => {
    const day = 'heavy-a';
    const session = {
      logicalDay:  getLogicalDay(),
      day,
      startedAt:   Date.now(),
      completedAt: Date.now(),
    };

    stageSetLog(day, {
      exerciseKey:  'barbell_bench_press',
      exerciseName: 'Barbell Bench Press',
      uid:          `${day}-0-0`,
      sets:         [{ weight: '150', reps: '5' }],
    });

    await putActiveSession({ ...session, completedAt: null });
    await completeSession(day, session);

    const history = await getHistory({ includeSeeded: false });
    expect(history.some(e => e.exerciseKey === 'barbell_bench_press')).toBe(true);
  });

  test('active session is removed from STORE_ACTIVE after completeSession', async () => {
    const day = 'heavy-a';
    const logicalDay = getLogicalDay();
    const session = { logicalDay, day, startedAt: Date.now(), completedAt: Date.now() };

    await putActiveSession({ ...session, completedAt: null });
    await completeSession(day, session);

    const active = await getActiveSessions();
    expect(active[logicalDay]).toBeUndefined();
  });

  test('completed session appears in STORE_COMPLETED after completeSession', async () => {
    const day = 'heavy-a';
    const session = { logicalDay: getLogicalDay(), day, startedAt: Date.now(), completedAt: Date.now() };
    await putActiveSession({ ...session, completedAt: null });
    await completeSession(day, session);

    const completed = await getCompletedSessions();
    expect(completed.some(s => s.logicalDay === session.logicalDay)).toBe(true);
  });

  test('abandonSession discards staged logs without writing to IDB', async () => {
    const day = 'heavy-a';
    stageSetLog(day, {
      exerciseKey:  'barbell_bench_press',
      exerciseName: 'Barbell Bench Press',
      uid:          `${day}-0-0`,
      sets:         [{ weight: '150', reps: '5' }],
    });
    abandonSession(day);

    // No session was started so completeSession guard would fire anyway,
    // but the staged log should also be gone — verify nothing was written.
    const history = await getHistory({ includeSeeded: false });
    expect(history.length).toBe(0);
  });
});

// ─── Session lifecycle (state layer) ─────────────────────────────────────────

describe('maybeStartSession', () => {
  test('creates an active session for today', async () => {
    await maybeStartSession('heavy-a');
    const sessions = await getActiveSessions();
    expect(sessions[getLogicalDay()]).toBeDefined();
    expect(sessions[getLogicalDay()].day).toBe('heavy-a');
  });

  test('is idempotent — second call for the same logical day is a no-op', async () => {
    await maybeStartSession('heavy-a');
    await maybeStartSession('heavy-a'); // should not throw or duplicate
    const sessions = await getActiveSessions();
    const keys = Object.keys(sessions);
    expect(keys.length).toBe(1);
  });
});

describe('session completeSession guard (state layer)', () => {
  test('is idempotent — calling completeSession twice does not double-commit', async () => {
    await maybeStartSession('heavy-a');
    await sessionCompleteSession('heavy-a');
    await sessionCompleteSession('heavy-a'); // second call must be a no-op

    const completed = await getCompletedSessions();
    const forToday  = completed.filter(s => s.logicalDay === getLogicalDay());
    expect(forToday.length).toBe(1);
  });
});

describe('reconcileStaleSessions', () => {
  test('closes a session started on a previous logical day', async () => {
    // Plant a session with a startedAt 2 days ago (safely in a different logical day)
    const twoDaysAgo  = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const oldLogDay   = getLogicalDay(twoDaysAgo);
    await putActiveSession({
      logicalDay:  oldLogDay,
      day:         'heavy-a',
      startedAt:   twoDaysAgo,
      completedAt: null,
    });

    await reconcileStaleSessions();

    // Session should have moved from active → completed
    const active    = await getActiveSessions();
    const completed = await getCompletedSessions();
    expect(active[oldLogDay]).toBeUndefined();
    expect(completed.some(s => s.logicalDay === oldLogDay)).toBe(true);
  });

  test('does NOT close a session that started today', async () => {
    await maybeStartSession('heavy-a');
    await reconcileStaleSessions();
    const active = await getActiveSessions();
    expect(active[getLogicalDay()]).toBeDefined();
  });

  test('synthesises completedAt as end-of-logical-day for reconciled sessions', async () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const oldLogDay  = getLogicalDay(twoDaysAgo);
    await putActiveSession({
      logicalDay:  oldLogDay, day: 'heavy-a',
      startedAt:   twoDaysAgo, completedAt: null,
    });

    await reconcileStaleSessions();

    const completed = await getCompletedSessions();
    const reconciled = completed.find(s => s.logicalDay === oldLogDay);
    expect(reconciled.completedAt).toBe(endOfLogicalDay(twoDaysAgo));
  });
});

describe('behavioral telemetry events', () => {
  test('session_started is captured by maybeStartSession', async () => {
    await maybeStartSession('heavy-a');
    const log = getLog();
    expect(log.some(e => e.event === 'session_started' && e.data.day === 'heavy-a')).toBe(true);
  });

  test('session_completed is captured with duration and counts', async () => {
    await maybeStartSession('heavy-a');
    stageSetLog('heavy-a', {
      exerciseKey: 'barbell_bench_press', exerciseName: 'Barbell Bench Press',
      uid: 'heavy-a-0-0', sets: [{ weight: '150', reps: '10' }, { weight: '150', reps: '10' }],
    });
    await sessionCompleteSession('heavy-a');
    const log = getLog();
    const ev  = log.find(e => e.event === 'session_completed');
    expect(ev).toBeDefined();
    expect(ev.data.day).toBe('heavy-a');
    expect(ev.data.setCount).toBe(2);
    expect(ev.data.exerciseCount).toBe(1);
    expect(typeof ev.data.durationMins).toBe('number');
  });

  test('session_abandoned is captured by abandonSession', async () => {
    await maybeStartSession('heavy-a');
    const { abandonSession: stateAbandon } = await import('../../src/state/session.js');
    await stateAbandon('heavy-a');
    const log = getLog();
    expect(log.some(e => e.event === 'session_abandoned' && e.data.day === 'heavy-a')).toBe(true);
  });
});

describe('progressionMap snapshot on completeSession', () => {
  test('session record has progressionMap after completeSession', async () => {
    const day     = 'heavy-a';
    const session = { logicalDay: getLogicalDay(), day, startedAt: Date.now() - 1000, completedAt: Date.now() };

    stageSetLog(day, {
      exerciseKey:  'barbell_bench_press',
      exerciseName: 'Barbell Bench Press',
      uid:          `${day}-0-0`,
      sets:         [{ weight: '150', reps: '10' }],
    });

    await putActiveSession({ ...session, completedAt: null });
    await completeSession(day, session);

    const completed = await getCompletedSessions();
    const saved = completed.find(s => s.startedAt === session.startedAt);
    expect(saved.progressionMap).toBeDefined();
    expect(saved.progressionMap['barbell_bench_press']).toBeDefined();
  });

  test('getSessionDetails reads levelUp from progressionMap, not live recomputation', async () => {
    const day     = 'heavy-a';
    const session = { logicalDay: getLogicalDay(), day, startedAt: Date.now() - 1000, completedAt: Date.now() };

    stageSetLog(day, {
      exerciseKey:  'barbell_bench_press',
      exerciseName: 'Barbell Bench Press',
      uid:          `${day}-0-0`,
      sets:         [{ weight: '150', reps: '10' }],
    });

    await putActiveSession({ ...session, completedAt: null });
    await completeSession(day, session);

    const details = await getSessionDetails(session.startedAt);
    const ex      = details.exercises.find(e => e.exerciseKey === 'barbell_bench_press');

    const completed = await getCompletedSessions();
    const saved     = completed.find(s => s.startedAt === session.startedAt);

    expect(ex.levelUp).toBe(saved.progressionMap['barbell_bench_press'].levelUp);
    expect(ex.streak).toBe(saved.progressionMap['barbell_bench_press'].streak);
  });
});

describe('getNextDay rotation', () => {
  test('defaults to heavy-a when there is no completed session history', async () => {
    expect(await getNextDay()).toBe('heavy-a');
  });

  test('returns the next day in DAY_ROTATION after the last completed day', async () => {
    // Complete a 'heavy-a' session → next should be 'acc-a'
    const session = {
      logicalDay:  getLogicalDay(),
      day:         'heavy-a',
      startedAt:   Date.now() - 1000,
      completedAt: Date.now(),
    };
    await putActiveSession({ ...session, completedAt: null });
    await completeSession('heavy-a', session);

    expect(await getNextDay()).toBe('acc-a');
  });

  test('wraps around to the first rotation entry after the last day', async () => {
    // Complete 'acc-b' (last in rotation) → next should be 'heavy-a'
    const session = {
      logicalDay:  getLogicalDay(),
      day:         'acc-b',
      startedAt:   Date.now() - 1000,
      completedAt: Date.now(),
    };
    await putActiveSession({ ...session, completedAt: null });
    await completeSession('acc-b', session);

    expect(await getNextDay()).toBe('heavy-a');
  });
});
