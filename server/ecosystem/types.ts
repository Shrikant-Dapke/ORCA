import type { AreaContext } from '../providers/types.js';
import { ProviderError } from '../providers/types.js';

/**
 * Ecosystem provider abstraction. Ecosystem readings (SST, chlorophyll)
 * describe conditions — they NEVER decide safety and NEVER predict fish.
 * The EcosystemAgent consumes this; the safety engine never sees it.
 */

export type EcosystemSource = 'demo' | 'incois' | 'none';

export interface EcosystemValue {
  value: number;
  unit: string;
}

export interface EcosystemReading {
  /** ISO timestamp of the actual observation (not fetch time). */
  observedAt: string;
  /** ACTUAL observation location (nearest grid point / float), not the request point. */
  latitude: number;
  longitude: number;
  sst?: EcosystemValue;
  chlorophyll?: EcosystemValue;
  /** Human source label for evidence, e.g. 'INCOIS ERDDAP'. */
  source: string;
  /** Dataset identifier for internal metadata/health. */
  dataset: string;
  /** True ONLY for fresh observations passing validation. */
  live: boolean;
}

export interface MarineEcosystemProvider {
  name: string;
  ecosystemSource: EcosystemSource;
  /** Dataset identifier reported in health (or 'demo'/'none'). */
  dataset: string;
  getConditions(ctx: AreaContext): Promise<EcosystemReading>;
}

export function isLiveEcosystemSource(source: EcosystemSource): boolean {
  return source === 'incois';
}

/** No-op ecosystem provider: no source configured. Never returns data. */
export class NullEcosystem implements MarineEcosystemProvider {
  readonly name = 'NullEcosystem';
  readonly ecosystemSource = 'none' as const;
  readonly dataset = 'none';
  async getConditions(): Promise<EcosystemReading> {
    throw new ProviderError('NullEcosystem', 'no ecosystem source configured');
  }
}
