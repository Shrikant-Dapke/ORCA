import { describe, expect, it } from 'vitest';
import { HazardAgent, LocationAgent, SeaAgent, WeatherAgent } from './index.js';
import type { AgentContext } from './types.js';
import { DemoMarineProvider } from '../providers/demo.js';
import type { MarineDataProvider } from '../providers/types.js';
import { DemoSafetyProvider } from '../safety/demoSafety.js';
import { NullSafetyProvider } from '../safety/types.js';
import { NullEcosystem } from '../ecosystem/types.js';
import { NullPfz } from '../pfz/providers.js';

/** Live-shaped stub (no network): proves provenance + confidence switch. */
const stubLiveMarine: MarineDataProvider = {
  name: 'StubOpenMeteo',
  dataSource: 'open-meteo',
  getSea: async () => ({ waveHeightM: 1.3, seaText: 'Moderate' }),
  getWeather: async () => ({ windKph: 22, gustKph: 30, skyText: 'Cloudy', windText: 'Moderate' }),
  getHazards: async () => ({ activeWarnings: [] }),
  getAdvice: async () => ({ bestTime: 'x', warning: 'y', recommendation: 'z' }),
};

function ctx(
  over: Partial<AgentContext> = {},
): AgentContext {
  return {
    label: 'Your Fishing Area',
    topic: 'general',
    timeframe: 'general',
    provider: new DemoMarineProvider(),
    safety: new DemoSafetyProvider(),
    ecosystem: new NullEcosystem(),
    pfz: new NullPfz(),
    ...over,
  };
}

describe('SeaAgent', () => {
  it('returns the full AgentResult contract for calm demo seas', async () => {
    const r = await new SeaAgent().run(ctx());
    expect(r.agent).toBe('sea');
    expect(r.status).toBe('available');
    expect(r.assessment).toBe('safe');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.reasoning).toBeTruthy();
    expect(r.data).not.toBeNull();
    expect(r.evidence).toEqual([
      { label: 'Wave height', value: '0.8 m', source: 'Demo data' },
      { label: 'Sea state', value: 'Calm', source: 'Demo data' },
    ]);
  });

  it('assesses rough demo seas as caution', async () => {
    const r = await new SeaAgent().run(ctx({ topic: 'wind' }));
    expect(r.assessment).toBe('caution');
    expect(r.evidence[0].value).toBe('2.3 m');
  });

  it('keeps live provenance and higher confidence for live providers', async () => {
    const r = await new SeaAgent().run(ctx({ provider: stubLiveMarine }));
    expect(r.assessment).toBe('safe');
    expect(r.confidence).toBe(0.9);
    expect(r.evidence.every((e) => e.source === 'Open-Meteo')).toBe(true);
  });
});

describe('WeatherAgent', () => {
  it('returns wind, gusts, and sky evidence with provenance', async () => {
    const r = await new WeatherAgent().run(ctx({ provider: stubLiveMarine }));
    expect(r.agent).toBe('weather');
    expect(r.assessment).toBe('safe');
    expect(r.evidence.map((e) => e.label)).toEqual(['Wind', 'Gusts', 'Sky']);
    expect(r.evidence[0]).toMatchObject({ value: '22 kph', source: 'Open-Meteo' });
    expect(r.confidence).toBe(0.9);
  });

  it('assesses strong demo winds as caution', async () => {
    const r = await new WeatherAgent().run(ctx({ topic: 'wind' }));
    expect(r.assessment).toBe('caution');
    expect(r.reasoning).toContain('42 kph');
  });
});

describe('HazardAgent', () => {
  it('treats a severe demo advisory as high-priority danger evidence', async () => {
    const r = await new HazardAgent().run(ctx({ topic: 'danger' }));
    expect(r.assessment).toBe('danger');
    expect(r.evidence.some((e) => e.severity === 'severe')).toBe(true);
    expect(r.evidence.join(' ')).not.toContain('INCOIS');
  });

  it('reports unknown (never safe-by-default) with no advisory source', async () => {
    const r = await new HazardAgent().run(ctx({ provider: stubLiveMarine, safety: new NullSafetyProvider() }));
    expect(r.assessment).toBe('unknown');
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.limitations?.join(' ')).toContain('no advisory feed');
  });

  it('assesses a clear demo feed as safe', async () => {
    const r = await new HazardAgent().run(ctx());
    expect(r.assessment).toBe('safe');
  });
});

describe('LocationAgent', () => {
  it('uses a GPS fix verbatim without exposing coordinates', async () => {
    const r = await new LocationAgent().run(
      ctx({ coordinates: { latitude: 19.05, longitude: 71.9 } }),
    );
    expect(r.assessment).toBe('safe');
    expect(r.confidence).toBe(0.9);
    expect(r.evidence).toEqual([{ label: 'Waters', value: 'your live location', source: 'GPS fix' }]);
    expect(JSON.stringify(r)).not.toContain('19.05');
  });

  it('never invents geography for demo labels', async () => {
    const r = await new LocationAgent().run(ctx());
    expect(r.evidence[0].source).toBe('Demo coordinates');
    expect(r.limitations?.length).toBeGreaterThan(0);
  });
});
