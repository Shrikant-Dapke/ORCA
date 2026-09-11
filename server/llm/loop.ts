import type { ChatRequest, ORCAResponse, OrcaStatus, ResponseLocale } from '../../shared/orca-contract.js';
import { detectLocale } from '../i18n/detect.js';
import { orchestrate, type OrchestratorDeps } from '../orchestrator.js';
import { LLMError, type LLMMessage } from './types.js';
import { SessionStore, snapshotContext } from './conversation.js';
import { ORCA_TOOLS, executeTool, isKnownTool, type BackendFacts } from './tools.js';

const MAX_TOOL_ROUNDS = 3;
const MAX_REPLY_CHARS = 1200;

const store = new SessionStore();

/**
 * Rate-limit circuit breaker. Free-tier quotas (e.g. 20 req/day on some
 * models) exhaust fast because one turn costs several model calls. While
 * open, turns skip the provider entirely and return the deterministic
 * answer — no hammering, no added latency. Trips ONLY on rate-limit
 * signals; other errors retry next turn as before.
 */
let breakerUntilMs = 0;
let breakerClock: () => number = Date.now;

/** Test hook: control the breaker clock. */
export function __setBreakerClock(fn: () => number): void {
  breakerClock = fn;
}

/** Test hook: reset breaker state. */
export function __resetBreaker(): void {
  breakerUntilMs = 0;
  breakerClock = Date.now;
}

function breakerOpen(): boolean {
  return breakerClock() < breakerUntilMs;
}

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|RESOURCE_EXHAUSTED|quota|rate.?limit|retry/i.test(msg);
}

function tripBreaker(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /retry in ([\d.]+)s/i.exec(msg);
  const waitMs = m ? Math.ceil(parseFloat(m[1]) * 1000) : 5 * 60 * 1000;
  breakerUntilMs = breakerClock() + Math.min(Math.max(waitMs, 1000), 30 * 60 * 1000);
  // eslint-disable-next-line no-console
  console.warn(`[orca] llm rate limited; cooling down for ${Math.round((breakerUntilMs - breakerClock()) / 1000)}s`);
}

const CAPABILITIES = [
  'checking if it is safe to fish (SAFE / CAUTION / DANGER)',
  'checking sea, wind, and weather conditions',
  'finding nearby fishing zones with distance and direction',
  'calculating a safe-risk route to a zone',
  'checking marine warnings and advisories',
].join('; ');

function languageName(locale: ResponseLocale): string {
  return locale === 'hi' ? 'Hindi' : locale === 'mr' ? 'Marathi' : 'English';
}

function buildSystem(locale: ResponseLocale, snapshot: string): string {
  return [
    'You are ORCA, a friendly marine assistant for Indian fishermen. Reply in ' + languageName(locale) + '.',
    'Use simple, short, caring language a fisherman understands. No technical jargon, no agent names.',
    `You can do this: ${CAPABILITIES}.`,
    'RULES — never break them:',
    '1. NEVER invent marine facts: no weather, wind, waves, zones, coordinates, vessels, alerts, routes, or safety verdicts except what TOOLS or EVIDENCE below provide.',
    '2. If information is missing, say it is unavailable. Never guess.',
    '3. The deterministic safety verdict in EVIDENCE is FINAL. You may explain it but never change, soften, or upgrade it. DANGER stays DANGER. Never call anything safe unless the verdict says safe.',
    '4. Say whether data is live or demo when asked about sources; never claim live government data (INCOIS/MOSDAC/satellite) unless EVIDENCE says live.',
    '5. Keep replies under 120 words unless explaining evidence in detail.',
    snapshot ? `CONVERSATION SO FAR:\n${snapshot}` : 'No earlier conversation in this session.',
  ].join('\n');
}

function evidenceBrief(base: ORCAResponse): string {
  const lines = [
    `Deterministic safety verdict (FINAL, immutable): ${base.status.toUpperCase()}.`,
    `Headline: ${base.headline}`,
    `Summary: ${base.summary}`,
    `Sea: ${base.conditions.sea ?? 'unknown'} | Wind: ${base.conditions.wind ?? 'unknown'} | Weather: ${base.conditions.weather ?? 'unknown'}.`,
  ];
  if (base.bestTime) lines.push(`Best time: ${base.bestTime}.`);
  if (base.warning) lines.push(`Warning: ${base.warning}.`);
  if (base.recommendation) lines.push(`Recommendation: ${base.recommendation}.`);
  if (base.zones && base.zones.length > 0) {
    lines.push(
      'Fishing zones: ' +
        base.zones.map((z) => `"${z.name}" ${z.distanceKm} km ${z.bearingCompass} (potential: ${z.potential}, live: ${z.live})`).join('; ') +
        '.',
    );
  }
  if (base.route) {
    lines.push(
      `Route: ${base.route.distanceKm} km ${base.route.bearingCompass}, risk ${base.route.riskLevel} (${base.route.riskScore}/100). ${base.route.note}`,
    );
  }
  lines.push(`Data source: ${base.meta?.dataSource ?? 'unknown'}, live: ${base.meta?.live === true}.`);
  if (base.explanation) lines.push(`Deterministic explanation: ${base.explanation}`);
  return lines.join('\n');
}

function toFacts(res: ORCAResponse): BackendFacts {
  return {
    status: res.status,
    headline: res.headline,
    summary: res.summary,
    sea: res.conditions.sea ?? 'unknown',
    wind: res.conditions.wind ?? 'unknown',
    weather: res.conditions.weather ?? 'unknown',
    bestTime: res.bestTime,
    warning: res.warning,
    recommendation: res.recommendation,
    zones: res.zones,
    route: res.route,
    live: res.meta?.live === true,
    dataSource: res.meta?.dataSource ?? 'unknown',
  };
}

interface ParsedSynthesis {
  reply: string;
  status: OrcaStatus;
}

export interface DiscardReport {
  reason: 'not-json' | 'empty-reply' | 'bad-status' | 'status-mismatch';
  claimedStatus?: string;
}

/** Strict-parse the model's synthesis JSON. Returns reply or the discard reason. */
export function parseSynthesis(
  text: string,
  fallbackStatus: OrcaStatus,
): { parsed: ParsedSynthesis } | { discarded: DiscardReport } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { discarded: { reason: 'not-json' } };
  let obj: { reply?: unknown; status?: unknown };
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as { reply?: unknown; status?: unknown };
  } catch {
    return { discarded: { reason: 'not-json' } };
  }
  if (typeof obj.reply !== 'string' || obj.reply.trim().length === 0) {
    return { discarded: { reason: 'empty-reply' } };
  }
  const claimed = typeof obj.status === 'string' ? obj.status.toLowerCase() : '';
  if (claimed !== 'safe' && claimed !== 'caution' && claimed !== 'danger') {
    return { discarded: { reason: 'bad-status', claimedStatus: String(obj.status ?? '') } };
  }
  const verdict: OrcaStatus = claimed;
  // THE guardrail: the model may never move the deterministic verdict.
  if (verdict !== fallbackStatus) {
    return { discarded: { reason: 'status-mismatch', claimedStatus: verdict } };
  }
  return { parsed: { reply: obj.reply.trim().slice(0, MAX_REPLY_CHARS), status: verdict } };
}

/**
 * LLM-assisted chat. Deterministic pipeline first (always), then the model
 * synthesizes a conversational reply grounded ONLY in that evidence.
 * Any LLM failure → the deterministic answer, still HTTP 200. Provider
 * failures from the pipeline itself still propagate (→ 502) untouched.
 */
export async function runLlmChat(req: ChatRequest, deps: OrchestratorDeps): Promise<ORCAResponse> {
  const llm = deps.llm;
  if (!llm) return orchestrate(req, deps);
  const locale = detectLocale(req.message, req.locale ?? 'en');

  // 1. Deterministic base — verdict, evidence, zones, route. Authoritative.
  const base = await orchestrate({ ...req, locale } as ChatRequest, deps);

  const sessionId = typeof req.sessionId === 'string' && SessionStore.validId(req.sessionId) ? req.sessionId : null;
  const session = sessionId ? store.get(sessionId) : null;
  const history: LLMMessage[] = session ? [...session.turns] : [];

  // Breaker open (recent 429): skip the provider entirely this turn.
  if (breakerOpen()) {
    if (sessionId && session) {
      store.append(sessionId, [{ role: 'user', text: req.message.slice(0, 500) }], {
        lastStatus: base.status,
        lastZones: base.zones,
        lastRoute: base.route ?? null,
        lastArea: req.location,
      });
    }
    return { ...base, ...(sessionId ? { sessionId } : {}) };
  }

  const runBackend = async (question: string): Promise<BackendFacts> => {
    const res = await orchestrate(
      { message: question, location: req.location, ...(req.coordinates ? { coordinates: req.coordinates } : {}), locale } as ChatRequest,
      deps,
    );
    return toFacts(res);
  };

  try {
    const system = buildSystem(locale, session ? snapshotContext(session.snapshot) : '');
    const messages: LLMMessage[] = [
      ...history,
      { role: 'user', text: req.message },
      { role: 'user', text: `CURRENT BACKEND EVIDENCE (ground every claim in this):\n${evidenceBrief(base)}` },
    ];

    // 2. Tool loop: let the model pull fresh backend facts for follow-ups.
    // Native function calling lives ONLY here. Stage logging names which
    // calls fire, so any functionCall sighting is attributable.
    let reply = await llm.provider.chat({ system, messages, tools: ORCA_TOOLS, jsonMode: false });
    if (reply.toolCalls.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[orca] llm tools called: ${reply.toolCalls.map((c) => c.name).join(',')}`);
    }
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const calls = reply.toolCalls.filter((c) => isKnownTool(c.name));
      if (calls.length === 0) break;
      messages.push({ role: 'model', text: reply.text || '(calling tools)' });
      for (const call of calls.slice(0, 4)) {
        const out = await executeTool(call.name, call.args, runBackend, req.message);
        messages.push({ role: 'tool', toolName: call.name, text: out });
      }
      reply = await llm.provider.chat({ system, messages, tools: ORCA_TOOLS, jsonMode: false });
      if (reply.toolCalls.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[orca] llm tools called (round ${round + 1}): ${reply.toolCalls.map((c) => c.name).join(',')}`,
        );
      }
    }

    // 3. Final synthesis as strict JSON so the verdict can be validated.
    // Anchored explicitly: history may mention a different past verdict, but
    // only the CURRENT deterministic verdict below may be stated.
    const synth = await llm.provider.chat({
      system:
        system +
        '\nReply with a single JSON object only: {"reply": "<conversational answer>", "status": "<safe|caution|danger>"}. ' +
        'The "status" MUST equal the CURRENT deterministic verdict in EVIDENCE, even if the conversation history mentions a different past verdict. ' +
        'For follow-up questions ("it", "that zone", "how far"), answer from the conversation snapshot and tool results above.',
      messages: [...messages, { role: 'user', text: 'Now give the final answer as JSON.' }],
      jsonMode: true,
      maxTokens: 500,
      // Synthesis must answer, never re-invoke: tools forbidden at API level.
      toolMode: 'none',
    });
    const parsed = parseSynthesis(synth.text, base.status);
    // The conversational reply lives in `message`; the structured card keeps
    // the deterministic `explanation` untouched. Fallback = no message field.
    let message: string | undefined;
    if ('parsed' in parsed) {
      message = parsed.parsed.reply;
    } else {
      // Observable fallback: operators can see WHY synthesis was discarded
      // (server log only — never exposed to fishermen, never the key).
      // eslint-disable-next-line no-console
      console.warn(
        `[orca] llm synthesis discarded (${parsed.discarded.reason}` +
          (parsed.discarded.claimedStatus ? `, claimed=${parsed.discarded.claimedStatus}` : '') +
          `, verdict=${base.status}); using deterministic answer`,
      );
    }

    if (synth.toolCalls.length > 0) {
      // Should be impossible with toolMode=none: if the API ever emits a
      // function call here, say so loudly (names only, no content).
      // eslint-disable-next-line no-console
      console.warn(
        `[orca] llm synthesis contained functionCall parts despite toolMode=none: ${synth.toolCalls.map((c) => c.name).join(',')}`,
      );
    }

    if (sessionId && session) {
      store.append(
        sessionId,
        [
          { role: 'user', text: req.message.slice(0, 500) },
          { role: 'model', text: (message ?? base.explanation ?? '').slice(0, 500) },
        ],
        {
          lastStatus: base.status,
          lastZones: base.zones,
          lastRoute: base.route ?? null,
          lastArea: req.location,
        },
      );
    }

    return {
      ...base,
      ...(message ? { message } : {}),
      ...(sessionId ? { sessionId } : {}),
    };
  } catch (err) {
    if (err instanceof LLMError) {
      if (isRateLimit(err)) tripBreaker(err);
      if (sessionId && session) {
        store.append(sessionId, [{ role: 'user', text: req.message.slice(0, 500) }], {
          lastStatus: base.status,
          lastZones: base.zones,
          lastRoute: base.route ?? null,
          lastArea: req.location,
        });
      }
      return { ...base, ...(sessionId ? { sessionId } : {}) };
    }
    throw err;
  }
}
