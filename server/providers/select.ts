import type { DataSource } from '../../shared/orca-contract.js';
import { DemoSafetyProvider } from '../safety/demoSafety.js';
import { IncoisSafetyProvider } from '../safety/incois.js';
import { NullSafetyProvider, type MarineSafetyProvider } from '../safety/types.js';
import { DemoMarineProvider } from './demo.js';
import { OpenMeteoMarineProvider } from './openMeteoMarine.js';
import type { MarineDataProvider } from './types.js';

/**
 * Provider selection — one env var, no surprises.
 *
 *   ORCA_DATA_SOURCE=demo        → DemoMarineProvider (default, offline-safe)
 *   ORCA_DATA_SOURCE=open-meteo  → OpenMeteoMarineProvider (live, needs internet)
 *
 * Anything else (or unset) falls back to demo with a loud warning, so the
 * system can never silently claim live data it does not have.
 */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): MarineDataProvider {
  const raw = (env.ORCA_DATA_SOURCE ?? 'demo').trim().toLowerCase();
  if (raw === 'open-meteo' || raw === 'openmeteo' || raw === 'live') {
    return new OpenMeteoMarineProvider();
  }
  if (raw !== 'demo') {
    // eslint-disable-next-line no-console
    console.warn(`[orca] unknown ORCA_DATA_SOURCE="${raw}" — falling back to demo provider`);
  }
  return new DemoMarineProvider();
}

/**
 * Advisory selection.
 *
 *   ORCA_ADVISORY_SOURCE=demo    → DemoSafetyProvider (scripted, labeled demo)
 *   ORCA_ADVISORY_SOURCE=incois  → IncoisSafetyProvider (honest 502 until an
 *                                  official machine-readable feed exists)
 *   ORCA_ADVISORY_SOURCE=none    → no advisories
 *   unset → paired default: demo marine gets demo advisories (scripted demo);
 *           live marine gets NONE — live readings must never be mixed with
 *           scripted warnings.
 */
export function safetyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  marineSource: DataSource = 'demo',
): MarineSafetyProvider {
  const raw = (env.ORCA_ADVISORY_SOURCE ?? '').trim().toLowerCase();
  if (raw === 'incois') return new IncoisSafetyProvider();
  if (raw === 'demo') return new DemoSafetyProvider();
  if (raw === 'none' || raw === 'off') return new NullSafetyProvider();
  if (raw !== '') {
    // eslint-disable-next-line no-console
    console.warn(`[orca] unknown ORCA_ADVISORY_SOURCE="${raw}" — using paired default`);
  }
  return marineSource === 'demo' ? new DemoSafetyProvider() : new NullSafetyProvider();
}
