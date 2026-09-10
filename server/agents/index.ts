import { resolvePosition } from '../location/areas.js';
import type { AreaContext } from '../providers/types.js';
import type { MarineWarning } from '../providers/types.js';
import { ProviderError } from '../providers/types.js';
import { bearingDeg, compass16, haversineKm, interpolateWaypoints } from '../geo/geo.js';
import { nearestZone } from '../pfz/providers.js';
import {
  assessHazardReading,
  assessSeaReading,
  assessWeatherReading,
} from '../reasoning/engine.js';
import { CONFIDENCE } from '../reasoning/fusion.js';
import {
  activeAdvisories,
  advisoryLabel,
  advisoryToWarning,
} from '../safety/types.js';
import { tr } from '../i18n/responses.js';
import type { AgentContext, AgentResult, EvidenceItem, OrcaAgent } from './types.js';

/**
 * Specialist agents. Each owns exactly one domain: it reads provider data,
 * assesses ONLY its domain with the shared assessors (thresholds live in
 * one place), and emits evidence with provenance. Agents never see each
 * other and never decide the final status — fusion + engine do that.
 */

/** Friendly provenance label. Demo sources are always explicit. */
function providerSource(ctx: AgentContext): { label: string; live: boolean } {
  const live = ctx.provider.dataSource !== 'demo';
  if (/open-?meteo/i.test(ctx.provider.name)) return { label: 'Open-Meteo', live };
  if (/demo/i.test(ctx.provider.name)) return { label: 'Demo data', live: false };
  return { label: ctx.provider.name, live };
}

function readingConfidence(ctx: AgentContext): number {
  return ctx.provider.dataSource !== 'demo' ? CONFIDENCE.live : CONFIDENCE.demo;
}

export class SeaAgent implements OrcaAgent {
  readonly name = 'sea';
  canHandle(): boolean {
    return true;
  }
  async run(ctx: AgentContext): Promise<AgentResult> {
    const data = await ctx.provider.getSea(ctx);
    const assessment = assessSeaReading(data);
    const source = providerSource(ctx);
    const evidence: EvidenceItem[] = [
      { label: 'Wave height', value: `${data.waveHeightM} m`, source: source.label },
      { label: 'Sea state', value: data.seaText, source: source.label },
    ];
    const reasoning =
      assessment === 'danger'
        ? `Waves at ${data.waveHeightM} m exceed safe limits for small boats.`
        : assessment === 'caution'
          ? `Waves at ${data.waveHeightM} m need care in a small boat.`
          : `Waves at ${data.waveHeightM} m are within safe limits.`;
    return {
      agent: this.name,
      status: 'available',
      assessment,
      confidence: readingConfidence(ctx),
      evidence,
      reasoning,
      data,
    };
  }
}

export class WeatherAgent implements OrcaAgent {
  readonly name = 'weather';
  canHandle(): boolean {
    return true;
  }
  async run(ctx: AgentContext): Promise<AgentResult> {
    const data = await ctx.provider.getWeather(ctx);
    const assessment = assessWeatherReading(data);
    const source = providerSource(ctx);
    const evidence: EvidenceItem[] = [
      { label: 'Wind', value: `${data.windKph} kph`, source: source.label },
      { label: 'Gusts', value: `${data.gustKph} kph`, source: source.label },
      { label: 'Sky', value: data.skyText, source: source.label },
    ];
    const reasoning =
      assessment === 'danger'
        ? `Winds at ${data.windKph} kph gusting to ${data.gustKph} kph are dangerous for small boats.`
        : assessment === 'caution'
          ? `Winds at ${data.windKph} kph need care, with gusts to ${data.gustKph} kph.`
          : `Winds at ${data.windKph} kph are acceptable for fishing.`;
    return {
      agent: this.name,
      status: 'available',
      assessment,
      confidence: readingConfidence(ctx),
      evidence,
      reasoning,
      data,
    };
  }
}

export class HazardAgent implements OrcaAgent {
  readonly name = 'hazard';
  canHandle(): boolean {
    return true;
  }
  async run(ctx: AgentContext): Promise<AgentResult> {
    // Marine warnings + official advisories merge into one list. Safety
    // failures propagate (→ HTTP 502) — never silently treated as "no hazard".
    const [marine, advisories] = await Promise.all([
      ctx.provider.getHazards(ctx),
      ctx.safety.getAdvisories(ctx),
    ]);
    const provider = providerSource(ctx);
    const active = activeAdvisories(advisories);
    const evidence: EvidenceItem[] = marine.activeWarnings.map((w) => ({
      label: 'Advisory',
      value: w.title,
      source: provider.label,
      severity: w.level,
    }));
    const warnings: MarineWarning[] = [...marine.activeWarnings];
    for (const advisory of active) {
      const mapped = advisoryToWarning(advisory);
      if (mapped) {
        warnings.push(mapped);
        evidence.push({
          label: mapped.level === 'severe' ? 'Warning' : 'Advisory',
          value: advisory.live ? advisory.headline : `${advisory.headline} (demo)`,
          source: advisory.source,
          severity: mapped.level,
        });
      } else {
        evidence.push({
          label: 'Notice',
          value: advisoryLabel(advisory),
          source: advisory.source,
          severity: 'info',
        });
      }
    }
    const assessment = assessHazardReading({ activeWarnings: warnings });

    // No advisory source at all (live marine, feed not configured): honestly
    // unknown — never "safe by default". Demo/closed-world emptiness is safe.
    if (warnings.length === 0 && ctx.safety.advisorySource === 'none') {
      return {
        agent: this.name,
        status: 'available',
        assessment: 'unknown',
        confidence: CONFIDENCE.unknown,
        evidence: [
          { label: 'Advisories', value: 'no advisory source configured', source: 'none', severity: 'info' },
        ],
        reasoning: 'No advisory feed is configured, so hazards beyond marine readings are unknown.',
        limitations: ['no advisory feed configured — official warnings cannot be checked'],
        data: { activeWarnings: [] },
      };
    }

    const liveSafety = ctx.safety.advisorySource === 'incois';
    const severeCount = warnings.filter((w) => w.level === 'severe').length;
    const reasoning =
      assessment === 'danger'
        ? `A severe advisory is active (${severeCount} severe warning${severeCount === 1 ? '' : 's'} on record).`
        : assessment === 'caution'
          ? 'A marine advisory is active for these waters.'
          : 'No active advisories for these waters.';
    return {
      agent: this.name,
      status: 'available',
      assessment,
      confidence: liveSafety ? CONFIDENCE.live : CONFIDENCE.demo,
      evidence:
        evidence.length > 0
          ? evidence
          : [
              {
                label: 'Advisories',
                value: 'none active',
                source: ctx.safety.advisorySource === 'demo' ? 'Demo safety watch' : 'Advisory feed',
                severity: 'info',
              },
            ],
      reasoning,
      data: { activeWarnings: warnings },
    };
  }
}

export class LocationAgent implements OrcaAgent {
  readonly name = 'location';
  canHandle(): boolean {
    return true;
  }
  async run(ctx: AgentContext): Promise<AgentResult> {
    // Provenance, never geography invention: GPS is used verbatim, labels
    // resolve to demo zones, and the mode is always stated.
    const pos = resolvePosition(ctx.label, (ctx as AreaContext).coordinates);
    const nearShoreOnly = ctx.topic === 'spot' || ctx.topic === 'wind';
    const guidance = nearShoreOnly
      ? tr(ctx.locale, 'loc.guidance.near')
      : tr(ctx.locale, 'loc.guidance.far');

    if (pos.mode === 'gps') {
      return {
        agent: this.name,
        status: 'available',
        assessment: 'safe',
        confidence: CONFIDENCE.live,
        evidence: [{ label: 'Waters', value: 'your live location', source: 'GPS fix' }],
        reasoning: 'The fisherman shared a live GPS position; readings use it verbatim.',
        data: { nearShoreOnly, guidance },
      };
    }
    const demo = pos.mode === 'demo';
    return {
      agent: this.name,
      status: 'available',
      assessment: 'safe',
      confidence: demo ? CONFIDENCE.demoWaters : CONFIDENCE.manual,
      evidence: [
        {
          label: 'Waters',
          value: demo ? `${pos.name} (default demo waters)` : pos.name,
          source: 'Demo coordinates',
        },
      ],
      reasoning: demo
        ? 'No position was shared, so default demo waters are used.'
        : `The selected area matched ${pos.name}; approximate demo coordinates are used.`,
      limitations: ['position is approximate demo coordinates, not GPS'],
      data: { nearShoreOnly, guidance },
    };
  }
}

export class EcosystemAgent implements OrcaAgent {
  readonly name = 'ecosystem';
  canHandle(): boolean {
    return true;
  }
  async run(ctx: AgentContext): Promise<AgentResult> {
    // Observation, never interpretation: SST/chlorophyll describe conditions.
    // They must NEVER become a safety verdict (assessment stays unknown) and
    // must NEVER predict fish. Failures degrade to unavailable — a missing
    // ecosystem reading must not break, or darken, the safety response.
    try {
      const reading = await ctx.ecosystem.getConditions(ctx);
      const source = reading.live ? reading.source : 'Demo data';
      const evidence: EvidenceItem[] = [];
      if (reading.sst) {
        evidence.push({
          label: 'Sea-surface temperature',
          value: `${reading.sst.value} ${reading.sst.unit}`,
          source,
          severity: 'info',
        });
      }
      if (reading.chlorophyll) {
        evidence.push({
          label: 'Chlorophyll-a',
          value: `${reading.chlorophyll.value} ${reading.chlorophyll.unit}`,
          source,
          severity: 'info',
        });
      }
      return {
        agent: this.name,
        status: 'available',
        assessment: 'unknown',
        confidence: reading.live ? CONFIDENCE.live : CONFIDENCE.demo,
        evidence,
        reasoning:
          'Nearby ecosystem indicators observed; they describe conditions only, not fish presence or safety.',
        limitations: reading.live ? undefined : ['demo ecosystem values, not observations'],
        data: null,
      };
    } catch (err) {
      if (err instanceof ProviderError) {
        return {
          agent: this.name,
          status: 'unavailable',
          assessment: 'unknown',
          confidence: 0,
          evidence: [],
          reasoning: 'Ecosystem data could not be retrieved.',
          limitations: [`ecosystem provider unavailable: ${err.message}`],
          data: null,
        };
      }
      throw err;
    }
  }
}

export class GeoAgent implements OrcaAgent {
  readonly name = 'geo';
  canHandle(): boolean {
    return true;
  }
  async run(ctx: AgentContext): Promise<AgentResult> {
    // Spatial reasoning over available zones. There is deliberately NO
    // invented restricted-area geometry: with no authoritative polygon
    // dataset configured, the agent says so instead of guessing.
    // Auxiliary-provider failure degrades (never 502s the safety answer).
    try {
      const zones = await ctx.pfz.getZones(ctx);
      const dest = nearestZone(zones);
      if (!dest) {
        return {
          agent: this.name,
          status: 'available',
          assessment: 'unknown',
          confidence: CONFIDENCE.unknown,
          evidence: [{ label: 'Fishing zones', value: 'none on record', source: 'PFZ feed', severity: 'info' }],
          reasoning: 'No candidate fishing zones are on record right now.',
          limitations: ['no fishing zones available for spatial reasoning'],
          data: null,
        };
      }
      return {
        agent: this.name,
        status: 'available',
        assessment: 'unknown',
        confidence: ctx.provider.dataSource !== 'demo' ? CONFIDENCE.live : CONFIDENCE.demo,
        evidence: [
          { label: 'Nearest zone', value: `${dest.distanceKm} km ${dest.bearingCompass}`, source: dest.source, severity: 'info' },
          { label: 'Restricted areas', value: 'no authoritative dataset on record', source: 'ORCA geo', severity: 'info' },
        ],
        reasoning: `Nearest candidate zone is ${dest.distanceKm} km ${dest.bearingCompass}; no authoritative restricted-area data to check it against.`,
        limitations: ['no authoritative restricted-area polygons configured'],
        data: null,
      };
    } catch (err) {
      if (err instanceof ProviderError) {
        return {
          agent: this.name,
          status: 'unavailable',
          assessment: 'unknown',
          confidence: 0,
          evidence: [],
          reasoning: 'Spatial reasoning could not run.',
          limitations: [`zone provider unavailable: ${err.message}`],
          data: null,
        };
      }
      throw err;
    }
  }
}

export class RouteAgent implements OrcaAgent {
  readonly name = 'route';
  canHandle(): boolean {
    return true;
  }
  async run(ctx: AgentContext): Promise<AgentResult> {
    // Deterministic route math only — never official navigation.
    // Auxiliary-provider failure degrades (never 502s the safety answer).
    try {
      const zones = await ctx.pfz.getZones(ctx);
      const dest = nearestZone(zones);
      if (!dest) {
        return {
          agent: this.name,
          status: 'unavailable',
          assessment: 'unknown',
          confidence: 0,
          evidence: [],
          reasoning: 'No destination zone, so no route was calculated.',
          limitations: ['no destination zone available'],
          data: null,
        };
      }
      const pos = resolvePosition(ctx.label, (ctx as AreaContext).coordinates);
      const origin = { latitude: pos.lat, longitude: pos.lon };
      const to = { latitude: dest.latitude, longitude: dest.longitude };
      const [sea, weather] = await Promise.all([
        ctx.provider.getSea(ctx),
        ctx.provider.getWeather(ctx),
      ]);
      const advisories = activeAdvisories(
        await ctx.safety.getAdvisories(ctx).catch(() => []),
      );
      const severe = advisories.some((a) => a.severity === 'severe');

      const distanceKm = Math.round(haversineKm(origin, to) * 10) / 10;
      const bearing = Math.round(bearingDeg(origin, to));
      const waypoints = interpolateWaypoints(origin, to, 3).map((w) => ({
        latitude: Math.round(w.latitude * 1000) / 1000,
        longitude: Math.round(w.longitude * 1000) / 1000,
      }));

      // Environmental risk score 0–100 from the same thresholds as safety.
      const load = Math.max(sea.waveHeightM / 4, weather.windKph / 70, weather.gustKph / 95);
      let riskScore = Math.min(100, Math.round(load * 100));
      if (severe) riskScore = Math.max(riskScore, 90);
      else if (advisories.some((a) => a.severity !== 'info')) riskScore = Math.max(riskScore, 45);
      const riskLevel = riskScore >= 67 ? 'high' : riskScore >= 34 ? 'moderate' : 'low';

      return {
        agent: this.name,
        status: 'available',
        assessment: 'unknown',
        confidence: ctx.provider.dataSource !== 'demo' ? CONFIDENCE.live : CONFIDENCE.demo,
        evidence: [
          { label: 'Distance', value: `${distanceKm} km`, source: 'ORCA route engine' },
          { label: 'Bearing', value: `${compass16(bearing)} (${bearing}°)`, source: 'ORCA route engine' },
          { label: 'Route risk', value: `${riskLevel} (${riskScore}/100)`, source: 'ORCA route engine' },
          { label: 'Destination', value: dest.name, source: dest.source },
        ],
        reasoning: `Route calculated to ${dest.name}: ${distanceKm} km ${compass16(bearing)}, environmental risk ${riskLevel}. Not official navigation.`,
        data: {
          destinationId: dest.id,
          destinationName: dest.name,
          waypoints,
          distanceKm,
          bearingDeg: bearing,
          bearingCompass: compass16(bearing),
          riskScore,
          riskLevel,
        },
      };
    } catch (err) {
      if (err instanceof ProviderError) {
        return {
          agent: this.name,
          status: 'unavailable',
          assessment: 'unknown',
          confidence: 0,
          evidence: [],
          reasoning: 'Route could not be calculated.',
          limitations: [`route inputs unavailable: ${err.message}`],
          data: null,
        };
      }
      throw err;
    }
  }
}
