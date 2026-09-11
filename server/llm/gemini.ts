import { GoogleGenAI, FunctionCallingConfigMode, ThinkingLevel, type FunctionDeclaration } from '@google/genai';
import { LLMError, type LLMChatOptions, type LLMProvider, type LLMReply, type LLMToolCall, type LLMToolDef } from './types.js';

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';
export const GEMINI_DEFAULT_TIMEOUT_MS = 15000;

/** Map our JSON-Schema-ish tool params to Gemini's uppercase Schema shape. */
function toGeminiSchema(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {};
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === 'type' && typeof value === 'string') {
      out[key] = value.toUpperCase();
    } else if (key === 'properties' && value && typeof value === 'object') {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(value as Record<string, unknown>)) {
        props[pk] = toGeminiSchema(pv);
      }
      out[key] = props;
    } else if (key === 'items') {
      out[key] = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function toGeminiFunction(tool: LLMToolDef): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    // Single contained cast at the provider boundary: our JSON-Schema-ish
    // defs are normalized to Gemini's Schema shape by toGeminiSchema above.
    parameters: toGeminiSchema(tool.parameters) as unknown as FunctionDeclaration['parameters'],
  };
}

/**
 * Google Gemini adapter via the official @google/genai SDK (server-side
 * only — the key never leaves this process). Supports chat, system
 * instructions, native function calling, and JSON mode. Streaming exists
 * upstream but stays unwired: the UI typing indicator covers latency and
 * JSON stays parseable.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;
  private readonly modelIdValue: string;
  private readonly timeoutMs: number;

  constructor(opts: GeminiOptions) {
    if (!opts.apiKey) throw new LLMError('Gemini API key is required (GEMINI_API_KEY).');
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
    this.modelIdValue = opts.model || GEMINI_DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? GEMINI_DEFAULT_TIMEOUT_MS;
  }

  get modelId(): string {
    return this.modelIdValue;
  }

  async chat(opts: LLMChatOptions): Promise<LLMReply> {
    const contents = opts.messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.role === 'tool' ? `Tool "${m.toolName ?? 'unknown'}" returned:\n${m.text}` : m.text }],
    }));
    const request = this.client.models.generateContent({
      model: this.modelIdValue,
      contents,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxTokens ?? 600,
        // Gemini 3 Flash thinks by default (dynamic, up to HIGH). Our calls
        // need short grounded answers, not deep reasoning: MINIMAL keeps
        // visible text flowing and cuts latency/cost. Internal thought parts
        // are never surfaced — see parsing below.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
        // Synthesis calls forbid tools at the API level: the final answer
        // must synthesize evidence, never re-invoke. Tool-loop calls keep
        // native declarations (see loop.ts).
        ...(opts.toolMode === 'none'
          ? { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } } }
          : opts.tools && opts.tools.length > 0
            ? { tools: [{ functionDeclarations: opts.tools.map(toGeminiFunction) }] }
            : {}),
      },
    });
    let res;
    try {
      res =
        this.timeoutMs > 0
          ? await Promise.race([
              request,
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new LLMError(`Gemini request timed out after ${this.timeoutMs}ms`)), this.timeoutMs),
              ),
            ])
          : await request;
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw new LLMError(`Gemini request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    let text = '';
    try {
      text = res.text ?? '';
    } catch {
      text = '';
    }
    const toolCalls: LLMToolCall[] = [];
    for (const call of res.functionCalls ?? []) {
      if (call.name) {
        toolCalls.push({ name: call.name, args: (call.args ?? {}) as Record<string, unknown> });
      }
    }
    if (text.trim().length === 0 && toolCalls.length === 0) {
      // No usable output: surface WHY (blocked prompt? thought-only reply?
      // truncation?) so diagnostics and the ping endpoint report a reason
      // instead of silent emptiness. The chat loop treats this as failure
      // and falls back to the deterministic answer.
      const candidate = res.candidates?.[0];
      const finish = candidate?.finishReason ?? 'unknown';
      const block =
        (res as { promptFeedback?: { blockReason?: string } }).promptFeedback?.blockReason ??
        'none';
      const thoughtOnly =
        (candidate?.content?.parts ?? []).length > 0 &&
        (candidate?.content?.parts ?? []).every((p) => (p as { thought?: boolean }).thought === true);
      throw new LLMError(
        `Gemini returned no usable text (finishReason=${finish}, blockReason=${block}` +
          `${thoughtOnly ? ', thought-parts only' : ''})`,
      );
    }
    return { text, toolCalls };
  }
}
