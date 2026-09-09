import { describe, expect, it, vi } from 'vitest';
import {
  OpenMeteoMarineProvider,
  describeSea,
  describeWind,
  nearestValue,
  pickIndex,
  wmoToSky,
  type FetchFn,
} from './openMeteoMarine.js';
import { ProviderError } from './types.js';
import { NullSafetyProvider } from '../safety/types.js';
import { NullEcosystem } from '../ecosystem/types.js';
import { orchestrate } from '../orchestrator.js';
import { DeterministicReasoningEngine } from '../reasoning/engine.js';

/**
 * All HTTP is stubbed — these tests never touch the live internet.
 * Fixtures mirror the real Open-Meteo shape: { hourly: { time, <vars> } }.
 */

const NOW = Date.parse('2026-09-10T05:30:00');

function times(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const h = String(i % 24).padStart(2, '0');
    const day = 10 + Math.floor(i / 24);
    out.push(`2026-09-${day}T${h}:00`);
  }
  return out;
}

function marineFixture(wave: number, extra: Record<string, (number | null)[]> = {}) {
  const t = times(72);
  const fill = (v: number | null) => t.map(() => v);
  return {
    hourly: {
      time: t,
      wave_height: fill(wave),
      wave_direction: fill(250),
      wave_period: fill(7),
      wind_wave_height: fill(0.6),
      swell_wave_height: fill(0.5),
      swell_wave_period: fill(9),
      ocean_current_velocity: fill(0.3),
      ocean_current_direction: fill(180),
      ...extra,
    },
  };
}

function forecastFixture(wind: number, gust: number, code: number) {
  const t = times(72);
  const fill = (v: number) => t.map(() => v);
  return {
    hourly: {
      time: t,
      wind_speed_10m: fill(wind),
      wind_gusts_10m: fill(gust),
      weather_code: fill(code),
    },
  };
}

function stubFetch(marine: unknown, forecast: unknown, onCall?: () => void): FetchFn {
  return (async (url: string) => {
    onCall?.();
    const body = url.includes('marine-api.open-meteo.com') ? marine : forecast;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as FetchFn;
}

const CTX = { label: 'Your Fishing Area', topic: 'general' as const, timeframe: 'general' as const };

describe('normalization', () => {
  it('normalizes a successful response into Sea/Weather readings', async () => {
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(marineFixture(0.7), forecastFixture(15, 22, 1)),
      clock: () => NOW,
    });
    const sea = await p.getSea(CTX);
    expect(sea.waveHeightM).toBeCloseTo(0.7);
    expect(sea.seaText).toBe('Calm');
    const wx = await p.getWeather(CTX);
    expect(wx.windKph).toBe(15);
    expect(wx.gustKph).toBe(22);
    expect(wx.skyText).toBe('Mostly clear');
    expect(wx.windText).toBe('Moderate');
    const snap = await p.snapshot(CTX);
    expect(snap.forecastTime).toBe('2026-09-10T06:00');
    expect(snap.areaMatched).toBe(false);
  });

  it('reads tomorrow questions ~24h ahead', async () => {
    const t = times(72);
    const wave = t.map((_, i) => (i < 30 ? 0.5 : 2.6));
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(marineFixture(0, { wave_height: wave }), forecastFixture(10, 12, 0)),
      clock: () => NOW,
    });
    const snap = await p.snapshot({ ...CTX, timeframe: 'tomorrow' });
    expect(snap.waveHeightM).toBeCloseTo(2.6);
  });

  it('uses the nearest valid value when the target hour is null', async () => {
    const t = times(72);
    const wave: (number | null)[] = t.map(() => 1.1);
    wave[6] = null; // target hour (first >= 05:30 is 06:00 → index 6)
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(marineFixture(0, { wave_height: wave }), forecastFixture(10, 12, 0)),
      clock: () => NOW,
    });
    expect((await p.getSea(CTX)).waveHeightM).toBeCloseTo(1.1);
  });

  it('throws ProviderError when a required series is entirely missing', async () => {
    const t = times(72);
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(
        marineFixture(0, { wave_height: t.map(() => null) }),
        forecastFixture(10, 12, 0),
      ),
      clock: () => NOW,
    });
    await expect(p.getSea(CTX)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('malformed responses', () => {
  it.each([
    ['empty object', {}],
    ['no hourly', { latitude: 1 }],
    ['empty time series', { hourly: { time: [] } }],
    ['missing variable', { hourly: { time: ['2026-09-10T00:00'], wave_height: [1] } }],
  ])('throws ProviderError for %s', async (_name, body) => {
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(body, forecastFixture(10, 12, 0)),
      clock: () => NOW,
    });
    await expect(p.getSea(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError for length-mismatched series', async () => {
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(
        { hourly: { time: ['2026-09-10T00:00', '2026-09-10T01:00'], wave_height: [1] } },
        forecastFixture(10, 12, 0),
      ),
      clock: () => NOW,
    });
    await expect(p.getSea(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError for non-JSON bodies', async () => {
    const fetchFn = (async () => new Response('not json', { status: 200 })) as FetchFn;
    const p = new OpenMeteoMarineProvider({ fetchFn, clock: () => NOW });
    await expect(p.getSea(CTX)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('transport failures (never fake live data)', () => {
  it('throws ProviderError on HTTP failure', async () => {
    const fetchFn = (async () => new Response('oops', { status: 500 })) as FetchFn;
    const p = new OpenMeteoMarineProvider({ fetchFn, clock: () => NOW });
    await expect(p.getSea(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on network failure', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as FetchFn;
    const p = new OpenMeteoMarineProvider({ fetchFn, clock: () => NOW });
    await expect(p.getSea(CTX)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on timeout', async () => {
    // Hanging fetch that honors abort, like a real stalled connection.
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          rej(e);
        });
      })) as unknown as FetchFn;
    const p = new OpenMeteoMarineProvider({ fetchFn, clock: () => NOW, timeoutMs: 20 });
    await expect(p.getSea(CTX)).rejects.toMatchObject({ name: 'ProviderError' });
  });
});

describe('GPS coordinates (Phase 2C)', () => {
  function capturingFetch(marine: unknown, forecast: unknown, urls: string[]): FetchFn {
    return (async (url: string) => {
      urls.push(url);
      const body = url.includes('marine-api.open-meteo.com') ? marine : forecast;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as FetchFn;
  }

  it('sends browser coordinates to Open-Meteo verbatim', async () => {
    const urls: string[] = [];
    const p = new OpenMeteoMarineProvider({
      fetchFn: capturingFetch(marineFixture(0.7), forecastFixture(15, 22, 1), urls),
      clock: () => NOW,
    });
    await p.getSea({ ...CTX, coordinates: { latitude: 19.05, longitude: 71.9 } });
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      expect(u).toContain('latitude=19.05');
      expect(u).toContain('longitude=71.9');
    }
  });

  it('GPS overrides even a matching demo-zone label', async () => {
    const urls: string[] = [];
    const p = new OpenMeteoMarineProvider({
      fetchFn: capturingFetch(marineFixture(0.7), forecastFixture(15, 22, 1), urls),
      clock: () => NOW,
    });
    const snap = await p.snapshot({
      ...CTX,
      label: 'Bay of Bengal Demo Zone',
      coordinates: { latitude: 8.1, longitude: 77.2 },
    });
    expect(urls[0]).toContain('latitude=8.1');
    expect(snap.areaName).toBe('your live location');
  });

  it('names the live position without exposing raw coordinates', async () => {
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(marineFixture(0.7), forecastFixture(15, 22, 1)),
      clock: () => NOW,
    });
    const ctx = { ...CTX, coordinates: { latitude: 19.05, longitude: 71.9 } };
    expect(p.describeLocation(ctx)).toBe('your live location (GPS fix)');
    expect(p.describeLocation(ctx)).not.toContain('19.05');
  });

  it('keeps demo-zone resolution when coordinates are absent', async () => {
    const urls: string[] = [];
    const p = new OpenMeteoMarineProvider({
      fetchFn: capturingFetch(marineFixture(0.7), forecastFixture(15, 22, 1), urls),
      clock: () => NOW,
    });
    await p.getSea({ ...CTX, label: 'Bay of Bengal Demo Zone' });
    expect(urls[0]).toContain('latitude=12.5');
    expect(urls[0]).toContain('longitude=80.8');
  });
});

describe('caching', () => {
  it('fetches once per area within the TTL (no repeated demo-time requests)', async () => {
    let calls = 0;
    const p = new OpenMeteoMarineProvider({
      fetchFn: stubFetch(marineFixture(0.7), forecastFixture(15, 22, 1), () => calls++),
      clock: () => NOW,
    });
    await p.getSea(CTX);
    await p.getWeather(CTX);
    await p.getAdvice(CTX);
    expect(calls).toBe(2); // one marine + one forecast fetch, then cache
  });
});

describe('helpers', () => {
  it('pickIndex selects the first hour at/after now and clamps at the end', () => {
    const t = ['2026-09-10T00:00', '2026-09-10T06:00', '2026-09-10T12:00'];
    expect(pickIndex(t, Date.parse('2026-09-10T05:00'), 0)).toBe(1);
    expect(pickIndex(t, Date.parse('2026-09-11T00:00'), 0)).toBe(2);
  });
  it('nearestValue scans neighbours then gives up', () => {
    expect(nearestValue([1, null, 3], 1)).toBe(1);
    expect(nearestValue([null, null], 0)).toBeUndefined();
  });
  it('maps WMO codes to sky words', () => {
    expect(wmoToSky(0)).toBe('Clear');
    expect(wmoToSky(3)).toBe('Cloudy');
    expect(wmoToSky(95)).toBe('Stormy');
    expect(wmoToSky(null)).toBe('Unknown');
  });
  it('describes sea/wind in plain words', () => {
    expect(describeSea(0.5)).toBe('Calm');
    expect(describeSea(4)).toBe('Very rough');
    expect(describeWind(10)).toBe('Light');
    expect(describeWind(70)).toBe('Very strong');
  });
});

describe('orchestrator over normalized live data (existing engine, unchanged)', () => {
  // NullSafetyProvider keeps these tests purely about Open-Meteo readings —
  // no advisories mixed in, live or otherwise.
  function liveDeps(marine: unknown, forecast: unknown) {
    return {
      provider: new OpenMeteoMarineProvider({
        fetchFn: stubFetch(marine, forecast),
        clock: () => NOW,
      }),
      reasoning: new DeterministicReasoningEngine(),
      safety: new NullSafetyProvider(),
      ecosystem: new NullEcosystem(),
    };
  }

  it('yields SAFE + live meta for calm live readings', async () => {
    const res = await orchestrate(
      { message: 'Can I go fishing tomorrow?', location: 'Your Fishing Area' },
      liveDeps(marineFixture(0.7), forecastFixture(15, 22, 1)),
    );
    expect(res.status).toBe('safe');
    expect(res.meta?.dataSource).toBe('open-meteo');
    expect(res.meta?.live).toBe(true);
    expect(res.meta?.locationMode).toBe('demo');
  });

  it('yields DANGER for severe live readings', async () => {
    const res = await orchestrate(
      { message: 'How is the sea?', location: 'Bay of Bengal Demo Zone' },
      liveDeps(marineFixture(4.5), forecastFixture(70, 85, 95)),
    );
    expect(res.status).toBe('danger');
    expect(res.meta?.live).toBe(true);
  });

  it('propagates live outages as ProviderError (API maps to 502, never fake-live)', async () => {
    const fetchFn = (async () => new Response('down', { status: 503 })) as FetchFn;
    await expect(
      orchestrate(
        { message: 'How is the sea?', location: 'X' },
        {
          provider: new OpenMeteoMarineProvider({ fetchFn, clock: () => NOW }),
          reasoning: new DeterministicReasoningEngine(),
          safety: new NullSafetyProvider(),
          ecosystem: new NullEcosystem(),
        },
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
