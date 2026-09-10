import type {
  AreaContext,
  HazardReading,
  MarineDataProvider,
  ScenarioAdvice,
  SeaReading,
  WeatherReading,
} from './types.js';
import { tr } from '../i18n/responses.js';

/**
 * DEMO provider — clearly isolated sample data for the SIH demo.
 *
 * This is NOT live data. No real-time conditions are claimed anywhere:
 * responses carry `meta: { dataSource: 'demo', live: false }`.
 *
 * To go live: implement `MarineDataProvider` against a real marine API
 * (e.g. Open-Meteo Marine + IMD warnings) and swap it in `server/app.ts`.
 * Nothing else changes.
 */

interface DemoScenario {
  waveM: number;
  windKph: number;
  gustKph: number;
  seaText: string;
  windText: string;
  skyText: string;
  warnings: HazardReading['activeWarnings'];
  /** Stable key into the trilingual advice dictionary (adv.{id}.*). */
  adviceId: 'calm' | 'breezy' | 'mixed' | 'storm';
}

const CALM_MORNING: DemoScenario = {
  waveM: 0.8,
  windKph: 18,
  gustKph: 26,
  seaText: 'Calm',
  windText: 'Moderate',
  skyText: 'Clear',
  warnings: [],
  adviceId: 'calm',
};

const BREEZY_AFTERNOON: DemoScenario = {
  waveM: 2.3,
  windKph: 42,
  gustKph: 55,
  seaText: 'Slightly rough',
  windText: 'Strong after noon',
  skyText: 'Cloudy',
  warnings: [{ level: 'moderate', title: 'Strong-wind advisory after noon (demo)' }],
  adviceId: 'breezy',
};

const NEAR_SHORE_MIXED: DemoScenario = {
  waveM: 2.4,
  windKph: 38,
  gustKph: 50,
  seaText: 'Rough outside, calmer near shore',
  windText: 'Moderate to strong',
  skyText: 'Cloudy',
  warnings: [{ level: 'moderate', title: 'Rough outer waters (demo)' }],
  adviceId: 'mixed',
};

const STORM_WARNING: DemoScenario = {
  waveM: 4.2,
  windKph: 72,
  gustKph: 90,
  seaText: 'Very rough',
  windText: 'Very strong',
  skyText: 'Stormy',
  warnings: [{ level: 'severe', title: 'Storm warning (demo)' }],
  adviceId: 'storm',
};

/** Deterministic scenario pick so judges can hit every state on demand. */
function pickScenario(ctx: AreaContext): DemoScenario {
  if (ctx.topic === 'danger') return STORM_WARNING;
  if (ctx.topic === 'wind') return BREEZY_AFTERNOON;
  if (ctx.topic === 'spot') return NEAR_SHORE_MIXED;
  if (ctx.timeframe === 'today') return BREEZY_AFTERNOON;
  return CALM_MORNING;
}

export class DemoMarineProvider implements MarineDataProvider {
  readonly name = 'DemoMarineProvider';
  readonly dataSource = 'demo' as const;

  describeLocation(): string {
    return 'your selected fishing area (demo data)';
  }

  async getSea(ctx: AreaContext): Promise<SeaReading> {
    const s = pickScenario(ctx);
    return { waveHeightM: s.waveM, seaText: s.seaText };
  }

  async getWeather(ctx: AreaContext): Promise<WeatherReading> {
    const s = pickScenario(ctx);
    return { windKph: s.windKph, gustKph: s.gustKph, skyText: s.skyText, windText: s.windText };
  }

  async getHazards(ctx: AreaContext): Promise<HazardReading> {
    const s = pickScenario(ctx);
    return { activeWarnings: s.warnings };
  }

  async getAdvice(ctx: AreaContext): Promise<ScenarioAdvice> {
    const id = pickScenario(ctx).adviceId;
    const locale = ctx.locale;
    return {
      bestTime: tr(locale, `adv.${id}.bestTime`),
      warning: tr(locale, `adv.${id}.warning`),
      recommendation: tr(locale, `adv.${id}.recommendation`),
    };
  }
}
