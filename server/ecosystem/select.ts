import type { DataSource } from '../../shared/orca-contract.js';
import { DemoEcosystemProvider } from './demoEcosystem.js';
import { IncoisEcosystemProvider } from './incoisEcosystem.js';
import { NullEcosystem, type MarineEcosystemProvider } from './types.js';

/**
 * Ecosystem selection — same philosophy as marine/safety providers.
 *
 *   ORCA_ECOSYSTEM_SOURCE=demo    → DemoEcosystemProvider (scripted, labeled)
 *   ORCA_ECOSYSTEM_SOURCE=incois  → IncoisEcosystemProvider (live ERDDAP SST
 *                                   with freshness gate; unavailable when stale)
 *   ORCA_ECOSYSTEM_SOURCE=none    → no ecosystem data
 *   unset → paired default: demo marine gets demo ecosystem; live marine gets
 *           the live INCOIS provider (failures degrade to unavailable — the
 *           ecosystem agent never breaks the safety response).
 */
export function ecosystemFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  marineSource: DataSource = 'demo',
): MarineEcosystemProvider {
  const raw = (env.ORCA_ECOSYSTEM_SOURCE ?? '').trim().toLowerCase();
  if (raw === 'incois') return new IncoisEcosystemProvider();
  if (raw === 'demo') return new DemoEcosystemProvider();
  if (raw === 'none' || raw === 'off') return new NullEcosystem();
  if (raw !== '') {
    // eslint-disable-next-line no-console
    console.warn(`[orca] unknown ORCA_ECOSYSTEM_SOURCE="${raw}" — using paired default`);
  }
  return marineSource === 'demo' ? new DemoEcosystemProvider() : new IncoisEcosystemProvider();
}
