/**
 * Location resolution — two layers:
 *
 *  resolveArea(label) → matches free text against a small set of approximate
 *    offshore coordinates on the Indian coast (DEMO zones, never ports).
 *  resolvePosition(label, coordinates?) → the per-request decision:
 *    browser GPS fix → 'gps'; matched zone label → 'manual';
 *    anything else → 'demo' default zone (explicit fallback).
 *
 * Rules:
 * - GPS coordinates are used verbatim and never logged or persisted.
 * - Free text is never treated as coordinates; unknown labels fall back to
 *   the default zone and say so (matched:false).
 * - No new locations may be invented here without review.
 */
import type { Coordinates, LocationMode } from '../../shared/orca-contract.js';

export interface DemoFishingArea {
  /** Stable key, e.g. 'arabian-sea-south'. */
  id: string;
  /** Generic display name shown in evidence trails. Never a port/village. */
  name: string;
  /** Approximate offshore position. */
  lat: number;
  lon: number;
  note: string;
}

export const DEMO_FISHING_AREAS: DemoFishingArea[] = [
  {
    id: 'arabian-sea-south',
    name: 'Arabian Sea Demo Zone (South)',
    lat: 9.5,
    lon: 75.5,
    note: 'Offshore waters west of the Kerala coast (approximate demo position)',
  },
  {
    id: 'arabian-sea-north',
    name: 'Arabian Sea Demo Zone (North)',
    lat: 20.5,
    lon: 69.5,
    note: 'Offshore waters west of the Saurashtra coast (approximate demo position)',
  },
  {
    id: 'bay-of-bengal-south',
    name: 'Bay of Bengal Demo Zone',
    lat: 12.5,
    lon: 80.8,
    note: 'Offshore waters east of the Tamil Nadu coast (approximate demo position)',
  },
];

export interface ResolvedArea {
  area: DemoFishingArea;
  /** True when the label matched a known demo zone; false = default zone used. */
  matched: boolean;
  /** Always 'demo' until real geocoding/GPS replaces this module. */
  mode: 'demo';
}

/** Keyword match on the free-text label. Never pretends text is coordinates. */
export function resolveArea(label: string): ResolvedArea {
  const q = (label ?? '').toLowerCase();
  const byId = DEMO_FISHING_AREAS.find((a) => q.includes(a.id));
  if (byId) return { area: byId, matched: true, mode: 'demo' };
  if (q.includes('bengal')) {
    return { area: DEMO_FISHING_AREAS[2], matched: true, mode: 'demo' };
  }
  if (q.includes('north') || q.includes('saurashtra') || q.includes('gujarat')) {
    return { area: DEMO_FISHING_AREAS[1], matched: true, mode: 'demo' };
  }
  if (q.includes('arabian') || q.includes('kerala') || q.includes('kochi')) {
    return { area: DEMO_FISHING_AREAS[0], matched: true, mode: 'demo' };
  }
  // Unknown label (e.g. the default "Your Fishing Area"): fall back to the
  // default zone and say so — never invent coordinates from arbitrary text.
  return { area: DEMO_FISHING_AREAS[0], matched: false, mode: 'demo' };
}

export interface ResolvedPosition {
  lat: number;
  lon: number;
  /** Display name for evidence trails. Never raw coordinates. */
  name: string;
  mode: LocationMode;
  matched: boolean;
}

/**
 * Single positioning decision per request:
 *  coordinates present → gps (use them verbatim, ignore the label);
 *  label matches a known zone → manual (zone coords, explicitly chosen);
 *  otherwise → demo (default zone, explicitly a fallback).
 */
export function resolvePosition(label: string, coordinates?: Coordinates): ResolvedPosition {
  if (coordinates) {
    return { lat: coordinates.latitude, lon: coordinates.longitude, name: 'your live location', mode: 'gps', matched: true };
  }
  const r = resolveArea(label);
  return {
    lat: r.area.lat,
    lon: r.area.lon,
    name: r.area.name,
    mode: r.matched ? 'manual' : 'demo',
    matched: r.matched,
  };
}
