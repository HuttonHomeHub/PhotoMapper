import { describe, it, expect } from 'vitest';
import { readConfig } from '../server/config.ts';

// Settings to the shared container standard, read with the hhh-platform kit.
describe('settings', () => {
  it('has the documented defaults', () => {
    const { config, deprecated } = readConfig({});
    expect(config.trustProxyHops).toBe(0);
    expect(config.apiRate).toEqual({ limit: 1000, windowMs: 15 * 60_000 });
    expect(config.uploadMaxBytes).toBe(60 * 1024 * 1024);
    expect(config.allowReset).toBe(false);
    expect(config.appVersion).toBe('dev');
    expect(deprecated).toEqual([]);
  });

  it('reads TRUST_PROXY as a hop count', () => {
    expect(readConfig({ TRUST_PROXY: '1' }).config.trustProxyHops).toBe(1);
    expect(readConfig({ TRUST_PROXY: 'true' }).config.trustProxyHops).toBe(1);
    expect(readConfig({ TRUST_PROXY: 'false' }).config.trustProxyHops).toBe(0);
  });

  it('reads API_RATE in the shared "<n> per [<k>] <unit>" form', () => {
    expect(readConfig({ API_RATE: '60 per minute' }).config.apiRate).toEqual({
      limit: 60,
      windowMs: 60_000,
    });
  });

  it('still honours the old RATE_LIMIT_* settings, reporting them as deprecated', () => {
    const { config, deprecated } = readConfig({
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_MAX: '50',
    });
    expect(config.apiRate).toEqual({ limit: 50, windowMs: 60_000 });
    expect(deprecated).toEqual([
      ['RATE_LIMIT_WINDOW_MS', 'API_RATE'],
      ['RATE_LIMIT_MAX', 'API_RATE'],
    ]);
  });

  it('lets API_RATE win over the old names, without a warning', () => {
    const { config, deprecated } = readConfig({ API_RATE: '5 per second', RATE_LIMIT_MAX: '50' });
    expect(config.apiRate).toEqual({ limit: 5, windowMs: 1000 });
    expect(deprecated).toEqual([]);
  });

  it('stops startup on a bad value, naming the setting', () => {
    expect(() => readConfig({ TRUST_PROXY: '10.0.0.0/8' })).toThrow(/TRUST_PROXY/);
    expect(() => readConfig({ API_RATE: 'lots' })).toThrow(/API_RATE/);
    expect(() => readConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});
