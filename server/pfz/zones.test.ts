import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoPfzProvider, IncoisPfzProvider, NullPfz, nearestZone } from './providers.js';
import { pfzFromEnv } from './select.js';
import { ProviderError } from '../providers/types.js';

const CTX = { label: 'Your Fishing Area', topic: 'spot' as const, timeframe: 'general' as const };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DemoPfzProvider', () => {
  it('returns deterministic labeled demo zones relative to resolved waters', async () => {
    const zones = await new DemoPfzProvider().getZones(CTX);
    expect(zones).toHaveLength(2);
    expect(zones[0].live).toBe(false);
    expect(zones[0].source).toBe('Demo data');
    expect(zones[0].distanceKm).toBe(18);
    expect(zones[0].bearingCompass).toBe('NE');
    // stable across calls (deterministic demo)
    expect(await new DemoPfzProvider().getZones(CTX)).toEqual(zones);
  });

  it('derives zones from GPS fixes when present', async () => {
    const zones = await new DemoPfzProvider().getZones({
      ...CTX,
      coordinates: { latitude: 19.05, longitude: 71.9 },
    });
    expect(zones[0].latitude).toBeCloseTo(19.18, 1);
  });
});

describe('nearestZone', () => {
  it('picks the closest zone and null for empty', async () => {
    const zones = await new DemoPfzProvider().getZones(CTX);
    expect(nearestZone(zones)?.id).toBe('demo-zone-1');
    expect(nearestZone([])).toBeNull();
  });
});

describe('honest stubs', () => {
  it('NullPfz returns no zones', async () => {
    await expect(new NullPfz().getZones(CTX)).resolves.toEqual([]);
  });

  it('IncoisPfzProvider fails honestly instead of inventing PFZ', async () => {
    await expect(new IncoisPfzProvider().getZones(CTX)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('pfzFromEnv', () => {
  it('selects demo/none explicitly and pairs by default', () => {
    vi.stubEnv('ORCA_PFZ_SOURCE', 'demo');
    expect(pfzFromEnv().pfzSource).toBe('demo');
    vi.stubEnv('ORCA_PFZ_SOURCE', 'none');
    expect(pfzFromEnv().pfzSource).toBe('none');
    vi.stubEnv('ORCA_PFZ_SOURCE', '');
    expect(pfzFromEnv(process.env, 'demo').pfzSource).toBe('demo');
    expect(pfzFromEnv(process.env, 'open-meteo').pfzSource).toBe('none');
  });
});
