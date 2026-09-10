/**
 * Provider interfaces — every external marine data source sits behind these.
 * The orchestrator never touches a real API directly, so a live provider
 * can replace the demo one without touching reasoning or routes.
 */
import type { Coordinates, DataSource, ResponseLocale } from '../../shared/orca-contract.js';

/** Single place that decides what counts as "live" — never scatter this check. */
export function isLiveSource(dataSource: DataSource): boolean {
  return dataSource !== 'demo';
}

export type Topic = 'sea' | 'wind' | 'danger' | 'spot' | 'zone' | 'route' | 'general';
export type Timeframe = 'tomorrow' | 'today' | 'general';

export interface AreaContext {
  /** Free-text label from the UI. Providers must NOT treat this as coordinates. */
  label: string;
  topic: Topic;
  timeframe: Timeframe;
  /**
   * Browser GPS fix for this request (Phase 2C). Present only in gps mode;
   * used in-memory for the current request and never persisted or logged.
   */
  coordinates?: Coordinates;
  /** Response language for provider-composed advice (default 'en'). */
  locale?: ResponseLocale;
}

export interface SeaReading {
  waveHeightM: number;
  seaText: string;
}

export interface WeatherReading {
  windKph: number;
  gustKph: number;
  skyText: string;
  windText: string;
}

export type WarningLevel = 'moderate' | 'severe';

export interface MarineWarning {
  level: WarningLevel;
  title: string;
}

export interface HazardReading {
  activeWarnings: MarineWarning[];
}

export interface ScenarioAdvice {
  bestTime: string;
  warning: string;
  recommendation: string;
}

export interface MarineDataProvider {
  /** Human name, e.g. "DemoMarineProvider". */
  name: string;
  /** Named source; liveness is derived via isLiveSource(). */
  dataSource: DataSource;
  getSea(ctx: AreaContext): Promise<SeaReading>;
  getWeather(ctx: AreaContext): Promise<WeatherReading>;
  getHazards(ctx: AreaContext): Promise<HazardReading>;
  /** Trip guidance for the readings behind ctx. */
  getAdvice(ctx: AreaContext): Promise<ScenarioAdvice>;
  /** Optional human account of which waters are being read (used in evidence). */
  describeLocation?(ctx: AreaContext): string;
}

/** Thrown when the underlying data source fails. Maps to HTTP 502. */
export class ProviderError extends Error {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}
