import type { OrcaStatus, ResponseLocale } from '../../shared/orca-contract.js';
import type { EvidenceItem } from '../agents/types.js';
import { joinList, tr } from '../i18n/responses.js';
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
  locale?: ResponseLocale;
}): string {
  const { status, fused, locationGuidance, includeOpportunity, locale } = input;
  const items = fused.evidence;
  const guidance = locationGuidance.trim();

  const opportunity = (): string => {
    if (!includeOpportunity || status !== 'safe') return '';
    const sst = find(items, 'Sea-surface temperature')?.value;
    if (!sst) return '';
    return tr(locale, 'ex.opportunity', { x: sst });
  };

  if (status === 'danger') {
    const parts: string[] = [];
    const severe = items.filter((e) => e.severity === 'severe');
    if (severe.length > 0) {
      const src = severe[0].source;
      parts.push(
        /demo|none/i.test(src)
          ? tr(locale, 'ex.danger.demoWarning', { x: cleanDemo(severe[0].value) })
          : tr(locale, 'ex.danger.liveWarning', { source: src, x: severe[0].value }),
      );
    }
    const wave = find(items, 'Wave height')?.value;
    const wind = find(items, 'Wind')?.value;
    const gusts = find(items, 'Gusts')?.value;
    const readings = [
      wave ? tr(locale, 'ex.danger.read.waves', { x: wave }) : null,
      wind ? tr(locale, 'ex.danger.read.wind', { x: wind }) : null,
      gusts ? tr(locale, 'ex.danger.read.gusts', { x: gusts }) : null,
    ].filter((x): x is string => x !== null);
    if (readings.length > 0) {
      parts.push(tr(locale, 'ex.danger.readings', { x: readings.join(', ') }));
    }
    if (parts.length === 0) {
      parts.push(tr(locale, 'ex.danger.fallback'));
    }
    parts.push(tr(locale, 'ex.danger.close'));
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
        drivers.push(
          tr(locale, 'ex.drv.wind', {
            w: wind,
            g: gusts ? tr(locale, 'ex.drv.gusts', { x: gusts }) : '',
          }),
        );
      } else if (agent === 'sea' && wave) {
        drivers.push(tr(locale, 'ex.drv.sea', { x: wave }));
      } else if (agent === 'hazard' && advisories.length > 0) {
        drivers.push(tr(locale, 'ex.drv.advisory', { x: cleanDemo(advisories[0].value) }));
      }
    }
    if (drivers.length === 0) {
      const fallback = [
        wave ? tr(locale, 'ex.drv.fallback.waves', { x: wave }) : null,
        wind ? tr(locale, 'ex.drv.fallback.wind', { x: wind }) : null,
      ].filter((x): x is string => x !== null);
      drivers.push(
        fallback.length > 0 ? joinList(locale, fallback) : tr(locale, 'ex.drv.fallback.rough'),
      );
    }

    // Contrast only genuinely calm domains — never a co-driver.
    const contrast: string[] = [];
    if (fused.assessments['weather'] === 'safe' && wind)
      contrast.push(tr(locale, 'ex.con.wind', { x: wind }));
    if (fused.assessments['sea'] === 'safe' && wave)
      contrast.push(tr(locale, 'ex.con.sea', { x: wave }));
    if (fused.assessments['hazard'] === 'safe') contrast.push(tr(locale, 'ex.con.noalert'));

    const sentence =
      contrast.length > 0
        ? tr(locale, 'ex.caution.full', { d: joinList(locale, drivers), c: joinList(locale, contrast) })
        : tr(locale, 'ex.caution.only', { d: joinList(locale, drivers) });
    return guidance ? `${sentence} ${guidance}` : sentence;
  }

  // safe
  const seaState = find(items, 'Sea state')?.value;
  const wind = find(items, 'Wind')?.value;
  const sky = find(items, 'Sky')?.value;
  const calm = [
    seaState ? tr(locale, 'ex.safe.sea', { x: seaState.toLowerCase() }) : null,
    wind ? tr(locale, 'ex.safe.wind', { x: wind }) : null,
    sky ? tr(locale, 'ex.safe.sky', { x: sky.toLowerCase() }) : null,
  ].filter((x): x is string => x !== null);
  // No advisory feed (hazard unknown) means "no warning ON RECORD" — never
  // claim checked warnings that were never checked.
  const hazardUnknown = fused.assessments['hazard'] === 'unknown';
  const base =
    calm.length > 0
      ? `${cap(calm.join(', '))}${tr(locale, hazardUnknown ? 'ex.safe.baseUnknown' : 'ex.safe.base')}`
      : tr(locale, hazardUnknown ? 'ex.safe.fallbackUnknown' : 'ex.safe.fallback');
  const safeText = guidance ? `${base} ${guidance}` : base;
  return `${safeText}${opportunity()}`;
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
