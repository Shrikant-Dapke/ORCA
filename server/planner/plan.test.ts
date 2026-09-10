import { describe, expect, it } from 'vitest';
import { planBatches, planRequest } from './plan.js';

describe('planRequest', () => {
  it('plans the full safety bench for a tomorrow question', () => {
    const plan = planRequest('general', 'demo', 'en');
    const agents = plan.tasks.map((t) => t.agent);
    expect(agents).toContain('sea');
    expect(agents).toContain('weather');
    expect(agents).toContain('hazard');
    expect(agents).toContain('location');
    expect(agents).toContain('ecosystem');
    expect(agents).not.toContain('route');
    expect(agents).not.toContain('geo');
    expect(agents).toContain('decide');
    expect(agents).toContain('explain');
  });

  it('adds zones, geo, and route tasks for a route question', () => {
    const plan = planRequest('route', 'gps', 'en');
    const agents = plan.tasks.map((t) => t.agent);
    expect(agents).toContain('pfz');
    expect(agents).toContain('geo');
    expect(agents).toContain('route');
    expect(agents).not.toContain('ecosystem');
  });

  it('skips ecosystem and spatial work for immediate safety questions', () => {
    for (const topic of ['sea', 'wind', 'danger'] as const) {
      const agents = planRequest(topic, 'demo', 'en').tasks.map((t) => t.agent);
      expect(agents).not.toContain('ecosystem');
      expect(agents).not.toContain('route');
      expect(agents).not.toContain('geo');
    }
  });

  it('wires route behind zones via dependencies', () => {
    const plan = planRequest('route', 'gps', 'en');
    const route = plan.tasks.find((t) => t.agent === 'route')!;
    expect(route.dependencies).toContain('t6-zones');
  });
});

describe('planBatches', () => {
  it('orders batches so dependencies run first', () => {
    const plan = planRequest('route', 'gps', 'en');
    const batches = planBatches(plan);
    const idx = (id: string) => batches.findIndex((b) => b.includes(id));
    expect(idx('t1-locate')).toBeLessThan(idx('t2-sea'));
    expect(idx('t6-zones')).toBeLessThan(idx('t8-route'));
    // independent agents share early batches
    expect(batches.flat()).toContain('t2-sea');
    expect(batches.flat()).toContain('t3-weather');
  });
});
