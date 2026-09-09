import type { OrcaStatus } from '../../shared/orca-contract.js';
import type { EvidenceItem } from '../agents/types.js';
import type { FusedEvidence } from './fusion.js';

/**
 * Evidence-backed explanations. Every sentence is built ONLY from fused
 * evidence items — never invented, never claiming advisories, satellite, or
 * live INCOIS data that is not in the evidence. Falls back to a generic but
 * truthful line when an expected item is absent.
 */

function cleanDemo(s: string): string {
  return s.replace(/ \(demo\)/g, '');
}

function find(items: EvidenceItem[], label: string): EvidenceItem | undefined {
  return items.find((e) => e.label === label);
}

export function buildExplanation(input: {
  status: OrcaStatus;
  fused: FusedEvidence;
  locationGuidance: string;
  /**
   * Fishing-opportunity context (planning questions only). Appends ONE
   * cautious sentence when ecosystem observations exist — observation, never
   * interpretation: no fish promises, no probabilities, no PFZ claims.
   */
  includeOpportunity?: boolean;
}): string {
  const { status, fused, locationGuidance, includeOpportunity } = input;
  const items = fused.evidence;
  const guidance = locationGuidance.trim();

  const opportunity = (): string => {
    if (!includeOpportunity || status !== 'safe') return '';
    const sst = find(items, 'Sea-surface temperature')?.value;
    if (!sst) return '';
    return ` Nearby sea-surface temperature is ${sst} — ecosystem conditions may be useful for identifying potentially favorable fishing areas.`;
  };

  if (status === 'danger') {
    const parts: string[] = [];
    const severe = items.filter((e) => e.severity === 'severe');
    if (severe.length > 0) {
      const src = severe[0].source;
      parts.push(
        /demo|none/i.test(src)
          ? `A marine warning is active: ${cleanDemo(severe[0].value)} (demo data).`
          : `A ${src} warning is active: ${severe[0].value}.`,
      );
    }
    const wave = find(items, 'Wave height')?.value;
    const wind = find(items, 'Wind')?.value;
    const gusts = find(items, 'Gusts')?.value;
    const readings = [
      wave ? `waves around ${wave}` : null,
      wind ? `winds of ${wind}` : null,
      gusts ? `gusting to ${gusts}` : null,
    ].filter((x): x is string => x !== null);
    if (readings.length > 0) {
      parts.push(`Readings are severe, with ${readings.join(', ')}.`);
    }
    if (parts.length === 0) {
      parts.push('Several danger signals agree that going out is unsafe today.');
    }
    parts.push('When warnings and severe readings agree, ORCA always says danger — no fishing today.');
    return parts.join(' ');
  }

  if (status === 'caution') {
    const top = fused.strongestSignal?.assessment ?? 'caution';
    const wave = find(items, 'Wave height')?.value;
    const wind = find(items, 'Wind')?.value;
    const gusts = find(items, 'Gusts')?.value;
    const advisories = items.filter((e) => e.severity === 'moderate');

    // Every domain sharing the top severity is a driver — never crown one
    // driver while calling another "acceptable". Priority: hazard, weather, sea.
    const drivers: string[] = [];
    const driverAgents = ['hazard', 'weather', 'sea'].filter(
      (a) => fused.assessments[a] === top,
    );
    for (const agent of driverAgents) {
      if (agent === 'weather' && wind) {
        drivers.push(`winds reach ${wind}${gusts ? ` with gusts to ${gusts}` : ''}`);
      } else if (agent === 'sea' && wave) {
        drivers.push(`waves are around ${wave}`);
      } else if (agent === 'hazard' && advisories.length > 0) {
        drivers.push(`an advisory is active (${cleanDemo(advisories[0].value)})`);
      }
    }
    if (drivers.length === 0) {
      const fallback = [
        wave ? `waves around ${wave}` : null,
        wind ? `winds of ${wind}` : null,
      ].filter((x): x is string => x !== null);
      drivers.push(fallback.length > 0 ? fallback.join(' and ') : 'conditions in part of the day look rough');
    }

    // Contrast only genuinely calm domains — never a co-driver.
    const contrast: string[] = [];
    if (fused.assessments['weather'] === 'safe' && wind) contrast.push(`winds remain acceptable at ${wind}`);
    if (fused.assessments['sea'] === 'safe' && wave) contrast.push(`waves stay around ${wave}`);
    if (fused.assessments['hazard'] === 'safe') contrast.push('there is no red alert');

    const sentence =
      contrast.length > 0
        ? `ORCA recommends caution because ${drivers.join(' and ')}, while ${contrast.join(' and ')}.`
        : `ORCA recommends caution because ${drivers.join(' and ')}.`;
    return guidance ? `${sentence} ${guidance}` : sentence;
  }

  // safe
  const seaState = find(items, 'Sea state')?.value;
  const wind = find(items, 'Wind')?.value;
  const sky = find(items, 'Sky')?.value;
  const calm = [
    seaState ? `the sea is ${seaState.toLowerCase()}` : null,
    wind ? `winds of ${wind}` : null,
    sky ? `under ${sky.toLowerCase()} skies` : null,
  ].filter((x): x is string => x !== null);
  const base =
    calm.length > 0
      ? `${cap(calm.join(', '))}, and there is no active marine warning.`
      : 'Available readings look fair, and there is no active marine warning.';
  const safeText = guidance ? `${base} ${guidance}` : base;
  return `${safeText}${opportunity()}`;
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
