import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildShareText, shareText } from '../../src/ui/share.js';

const SESSION = {
  day:         'heavy-a',
  startedAt:   new Date('2026-06-01T10:00:00Z').getTime(),
  completedAt: new Date('2026-06-01T11:00:00Z').getTime(),
};

const LOGS = [
  {
    exerciseKey:  'barbell_back_squat',
    exerciseName: 'Back Squat',
    sets: [
      { weight: '185', reps: '5' },
      { weight: '185', reps: '5' },
      { weight: '185', reps: '4' },
    ],
  },
];

// volume = (185 * 5) + (185 * 5) + (185 * 4) = 925 + 925 + 740 = 2590 lbs

describe('buildShareText', () => {
  test('includes the day label and date in the header', () => {
    const text = buildShareText(SESSION, LOGS);
    expect(text).toContain('Heavy A');
    expect(text).toContain('Jun 1');
  });

  test('includes duration when completedAt is set', () => {
    const text = buildShareText(SESSION, LOGS);
    expect(text).toContain('60 min');
  });

  test('omits duration when completedAt is null', () => {
    const text = buildShareText({ ...SESSION, completedAt: null }, LOGS);
    expect(text).not.toContain('min');
  });

  test('renders correct set emoji dots (🟩 hit, 🟨 one short, 🟥 failed)', () => {
    const text = buildShareText(SESSION, LOGS);
    expect(text).toContain('🟩🟩🟨'); // sets: 5,5,4 against target 5
  });

  test('includes volume line', () => {
    const text = buildShareText(SESSION, LOGS);
    expect(text).toContain('lbs total');
  });

  test('includes animal comparison line when volume > 0', () => {
    const text = buildShareText(SESSION, LOGS);
    expect(text).toContain("That's the weight of");
  });

  test('omits volume and animal lines when logs have no weight', () => {
    const bwLogs = [{ exerciseKey: 'barbell_back_squat', exerciseName: 'Squat', sets: [{ weight: '0', reps: '10' }] }];
    const text = buildShareText(SESSION, bwLogs);
    expect(text).not.toContain('lbs total');
    expect(text).not.toContain("That's the weight of");
  });

  test('truncates exercise names longer than 24 characters', () => {
    const longLogs = [{
      exerciseKey:  'barbell_back_squat',
      exerciseName: 'A Very Long Exercise Name Here',
      sets: [{ weight: '100', reps: '5' }],
    }];
    const text = buildShareText(SESSION, longLogs);
    expect(text).toContain('…');
    expect(text).not.toContain('A Very Long Exercise Name Here');
  });
});

describe('shareText', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('returns "shared" when navigator.share succeeds', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockResolvedValue(undefined) });
    expect(await shareText('hello')).toBe('shared');
    expect(navigator.share).toHaveBeenCalledWith({ text: 'hello' });
  });

  test('returns "error" when navigator.share is aborted by the user', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(err) });
    expect(await shareText('hello')).toBe('error');
  });

  test('falls through to clipboard when navigator.share throws a non-abort error', async () => {
    const err = Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' });
    vi.stubGlobal('navigator', {
      share:     vi.fn().mockRejectedValue(err),
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    expect(await shareText('hello')).toBe('copied');
  });

  test('returns "copied" when navigator.share is absent and clipboard succeeds', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await shareText('hello')).toBe('copied');
  });

  test('returns "error" when clipboard also fails', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    expect(await shareText('hello')).toBe('error');
  });
});
