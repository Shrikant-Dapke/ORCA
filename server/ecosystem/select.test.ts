import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoEcosystemProvider } from './demoEcosystem.js';
import { IncoisEcosystemProvider } from './incoisEcosystem.js';
import { ecosystemFromEnv } from './select.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ecosystemFromEnv', () => {
  it('selects demo explicitly', () => {
    vi.stubEnv('ORCA_ECOSYSTEM_SOURCE', 'demo');
    const p = ecosystemFromEnv();
    expect(p).toBeInstanceOf(DemoEcosystemProvider);
    expect(p.ecosystemSource).toBe('demo');
  });

  it('selects incois explicitly', () => {
    vi.stubEnv('ORCA_ECOSYSTEM_SOURCE', 'incois');
    const p = ecosystemFromEnv();
    expect(p).toBeInstanceOf(IncoisEcosystemProvider);
    expect(p.dataset).toBe('NOAA_AVHRR_AMSR_datasets');
  });

  it('selects none explicitly', () => {
    vi.stubEnv('ORCA_ECOSYSTEM_SOURCE', 'none');
    expect(ecosystemFromEnv().ecosystemSource).toBe('none');
  });

  it('pairs demo ecosystem with demo marine by default', () => {
    vi.stubEnv('ORCA_ECOSYSTEM_SOURCE', '');
    expect(ecosystemFromEnv(process.env, 'demo')).toBeInstanceOf(DemoEcosystemProvider);
  });

  it('pairs live INCOIS ecosystem with live marine by default', () => {
    vi.stubEnv('ORCA_ECOSYSTEM_SOURCE', '');
    const p = ecosystemFromEnv(process.env, 'open-meteo');
    expect(p).toBeInstanceOf(IncoisEcosystemProvider);
  });
});

describe('DemoEcosystemProvider', () => {
  it('returns labeled demo values, never live', async () => {
    const r = await new DemoEcosystemProvider().getConditions({
      label: 'X',
      topic: 'general',
      timeframe: 'general',
    });
    expect(r.live).toBe(false);
    expect(r.source).toBe('Demo data');
    expect(r.sst?.unit).toBe('°C');
    expect(r.chlorophyll?.unit).toBe('mg/m³');
  });
});
