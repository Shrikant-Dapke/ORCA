import { resolvePosition } from '../location/areas.js';
import { THRESHOLDS } from '../reasoning/thresholds.js';
import type {
  AreaContext,
  HazardReading,
  MarineDataProvider,
  ScenarioAdvice,
  SeaReading,
  WeatherReading,
} from './types.js';
import { ProviderError } from './types.js';

/**
 * LIVE provider backed by the official Open-Meteo APIs (no key required):
 *  - Marine:  https://marine-api.open-meteo.com/v1/marine
 *  - Weather: https://api.open-meteo.com/v1/forecast (wind + weather code;
 *             the marine API does not provide wind)
 *
 * Hourly variables fetched (nothing more):
 *  marine  — wave_height, wave_direction, wave_period, wind_wave_height,
 *            swell_wave_height, swell_wave_period,
 *            ocean_current_velocity, ocean_current_direction
 *  weather — wind_speed_10m, wind_gusts_10m, weather_code
 *
 * Units (requested/documented): wave/swell heights metres, directions degrees,
 * periods seconds, currents m/s, wind km/h (wind_speed_unit=kmh).
 *
 * Honesty rules enforced here, not in the orchestrator:
 *  - Any HTTP error / timeout / malformed payload / missing values becomes a
 *    ProviderError (→ HTTP 502). A failed live fetch NEVER degrades into
 *    fake "live" data.
 *  - Open-Meteo has no advisory feed, so getHazards() returns []. DANGER is
 *    still reachable purely from severe wave/wind readings. IMD advisory
 *    integration is the documented next step.
 *  - Coordinates always come from server/location/areas.ts (DEMO LOCATION
 *    mode) — free-text labels are never treated as coordinates.
 */

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';

const MARINE_VARS = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'wind_wave_height',
  'swell_wave_height',
  'swell_wave_period',
  'ocean_current_velocity',
  'ocean_current_direction',
].join(',');

const FORECAST_VARS = ['wind_speed_10m', 'wind_gusts_10m', 'weather_code'].join(',');

export const OPEN_METEO_DEFAULT_TIMEOUT_MS = 8000;
export const OPEN_METEO_DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpenMeteoOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  cacheTtlMs?: number;
  /** Clock override (tests). Defaults to Date.now. */
  clock?: () => number;
}

type NumArr = (number | null)[];

interface MarinePayload {
  hourly: { time: string[]; [variable: string]: NumArr | string[] };
}

interface ForecastPayload {
  hourly: { time: string[]; [variable: string]: NumArr | string[] };
}

/** Normalized internal snapshot — raw Open-Meteo JSON never leaves this file. */
export interface LiveMarineSnapshot {
  waveHeightM: number;
  waveDirectionDeg: number | null;
  wavePeriodS: number | null;
  windWaveHeightM: number | null;
  swellHeightM: number | null;
  swellPeriodS: number | null;
  currentMs: number | null;
  currentDirectionDeg: number | null;
  windKph: number;
  gustKph: number;
  weatherCode: number | null;
  forecastTime: string;
  areaName: string;
  areaMatched: boolean;
}

/** Presentation-only wording. Safety always comes from the ReasoningEngine. */
export function describeSea(waveM: number): string {
  if (waveM < 1.0) return 'Calm';
  if (waveM < 2.0) return 'Moderate';
  if (waveM < 3.5) return 'Rough';
  return 'Very rough';
}

/** Presentation-only wording. Safety always comes from the ReasoningEngine. */
export function describeWind(windKph: number): string {
  if (windKph < 12) return 'Light';
  if (windKph < 35) return 'Moderate';
  if (windKph < 60) return 'Strong';
  return 'Very strong';
}

/** WMO weather-code → fisherman-friendly sky words. */
export function wmoToSky(code: number | null): string {
  if (code === null) return 'Unknown';
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code === 61 || code === 63 || code === 65) return 'Rainy';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Wintry showers';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95) return 'Stormy';
  return 'Changing skies';
}

/** First hourly index at/after `now + offsetH`. Falls back to the last index. */
export function pickIndex(times: string[], nowMs: number, offsetH: number): number {
  const target = nowMs + offsetH * 3600_000;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (!Number.isNaN(t) && t >= target) return i;
  }
  return times.length - 1;
}

/** Value at i, else nearest finite neighbour within ±6 steps, else undefined. */
export function nearestValue(arr: NumArr, i: number): number | undefined {
  if (Number.isFinite(arr[i] as number)) return arr[i] as number;
  for (let d = 1; d <= 6; d++) {
    for (const j of [i - d, i + d]) {
      if (j >= 0 && j < arr.length && Number.isFinite(arr[j] as number)) return arr[j] as number;
    }
  }
  return undefined;
}

function asNumArr(v: unknown, name: string): NumArr {
  if (!Array.isArray(v) || !v.every((x) => x === null || typeof x === 'number')) {
    throw new ProviderError('OpenMeteoMarineProvider', `malformed response: "${name}" is not a numeric series`);
  }
  return v as NumArr;
}

function parsePayload(
  json: unknown,
  needed: string[],
  what: string,
): { time: string[]; vars: Record<string, NumArr> } {
  if (!json || typeof json !== 'object') {
    throw new ProviderError('OpenMeteoMarineProvider', `malformed response: ${what} is not an object`);
  }
  const hourly = (json as { hourly?: unknown }).hourly;
  if (!hourly || typeof hourly !== 'object') {
    throw new ProviderError('OpenMeteoMarineProvider', `malformed response: ${what} has no hourly data`);
  }
  const h = hourly as Record<string, unknown>;
  if (!Array.isArray(h.time) || !h.time.every((t) => typeof t === 'string') || h.time.length === 0) {
    throw new ProviderError('OpenMeteoMarineProvider', `malformed response: ${what} has no time series`);
  }
  const time = h.time as string[];
  const vars: Record<string, NumArr> = {};
  for (const name of needed) {
    const arr = asNumArr(h[name], name);
    if (arr.length !== time.length) {
      throw new ProviderError(
        'OpenMeteoMarineProvider',
        `malformed response: "${name}" length does not match time series`,
      );
    }
    vars[name] = arr;
  }
  return { time, vars };
}

export class OpenMeteoMarineProvider implements MarineDataProvider {
  readonly name = 'OpenMeteoMarineProvider';
  readonly dataSource = 'open-meteo' as const;

  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly clock: () => number;
  private readonly cache = new Map<string, { at: number; marine: unknown; forecast: unknown }>();

  constructor(opts: OpenMeteoOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? OPEN_METEO_DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = opts.cacheTtlMs ?? OPEN_METEO_DEFAULT_CACHE_TTL_MS;
    this.clock = opts.clock ?? Date.now;
  }

  describeLocation(ctx: AreaContext): string {
    const pos = resolvePosition(ctx.label, ctx.coordinates);
    // Never print raw coordinates: fishermen see words, not numbers.
    if (pos.mode === 'gps') return 'your live location (GPS fix)';
    return pos.matched
      ? `${pos.name} — demo coordinates (no GPS fix)`
      : `${pos.name} — default demo waters (no GPS fix)`;
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
          throw new ProviderError('OpenMeteoMarineProvider', `request timed out after ${this.timeoutMs}ms`);
        }
        throw new ProviderError(
          'OpenMeteoMarineProvider',
          `network error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!res.ok) {
        throw new ProviderError('OpenMeteoMarineProvider', `Open-Meteo HTTP ${res.status}`);
      }
      try {
        return (await res.json()) as unknown;
      } catch {
        throw new ProviderError('OpenMeteoMarineProvider', 'malformed response: body is not JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async loadArea(ctx: AreaContext): Promise<{ marine: unknown; forecast: unknown }> {
    // GPS fix wins verbatim; otherwise the resolved demo-zone position.
    // Coordinates live only in this request (cache key + query params).
    const pos = resolvePosition(ctx.label, ctx.coordinates);
    const key = `${pos.lat.toFixed(3)},${pos.lon.toFixed(3)}`;
    const hit = this.cache.get(key);
    if (hit && this.clock() - hit.at < this.cacheTtlMs) return hit;
    const marineUrl =
      `${MARINE_BASE}?latitude=${pos.lat}&longitude=${pos.lon}` +
      `&hourly=${MARINE_VARS}&forecast_days=3&timezone=auto`;
    const forecastUrl =
      `${FORECAST_BASE}?latitude=${pos.lat}&longitude=${pos.lon}` +
      `&hourly=${FORECAST_VARS}&wind_speed_unit=kmh&forecast_days=3&timezone=auto`;
    const [marine, forecast] = await Promise.all([
      this.fetchJson(marineUrl),
      this.fetchJson(forecastUrl),
    ]);
    const entry = { at: this.clock(), marine, forecast };
    this.cache.set(key, entry);
    return entry;
  }

  /** Fetch + normalize. Exported for tests; agents use the typed getters. */
  async snapshot(ctx: AreaContext): Promise<LiveMarineSnapshot> {
    const { marine, forecast } = await this.loadArea(ctx);
    const m = parsePayload(marine, MARINE_VARS.split(','), 'marine forecast');
    const f = parsePayload(forecast, FORECAST_VARS.split(','), 'weather forecast');

    // "tomorrow" questions read the same time tomorrow; otherwise the
    // nearest current hour. Documented approximation (server clock vs area tz).
    const offsetH = ctx.timeframe === 'tomorrow' ? 24 : 0;
    const mi = pickIndex(m.time, this.clock(), offsetH);
    const fi = pickIndex(f.time, this.clock(), offsetH);

    const need = (arr: NumArr, i: number, name: string): number => {
      const v = nearestValue(arr, i);
      if (v === undefined) {
        throw new ProviderError('OpenMeteoMarineProvider', `missing value: no usable "${name}" near forecast hour`);
      }
      return v;
    };
    const optional = (arr: NumArr, i: number): number | null => nearestValue(arr, i) ?? null;

    const pos = resolvePosition(ctx.label, ctx.coordinates);
    return {
      waveHeightM: need(m.vars['wave_height'], mi, 'wave_height'),
      waveDirectionDeg: optional(m.vars['wave_direction'], mi),
      wavePeriodS: optional(m.vars['wave_period'], mi),
      windWaveHeightM: optional(m.vars['wind_wave_height'], mi),
      swellHeightM: optional(m.vars['swell_wave_height'], mi),
      swellPeriodS: optional(m.vars['swell_wave_period'], mi),
      currentMs: optional(m.vars['ocean_current_velocity'], mi),
      currentDirectionDeg: optional(m.vars['ocean_current_direction'], mi),
      windKph: need(f.vars['wind_speed_10m'], fi, 'wind_speed_10m'),
      gustKph: need(f.vars['wind_gusts_10m'], fi, 'wind_gusts_10m'),
      weatherCode: optional(f.vars['weather_code'], fi),
      forecastTime: m.time[mi],
      areaName: pos.name,
      areaMatched: pos.matched,
    };
  }

  async getSea(ctx: AreaContext): Promise<SeaReading> {
    const s = await this.snapshot(ctx);
    return { waveHeightM: s.waveHeightM, seaText: describeSea(s.waveHeightM) };
  }

  async getWeather(ctx: AreaContext): Promise<WeatherReading> {
    const s = await this.snapshot(ctx);
    return {
      windKph: s.windKph,
      gustKph: s.gustKph,
      skyText: wmoToSky(s.weatherCode),
      windText: describeWind(s.windKph),
    };
  }

  async getHazards(): Promise<HazardReading> {
    // Open-Meteo publishes no advisory feed, so there is nothing honest to
    // report here. Severe live readings still yield DANGER via the engine.
    return { activeWarnings: [] };
  }

  async getAdvice(ctx: AreaContext): Promise<ScenarioAdvice> {
    const s = await this.snapshot(ctx);
    const danger =
      s.windKph >= THRESHOLDS.windDangerKph ||
      s.gustKph >= THRESHOLDS.gustDangerKph ||
      s.waveHeightM >= THRESHOLDS.waveDangerM;
    const caution =
      !danger &&
      (s.windKph >= THRESHOLDS.windCautionKph || s.waveHeightM >= THRESHOLDS.waveCautionM);
    const measured = `${s.waveHeightM.toFixed(1)} m waves with ${Math.round(s.windKph)} kph winds`;
    if (danger) {
      return {
        bestTime: 'No safe window today',
        warning: `Live readings are severe: ${measured}. Small boats should not go out.`,
        recommendation: 'Do not go fishing today. Wait for the next safe update from ORCA.',
      };
    }
    if (caution) {
      return {
        bestTime: 'Early morning only — re-check before leaving',
        warning: `Live readings show ${measured}. Conditions may worsen through the day.`,
        recommendation: 'If you go, stay close to shore and return early.',
      };
    }
    return {
      bestTime: 'Early morning – 12:00 PM',
      warning: `Live readings look fair (${measured}), but the sea can change fast.`,
      recommendation: 'Plan a morning trip and keep an eye on the sky.',
    };
  }
}
