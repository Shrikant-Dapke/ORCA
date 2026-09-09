import { describe, expect, it } from 'vitest';
import { orchestrateWithTrace, selectAgents } from './orchestrator.js';
import { DemoMarineProvider } from './providers/demo.js';
import type { MarineDataProvider } from './providers/types.js';
import { ProviderError } from './providers/types.js';
import { DeterministicReasoningEngine } from './reasoning/engine.js';
import { DemoSafetyProvider } from './safety/demoSafety.js';
import { NullSafetyProvider, type MarineSafetyProvider, type SafetyAdvisory } from './safety/types.js';
import { DemoEcosystemProvider } from './ecosystem/demoEcosystem.js';
import { NullEcosystem, type MarineEcosystemProvider } from './ecosystem/types.js';
import { HazardAgent, LocationAgent, SeaAgent, WeatherAgent } from './agents/index.js';
import { EcosystemAgent } from './agents/index.js';

/** Live-shaped stub (no network): calm seas, so advisories decide alone. */
const calmLiveMarine: MarineDataProvider = {
  name: 'StubOpenMeteo',
  dataSource: 'open-meteo',
  getSea: async () => ({ waveHeightM: 0.6, seaText: 'Calm' }),
  getWeather: async () => ({ windKph: 12, gustKph: 18, skyText: 'Clear', windText: 'Light' }),
  getHazards: async () => ({ activeWarnings: [] }),
  getAdvice: async () => ({ bestTime: 'x', warning: 'y', recommendation: 'z' }),
};

function liveAdvisory(over: Partial<SafetyAdvisory> = {}): SafetyAdvisory {
  return {
    severity: 'severe',
    type: 'small-vessel',
    headline: 'Official overturning risk warning',
    validFrom: '2020-01-01T00:00:00Z',
    validUntil: '2099-01-01T00:00:00Z',
    area: 'test waters',
    source: 'INCOIS SVAS',
    live: true,
    ...over,
  };
}

const AGENTS = [new SeaAgent(), new WeatherAgent(), new HazardAgent(), new LocationAgent(), new EcosystemAgent()];

describe('collaborative execution', () => {
  it('runs agents in parallel and records each verdict in the trace', async () => {
    const { response, trace } = await orchestrateWithTrace(
      { message: 'Is there any danger nearby?', location: 'Your Fishing Area' },
      {
        provider: new DemoMarineProvider(),
        reasoning: new DeterministicReasoningEngine(),
      safety: new DemoSafetyProvider(),
      ecosystem: new NullEcosystem(),
      agents: AGENTS,
      },
    );
    expect(response.status).toBe('danger');
    expect(trace.steps.length).toBeGreaterThan(3);
    expect(trace.steps[0]).toContain('topic=danger');
    expect(trace.steps.some((s) => s.startsWith('sea:'))).toBe(true);
    expect(trace.steps.some((s) => s.startsWith('Final decision: danger'))).toBe(true);
    expect(trace.fused.strongestSignal?.assessment).toBe('danger');
  });

  it('never lets calm live readings override a severe official advisory', async () => {
    const safety: MarineSafetyProvider = {
      name: 'StubSafety',
      advisorySource: 'incois',
      getAdvisories: async () => [liveAdvisory()],
    };
    const { response, trace } = await orchestrateWithTrace(
      { message: 'Can I go fishing tomorrow?', location: 'Your Fishing Area' },
      { provider: calmLiveMarine, reasoning: new DeterministicReasoningEngine(), safety, agents: AGENTS, ecosystem: new NullEcosystem() },
    );
    expect(response.status).toBe('danger');
    expect(response.evidence?.join(' ')).toContain('INCOIS SVAS');
    expect(trace.guardrailRaised || response.status === 'danger').toBe(true);
  });

  it('selects the safety bench for every intent, plus ecosystem for planning questions', () => {
    for (const topic of ['sea', 'wind', 'danger'] as const) {
      const names = selectAgents(topic, AGENTS).map((a) => a.name).sort();
      expect(names).toEqual(['hazard', 'location', 'sea', 'weather']);
    }
    for (const topic of ['general', 'spot'] as const) {
      const names = selectAgents(topic, AGENTS).map((a) => a.name).sort();
      expect(names).toEqual(['ecosystem', 'hazard', 'location', 'sea', 'weather']);
    }
  });
});

describe('evidence-backed explanations', () => {
  async function explainFor(message: string) {
    const { response } = await orchestrateWithTrace(
      { message, location: 'Your Fishing Area' },
      {
        provider: new DemoMarineProvider(),
        reasoning: new DeterministicReasoningEngine(),
      safety: new DemoSafetyProvider(),
      ecosystem: new NullEcosystem(),
      agents: AGENTS,
      },
    );
    return response;
  }

  it('caution explanation cites real wind numbers from evidence', async () => {
    const res = await explainFor('Will there be strong winds?');
    expect(res.status).toBe('caution');
    expect(res.explanation).toContain('42 kph');
    expect(res.explanation).toContain('2.3 m');
    expect(res.explanation).not.toContain('acceptable at 42');
    expect(res.explanation).not.toContain('satellite');
    expect(res.explanation).not.toContain('INCOIS');
  });

  it('danger explanation names the active warning without inventing sources', async () => {
    const res = await explainFor('Is there any danger nearby?');
    expect(res.status).toBe('danger');
    expect(res.explanation).toContain('warning is active');
    expect(res.explanation).not.toContain('satellite');
    expect(res.explanation).not.toContain('INCOIS');
  });

  it('safe explanation describes actual calm readings', async () => {
    const res = await explainFor('Can I go fishing tomorrow?');
    expect(res.status).toBe('safe');
    expect(res.explanation).toContain('calm');
    expect(res.explanation).not.toContain('satellite');
  });
});

describe('provenance end to end', () => {
  it('live GPS evidence names Open-Meteo and the GPS fix, never raw coordinates', async () => {
    const { response } = await orchestrateWithTrace(
      {
        message: 'How is the sea?',
        location: 'Your Fishing Area',
        coordinates: { latitude: 19.05, longitude: 71.9 },
      },
      {
        provider: calmLiveMarine,
        reasoning: new DeterministicReasoningEngine(),
      safety: new NullSafetyProvider(),
      ecosystem: new NullEcosystem(),
      agents: AGENTS,
      },
    );
    const trail = response.evidence?.join(' ') ?? '';
    expect(trail).toContain('Open-Meteo');
    expect(trail).toContain('GPS fix');
    expect(trail).not.toContain('19.05');
    expect(trail).not.toContain('71.9');
    expect(response.meta?.locationMode).toBe('gps');
  });

  it('demo evidence stays explicitly marked as demo', async () => {
    const { response } = await orchestrateWithTrace(
      { message: 'Will there be strong winds?', location: 'Your Fishing Area' },
      {
        provider: new DemoMarineProvider(),
        reasoning: new DeterministicReasoningEngine(),
      safety: new DemoSafetyProvider(),
      ecosystem: new NullEcosystem(),
      agents: AGENTS,
      },
    );
    const trail = response.evidence?.join(' ') ?? '';
    expect(trail).toContain('Demo data');
    expect(trail).toContain('(demo)');
  });

  it('keeps the ORCAResponse wire contract intact', async () => {
    const { response } = await orchestrateWithTrace(
      { message: 'Hello', location: 'Your Fishing Area' },
      {
        provider: new DemoMarineProvider(),
        reasoning: new DeterministicReasoningEngine(),
      safety: new DemoSafetyProvider(),
      ecosystem: new NullEcosystem(),
      agents: AGENTS,
      },
    );
    for (const key of [
      'status', 'headline', 'summary', 'bestTime', 'conditions',
      'warning', 'recommendation', 'explanation', 'evidence', 'meta',
    ]) {
      expect(response).toHaveProperty(key);
    }
  });
});

describe('ecosystem collaboration', () => {
  const AGENTS5 = [...AGENTS, new EcosystemAgent()];

  function ecoDeps(ecosystem: MarineEcosystemProvider) {
    return {
      provider: calmLiveMarine,
      reasoning: new DeterministicReasoningEngine(),
      safety: new NullSafetyProvider(),
      ecosystem,
      agents: AGENTS5,
    };
  }

  it('runs the ecosystem agent for planning questions, skips it for safety questions', async () => {
    const general = await orchestrateWithTrace(
      { message: 'Can I fish tomorrow?', location: 'X' },
      { ...ecoDeps(new DemoEcosystemProvider()) },
    );
    expect(general.trace.steps.some((s) => s.startsWith('ecosystem:'))).toBe(true);

    const sea = await orchestrateWithTrace(
      { message: 'How is the sea today?', location: 'X' },
      { ...ecoDeps(new DemoEcosystemProvider()) },
    );
    expect(sea.trace.steps.some((s) => s.startsWith('ecosystem:'))).toBe(false);
  });

  it('severe hazard + favorable ecosystem still yields DANGER', async () => {
    const { response } = await orchestrateWithTrace(
      { message: 'Where might fishing be better?', location: 'X' },
      {
        ...ecoDeps(new DemoEcosystemProvider()),
        safety: {
          name: 'StubSafety',
          advisorySource: 'demo',
          getAdvisories: async () => [liveAdvisory()],
        } satisfies MarineSafetyProvider,
      },
    );
    expect(response.status).toBe('danger');
  });

  it('ecosystem failure preserves the existing safe behavior', async () => {
    const failing: MarineEcosystemProvider = {
      name: 'FailingEco',
      ecosystemSource: 'incois',
      dataset: 'test',
      getConditions: async () => {
        throw new ProviderError('FailingEco', 'stale observation');
      },
    };
    const { response, trace } = await orchestrateWithTrace(
      { message: 'Can I go fishing tomorrow?', location: 'X' },
      { ...ecoDeps(failing) },
    );
    expect(response.status).toBe('safe');
    expect(trace.fused.missingDomains).toContain('ecosystem');
  });

  it('delivers GPS coordinates to the ecosystem provider without leaking them', async () => {
    let seen: unknown;
    const spy: MarineEcosystemProvider = {
      name: 'SpyEco',
      ecosystemSource: 'demo',
      dataset: 'test',
      getConditions: async (ctx) => {
        seen = ctx.coordinates;
        return {
          observedAt: new Date().toISOString(),
          latitude: 9.5,
          longitude: 75.5,
          sst: { value: 28.1, unit: '°C' },
          source: 'INCOIS ERDDAP',
          dataset: 'test',
          live: true,
        };
      },
    };
    const { response } = await orchestrateWithTrace(
      {
        message: 'Where might fishing be better?',
        location: 'X',
        coordinates: { latitude: 19.05, longitude: 71.9 },
      },
      { ...ecoDeps(spy) },
    );
    expect(seen).toEqual({ latitude: 19.05, longitude: 71.9 });
    expect(JSON.stringify(response)).not.toContain('19.05');
    expect(JSON.stringify(response)).not.toContain('71.9');
  });

  it('adds cautious opportunity context for safe planning answers only', async () => {
    const planning = await orchestrateWithTrace(
      { message: 'Can I go fishing tomorrow?', location: 'X' },
      {
        provider: new DemoMarineProvider(),
        reasoning: new DeterministicReasoningEngine(),
        safety: new DemoSafetyProvider(),
        ecosystem: new DemoEcosystemProvider(),
        agents: AGENTS5,
      },
    );
    expect(planning.response.status).toBe('safe');
    expect(planning.response.explanation).toContain('ecosystem conditions may be useful');

    const immediate = await orchestrateWithTrace(
      { message: 'How is the sea?', location: 'X' },
      { ...ecoDeps(new DemoEcosystemProvider()) },
    );
    expect(immediate.response.explanation ?? '').not.toContain('ecosystem conditions may be useful');
  });
});
