import type { ChatRequest, ORCAResponse, OrcaStatus } from '../shared/orca-contract.js';
import type { AgentContext, OrcaAgent } from './agents/types.js';
import type { LocationAdvice } from './agents/types.js';
import { HazardAgent, LocationAgent, SeaAgent, WeatherAgent } from './agents/index.js';
import { EcosystemAgent } from './agents/index.js';
import type {
  HazardReading,
  MarineDataProvider,
  ScenarioAdvice,
  SeaReading,
  Timeframe,
  Topic,
  WeatherReading,
} from './providers/types.js';
import { isLiveSource } from './providers/types.js';
import { providerFromEnv, safetyFromEnv } from './providers/select.js';
import { ecosystemFromEnv } from './ecosystem/select.js';
import type { MarineEcosystemProvider } from './ecosystem/types.js';
import { resolvePosition } from './location/areas.js';
import type { MarineSafetyProvider } from './safety/types.js';
import type { ReasoningEngine } from './reasoning/engine.js';
import { DeterministicReasoningEngine } from './reasoning/engine.js';
import type { FusedEvidence } from './reasoning/fusion.js';
import { applyGuardrail, evidenceToStrings, fuseEvidence } from './reasoning/fusion.js';
import { buildExplanation } from './reasoning/explain.js';

export interface OrchestratorDeps {
  provider: MarineDataProvider;
  reasoning: ReasoningEngine;
  safety: MarineSafetyProvider;
  ecosystem: MarineEcosystemProvider;
  /** Override to register future agents (e.g. satellite). Defaults to the MVP set. */
  agents?: OrcaAgent[];
}

/** Default wiring: providers from env (demo unless configured) + deterministic rules. */
export function defaultDeps(env: NodeJS.ProcessEnv = process.env): OrchestratorDeps {
  const provider = providerFromEnv(env);
  return {
    provider,
    reasoning: new DeterministicReasoningEngine(),
    safety: safetyFromEnv(env, provider.dataSource),
    ecosystem: ecosystemFromEnv(env, provider.dataSource),
    agents: [new SeaAgent(), new WeatherAgent(), new HazardAgent(), new LocationAgent(), new EcosystemAgent()],
  };
}

export interface DetectedIntent {
  topic: Topic;
  timeframe: Timeframe;
}

/** Keyword intent router — deterministic so the demo reliably hits every state. */
export function detectIntent(message: string): DetectedIntent {
  const q = message.toLowerCase();

  let topic: Topic = 'general';
  if (/(danger|storm|cyclone|warning|alert|nearby|near me)/.test(q)) topic = 'danger';
  else if (/(safer|where.*fish|which side|location|place|spot|area)/.test(q)) topic = 'spot';
  else if (/(wind|gust|stormy|wave)/.test(q)) topic = 'wind';
  else if (/(today|now|right now|sea|rain|cloud|weather)/.test(q)) topic = 'sea';

  let timeframe: Timeframe = 'general';
  if (/(tomorrow|next day|weekend|morning)/.test(q)) timeframe = 'tomorrow';
  else if (/(today|now|this afternoon|tonight)/.test(q)) timeframe = 'today';

  return { topic, timeframe };
}

function isSeaReading(d: unknown): d is SeaReading {
  return !!d && typeof (d as SeaReading).waveHeightM === 'number';
}
function isWeatherReading(d: unknown): d is WeatherReading {
  return !!d && typeof (d as WeatherReading).windKph === 'number';
}
function isHazardReading(d: unknown): d is HazardReading {
  return !!d && Array.isArray((d as HazardReading).activeWarnings);
}

const HEADLINES: Record<Exclude<OrcaStatus, 'safe'>, Record<string, string>> = {
  caution: {
    default: 'BE CAREFUL',
    sea: 'BE CAREFUL TODAY',
    wind: 'STRONG WINDS EXPECTED',
    spot: 'STAY CLOSE, STAY SHALLOW',
  },
  danger: { default: 'DO NOT GO — DANGER' },
};

function pickHeadline(status: OrcaStatus, topic: Topic, timeframe: Timeframe): string {
  // SAFE mirrors the demo script: a concrete morning plan earns "SAFE TO GO",
  // a general check-in gets the softer "LOOKS GOOD FOR NOW".
  if (status === 'safe') return timeframe === 'tomorrow' ? 'SAFE TO GO' : 'LOOKS GOOD FOR NOW';
  return HEADLINES[status][topic] ?? HEADLINES[status].default;
}

const SUMMARIES: Record<OrcaStatus, (topic: Topic, timeframe: Timeframe) => string> = {
  safe: (_topic, timeframe) =>
    timeframe === 'tomorrow'
      ? 'Tomorrow morning looks suitable for fishing in your selected area.'
      : 'Conditions in your fishing area look suitable at the moment.',
  caution: (topic) => {
    if (topic === 'spot') return 'Open waters look rough. The calmer option is near-shore, sheltered water.';
    if (topic === 'wind') return 'Yes — strong winds are expected later today in your fishing area.';
    if (topic === 'sea') return 'Today the sea is passable, but the afternoon looks rough in your area.';
    return 'Conditions need care — part of the day looks rough in your area.';
  },
  danger: () => 'There is danger near your fishing area. Stay on land today.',
};

/**
 * Orchestrator: question → intent → agents (parallel) → fusion → guardrail →
 * ORCAResponse. Provider failures propagate as-is so the API layer can map
 * them to 502.
 *
 * Collaborative flow:
 *   Promise.all(agents) → AgentResults → EvidenceFusion → SafetyReasoning
 *   → guardrailed ORCAResponse (+ internal trace, never sent to fishermen).
 */
export interface OrchestratedTrace {
  /** Internal step-by-step account for debugging/evaluation. Never on the wire. */
  steps: string[];
  fused: FusedEvidence;
  guardrailRaised: boolean;
}

/**
 * Intent-aware participation. The safety bench (sea, weather, hazard,
 * location) always runs in full — for a safety chatbot there is no safe
 * exclusion. The ecosystem agent joins planning-type questions (tomorrow
 * plans, where-better) and skips immediate safety questions (sea/wind/
 * danger) to avoid extra network calls when seconds matter.
 */
export function selectAgents(_topic: Topic, agents: OrcaAgent[]): OrcaAgent[] {
  if (_topic === 'general' || _topic === 'spot') return agents;
  return agents.filter((a) => a.name !== 'ecosystem');
}

export async function orchestrateWithTrace(
  req: ChatRequest,
  deps: OrchestratorDeps,
): Promise<{ response: ORCAResponse; trace: OrchestratedTrace }> {
  const { topic, timeframe } = detectIntent(req.message);
  const position = resolvePosition(req.location, req.coordinates);
  const ctx: AgentContext = {
    label: req.location,
    topic,
    timeframe,
    provider: deps.provider,
    safety: deps.safety,
    ecosystem: deps.ecosystem,
    ...(req.coordinates ? { coordinates: req.coordinates } : {}),
  };

  const steps: string[] = [
    `Intent: topic=${topic}, timeframe=${timeframe}; position mode=${position.mode}`,
  ];

  const agents = selectAgents(topic, deps.agents ?? defaultDeps().agents!);
  // Agents are independent: one parallel fan-out, plus the provider-level
  // trip advice (independent call, cached upstream for live providers).
  const [results, advice] = await Promise.all([
    Promise.all(agents.filter((a) => a.canHandle(ctx)).map((a) => a.run(ctx))),
    deps.provider.getAdvice(ctx),
  ]);

  for (const r of results) {
    steps.push(`${r.agent}: ${r.status}/${r.assessment} (confidence ${r.confidence}) — ${r.reasoning}`);
    for (const limitation of r.limitations ?? []) steps.push(`${r.agent} limitation: ${limitation}`);
  }

  const fused = fuseEvidence(results);
  for (const conflict of fused.conflicts) steps.push(`Conflict: ${conflict.reason}`);
  if (fused.missingDomains.length > 0) {
    steps.push(`Missing domains (excluded from verdict): ${fused.missingDomains.join(', ')}`);
  }

  // Deterministic engine input from agent payloads. A null payload means the
  // domain could not be read: substitute neutral readings, say so in the
  // trace, and let fusion's missing-domain + confidence handling carry the
  // uncertainty (never pretend the domain is safe, never auto-danger).
  let sea: SeaReading = { waveHeightM: 0, seaText: 'Unknown' };
  let weather: WeatherReading = { windKph: 0, gustKph: 0, skyText: 'Unknown', windText: 'Unknown' };
  let hazard: HazardReading = { activeWarnings: [] };
  let locationAdvice: LocationAdvice = { nearShoreOnly: false, guidance: '' };
  const fallbacks: string[] = [];
  for (const r of results) {
    if (r.data === null) {
      fallbacks.push(r.agent);
      continue;
    }
    if (isSeaReading(r.data)) sea = r.data;
    else if (isWeatherReading(r.data)) weather = r.data;
    else if (isHazardReading(r.data)) hazard = r.data;
    else if ('guidance' in r.data) locationAdvice = r.data as LocationAdvice;
  }
  if (fallbacks.length > 0) {
    steps.push(`Engine used neutral fallback readings for unread domains: ${fallbacks.join(', ')}`);
  }

  const outcome = deps.reasoning.decide({ sea, weather, hazard });
  steps.push(`Engine: ${outcome.status} (${outcome.reasons.join('; ')})`);

  const finalStatus = applyGuardrail(outcome.status, fused);
  const guardrailRaised = finalStatus !== outcome.status;
  if (guardrailRaised && fused.strongestSignal) {
    steps.push(
      `Guardrail: engine said ${outcome.status} but ${fused.strongestSignal.agent} signals ${fused.strongestSignal.assessment} — raised to ${finalStatus}`,
    );
  }
  steps.push(`Final decision: ${finalStatus} (overall domain confidence ${fused.overallConfidence})`);

  const headline = pickHeadline(finalStatus, topic, timeframe);
  const explanation = buildExplanation({
    status: finalStatus,
    fused,
    locationGuidance: locationAdvice.guidance,
    includeOpportunity: topic === 'general' || topic === 'spot',
  });

  const response: ORCAResponse = {
    status: finalStatus,
    headline,
    summary: SUMMARIES[finalStatus](topic, timeframe),
    bestTime: advice.bestTime,
    conditions: { sea: sea.seaText, wind: weather.windText, weather: weather.skyText },
    warning: advice.warning,
    recommendation:
      finalStatus === 'safe' && locationAdvice.guidance
        ? `${advice.recommendation} ${locationAdvice.guidance}`
        : advice.recommendation,
    explanation,
    evidence: evidenceToStrings(fused.evidence),
    meta: {
      dataSource: deps.provider.dataSource,
      live: isLiveSource(deps.provider.dataSource),
      generatedAt: new Date().toISOString(),
      // gps = browser fix used verbatim; manual = matched demo zone;
      // demo = default waters. Raw coordinates are never echoed (privacy).
      locationMode: position.mode,
    },
  };
  return { response, trace: { steps, fused, guardrailRaised } };
}

export async function orchestrate(req: ChatRequest, deps: OrchestratorDeps): Promise<ORCAResponse> {
  return (await orchestrateWithTrace(req, deps)).response;
}
