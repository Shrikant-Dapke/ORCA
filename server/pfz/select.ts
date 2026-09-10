import type { DataSource } from '../../shared/orca-contract.js';
import { DemoPfzProvider, IncoisPfzProvider, NullPfz, type PfzProvider } from './providers.js';

/**
 * PFZ selection — same philosophy as the other providers.
 *   ORCA_PFZ_SOURCE=demo    → scripted demo zones (labeled demo)
 *   ORCA_PFZ_SOURCE=incois  → honest stub (502 until authorized feed exists)
 *   ORCA_PFZ_SOURCE=none    → no zones
 *   unset → paired default: demo marine gets demo zones; live marine gets
 *           NONE (never mix scripted zones with live readings by default).
 */
export function pfzFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  marineSource: DataSource = 'demo',
): PfzProvider {
  const raw = (env.ORCA_PFZ_SOURCE ?? '').trim().toLowerCase();
  if (raw === 'incois') return new IncoisPfzProvider();
  if (raw === 'demo') return new DemoPfzProvider();
  if (raw === 'none' || raw === 'off') return new NullPfz();
  if (raw !== '') {
    // eslint-disable-next-line no-console
    console.warn(`[orca] unknown ORCA_PFZ_SOURCE="${raw}" — using paired default`);
  }
  return marineSource === 'demo' ? new DemoPfzProvider() : new NullPfz();
}
