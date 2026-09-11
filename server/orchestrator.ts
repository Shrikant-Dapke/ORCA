import type { ChatRequest, FishingZone, ORCAResponse, OrcaStatus, ResponseLocale, RouteInfo } from '../shared/orca-contract.js';
import type { AgentContext, AgentResult, OrcaAgent } from './agents/types.js';
import type { LocationAdvice, RoutePlan } from './agents/types.js';
import { EcosystemAgent, GeoAgent, HazardAgent, LocationAgent, RouteAgent, SeaAgent, WeatherAgent } from './agents/index.js';
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
import { pfzFromEnv } from './pfz/select.js';
import { llmFromEnv } from './llm/select.js';
import type { MarineEcosystemProvider } from './ecosystem/types.js';
import type { ResolvedLLM } from './llm/select.js';
import type { PfzProvider } from './pfz/providers.js';
import { resolvePosition } from './location/areas.js';
import type { MarineSafetyProvider } from './safety/types.js';
import type { ReasoningEngine } from './reasoning/engine.js';
import { DeterministicReasoningEngine } from './reasoning/engine.js';
import type { FusedEvidence } from './reasoning/fusion.js';
import { applyGuardrail, evidenceToStrings, fuseEvidence } from './reasoning/fusion.js';
import { buildExplanation } from './reasoning/explain.js';
import { planBatches, planRequest } from './planner/plan.js';
import { detectLocale } from './i18n/detect.js';
import { tr } from './i18n/responses.js';

export interface OrchestratorDeps {
  provider: MarineDataProvider;
  reasoning: ReasoningEngine;
  safety: MarineSafetyProvider;
  ecosystem: MarineEcosystemProvider;
  pfz: PfzProvider;
  /** Optional LLM synthesis layer. Absent = deterministic only (default). */
  llm?: ResolvedLLM | null;
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
    pfz: pfzFromEnv(env, provider.dataSource),
    llm: llmFromEnv(env),
    agents: [new SeaAgent(), new WeatherAgent(), new HazardAgent(), new LocationAgent(), new EcosystemAgent(), new GeoAgent(), new RouteAgent()],
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
  else if (/(route|navigate|navigation|reach|safest way|get there|go there)/.test(q)) topic = 'route';
  else if (/(pfz|fishing zones?|where should i fish|best fishing|show.*fish|\bzone\b)/.test(q)) topic = 'zone';
  else if (/(wind|gust|stormy|wave)/.test(q)) topic = 'wind';
  else if (/(today|now|right now|sea|rain|cloud|weather)/.test(q)) topic = 'sea';

  let timeframe: Timeframe = 'general';
  if (/(tomorrow|next day|weekend|morning)/.test(q)) timeframe = 'tomorrow';
  else if (/(today|now|this afternoon|tonight)/.test(q)) timeframe = 'today';
  // Devanagari timeframes mirror the Latin ones (Marathi + Hindi).
  if (timeframe === 'general') {
    if (/(उद्या|सकाळी|कल|सुबह)/.test(q)) timeframe = 'tomorrow';
    else if (/(आज|आत्ता|आता|अभी|अब)/.test(q)) timeframe = 'today';
  }

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

function pickHeadline(status: OrcaStatus, topic: Topic, timeframe: Timeframe, locale: ResponseLocale): string {
  // SAFE mirrors the demo script: a concrete morning plan earns "SAFE TO GO",
  // a general check-in gets the softer "LOOKS GOOD FOR NOW".
  if (status === 'safe')
    return tr(locale, timeframe === 'tomorrow' ? 'hl.safe.tomorrow' : 'hl.safe.general');
  const key =
    topic === 'sea' ? 'hl.caution.sea' : topic === 'wind' ? 'hl.caution.wind' : topic === 'spot' ? 'hl.caution.spot' : null;
  if (status === 'danger') return tr(locale, 'hl.danger');
  return key ? tr(locale, key) : tr(locale, 'hl.caution.default');
}

function pickSummary(status: OrcaStatus, topic: Topic, timeframe: Timeframe, locale: ResponseLocale): string {
  if (status === 'safe') {
    return tr(locale, timeframe === 'tomorrow' ? 'sum.safe.tomorrow' : 'sum.safe.general');
  }
  if (status === 'danger') return tr(locale, 'sum.danger');
  if (topic === 'spot') return tr(locale, 'sum.caution.spot');
  if (topic === 'wind') return tr(locale, 'sum.caution.wind');
  if (topic === 'sea') return tr(locale, 'sum.caution.sea');
  return tr(locale, 'sum.caution.default');
}

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
 * exclusion. The ecosystem agent joins planning-type questions; the spatial
 * agents (geo, route) join only when the question is about where to go or
 * how to get there, so safety questions never pay for extra network calls.
 */
export function selectAgents(_topic: Topic, agents: OrcaAgent[]): OrcaAgent[] {
  const safetyBench = ['sea', 'weather', 'hazard', 'location'];
  const planning = _topic === 'general' || _topic === 'spot' || _topic === 'zone';
  const spatial = _topic === 'spot' || _topic === 'zone' || _topic === 'route';
  return agents.filter(
    (a) =>
      safetyBench.includes(a.name) ||
      (a.name === 'ecosystem' && planning) ||
      ((a.name === 'geo' || a.name === 'route') && spatial),
  );
}

export async function orchestrateWithTrace(
  req: ChatRequest,
  deps: OrchestratorDeps,
): Promise<{ response: ORCAResponse; trace: OrchestratedTrace }> {
  const { topic, timeframe } = detectIntent(req.message);
  const locale = detectLocale(req.message, req.locale ?? 'en');
  const position = resolvePosition(req.location, req.coordinates);
  const ctx: AgentContext = {
    label: req.location,
    topic,
    timeframe,
    provider: deps.provider,
    safety: deps.safety,
    ecosystem: deps.ecosystem,
    pfz: deps.pfz,
    locale,
    ...(req.coordinates ? { coordinates: req.coordinates } : {}),
  };

  const steps: string[] = [
    `Intent: topic=${topic}, timeframe=${timeframe}; position mode=${position.mode}; locale=${locale}`,
  ];

  // Explicit planner: task graph first, then staged execution. Independent
  // tasks run in parallel batches; route-class work follows zone data.
  const plan = planRequest(topic, position.mode, locale);
  steps.push(`Plan: ${plan.tasks.map((t) => `${t.taskId}(${t.agent})`).join(' → ')}`);

  const agents = selectAgents(topic, deps.agents ?? defaultDeps().agents!);
  const agentByName = new Map(agents.filter((a) => a.canHandle(ctx)).map((a) => [a.name, a]));
  const taskById = new Map(plan.tasks.map((t) => [t.taskId, t]));
  const results: AgentResult[] = [];
  let zones: FishingZone[] = [];
  let zonesNote: string | null = null;

  for (const batch of planBatches(plan)) {
    await Promise.all(
      batch.map(async (taskId) => {
        const task = taskById.get(taskId);
        if (!task) return;
        if (task.agent === 'pfz') {
          // Auxiliary data: degrade honestly, never fail the safety answer.
          try {
            zones = await deps.pfz.getZones(ctx);
          } catch (err) {
            zones = [];
            zonesNote = err instanceof Error ? err.message : String(err);
          }
          return;
        }
        const agent = agentByName.get(task.agent);
        if (agent) results.push(await agent.run(ctx));
      }),
    );
  }
  if (zonesNote) steps.push(`Zones unavailable: ${zonesNote}`);

  // Provider-level trip advice runs alongside (cached upstream for live).
  const advice: ScenarioAdvice = await deps.provider.getAdvice(ctx);

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
  let routePlan: RoutePlan | null = null;
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
    else if ('waypoints' in r.data) routePlan = r.data;
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

  const headline = pickHeadline(finalStatus, topic, timeframe, locale);
  const explanation = buildExplanation({
    status: finalStatus,
    fused,
    locationGuidance: locationAdvice.guidance,
    includeOpportunity: topic === 'general' || topic === 'spot',
    locale,
  });

  const response: ORCAResponse = {
    status: finalStatus,
    headline,
    summary: pickSummary(finalStatus, topic, timeframe, locale),
    bestTime: advice.bestTime,
    conditions: { sea: sea.seaText, wind: weather.windText, weather: weather.skyText },
    warning: advice.warning,
    recommendation:
      finalStatus === 'safe' && locationAdvice.guidance
        ? `${advice.recommendation} ${locationAdvice.guidance}`
        : advice.recommendation,
    explanation,
    evidence: evidenceToStrings(fused.evidence),
    locale,
    ...(zones.length > 0 ? { zones } : {}),
    ...(routePlan
      ? {
          route: {
            distanceKm: routePlan.distanceKm,
            bearingDeg: routePlan.bearingDeg,
            bearingCompass: routePlan.bearingCompass,
            waypoints: routePlan.waypoints,
            riskScore: routePlan.riskScore,
            riskLevel: routePlan.riskLevel,
            note: 'ORCA calculated safe-risk route — not official navigation.',
            source: 'ORCA route engine',
          } satisfies RouteInfo,
        }
      : {}),
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
