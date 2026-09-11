import { NetCDFReader } from 'netcdfjs';
import { resolvePosition } from '../location/areas.js';
import { THRESHOLDS } from '../reasoning/thresholds.js';
import { tr } from '../i18n/responses.js';
import type { AreaContext, HazardReading, MarineDataProvider, ScenarioAdvice, SeaReading, WeatherReading } from './types.js';
import { ProviderError } from './types.js';

export const INCOIS_RSMC_LISTING = 'https://www.incois.gov.in/oceanservices/rsmc_download.jsp';
export const INCOIS_RSMC_BASE = 'https://www.incois.gov.in/thredds/fileServer/osf/ww3';
export const INCOIS_RSMC_TIMEOUT_MS = 30000;
export const INCOIS_RSMC_CACHE_TTL_MS = 20 * 60 * 1000;\nexport const INCOIS_RSMC_DEFAULT_MAX_AGE_HOURS = 72;

type Var = { name: string; dimensions: number[]; attributes?: { name: string; value: unknown }[] };

const flat = (x: unknown): number[] => Array.isArray(x) ? x.flatMap(flat) : typeof x === 'number' ? [x] : [];
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
const attr = (v: Var, n: string) => v.attributes?.find(a => a.name === n)?.value;

function pick(r: NetCDFReader, names: string[], patterns: RegExp[], dims: Set<number>): Var | undefined {
  const vars = r.variables as Var[];
  return vars.find(v => names.some(n => norm(v.name) === norm(n)) && v.dimensions.every(d => dims.has(d)))
    ?? vars.find(v => patterns.some(p => p.test(norm(v.name))) && dims.size === v.dimensions.filter(d => dims.has(d)).length);
}
function coord(r: NetCDFReader, patterns: RegExp[]) {
  const d = r.dimensions.findIndex(x => patterns.some(p => p.test(norm(x.name))));
  if (d < 0) throw new Error('coordinate dimension not found');
  const v = (r.variables as Var[]).find(x => x.name === r.dimensions[d].name);
  if (!v) throw new Error('coordinate variable not found');
  return { id: d, values: flat(r.getDataVariable(v.name)), variable: v };
}
function nearest(a: number[], x: number) {
  return a.reduce((best, v, i) => Math.abs(v - x) < Math.abs(a[best] - x) ? i : best, 0);
}
function timeMs(raw: number, v: Var) {
  const u = String(attr(v, 'units') ?? '').toLowerCase();
  const m = u.match(/^(seconds?|minutes?|hours?|days?)\\s+since\\s+(.+)$/);
  if (!m) return raw > 1e12 ? raw : raw > 1e9 ? raw * 1000 : NaN;
  const base = Date.parse(m[2]); if (!Number.isFinite(base)) return NaN;
  const f = m[1].startsWith('second') ? 1000 : m[1].startsWith('minute') ? 60000 : m[1].startsWith('hour') ? 3600000 : 86400000;
  return base + raw * f;
}
function point(r: NetCDFReader, v: Var, indexes: Map<number, number>) {
  const shape = v.dimensions.map(d => r.dimensions[d].size);
  const data = flat(r.getDataVariable(v.name)); let ix = 0; let stride = 1;
  for (let i = shape.length - 1; i >= 0; i--) { ix += (indexes.get(v.dimensions[i]) ?? 0) * stride; stride *= shape[i]; }
  return Number.isFinite(data[ix]) ? data[ix] : null;
}
function windFactor(v: Var) {
  const u = String(attr(v, 'units') ?? '').toLowerCase().replace(/\\s/g, '');
  return /m\\/?s|ms-1|ms\\^?1/.test(u) ? 3.6 : 1;
}

export class IncoisRsmcMarineProvider implements MarineDataProvider {
  readonly name = 'IncoisRsmcMarineProvider';
  readonly dataSource = 'incois' as const;
  private readonly fetchFn: typeof fetch;
  private readonly timeout: number;
  private readonly ttl: number;
  private readonly clock: () => number;\n  private readonly maxAgeHours: number;
  private cache: { at: number; file: string; reader: NetCDFReader } | null = null;
  private snapshots = new Map<string, { at: number; data: any }>();

  constructor(o: { fetchFn?: typeof fetch; timeoutMs?: number; cacheTtlMs?: number; clock?: () => number; maxAgeHours?: number } = {}) {
    this.fetchFn = o.fetchFn ?? fetch; this.timeout = o.timeoutMs ?? INCOIS_RSMC_TIMEOUT_MS;
    this.ttl = o.cacheTtlMs ?? INCOIS_RSMC_CACHE_TTL_MS; this.clock = o.clock ?? Date.now;\n    const envAge = Number(process.env.ORCA_INCOIS_RSMC_MAX_AGE_HOURS);\n    this.maxAgeHours = o.maxAgeHours ?? (Number.isFinite(envAge) && envAge > 0 ? envAge : INCOIS_RSMC_DEFAULT_MAX_AGE_HOURS);
  }
  private async get(url: string) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), this.timeout);
    try { return await this.fetchFn(url, { signal: c.signal }); }
    catch (e) { throw new ProviderError(this.name, e instanceof Error ? e.message : String(e)); }
    finally { clearTimeout(t); }
  }
  private async model() {
    const now = this.clock();
    if (this.cache && now - this.cache.at < this.ttl) return this.cache;
    const listing = await this.get(INCOIS_RSMC_LISTING);
    if (!listing.ok) throw new ProviderError(this.name, `INCOIS RSMC listing HTTP ${listing.status}`);
    const html = await listing.text();
    const files = [...html.matchAll(/rsmc_combined_ww3_(\\d{8})\\.nc/g)].map(m => ({ date: m[1], file: `rsmc_combined_ww3_${m[1]}.nc` })).sort((a,b) => a.date.localeCompare(b.date));
    if (!files.length) throw new ProviderError(this.name, 'No INCOIS WW3 file found in official listing');
    const file = files.at(-1)!.file;
    const res = await this.get(`${INCOIS_RSMC_BASE}/${file}`);
    if (!res.ok) throw new ProviderError(this.name, `INCOIS WW3 HTTP ${res.status}`);
    let reader: NetCDFReader; try { reader = new NetCDFReader(new Uint8Array(await res.arrayBuffer())); }
    catch (e) { throw new ProviderError(this.name, `Unable to parse INCOIS WW3 NetCDF: ${e instanceof Error ? e.message : String(e)}`); }
    this.cache = { at: now, file, reader }; return this.cache;
  }
  private async snapshot(ctx: AreaContext) {
    const p = resolvePosition(ctx.label, ctx.coordinates); const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    const hit = this.snapshots.get(key); if (hit && this.clock() - hit.at < this.ttl) return hit.data;
    const { reader, file } = await this.model();
    const lat = coord(reader, [/^lat$/, /latitude/]); const lon = coord(reader, [/^lon$/, /longitude/]); const time = coord(reader, [/^time$/, /forecasttime/, /date/]);
    let ti = -1, latest = -Infinity;
    time.values.forEach((v, i) => { const ms = timeMs(v, time.variable); if (ms > latest) { latest = ms; ti = i; } });
    if (ti < 0) throw new ProviderError(this.name, 'INCOIS WW3 contains no usable forecast time');
    const ids = new Map([[lat.id, nearest(lat.values, p.lat)], [lon.id, nearest(lon.values, p.lon)], [time.id, ti]]);
    const required = new Set([lat.id, lon.id, time.id]);
    const hs = pick(reader, ['hs','swh','significant_wave_height','wave_height'], [/^(hs|swh|significantwaveheight|waveheight)$/], required);
    if (!hs) throw new ProviderError(this.name, 'INCOIS WW3 has no significant-wave-height variable');
    const wave = point(reader, hs, ids); if (wave === null || wave < 0 || wave > 30) throw new ProviderError(this.name, 'Invalid INCOIS WW3 wave value');
    const wu = pick(reader, ['uwnd','u10','wind_u'], [/^(uwnd|u10|windu|u)$/], required);
    const wv = pick(reader, ['vwnd','v10','wind_v'], [/^(vwnd|v10|windv|v)$/], required);
    const ws = pick(reader, ['wind_speed','wspd','wind_speed_10m'], [/^(windspeed|wspd|wind10m)$/], required);
    let wind = ws ? point(reader, ws, ids) : wu && wv ? Math.hypot(point(reader, wu, ids) ?? NaN, point(reader, wv, ids) ?? NaN) : null;
    if (wind === null || !Number.isFinite(wind)) throw new ProviderError(this.name, 'INCOIS WW3 has no usable wind value');
    wind *= windFactor(ws ?? wu!); if (wind < 0 || wind > 150) throw new ProviderError(this.name, 'Invalid INCOIS WW3 wind value');
    const out = { waveHeightM: Math.round(wave*10)/10, windKph: Math.round(wind*10)/10, gustKph: Math.round(wind*1.35*10)/10, forecastTime: new Date(latest).toISOString(), file };
    this.snapshots.set(key, { at: this.clock(), data: out }); return out;
  }
  describeLocation(ctx: AreaContext) { const p = resolvePosition(ctx.label, ctx.coordinates); return p.mode === 'gps' ? 'your live location (GPS fix)' : `${p.name} — INCOIS WW3 forecast grid`; }
  async getSea(ctx: AreaContext): Promise<SeaReading> { const s=await this.snapshot(ctx); return { waveHeightM:s.waveHeightM, seaText:s.waveHeightM<1?'Calm':s.waveHeightM<2?'Moderate':s.waveHeightM<3.5?'Rough':'Very rough' }; }
  async getWeather(ctx: AreaContext): Promise<WeatherReading> { const s=await this.snapshot(ctx); return { windKph:s.windKph, gustKph:s.gustKph, skyText:'Ocean forecast', windText:s.windKph<12?'Light':s.windKph<35?'Moderate':s.windKph<60?'Strong':'Very strong' }; }
  async getHazards(): Promise<HazardReading> { return { activeWarnings: [] }; }
  async getAdvice(ctx: AreaContext): Promise<ScenarioAdvice> {
    const s=await this.snapshot(ctx); const danger=s.windKph>=THRESHOLDS.windDangerKph||s.gustKph>=THRESHOLDS.gustDangerKph||s.waveHeightM>=THRESHOLDS.waveDangerM;
    const caution=!danger&&(s.windKph>=THRESHOLDS.windCautionKph||s.waveHeightM>=THRESHOLDS.waveCautionM); const band=danger?'danger':caution?'caution':'safe';
    const measured=tr(ctx.locale,`om.measured`,{wave:s.waveHeightM.toFixed(1),wind:Math.round(s.windKph)});
    return { bestTime:tr(ctx.locale,`om.${band}.bestTime`), warning:tr(ctx.locale,`om.${band}.warning`,{m:measured}), recommendation:tr(ctx.locale,`om.${band}.recommendation`) };
  }
}
