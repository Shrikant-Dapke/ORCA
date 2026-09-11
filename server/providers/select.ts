import type { DataSource } from '../../shared/orca-contract.js';
import { DemoSafetyProvider } from '../safety/demoSafety.js';
import { IncoisSafetyProvider } from '../safety/incois.js';
import { NullSafetyProvider, type MarineSafetyProvider } from '../safety/types.js';
import { DemoMarineProvider } from './demo.js';
import { IncoisRsmcMarineProvider } from './incoisRsmc.js';
import { OpenMeteoMarineProvider } from './openMeteoMarine.js';
import type { MarineDataProvider } from './types.js';

/**
 * Marine source:
 *   demo      → scripted demo data
 *   open-meteo → live Open-Meteo
 *   incois    → live INCOIS RSMC WaveWatch III NetCDF
 */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): MarineDataProvider {
  const raw = (env.ORCA_DATA_SOURCE ?? 'demo').trim().toLowerCase();
  if (raw === 'incois' || raw === 'incois-rsmc') return new IncoisRsmcMarineProvider();
  if (raw === 'open-meteo' || raw === 'openmeteo' || raw === 'live') return new OpenMeteoMarineProvider();
  if (raw !== 'demo') console.warn(`[orca] unknown ORCA_DATA_SOURCE="${raw}" — falling back to demo provider`);
  return new DemoMarineProvider();
}

export function safetyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  marineSource: DataSource = 'demo',
): MarineSafetyProvider {
  const raw = (env.ORCA_ADVISORY_SOURCE ?? '').trim().toLowerCase();
  if (raw === 'incois') return new IncoisSafetyProvider();
  if (raw === 'demo') return new DemoSafetyProvider();
  if (raw === 'none' || raw === 'off') return new NullSafetyProvider();
  if (raw !== '') console.warn(`[orca] unknown ORCA_ADVISORY_SOURCE="${raw}" — using paired default`);
  return marineSource === 'demo' ? new DemoSafetyProvider() : new NullSafetyProvider();
}
