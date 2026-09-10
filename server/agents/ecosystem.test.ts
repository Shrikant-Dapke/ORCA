import { describe, expect, it } from 'vitest';
import { EcosystemAgent } from './index.js';
import type { AgentContext } from './types.js';
import type { AreaContext } from '../providers/types.js';
import { ProviderError } from '../providers/types.js';
import { DemoMarineProvider } from '../providers/demo.js';
import { DemoSafetyProvider } from '../safety/demoSafety.js';
import { DemoEcosystemProvider } from '../ecosystem/demoEcosystem.js';
import { NullEcosystem, type MarineEcosystemProvider } from '../ecosystem/types.js';
import { NullPfz } from '../pfz/providers.js';

function ctx(ecosystem: MarineEcosystemProvider, over: Partial<AgentContext> = {}): AgentContext {
  return {
    label: 'Your Fishing Area',
    topic: 'general',
    timeframe: 'general',
    provider: new DemoMarineProvider(),
    safety: new DemoSafetyProvider(),
    ecosystem,
    pfz: new NullPfz(),
    ...over,
  };
}

describe('EcosystemAgent', () => {
  it('returns an informational result with provenance, never a safety verdict', async () => {
    const r = await new EcosystemAgent().run(ctx(new DemoEcosystemProvider()));
    expect(r.agent).toBe('ecosystem');
    expect(r.status).toBe('available');
    expect(r.assessment).toBe('unknown');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.reasoning).toBeTruthy();
    expect(r.data).toBeNull();
    expect(r.evidence).toEqual([
      { label: 'Sea-surface temperature', value: '28.4 °C', source: 'Demo data', severity: 'info' },
      { label: 'Chlorophyll-a', value: '0.72 mg/m³', source: 'Demo data', severity: 'info' },
    ]);
  });

  it('emits evidence only for values that actually exist (no fabrication)', async () => {
    const partial: MarineEcosystemProvider = {
      name: 'PartialStub',
      ecosystemSource: 'incois',
      dataset: 'test',
      getConditions: async () => ({
        observedAt: new Date().toISOString(),
        latitude: 9.5,
        longitude: 75.5,
        sst: { value: 29.1, unit: '°C' },
        source: 'INCOIS ERDDAP',
        dataset: 'test',
        live: true,
      }),
    };
    const r = await new EcosystemAgent().run(ctx(partial));
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0].label).toBe('Sea-surface temperature');
    expect(r.confidence).toBe(0.9);
  });

  it('degrades to unavailable on provider failure instead of breaking safety', async () => {
    const failing: MarineEcosystemProvider = {
      name: 'FailingEco',
      ecosystemSource: 'incois',
      dataset: 'test',
      getConditions: async () => {
        throw new ProviderError('FailingEco', 'stale observation');
      },
    };
    const r = await new EcosystemAgent().run(ctx(failing));
    expect(r.status).toBe('unavailable');
    expect(r.assessment).toBe('unknown');
    expect(r.evidence).toEqual([]);
    expect(r.limitations?.length).toBeGreaterThan(0);
  });

  it('reports no source as unavailable, never safe-by-default', async () => {
    const r = await new EcosystemAgent().run(ctx(new NullEcosystem()));
    expect(r.status).toBe('unavailable');
    expect(r.assessment).toBe('unknown');
  });
});
