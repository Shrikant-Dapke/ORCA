import { describe, expect, it } from 'vitest';
import { GeoAgent, RouteAgent } from './index.js';
import type { AgentContext } from './types.js';
import { DemoMarineProvider } from '../providers/demo.js';
import { DemoSafetyProvider } from '../safety/demoSafety.js';
import { NullEcosystem } from '../ecosystem/types.js';
import { DemoPfzProvider, NullPfz } from '../pfz/providers.js';

function ctx(over: Partial<AgentContext> = {}): AgentContext {
  return {
    label: 'Your Fishing Area',
    topic: 'spot',
    timeframe: 'general',
    provider: new DemoMarineProvider(),
    safety: new DemoSafetyProvider(),
    ecosystem: new NullEcosystem(),
    pfz: new DemoPfzProvider(),
    ...over,
  };
}

describe('GeoAgent', () => {
  it('measures the nearest zone without inventing restricted areas', async () => {
    const r = await new GeoAgent().run(ctx());
    expect(r.agent).toBe('geo');
    expect(r.assessment).toBe('unknown');
    expect(r.evidence.some((e) => e.label === 'Nearest zone')).toBe(true);
    expect(r.limitations?.join(' ')).toContain('no authoritative restricted-area');
  });

  it('reports unavailable when zones fail, never crashing safety', async () => {
    const { ProviderError } = await import('../providers/types.js');
    const r = await new GeoAgent().run(
      ctx({
        pfz: {
          name: 'DeadPfz',
          pfzSource: 'incois',
          getZones: async () => {
            throw new ProviderError('DeadPfz', 'down');
          },
        },
      }),
    );
    expect(r.status).toBe('unavailable');
    expect(r.assessment).toBe('unknown');
  });
});

describe('RouteAgent', () => {
  it('calculates distance, bearing, waypoints, and risk honestly', async () => {
    const r = await new RouteAgent().run(ctx());
    expect(r.agent).toBe('route');
    expect(r.assessment).toBe('unknown');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    const labels = r.evidence.map((e) => e.label);
    expect(labels).toContain('Distance');
    expect(labels).toContain('Bearing');
    expect(labels).toContain('Route risk');
    expect(r.evidence.every((e) => e.source === 'ORCA route engine' || e.source === 'Demo data')).toBe(true);
    expect(r.data).not.toBeNull();
    const plan = r.data as { distanceKm: number; waypoints: unknown[]; riskLevel: string };
    expect(plan.distanceKm).toBeGreaterThan(0);
    expect(plan.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(['low', 'moderate', 'high']).toContain(plan.riskLevel);
    expect(r.reasoning).toContain('Not official navigation');
  });

  it('is unavailable without destination zones instead of inventing a route', async () => {
    const r = await new RouteAgent().run(ctx({ pfz: new NullPfz() }));
    expect(r.status).toBe('unavailable');
    expect(r.data).toBeNull();
  });
});
