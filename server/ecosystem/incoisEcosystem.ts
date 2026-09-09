import { resolvePosition } from '../location/areas.js';
import type { AreaContext } from '../providers/types.js';
import { ProviderError } from '../providers/types.js';
import type { EcosystemReading, MarineEcosystemProvider } from './types.js';

/**
 * LIVE ecosystem provider over official INCOIS ERDDAP (no key, RESTful JSON).
 *
 * RECON-VERIFIED DATASET SELECTION (catalog re-checked; see recon notes):
 *  - SST: NOAA_AVHRR_AMSR_datasets — Daily OI SST, var `sst` (°C),
 *    dims time/zlev/latitude/longitude, 0.25° grid. Catalog ends 2011
 *    (stale) — see freshness rule below.
 *  - Chlorophyll: NO current dataset exists (IRS P4 ends 2006, Oceansat-2
 *    OCM ends 2020). Chlorophyll is therefore ALWAYS undefined here.
 *    This is intentional per the no-historical-data-as-live rule.
 *
 * FRESHNESS RULE: the observation timestamp must be within
 * ORCA_ECOSYSTEM_MAX_AGE_HOURS (default 96h ≈ daily cadence + processing
 * lag). Anything older — including this catalog's holdings as of writing —
 * is rejected, and the provider reports unavailable. The provider NEVER
 * labels stale historical data as live.
 *
 * Query: single griddap request for a 7-day window × ±0.5° box; the nearest
 * finite grid point to the request position wins. GPS fixes are used
 * verbatim but never logged, never cached (only demo-zone queries are
 * cached), and the returned reading carries the ACTUAL grid location.
 */

export const INCOIS_ERDDAP_BASE = 'https://erddap.incois.gov.in/erddap';

export const INCOIS_SST_DATASET = {
  id: 'NOAA_AVHRR_AMSR_datasets',
  variable: 'sst',
  unit: '°C',
  resolutionDeg: 0.25,
  cadence: 'daily',
  /** Recon-verified catalog end (stale) — documents WHY live reads fail. */
  catalogEnd: '2011-10-04T00:00:00Z',
} as const;

/** Default freshness window: daily cadence + processing-lag tolerance. */
export const ECOSYSTEM_DEFAULT_MAX_AGE_HOURS = 96;
/** Cache TTL for demo-zone queries (GPS queries are never cached). */
export const ECOSYSTEM_DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const ECOSYSTEM_DEFAULT_TIMEOUT_MS = 8000;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface IncoisEcosystemOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  maxAgeHours?: number;
  cacheTtlMs?: number;
  clock?: () => number;
  baseUrl?: string;
}

function envMaxAge(): number | undefined {
  const raw = process.env.ORCA_ECOSYSTEM_MAX_AGE_HOURS;
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Plausible ocean SST range — FillValue (-9.99) and junk never pass. */
function validSeaTemp(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -2 && v <= 40;
}

interface GriddapTable {
  columnNames: string[];
  rows: unknown[][];
}

export class IncoisEcosystemProvider implements MarineEcosystemProvider {
  readonly name = 'IncoisEcosystemProvider';
  readonly ecosystemSource = 'incois' as const;
  readonly dataset = INCOIS_SST_DATASET.id;

  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly maxAgeHours: number;
  private readonly cacheTtlMs: number;
  private readonly clock: () => number;
  private readonly baseUrl: string;
  private readonly cache = new Map<string, { at: number; reading: EcosystemReading }>();

  constructor(opts: IncoisEcosystemOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? ECOSYSTEM_DEFAULT_TIMEOUT_MS;
    this.maxAgeHours = opts.maxAgeHours ?? envMaxAge() ?? ECOSYSTEM_DEFAULT_MAX_AGE_HOURS;
    this.cacheTtlMs = opts.cacheTtlMs ?? ECOSYSTEM_DEFAULT_CACHE_TTL_MS;
    this.clock = opts.clock ?? Date.now;
    this.baseUrl = (opts.baseUrl ?? INCOIS_ERDDAP_BASE).replace(/\/+$/, '');
  }

  private async fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchFn(url, { signal: controller.signal });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new ProviderError('IncoisEcosystemProvider', `request timed out after ${this.timeoutMs}ms`);
        }
        throw new ProviderError(
          'IncoisEcosystemProvider',
          `network error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!res.ok) {
        throw new ProviderError('IncoisEcosystemProvider', `INCOIS ERDDAP HTTP ${res.status}`);
      }
      try {
        return (await res.json()) as unknown;
      } catch {
        throw new ProviderError('IncoisEcosystemProvider', 'malformed response: body is not JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async getConditions(ctx: AreaContext): Promise<EcosystemReading> {
    const pos = resolvePosition(ctx.label, ctx.coordinates);
    const cacheable = pos.mode !== 'gps';
    const cacheKey = `${INCOIS_SST_DATASET.id}|${pos.lat.toFixed(1)},${pos.lon.toFixed(1)}`;
    if (cacheable) {
      const hit = this.cache.get(cacheKey);
      if (hit && this.clock() - hit.at < this.cacheTtlMs) return hit.reading;
    }

    const now = this.clock();
    const startISO = new Date(now - 7 * 24 * 3600_000).toISOString();
    const endISO = new Date(now).toISOString();
    const latBox = `(${(pos.lat - 0.5).toFixed(3)}):1:(${(pos.lat + 0.5).toFixed(3)})`;
    const lonBox = `(${(pos.lon - 0.5).toFixed(3)}):1:(${(pos.lon + 0.5).toFixed(3)})`;
    const timeBox = `(${startISO}):1:(${endISO})`;
    const url =
      `${this.baseUrl}/griddap/${INCOIS_SST_DATASET.id}.json` +
      `?${INCOIS_SST_DATASET.variable}${timeBox}[(0.0):1:(0.0)]${latBox}${lonBox}` +
      `,time${timeBox}`;

    const json = await this.fetchJson(url);
    const reading = this.parse(json, pos.lat, pos.lon, now);
    if (cacheable) this.cache.set(cacheKey, { at: now, reading });
    return reading;
  }

  private parse(json: unknown, lat: number, lon: number, nowMs: number): EcosystemReading {
    const table = (json as { table?: Partial<GriddapTable> })?.table;
    if (!table || !Array.isArray(table.columnNames) || !Array.isArray(table.rows)) {
      throw new ProviderError('IncoisEcosystemProvider', 'malformed response: no data table');
    }
    const cols = table.columnNames;
    const need = ['time', 'latitude', 'longitude', INCOIS_SST_DATASET.variable];
    const idx = need.map((c) => cols.indexOf(c));
    if (idx.some((i) => i < 0)) {
      throw new ProviderError('IncoisEcosystemProvider', 'malformed response: missing variable');
    }
    const [ti, lati, loni, ssti] = idx;

    let best: { t: number; rowLat: number; rowLon: number; sst: number } | null = null;
    for (const row of table.rows) {
      if (!Array.isArray(row)) continue;
      const t = Date.parse(String(row[ti]));
      const rowLat = Number(row[lati]);
      const rowLon = Number(row[loni]);
      const sst = row[ssti];
      if (Number.isNaN(t) || !Number.isFinite(rowLat) || !Number.isFinite(rowLon)) continue;
      if (!validSeaTemp(sst)) continue;
      const dist = Math.abs(rowLat - lat) + Math.abs(rowLon - lon);
      if (
        !best ||
        t > best.t ||
        (t === best.t && dist < Math.abs(best.rowLat - lat) + Math.abs(best.rowLon - lon))
      ) {
        best = { t, rowLat, rowLon, sst: sst as number };
      }
    }
    if (!best) {
      throw new ProviderError('IncoisEcosystemProvider', 'no usable SST observation near this location');
    }
    const ageHours = (nowMs - best.t) / 3600_000;
    if (ageHours > this.maxAgeHours) {
      throw new ProviderError(
        'IncoisEcosystemProvider',
        `stale observation (${new Date(best.t).toISOString()}, age ${Math.round(ageHours)}h > ${this.maxAgeHours}h) — not labeled live`,
      );
    }
    return {
      observedAt: new Date(best.t).toISOString(),
      latitude: best.rowLat,
      longitude: best.rowLon,
      sst: { value: Math.round(best.sst * 10) / 10, unit: INCOIS_SST_DATASET.unit },
      // Chlorophyll: no current machine-readable INCOIS dataset (best is
      // Oceansat-2 OCM, ending 2020) — deliberately absent, never fabricated.
      chlorophyll: undefined,
      source: 'INCOIS ERDDAP',
      dataset: INCOIS_SST_DATASET.id,
      live: true,
    };
  }
}
