import { describe, it, expect } from 'vitest';
import { formatDate } from '../../src/lib/format.ts';

describe('formatDate', () => {
  it('returns null for empty input', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate('')).toBeNull();
    expect(formatDate(undefined)).toBeNull();
  });

  it('formats a valid ISO date to a non-empty locale string', () => {
    const out = formatDate('2021-06-01T10:00:00.000Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});
