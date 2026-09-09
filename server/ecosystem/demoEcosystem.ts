import { resolvePosition } from '../location/areas.js';
import type { AreaContext } from '../providers/types.js';
import type { EcosystemReading, MarineEcosystemProvider } from './types.js';

/**
 * DEMO ecosystem provider — stable sample indicators for the SIH demo.
 * Clearly labeled (live:false, source 'Demo data'); never mixed with live
 * readings without the label. Assessment stays informational downstream.
 */
export class DemoEcosystemProvider implements MarineEcosystemProvider {
  readonly name = 'DemoEcosystemProvider';
  readonly ecosystemSource = 'demo' as const;
  readonly dataset = 'demo';

  async getConditions(ctx: AreaContext): Promise<EcosystemReading> {
    const pos = resolvePosition(ctx.label, ctx.coordinates);
    return {
      observedAt: new Date().toISOString(),
      latitude: pos.lat,
      longitude: pos.lon,
      sst: { value: 28.4, unit: '°C' },
      chlorophyll: { value: 0.72, unit: 'mg/m³' },
      source: 'Demo data',
      dataset: 'demo',
      live: false,
    };
  }
}
