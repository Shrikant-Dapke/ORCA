import type { AreaContext } from '../providers/types.js';

/**
 * FUTURE EXTENSION POINT — Potential Fishing Zone advisories.
 *
 * Official PFZ integration requires an authorized/machine-readable INCOIS
 * source. There is intentionally NO implementation here:
 *  - DO NOT scrape the INCOIS PFZ WebGIS or visual maps.
 *  - DO NOT fabricate PFZ coordinates.
 *  - DO NOT relabel SST/chlorophyll values as "official PFZ".
 *
 * When a legitimate feed exists, implement this interface against it and
 * register the provider alongside the ecosystem agent. Until then, ORCA
 * speaks only of observed ecosystem conditions, never of PFZ zones.
 */
export interface PotentialFishingZone {
  /** Human area description from the official bulletin (no invented coords). */
  areaDescription: string;
  issuedAt: string;
  validUntil: string;
  source: string;
  sourceUrl?: string;
}

export interface PotentialFishingZoneProvider {
  name: string;
  getZones(ctx: AreaContext): Promise<PotentialFishingZone[]>;
}

export const PFZ_STATUS = 'awaiting authorized machine-readable INCOIS source — not implemented';
