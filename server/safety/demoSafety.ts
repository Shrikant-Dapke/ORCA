import type { AreaContext } from '../providers/types.js';
import { tr } from '../i18n/responses.js';
import type { MarineSafetyProvider, SafetyAdvisory } from './types.js';

/**
 * DEMO safety provider — scripted advisories so judges can demonstrate
 * SAFE / CAUTION / DANGER without pretending a real warning exists.
 *
 * Every item carries live:false, source 'Demo safety watch', and the mapping
 * layer suffixes titles with "(demo)". Meta reports advisorySource 'demo',
 * advisoryLive false. Mirrors the demo marine scenario picks by topic.
 */
export class DemoSafetyProvider implements MarineSafetyProvider {
  readonly name = 'DemoSafetyProvider';
  readonly advisorySource = 'demo' as const;

  async getAdvisories(ctx: AreaContext): Promise<SafetyAdvisory[]> {
    const now = Date.now();
    const validFrom = new Date(now - 60 * 60 * 1000).toISOString();
    const validUntil = new Date(now + 30 * 60 * 60 * 1000).toISOString();
    const issuedAt = new Date(now).toISOString();
    const base = { validFrom, validUntil, issuedAt, area: ctx.label, live: false };

    if (ctx.topic === 'danger') {
      return [
        {
          ...base,
          severity: 'severe',
          type: 'small-vessel',
          headline: tr(ctx.locale, 'haz.demo.severe'),
          source: 'Demo safety watch',
        },
      ];
    }
    if (ctx.topic === 'wind' || ctx.topic === 'spot' || ctx.topic === 'sea') {
      return [
        {
          ...base,
          severity: 'moderate',
          type: 'small-vessel',
          headline: tr(ctx.locale, 'haz.demo.moderate'),
          source: 'Demo safety watch',
        },
      ];
    }
    return [];
  }
}
