import { describe, expect, it } from 'vitest';
import {
  IncoisEcosystemProvider,
  type FetchFn,
} from './incoisEcosystem.js';
import { ProviderError } from '../providers/types.js';

/**
 * All HTTP is stubbed — never the live catalog. Fixtures mirror the real
 * ERDDAP griddap shape: { table: { columnNames, rows } }.
 */

const NOW = Date.parse('2026-09-10T05:30:00Z');
const FRESH_T = '2026-09-09T12:00:00Z';
const STALE_T = '2026-08-01T12:00:00Z';

const CTX = { label: 'Your Fishing Area', topic: 'general' as const, timeframe: 'general' as const };

function grid(
  times: string[],
  lats: number[],
  lons: number[],
  sst: (t: string, la: number, lo: number) => number | null,
) {
  const rows: unknown[][] = [];
  for (const t of times) for (const la of lats) for (const lo of lons) rows.push([t, 0, la, lo, sst(t, la, lo)]);
  return { table: { columnNames: ['time', 'zlev', 'latitude', 'longitude', 'sst'], rows } };
}

const LATS = [9.25, 9.5, 9.75];
const LONS = [75.25, 75.5, 75.75];

function stubFetch(body: unknown, onCall?: (url: string) => void): FetchFn {
  return (async (url: string) => {
    onCall?.(url);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as FetchFn;
}

describe('fresh SST acceptance', () => {
  it('normalizes a fresh observation with units and actual grid location', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], LATS, LONS, () => 28.44)),
      clock: () => NOW,
    });
    const r = await p.getConditions(CTX);
    expect(r.sst).toEqual({ value: 28.4, unit: '°C' });
    expect(r.source).toBe('INCOIS ERDDAP');
    expect(r.dataset).toBe('NOAA_AVHRR_AMSR_datasets');
    expect(r.live).toBe(true);
    expect(r.observedAt).toBe('2026-09-09T12:00:00.000Z');
    expect(r.latitude).toBe(9.5);
    expect(r.longitude).toBe(75.5);
  });

  it('preserves the ACTUAL nearest grid point, not the request point', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], [9.0, 9.6], [75.0], () => 27.1)),
      clock: () => NOW,
    });
    const r = await p.getConditions(CTX);
    expect(r.latitude).toBe(9.6);
  });

  it('prefers the latest time over nearer older points', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid(['2026-09-08T12:00:00Z', FRESH_T], [9.5], [75.5], (t) => (t.startsWith('2026-09-08') ? 20 : 29))),
      clock: () => NOW,
    });
    const r = await p.getConditions(CTX);
    expect(r.sst?.value).toBe(29);
  });

  it('leaves chlorophyll undefined — no current dataset, never fabricated', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], LATS, LONS, () => 28)),
      clock: () => NOW,
    });
    expect((await p.getConditions(CTX)).chlorophyll).toBeUndefined();
  });
});

describe('staleness gate (never label history as live)', () => {
  it('rejects observations older than the window', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([STALE_T], LATS, LONS, () => 28)),
      clock: () => NOW,
    });
    await expect(p.getConditions(CTX)).rejects.toMatchObject({ name: 'ProviderError' });
  });

  it('honors a custom ORCA_ECOSYSTEM_MAX_AGE_HOURS-style override', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], LATS, LONS, () => 28)),
      clock: () => NOW,
      maxAgeHours: 1,
    });
    await expect(p.getConditions(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('rejects fill values and out-of-range junk as missing', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], LATS, LONS, () => -9.99)),
      clock: () => NOW,
    });
    await expect(p.getConditions(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('rejects empty recent windows (what a stale catalog returns live)', async () => {
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch({ table: { columnNames: ['time', 'zlev', 'latitude', 'longitude', 'sst'], rows: [] } }),
      clock: () => NOW,
    });
    await expect(p.getConditions(CTX)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('malformed and transport failures', () => {
  it.each([
    ['empty object', {}],
    ['no table', { foo: 1 }],
    ['missing sst column', { table: { columnNames: ['time'], rows: [['x']] } }],
  ])('throws ProviderError for %s', async (_name, body) => {
    const p = new IncoisEcosystemProvider({ fetchFn: stubFetch(body), clock: () => NOW });
    await expect(p.getConditions(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError for non-JSON bodies', async () => {
    const fetchFn = (async () => new Response('not json', { status: 200 })) as FetchFn;
    const p = new IncoisEcosystemProvider({ fetchFn, clock: () => NOW });
    await expect(p.getConditions(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on HTTP failure', async () => {
    const fetchFn = (async () => new Response('gone', { status: 404 })) as FetchFn;
    const p = new IncoisEcosystemProvider({ fetchFn, clock: () => NOW });
    await expect(p.getConditions(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on timeout', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          rej(e);
        });
      })) as unknown as FetchFn;
    const p = new IncoisEcosystemProvider({ fetchFn, clock: () => NOW, timeoutMs: 20 });
    await expect(p.getConditions(CTX)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('caching and privacy', () => {
  it('caches demo-zone queries within the TTL', async () => {
    let calls = 0;
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], LATS, LONS, () => 28), () => calls++),
      clock: () => NOW,
    });
    await p.getConditions(CTX);
    await p.getConditions(CTX);
    expect(calls).toBe(1);
  });

  it('never caches GPS fixes', async () => {
    let calls = 0;
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], LATS, LONS, () => 28), () => calls++),
      clock: () => NOW,
    });
    const gps = { ...CTX, coordinates: { latitude: 19.05, longitude: 71.9 } };
    await p.getConditions(gps);
    await p.getConditions(gps);
    expect(calls).toBe(2);
  });

  it('queries a box centered on the GPS position verbatim', async () => {
    const urls: string[] = [];
    const p = new IncoisEcosystemProvider({
      fetchFn: stubFetch(grid([FRESH_T], [19.0], [71.9], () => 28), (u) => urls.push(u)),
      clock: () => NOW,
    });
    await p.getConditions({ ...CTX, coordinates: { latitude: 19.05, longitude: 71.9 } });
    // ±0.5° box around the fix (ERDDAP value-constraint syntax)
    expect(urls[0]).toContain('(18.550):1:(19.550)');
    expect(urls[0]).toContain('(71.400):1:(72.400)');
  });
});
