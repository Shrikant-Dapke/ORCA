import type { OrcaStatus } from '../../shared/orca-contract.js';
import type { HazardReading, SeaReading, WeatherReading } from '../providers/types.js';
import { THRESHOLDS } from './thresholds.js';

export interface ReasoningInput {
  sea: SeaReading;
  weather: WeatherReading;
  hazard: HazardReading;
}

export interface ReasoningOutcome {
  status: OrcaStatus;
  /** Short machine-friendly reasons, e.g. "wind 42kph ≥ caution 35". Feeds evidence. */
  reasons: string[];
}

/**
 * ReasoningEngine abstraction — deterministic rules today, a plugged-in
 * model later. The orchestrator only depends on this interface.
 */
export interface ReasoningEngine {
  decide(input: ReasoningInput): ReasoningOutcome;
}

/**
 * Per-domain assessment shared by agents AND the engine, so thresholds live
 * in exactly one place (thresholds.ts). Severity order: danger > caution >
 * safe. 'unknown' means the domain could not be assessed (never a verdict).
 */
export type DomainAssessment = 'safe' | 'caution' | 'danger' | 'unknown';

export function assessSeaReading(sea: SeaReading): DomainAssessment {
  if (sea.waveHeightM >= THRESHOLDS.waveDangerM) return 'danger';
  if (sea.waveHeightM >= THRESHOLDS.waveCautionM) return 'caution';
  return 'safe';
}

export function assessWeatherReading(weather: WeatherReading): DomainAssessment {
  if (
    weather.windKph >= THRESHOLDS.windDangerKph ||
    weather.gustKph >= THRESHOLDS.gustDangerKph
  ) {
    return 'danger';
  }
  if (weather.windKph >= THRESHOLDS.windCautionKph) return 'caution';
  return 'safe';
}

export function assessHazardReading(hazard: HazardReading): DomainAssessment {
  if (hazard.activeWarnings.some((w) => w.level === 'severe')) return 'danger';
  if (hazard.activeWarnings.some((w) => w.level === 'moderate')) return 'caution';
  return 'safe';
}

/**
 * Deterministic MVP rules:
 *  DANGER  = severe warning OR severe wind/gust/waves
 *  CAUTION = moderate warning OR moderate wind/waves
 *  SAFE    = everything calm + no warnings
 */
export class DeterministicReasoningEngine implements ReasoningEngine {
  decide({ sea, weather, hazard }: ReasoningInput): ReasoningOutcome {
    const reasons: string[] = [];
    const severe = hazard.activeWarnings.some((w) => w.level === 'severe');
    const moderate = hazard.activeWarnings.some((w) => w.level === 'moderate');

    if (severe) reasons.push('severe marine warning active');
    if (weather.windKph >= THRESHOLDS.windDangerKph)
      reasons.push(`wind ${weather.windKph}kph ≥ danger ${THRESHOLDS.windDangerKph}`);
    if (weather.gustKph >= THRESHOLDS.gustDangerKph)
      reasons.push(`gusts ${weather.gustKph}kph ≥ danger ${THRESHOLDS.gustDangerKph}`);
    if (sea.waveHeightM >= THRESHOLDS.waveDangerM)
      reasons.push(`waves ${sea.waveHeightM}m ≥ danger ${THRESHOLDS.waveDangerM}`);
    if (reasons.length > 0) return { status: 'danger', reasons };

    if (moderate) reasons.push('marine advisory active');
    if (weather.windKph >= THRESHOLDS.windCautionKph)
      reasons.push(`wind ${weather.windKph}kph ≥ caution ${THRESHOLDS.windCautionKph}`);
    if (sea.waveHeightM >= THRESHOLDS.waveCautionM)
      reasons.push(`waves ${sea.waveHeightM}m ≥ caution ${THRESHOLDS.waveCautionM}`);
    if (reasons.length > 0) return { status: 'caution', reasons };

    reasons.push(`waves ${sea.waveHeightM}m + wind ${weather.windKph}kph within safe limits, no warnings`);
    return { status: 'safe', reasons };
  }
}

/**
 * FUTURE LLM EXTENSION POINT (not implemented — no external call, no key, no SDK).
 *
 * To add LLM-assisted reasoning later, implement a class in a new file
 * (e.g. server/reasoning/llmEngine.ts) that:
 *   1. implements ReasoningEngine (same decide() signature — orchestrator,
 *      agents, and providers stay untouched);
 *   2. takes the FUSED evidence (server/reasoning/fusion.ts) as its prompt
 *      context — never raw provider internals — and asks the model ONLY for
 *      a better fisherman explanation and/or a second-opinion assessment;
 *   3. passes its suggestion through applyGuardrail() (fusion.ts) so a model
 *      can NEVER downgrade DANGER when severe evidence exists;
 *   4. falls back to DeterministicReasoningEngine on any failure, timeout,
 *      or malformed model output.
 * Suggested shape: class LlmReasoningEngine implements ReasoningEngine,
 * constructed with { apiKey (server env only), model, baseUrl, timeoutMs },
 * default OFF behind ORCA_REASONING=llm. Deterministic stays the default.
 */
export const LLM_EXTENSION_POINT = 'server/reasoning/llmEngine.ts (not yet implemented)';
