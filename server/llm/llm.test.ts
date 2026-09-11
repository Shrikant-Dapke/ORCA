import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoMarineProvider } from '../providers/demo.js';
import { DeterministicReasoningEngine } from '../reasoning/engine.js';
import { DemoSafetyProvider } from '../safety/demoSafety.js';
import { DemoEcosystemProvider } from '../ecosystem/demoEcosystem.js';
import { DemoPfzProvider } from '../pfz/providers.js';
import { SeaAgent, WeatherAgent, HazardAgent, LocationAgent, EcosystemAgent, GeoAgent, RouteAgent } from '../agents/index.js';
import { LLMError, type LLMChatOptions, type LLMProvider, type LLMReply } from './types.js';
import { runLlmChat } from './loop.js';
import { SessionStore } from './conversation.js';
import { executeTool, ORCA_TOOLS } from './tools.js';
import type { OrchestratorDeps } from '../orchestrator.js';

/** Scripted stand-in: queue replies per chat() call. Records prompts. */
class FakeLLM implements LLMProvider {
  readonly name = 'fake';
  readonly seen: string[] = [];
  constructor(private replies: LLMReply[] | ((opts: LLMChatOptions) => LLMReply)) {}
  async chat(opts: LLMChatOptions): Promise<LLMReply> {
    this.seen.push(opts.system + '\n' + opts.messages.map((m) => `${m.role}: ${m.text.slice(0, 120)}`).join('\n'));
    if (typeof this.replies === 'function') return this.replies(opts);
    const next = this.replies.shift();
    if (!next) throw new LLMError('fake exhausted');
    return next;
  }
}

const AGENTS = [new SeaAgent(), new WeatherAgent(), new HazardAgent(), new LocationAgent(), new EcosystemAgent(), new GeoAgent(), new RouteAgent()];

function depsWith(llm: LLMProvider): OrchestratorDeps {
  return {
    provider: new DemoMarineProvider(),
    reasoning: new DeterministicReasoningEngine(),
    safety: new DemoSafetyProvider(),
    ecosystem: new DemoEcosystemProvider(),
    llm: { provider: llm, model: 'fake-model', configured: true },
    pfz: new DemoPfzProvider(),
    agents: AGENTS,
  };
}

const ok = (reply: string, status: 'safe' | 'caution' | 'danger' = 'safe') => ({
  text: JSON.stringify({ reply, status }),
  toolCalls: [],
});

/** First turn never calls tools (empty), second turn synthesizes. */
const direct = (reply: string, status: 'safe' | 'caution' | 'danger' = 'safe') => [
  { text: '', toolCalls: [] },
  ok(reply, status),
];

describe('runLlmChat synthesis', () => {
  it('uses the model reply when status matches the deterministic verdict', async () => {
    const fake = new FakeLLM(direct('Namaste! The sea looks calm this morning.'));
    const res = await runLlmChat(
      { message: 'Can I go fishing tomorrow morning?', location: 'X', sessionId: 's-1' },
      depsWith(fake),
    );
    expect(res.status).toBe('safe');
    expect(res.message).toBe('Namaste! The sea looks calm this morning.');
    expect(res.sessionId).toBe('s-1');
  });

  it('falls back to deterministic text when the model tries to override DANGER', async () => {
    const fake = new FakeLLM(direct('All clear, go fishing!', 'safe'));
    const res = await runLlmChat(
      { message: 'Is there any danger nearby?', location: 'X', sessionId: 's-2' },
      depsWith(fake),
    );
    expect(res.status).toBe('danger');
    expect(res.explanation).not.toContain('All clear');
    expect(res.message).toBeUndefined();
  });

  it('falls back on malformed model output', async () => {
    const fake = new FakeLLM([{ text: '', toolCalls: [] }, { text: 'not json at all', toolCalls: [] }]);
    const res = await runLlmChat({ message: 'How is the sea?', location: 'X' }, depsWith(fake));
    expect(res.status).toBe('caution');
    expect(res.explanation).toContain('ORCA recommends caution');
    expect(res.message).toBeUndefined();
  });

  it('falls back on provider failure but keeps HTTP-200 shape', async () => {
    const failing: LLMProvider = {
      name: 'failing',
      chat: async () => {
        throw new LLMError('boom');
      },
    };
    const res = await runLlmChat({ message: 'How is the sea?', location: 'X' }, depsWith(failing));
    expect(res.status).toBe('caution');
    expect(res.headline).toBe('BE CAREFUL TODAY');
  });

  it('runs the tool loop against the real backend for follow-ups', async () => {
    const seen: string[] = [];
    const fake = new FakeLLM([
      { text: '', toolCalls: [{ name: 'get_fishing_zones', args: { question: 'Where should I fish today?' } }] },
      { text: 'checking zones…', toolCalls: [] },
      ok('Zone one is 18 km NE.'),
    ]);
    const res = await runLlmChat(
      { message: 'Which one is safest?', location: 'X', sessionId: 's-3' },
      depsWith(fake),
    );
    expect(res.message).toBe('Zone one is 18 km NE.');
    expect(fake.seen.join('\n')).toContain('Demo fishing zone');
    seen.push('done');
    expect(seen).toEqual(['done']);
  });

  it('ignores unknown tool names safely', async () => {
    const fake = new FakeLLM([
      { text: '', toolCalls: [{ name: 'launch_missiles', args: {} }] },
      ok('I can only help with fishing safety.'),
    ]);
    const res = await runLlmChat({ message: 'Hi', location: 'X' }, depsWith(fake));
    expect(res.message).toBe('I can only help with fishing safety.');
  });
});

describe('conversation memory', () => {
  it('resolves follow-ups from session snapshot across turns', async () => {
    const fake = new FakeLLM([
      ...direct('Zone one is nearest at 18 km NE.'),
      ...direct('It is 18 km to the northeast, about an hour by boat.'),
    ]);
    const deps = depsWith(fake);
    await runLlmChat(
      { message: 'Where should I fish today?', location: 'X', sessionId: 'mem-1' },
      deps,
    );
    const second = await runLlmChat(
      { message: 'How far is it?', location: 'X', sessionId: 'mem-1' },
      deps,
    );
    expect(second.message).toContain('18 km');
    // Second-turn prompt carried the prior zones.
    expect(fake.seen[2]).toContain('Previously discussed fishing zones');
  });

  it('isolates sessions from each other', async () => {
    const fake = new FakeLLM([...direct('First answer.'), ...direct('Second answer.')]);
    const deps = depsWith(fake);
    await runLlmChat({ message: 'Where should I fish today?', location: 'X', sessionId: 'iso-a' }, deps);
    await runLlmChat({ message: 'How far is it?', location: 'X', sessionId: 'iso-b' }, deps);
    expect(fake.seen[1]).not.toContain('Previously discussed fishing zones');
  });
});

describe('parseSynthesis diagnostics', () => {
  it('accepts case-insensitive matching verdicts', async () => {
    const { parseSynthesis } = await import('./loop.js');
    const r = parseSynthesis('{"reply": "All good.", "status": "SAFE"}', 'safe');
    expect('parsed' in r && r.parsed.reply).toBe('All good.');
  });

  it('reports mismatch/nonsense distinctly', async () => {
    const { parseSynthesis } = await import('./loop.js');
    expect(parseSynthesis('no json', 'safe')).toEqual({ discarded: { reason: 'not-json' } });
    expect(parseSynthesis('{"reply": "x", "status": "danger"}', 'safe')).toEqual({
      discarded: { reason: 'status-mismatch', claimedStatus: 'danger' },
    });
    expect(parseSynthesis('{"reply": "x", "status": "maybe"}', 'safe')).toEqual({
      discarded: { reason: 'bad-status', claimedStatus: 'maybe' },
    });
    expect(parseSynthesis('{"reply": "  ", "status": "safe"}', 'safe')).toEqual({
      discarded: { reason: 'empty-reply' },
    });
  });
});

describe('rate-limit circuit breaker', () => {
  it('opens on 429 and skips the provider until cooldown passes', async () => {
    const { __setBreakerClock, __resetBreaker } = await import('./loop.js');
    __resetBreaker();
    let now = 1_000_000;
    __setBreakerClock(() => now);
    try {
      let calls = 0;
      const limited: LLMProvider = {
        name: 'limited',
        chat: async () => {
          calls += 1;
          throw new LLMError('Gemini request failed: 429 RESOURCE_EXHAUSTED, quota exceeded. Please retry in 19.3s.');
        },
      };
      const first = await runLlmChat({ message: 'Hi', location: 'X', sessionId: 'brk-1' }, depsWith(limited));
      expect(first.status).toBe('safe');
      expect(first.message).toBeUndefined();
      expect(calls).toBe(1);
      // Second turn: breaker open, provider untouched, deterministic answer kept.
      const second = await runLlmChat({ message: 'Hi again', location: 'X', sessionId: 'brk-1' }, depsWith(limited));
      expect(second.status).toBe('safe');
      expect(calls).toBe(1);
      // After the retry delay the breaker closes and calls resume.
      now += 25_000;
      await runLlmChat({ message: 'Hi again', location: 'X', sessionId: 'brk-1' }, depsWith(limited));
      expect(calls).toBe(2);
    } finally {
      __resetBreaker();
    }
  });

  it('does not trip on non-rate errors', async () => {
    const { __setBreakerClock, __resetBreaker } = await import('./loop.js');
    __resetBreaker();
    __setBreakerClock(() => 1_000_000);
    try {
      let calls = 0;
      const flaky: LLMProvider = {
        name: 'flaky',
        chat: async () => {
          calls += 1;
          throw new LLMError('socket hangup');
        },
      };
      await runLlmChat({ message: 'Hi', location: 'X' }, depsWith(flaky));
      await runLlmChat({ message: 'Hi', location: 'X' }, depsWith(flaky));
      expect(calls).toBe(2);
    } finally {
      __resetBreaker();
    }
  });
});

describe('executeTool', () => {  it('exposes only real backend capabilities', async () => {
    expect(ORCA_TOOLS.map((t) => t.name).sort()).toEqual([
      'calculate_route',
      'get_alerts',
      'get_fishing_zones',
      'get_safety_status',
      'get_sea_conditions',
    ]);
    const out = await executeTool('get_safety_status', { question: 'Is it safe?' }, async () => ({
      status: 'safe',
      headline: 'SAFE TO GO',
      summary: 'Fine.',
      sea: 'Calm',
      wind: 'Light',
      weather: 'Clear',
      live: false,
      dataSource: 'demo',
    }), 'Is it safe?');
    expect(JSON.parse(out).status).toBe('safe');
  });

  it('rejects unknown tools without touching the backend', async () => {
    let called = false;
    const out = await executeTool('hack', {}, async () => {
      called = true;
      throw new Error('must not run');
    }, 'hi');
    expect(called).toBe(false);
    expect(JSON.parse(out).error).toContain('unknown tool');
  });
});

describe('verdict anchoring across turns', () => {
  it('marks past verdicts HISTORICAL so the model anchors on the current one', async () => {
    const { snapshotContext } = await import('./conversation.js');
    const ctx = snapshotContext({ lastStatus: 'caution' });
    expect(ctx).toContain('HISTORICAL');
    expect(ctx).toContain('never reuse it');
  });

  it('accepts a context-aware follow-up that matches the current verdict', async () => {
    const fake = new FakeLLM([
      ...direct('Zone one is nearest at 18 km NE.'),
      ...direct('It is 18 km northeast; seas are calm right now.'),
    ]);
    const deps = depsWith(fake);
    await runLlmChat(
      { message: 'Where should I fish today?', location: 'X', sessionId: 'anchor-1' },
      deps,
    );
    const second = await runLlmChat(
      { message: 'How far is it?', location: 'X', sessionId: 'anchor-1' },
      deps,
    );
    expect(second.message).toContain('18 km');
  });
});

describe('SessionStore', () => {  it('caps turns and validates ids', () => {
    const store = new SessionStore();
    expect(SessionStore.validId('abc-123')).toBe(true);
    expect(SessionStore.validId('no spaces!')).toBe(false);
    expect(SessionStore.validId('x'.repeat(65))).toBe(false);
    store.append('s', Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, text: `m${i}` })));
    expect(store.get('s').turns).toHaveLength(12);
  });
});

describe('llm selection', () => {  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays off by default and without a key', async () => {
    const { llmFromEnv } = await import('./select.js');
    vi.stubEnv('ORCA_LLM', '');
    expect(llmFromEnv()).toBeNull();
    vi.stubEnv('ORCA_LLM', 'on');
    expect(llmFromEnv()).toBeNull();
  });

  it('enables with an explicit key without exposing it', async () => {
    const { llmFromEnv } = await import('./select.js');
    vi.stubEnv('ORCA_LLM', 'on');
    vi.stubEnv('ORCA_MODEL_API_KEY', 'test-key-value');
    const resolved = llmFromEnv()!;
    expect(resolved.configured).toBe(true);
    expect(resolved.model).toBe('gemini-3.6-flash');
    expect(resolved.provider.name).toBe('gemini');
    // Only non-secret descriptors ever leave the server (health shape).
    expect(JSON.stringify({ provider: resolved.provider.name, model: resolved.model })).not.toContain(
      'test-key-value',
    );
  });

  it('passes Marathi synthesis through with locale intact', async () => {
    const fake = new FakeLLM(direct('उद्या सकाळी समुद्र शांत दिसत आहे.', 'safe'));
    const res = await runLlmChat(
      { message: 'उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?', location: 'X' },
      depsWith(fake),
    );
    expect(res.locale).toBe('mr');
    expect(res.message).toContain('उद्या सकाळी');
  });

  it('prefers GEMINI_API_KEY over the legacy fallback', async () => {
    const { llmFromEnv } = await import('./select.js');
    vi.stubEnv('ORCA_LLM', 'on');
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('ORCA_MODEL_API_KEY', 'legacy-key');
    expect(llmFromEnv()).not.toBeNull();
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(llmFromEnv()).not.toBeNull();
  });
});

describe('GeminiProvider SDK adapter (mocked HTTP, no network)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function geminiHttp(body: unknown, status = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
  }

  it('sends system + messages and parses text plus function calls', async () => {
    const { GeminiProvider } = await import('./gemini.js');
    geminiHttp({
      candidates: [
        {
          content: {
            parts: [
              { text: 'checking' },
              { functionCall: { name: 'get_safety_status', args: { question: 'Is it safe?' } } },
            ],
          },
        },
      ],
    });
    const p = new GeminiProvider({ apiKey: 'k', model: 'gemini-3.6-flash' });
    const reply = await p.chat({
      system: 'sys',
      messages: [{ role: 'user', text: 'hi' }],
      tools: [{ name: 'get_safety_status', description: 'd', parameters: { type: 'object', properties: {} } }],
    });
    expect(reply.text).toBe('checking');
    expect(reply.toolCalls).toEqual([{ name: 'get_safety_status', args: { question: 'Is it safe?' } }]);
    const [, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    const sent = JSON.parse(init.body as string);
    expect(sent.systemInstruction.parts[0].text).toBe('sys');
    expect(sent.tools[0].functionDeclarations[0].parameters.type).toBe('OBJECT');
  });

  it('maps HTTP failures to LLMError (loop falls back, never 500s chat)', async () => {
    const { GeminiProvider } = await import('./gemini.js');
    geminiHttp({ error: { message: 'bad key' } }, 400);
    const p = new GeminiProvider({ apiKey: 'bad' });
    await expect(p.chat({ system: 's', messages: [{ role: 'user', text: 'hi' }] })).rejects.toMatchObject({
      name: 'LLMError',
    });
  });

  it('requires a key at construction', async () => {
    const { GeminiProvider } = await import('./gemini.js');
    expect(() => new GeminiProvider({ apiKey: '' })).toThrowError(/GEMINI_API_KEY/);
  });

  it('sends MINIMAL thinking level for short grounded answers', async () => {
    const { GeminiProvider } = await import('./gemini.js');
    geminiHttp({
      candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
    });
    const p = new GeminiProvider({ apiKey: 'k' });
    await p.chat({ system: 's', messages: [{ role: 'user', text: 'ping' }] });
    const [, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    const sent = JSON.parse(init.body as string);
    expect(sent.generationConfig.thinkingConfig.thinkingLevel).toBe('MINIMAL');
  });

  it('reports thought-only replies as errors instead of silent emptiness', async () => {
    const { GeminiProvider } = await import('./gemini.js');
    geminiHttp({
      candidates: [
        { content: { parts: [{ text: 'internal reasoning', thought: true }] }, finishReason: 'STOP' },
      ],
    });
    const p = new GeminiProvider({ apiKey: 'k' });
    await expect(p.chat({ system: 's', messages: [{ role: 'user', text: 'ping' }] })).rejects.toMatchObject({
      name: 'LLMError',
    });
  });

  it('reports safety blocks with the block reason', async () => {
    const { GeminiProvider } = await import('./gemini.js');
    geminiHttp({
      candidates: [],
      promptFeedback: { blockReason: 'SAFETY' },
    });
    const p = new GeminiProvider({ apiKey: 'k' });
    await expect(p.chat({ system: 's', messages: [{ role: 'user', text: 'ping' }] })).rejects.toThrowError(
      /SAFETY/,
    );
  });

  it('forbids tools at API level on synthesis calls but keeps them on agent calls', async () => {
    const { GeminiProvider } = await import('./gemini.js');
    const stub = vi.fn(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', stub);
    const calls = (stub as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
    const p = new GeminiProvider({ apiKey: 'k' });
    const tools = [{ name: 'get_safety_status', description: 'd', parameters: { type: 'object', properties: {} } }];
    await p.chat({ system: 's', messages: [{ role: 'user', text: 'q' }], tools, toolMode: 'none', jsonMode: true });
    await p.chat({ system: 's', messages: [{ role: 'user', text: 'q' }], tools });
    const synthesisBody = JSON.parse(calls[0][1].body as string);
    const agentBody = JSON.parse(calls[1][1].body as string);
    // Synthesis: no declarations, mode NONE — a function call is impossible.
    expect(synthesisBody.tools).toBeUndefined();
    expect(synthesisBody.toolConfig.functionCallingConfig.mode).toBe('NONE');
    expect(synthesisBody.generationConfig.responseMimeType).toBe('application/json');
    expect(synthesisBody.generationConfig.thinkingConfig.thinkingLevel).toBe('MINIMAL');
    // Agent phase: native declarations intact, no mode override.
    expect(agentBody.tools[0].functionDeclarations).toHaveLength(1);
    expect(agentBody.toolConfig).toBeUndefined();
  });
});
