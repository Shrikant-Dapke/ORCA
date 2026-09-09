import type { AreaContext, MarineWarning, WarningLevel } from '../providers/types.js';

/**
 * Advisory-side provider abstraction. Marine *forecasts* (waves/wind) flow
 * through MarineDataProvider; official *safety advisories* (severity +
 * validity window) flow through here. The HazardAgent merges both, so the
 * reasoning engine sees one warning list and needs no INCOIS-specific code.
 */

export type AdvisorySource = 'demo' | 'incois' | 'none';

export type AdvisorySeverity = 'severe' | 'moderate' | 'info';

export interface SafetyAdvisory {
  severity: AdvisorySeverity;
  /** Advisory kind, e.g. 'small-vessel', 'high-wave', 'cyclone'. */
  type: string;
  /** Plain-words headline WITHOUT any demo suffix (mapping adds it). */
  headline: string;
  /** ISO timestamps bounding when the advisory applies. */
  validFrom: string;
  validUntil: string;
  /** Human area description, e.g. 'your selected fishing area'. */
  area: string;
  /** Issuing authority label, e.g. 'INCOIS SVAS', 'Demo safety watch'. */
  source: string;
  /** True ONLY when retrieved from a real issuing authority. */
  live: boolean;
  issuedAt?: string;
  /** Link to the official bulletin page when one exists. */
  sourceUrl?: string;
}

export interface MarineSafetyProvider {
  /** Human name, e.g. "DemoSafetyProvider". */
  name: string;
  advisorySource: AdvisorySource;
  getAdvisories(ctx: AreaContext): Promise<SafetyAdvisory[]>;
}

/** 'incois' is the only source counted as live. Single place — never scatter. */
export function isLiveAdvisorySource(source: AdvisorySource): boolean {
  return source === 'incois';
}

/**
 * Drop expired advisories. Unparseable validity windows are KEPT (fail-open):
 * for fishermen, a possibly-stale warning is safer than a silently dropped
 * real one. Malformed-but-kept items are still just warnings, never data.
 */
export function activeAdvisories(
  list: SafetyAdvisory[],
  nowMs: number = Date.now(),
): SafetyAdvisory[] {
  return list.filter((a) => {
    const from = Date.parse(a.validFrom);
    const until = Date.parse(a.validUntil);
    if (Number.isNaN(from) || Number.isNaN(until)) return true;
    return from <= nowMs && nowMs <= until;
  });
}

/**
 * Central advisory → warning mapping. 'severe' forces DANGER and 'moderate'
 * forces CAUTION in the existing engine; 'info' is evidence-only and never
 * affects the status. Demo items are visibly suffixed — never labeled live.
 */
export function advisoryLabel(a: SafetyAdvisory): string {
  const base = `${a.source}: ${a.headline}`;
  return a.live ? base : `${base} (demo)`;
}

export function advisoryToWarning(a: SafetyAdvisory): MarineWarning | null {
  const level: WarningLevel | null =
    a.severity === 'severe' ? 'severe' : a.severity === 'moderate' ? 'moderate' : null;
  if (!level) return null;
  return { level, title: advisoryLabel(a) };
}

/** No-op safety provider: no advisory source configured. Never warns. */
export class NullSafetyProvider implements MarineSafetyProvider {
  readonly name = 'NullSafetyProvider';
  readonly advisorySource = 'none' as const;
  async getAdvisories(): Promise<SafetyAdvisory[]> {
    return [];
  }
}
