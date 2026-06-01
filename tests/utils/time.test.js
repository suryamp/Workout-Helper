import { describe, test, expect } from 'vitest';
import { getLogicalDay, endOfLogicalDay } from '../../src/utils/time.js';

// Build a local-time timestamp from an ISO-like string (no Z = local time).
// This keeps tests consistent regardless of the machine's timezone because
// getLogicalDay also uses new Date() in local time.
function local(str) { return new Date(str).getTime(); }

describe('getLogicalDay', () => {
  test('maps a late-evening timestamp to the same calendar day', () => {
    expect(getLogicalDay(local('2025-03-15T23:00:00'))).toBe('2025-03-15');
  });

  test('maps a noon timestamp to the same calendar day', () => {
    expect(getLogicalDay(local('2025-03-15T12:00:00'))).toBe('2025-03-15');
  });

  test('maps 2:59 AM to the PREVIOUS calendar day (within 3 AM cutoff)', () => {
    expect(getLogicalDay(local('2025-03-15T02:59:00'))).toBe('2025-03-14');
  });

  test('maps exactly 3:00 AM to the CURRENT calendar day (at the cutoff boundary)', () => {
    expect(getLogicalDay(local('2025-03-15T03:00:00'))).toBe('2025-03-15');
  });

  test('maps one second before 3:00 AM to the previous calendar day', () => {
    expect(getLogicalDay(local('2025-03-15T02:59:59'))).toBe('2025-03-14');
  });

  test('returns a string in YYYY-MM-DD format', () => {
    const result = getLogicalDay(local('2025-06-01T12:00:00'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('pads single-digit month and day with leading zeros', () => {
    expect(getLogicalDay(local('2025-01-05T12:00:00'))).toBe('2025-01-05');
  });

  test('defaults to the current moment when called with no argument', () => {
    const expected = getLogicalDay(Date.now());
    expect(getLogicalDay()).toBe(expected);
  });
});

describe('endOfLogicalDay', () => {
  test('result falls within the same logical day as the input', () => {
    const ts  = local('2025-03-15T20:00:00');
    const end = endOfLogicalDay(ts);
    expect(getLogicalDay(end)).toBe(getLogicalDay(ts));
  });

  test('result is strictly after the input timestamp', () => {
    const ts = local('2025-03-15T20:00:00');
    expect(endOfLogicalDay(ts)).toBeGreaterThan(ts);
  });

  test('a timestamp 1 ms after the result belongs to the NEXT logical day', () => {
    const ts  = local('2025-03-15T20:00:00');
    const end = endOfLogicalDay(ts);
    expect(getLogicalDay(end + 1)).not.toBe(getLogicalDay(ts));
  });

  test('correctly handles late-night inputs within the 3 AM boundary', () => {
    // 2 AM on the 15th belongs to the logical day of the 14th
    const ts = local('2025-03-15T02:00:00');
    expect(getLogicalDay(endOfLogicalDay(ts))).toBe('2025-03-14');
  });

  test('round-trip: endOfLogicalDay and getLogicalDay agree on the same day', () => {
    const ts    = local('2025-06-01T18:30:00');
    const end   = endOfLogicalDay(ts);
    expect(getLogicalDay(end)).toBe(getLogicalDay(ts));
    expect(getLogicalDay(end + 1)).not.toBe(getLogicalDay(ts));
  });
});
