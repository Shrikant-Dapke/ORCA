import { ProviderError } from '../providers/types.js';
import type { AreaContext } from '../providers/types.js';
import type { MarineSafetyProvider, SafetyAdvisory } from './types.js';

/**
 * INCOIS safety provider — RESEARCH FINDINGS (verified Sep 2026, documented
 * here so nobody re-discovers them by guessing URLs):
 *
 * 1. SVAS (Small Vessel Advisory & Forecast Services) is a real operational
 *    INCOIS service: Boat Safety Index from wave height/steepness/directional
 *    spread/wind-sea development, boat-specific by beam width, ~10-day
 *    outlook, all 9 coastal states/UTs. Delivered through a VISUAL map portal
 *    (incois.gov.in → Multi-Hazard → SVAS → "View Large Map"). No public
 *    machine-readable API is documented anywhere.
 * 2. High Wave / Swell Surge bulletins: same story — visual map + web pages
 *    (site/services/hwa.jsp), no JSON/XML/CSV feed, no documented endpoint.
 * 3. INCOIS ERDDAP (erddap.incois.gov.in) IS reachable and machine-readable
 *    (RESTful .json/.csv, no auth) — but hosts OBSERVATIONS only: ASCAT
 *    winds, SST, chlorophyll, Argo floats. No SVAS/BSI, advisory, or alert
 *    datasets exist there (16-dataset inventory checked).
 * 4. MoES ESSDP data portal is a searchable catalogue, not an advisory API.
 *
 * Per the research-first rule this class STOPS at the provider interface: it
 * implements MarineSafetyProvider so the HazardAgent/orchestrator path is
 * fully wired, but fetching throws an honest ProviderError (→ HTTP 502)
 * instead of scraping a visual page or inventing an endpoint.
 *
 * TO GO LIVE, one of:
 *  a) INCOIS publishes an official advisory API/feed → implement
 *     getAdvisories() against it here (auth from env, never source);
 *  b) Formal data-sharing arrangement for SVAS/BSI grids or bulletins;
 *  c) IMD marine/fisherfolk warnings: same MarineSafetyProvider interface —
 *     needs an officially accessible feed (none available in this
 *     environment); required config would be the feed URL (+ key if any)
 *     via env, e.g. ORCA_IMD_FEED_URL. Do NOT scrape mausam.imd.gov.in.
 */
export class IncoisSafetyProvider implements MarineSafetyProvider {
  readonly name = 'IncoisSafetyProvider';
  readonly advisorySource = 'incois' as const;

  async getAdvisories(_ctx: AreaContext): Promise<SafetyAdvisory[]> {
    throw new ProviderError(
      'IncoisSafetyProvider',
      'INCOIS publishes SVAS/high-wave advisories through visual map portals only — ' +
        'no public machine-readable API exists (see server/safety/incois.ts). ' +
        'Use ORCA_ADVISORY_SOURCE=demo for scripted advisories.',
    );
  }
}
