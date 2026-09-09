import type {
  AreaContext,
  HazardReading,
  MarineDataProvider,
  SeaReading,
  WeatherReading,
} from '../providers/types.js';
import type { DomainAssessment } from '../reasoning/engine.js';
import type { MarineSafetyProvider } from '../safety/types.js';
import type { MarineEcosystemProvider } from '../ecosystem/types.js';

/**
 * Agent architecture — one small interface every specialist implements.
 * Agents are intelligence workers, not chatbots: they inspect the shared
 * context, assess ONLY their own domain, and contribute structured evidence
 * with provenance. Fusion and final decisions live elsewhere.
 *
 * New agents (e.g. SatelliteAgent once a real source exists) implement
 * `OrcaAgent` and get registered in `server/orchestrator.ts`. No other
 * changes needed.
 */
export interface AgentContext extends AreaContext {
  provider: MarineDataProvider;
  safety: MarineSafetyProvider;
  ecosystem: MarineEcosystemProvider;
}

export type AgentStatus = 'available' | 'unavailable' | 'error';

export type EvidenceSeverity = 'info' | 'moderate' | 'severe';

export interface EvidenceItem {
  /** Short field name, e.g. 'Wave height'. Never a sentence. */
  label: string;
  /** Observed value in plain words/numbers, e.g. '1.3 m'. Never invented. */
  value: string;
  /** Where it came from, e.g. 'Open-Meteo', 'Demo data', 'INCOIS SVAS'. */
  source: string;
  severity?: EvidenceSeverity;
}

export interface AgentResult {
  /** Stable agent name for the evidence trail, e.g. "sea". */
  agent: string;
  /** available = assessed; unavailable = ran but could not assess. */
  status: AgentStatus;
  /** This domain's verdict. 'unknown' contributes nothing to the final status. */
  assessment: DomainAssessment;
  /**
   * How complete/reliable this domain's evidence is (0–1, coarse buckets —
   * never fake precision). NOT the probability the fisherman is safe.
   * Internal only; never shown to fishermen.
   */
  confidence: number;
  /** Structured findings with provenance. Rendered to wire strings by fusion. */
  evidence: EvidenceItem[];
  /** One plain sentence on what this agent concluded and why. */
  reasoning: string;
  /** Known gaps, e.g. 'no advisory feed configured'. Internal. */
  limitations?: string[];
  /**
   * Normalized domain payload for the deterministic engine. Null when the
   * domain could not be read — the orchestrator substitutes neutral readings
   * and records the gap instead of pretending the domain is safe.
   */
  data: SeaReading | WeatherReading | HazardReading | LocationAdvice | null;
}

export interface LocationAdvice {
  nearShoreOnly: boolean;
  guidance: string;
}

export interface OrcaAgent {
  readonly name: string;
  canHandle(ctx: AgentContext): boolean;
  run(ctx: AgentContext): Promise<AgentResult>;
}

// Extension point: SatelliteAgent — NOT implemented because no real,
// accessible satellite data source is configured. Do not fabricate
// satellite data; add the agent here when a source exists.
//   export class SatelliteAgent implements OrcaAgent { ... }
