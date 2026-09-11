/**
 * Provider-neutral LLM abstraction. The ORCA core only depends on these
 * types — swapping Gemini for another OpenAI-compatible provider means
 * adding one adapter file, nothing else.
 */

export type LLMRole = 'user' | 'model' | 'system' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  text: string;
  /** Present on tool-result messages. */
  toolName?: string;
}

export interface LLMToolDef {
  name: string;
  description: string;
  /** JSON Schema object for parameters. */
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface LLMReply {
  /** Raw model text (may be JSON when requested). */
  text: string;
  toolCalls: LLMToolCall[];
}

export interface LLMChatOptions {
  system: string;
  messages: LLMMessage[];
  tools?: LLMToolDef[];
  /**
   * Tool-use policy for this call. 'auto' (default) lets the model call the
   * declared tools; 'none' forbids function calls at the API level — used
   * for final synthesis, which must answer from evidence, never re-invoke.
   */
  toolMode?: 'auto' | 'none';
  /** Ask for a JSON object back (defensive parsing still applies). */
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  readonly name: string;
  chat(opts: LLMChatOptions): Promise<LLMReply>;
}

/** Failure inside the LLM layer. NEVER surfaces as chat failure — the
 *  deterministic pipeline answer is always the fallback. */
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}
