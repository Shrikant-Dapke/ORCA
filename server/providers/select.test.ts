import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoMarineProvider } from './demo.js';
import { OpenMeteoMarineProvider } from './openMeteoMarine.js';
import { providerFromEnv } from './select.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('providerFromEnv', () => {
  it('defaults to the demo provider when unset (offline-safe)', () => {
    delete process.env.ORCA_DATA_SOURCE;
    expect(providerFromEnv()).toBeInstanceOf(DemoMarineProvider);
  });

  it('selects the live Open-Meteo provider when explicitly configured', () => {
    vi.stubEnv('ORCA_DATA_SOURCE', 'open-meteo');
    const p = providerFromEnv();
    expect(p).toBeInstanceOf(OpenMeteoMarineProvider);
    expect(p.dataSource).toBe('open-meteo');
  });

  it('falls back to demo (loudly) for unknown values — never silently live', () => {
    vi.stubEnv('ORCA_DATA_SOURCE', 'bogus-source');
    expect(providerFromEnv()).toBeInstanceOf(DemoMarineProvider);
  });
});
