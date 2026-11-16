import { describe, it, expect } from 'vitest';
import { parseTrustProxy } from '../server/config.ts';

// Trust-proxy config parsing: behind a reverse proxy this drives Express's
// `trust proxy` so req.ip / rate-limiting use the real client, not the proxy.
describe('parseTrustProxy', () => {
  it('is off by default (unset / empty / false)', () => {
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('  ')).toBe(false);
  });

  it('parses a hop count into a number', () => {
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy(' 1 ')).toBe(1);
  });

  it('parses "true"', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });

  it('passes an IP/subnet list or preset through unchanged', () => {
    expect(parseTrustProxy('127.0.0.1, 10.0.0.0/8')).toBe('127.0.0.1, 10.0.0.0/8');
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });
});
