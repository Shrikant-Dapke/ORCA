import { ProviderError } from '../providers/types.js';
import type { AreaContext } from '../providers/types.js';

/**
 * MOSDAC (ISRO) satellite data — RESEARCH FINDINGS (verified):
 *
 * MOSDAC DOES publish an official download API (mosdac.gov.in →
 * "API based Access", mdapi.py client + OpenAPI search), BUT it requires:
 *  1. a registered MOSDAC SSO account with approval,
 *  2. user credentials in every request,
 *  3. a known datasetId,
 *  4. NRT/privileged status for near-real-time products
 *     (general users get 3-day latency; anonymous users only open data).
 * None of these exist in this environment, and embedding personal
 * credentials in a hackathon MVP is out of scope.
 *
 * This stub therefore implements the satellite provider interface and fails
 * honestly (→ degraded unavailable, never fake imagery) until configured.
 *
 * TO GO LIVE, set (server env only, never frontend):
 *   MOSDAC_USERNAME, MOSDAC_PASSWORD  — approved SSO account
 *   MOSDAC_DATASET_ID                — e.g. an OCM chlorophyll product id
 * and implement getPass() against the mdapi search/download flow.
 * Do NOT scrape mosdac.gov.in pages.
 */

export interface SatellitePass {
  datasetId: string;
  observedAt: string;
  product: string;
  source: string;
  sourceUrl?: string;
}

export interface SatelliteProvider {
  name: string;
  getPass(_ctx: AreaContext): Promise<SatellitePass>;
}

export class MosdacProvider implements SatelliteProvider {
  readonly name = 'MosdacProvider';

  async getPass(): Promise<SatellitePass> {
    throw new ProviderError(
      'MosdacProvider',
      'MOSDAC needs a registered SSO account (MOSDAC_USERNAME/MOSDAC_PASSWORD/MOSDAC_DATASET_ID). ' +
        'No credentials are configured — satellite products unavailable.',
    );
  }
}

export function mosdacConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.MOSDAC_USERNAME && env.MOSDAC_PASSWORD && env.MOSDAC_DATASET_ID);
}
