import { resolvePosition } from '../location/areas.js';
import type { AreaContext } from '../providers/types.js';import { ProviderError } from '../providers/types.js';
import { bearingDeg, compass16, destinationPoint, haversineKm } from '../geo/geo.js';
import type { FishingZone } from '../../shared/orca-contract.js';

/**
 * PFZ provider abstraction. Official INCOIS PFZ has no machine-readable API
 * (verified: text bulletins + WebGIS visuals only — scraping disallowed), so
 * only the honest demo + null implementations exist. Zones are NEVER
 * presented as official PFZ unless a live feed backs them.
 */

export type PfzSource = 'demo' | 'incois' | 'none';

export interface PfzProvider {
  name: string;
  pfzSource: PfzSource;
  getZones(ctx: AreaContext): Promise<FishingZone[]>;
}

export function isLivePfzSource(source: PfzSource): boolean {
  return source === 'incois';
}

/**
 * DEMO fishing zones — deterministic positions relative to the resolved
 * waters (fixed bearings/distances), clearly labeled demo. They demonstrate
 * the zone → route → map flow, never real fish locations.
 */
export class DemoPfzProvider implements PfzProvider {
  readonly name = 'DemoPfzProvider';
  readonly pfzSource = 'demo' as const;

  async getZones(ctx: AreaContext): Promise<FishingZone[]> {
    const pos = resolvePosition(ctx.label, ctx.coordinates);
    const origin = { latitude: pos.lat, longitude: pos.lon };
    const specs = [
      { bearing: 45, distanceKm: 18, potential: 'good' as const },
      { bearing: 200, distanceKm: 31, potential: 'moderate' as const },
    ];
    return specs.map((s, i) => {
      const at = destinationPoint(origin, s.bearing, s.distanceKm);
      const comp = compass16(s.bearing);
      return {
        id: `demo-zone-${i + 1}`,
        name: `Demo fishing zone ${comp}`,
        bearingDeg: s.bearing,
        bearingCompass: comp,
        distanceKm: s.distanceKm,
        latitude: Math.round(at.latitude * 1000) / 1000,
        longitude: Math.round(at.longitude * 1000) / 1000,
        potential: s.potential,
        source: 'Demo data',
        live: false,
      };
    });
  }
}

/** Honest stub: official PFZ needs an authorized machine-readable source. */
export class IncoisPfzProvider implements PfzProvider {
  readonly name = 'IncoisPfzProvider';
  readonly pfzSource = 'incois' as const;

  async getZones(_ctx: AreaContext): Promise<FishingZone[]> {
    throw new ProviderError(
      'IncoisPfzProvider',
      'Official PFZ has no machine-readable API (text/WebGIS only). Awaiting authorized source.',
    );
  }
}

export class NullPfz implements PfzProvider {
  readonly name = 'NullPfz';
  readonly pfzSource = 'none' as const;

  async getZones(_ctx: AreaContext): Promise<FishingZone[]> {
    return [];
  }
}

export function nearestZone(zones: FishingZone[]): FishingZone | null {
  if (zones.length === 0) return null;
  return zones.reduce((a, b) => (b.distanceKm < a.distanceKm ? b : a));
}

export function zoneBearingFrom(origin: { latitude: number; longitude: number }, zone: FishingZone): { bearingDeg: number; bearingCompass: string; distanceKm: number } {
  const to = { latitude: zone.latitude, longitude: zone.longitude };
  const b = bearingDeg(origin, to);
  return { bearingDeg: Math.round(b), bearingCompass: compass16(b), distanceKm: Math.round(haversineKm(origin, to) * 10) / 10 };
}
