import { describe, it, expect } from 'vitest';
import { dateRange, endOfDay, startOfDay } from './date-filter';

describe('dateRange', () => {
  it('returns an empty filter when neither bound is given', () => {
    expect(dateRange(undefined, undefined)).toEqual({});
    expect(dateRange('', '')).toEqual({});
  });

  it('keeps gte and lte as siblings so neither bound overwrites the other', () => {
    const range = dateRange('2026-09-01', '2026-09-30');
    expect(range.gte).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(range.lte).toEqual(new Date('2026-09-30T23:59:59.999Z'));
  });

  it('makes a date-only "to" bound cover the whole day', () => {
    // The regression this guards: `new Date('2026-09-30')` is midnight UTC, so
    // a `lte` bound built from it silently drops every later entry that day.
    const { lte } = dateRange(undefined, '2026-09-30');
    expect(lte!.getTime()).toBeGreaterThan(new Date('2026-09-30T12:00:00.000Z').getTime());
  });

  it('supports a single bound in either direction', () => {
    expect(dateRange('2026-09-01', undefined)).toEqual({ gte: new Date('2026-09-01T00:00:00.000Z') });
    expect(dateRange(undefined, '2026-09-30')).toEqual({ lte: new Date('2026-09-30T23:59:59.999Z') });
  });

  it('produces an ordering that startOfDay precedes endOfDay on the same day', () => {
    expect(startOfDay('2026-09-30').getTime()).toBeLessThan(endOfDay('2026-09-30').getTime());
  });
});
