import { GeminiProvider, GEMINI_DEFAULT_MODEL } from './gemini.js';
import type { LLMProvider } from './types.js';

export interface ResolvedLLM {
  provider: LLMProvider;
  /** Model id reported in health (no secrets). */
  model: string;
  /** True only when explicitly enabled AND a key is present. */
  configured: boolean;
}

const SUPPORTED_PROVIDERS = ['gemini'] as const;

/**
 * LLM selection — safe by default. The deterministic pipeline runs with or
 * without a model; the LLM is a pure synthesis layer on top.
 *
 *   ORCA_LLM=on                  → enable (requires a key, see below)
 *   ORCA_MODEL_PROVIDER=gemini   → only supported provider today
  *   ORCA_MODEL_NAME              → default gemini-3.6-flash
 *   GEMINI_API_KEY               → primary key source (server env only)
 *   ORCA_MODEL_API_KEY           → fallback key source (server env only)
 *   ORCA_MODEL_TIMEOUT_MS        → default 15000
 *
 * Anything missing/unknown → disabled with a loud warning. The app never
 * claims LLM assistance it does not have.
 */
export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): ResolvedLLM | null {
  if ((env.ORCA_LLM ?? 'off').trim().toLowerCase() !== 'on') return null;
  const providerName = (env.ORCA_MODEL_PROVIDER ?? 'gemini').trim().toLowerCase();
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(providerName)) {
    // eslint-disable-next-line no-console
    console.warn(`[orca] unknown ORCA_MODEL_PROVIDER="${providerName}" — LLM disabled`);
    return null;
  }
  const apiKey = [env.GEMINI_API_KEY, env.ORCA_MODEL_API_KEY]
    .map((v) => (v ?? '').trim())
    .find((v) => v.length > 0);
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[orca] ORCA_LLM=on but no model key found (GEMINI_API_KEY) — LLM disabled');
    return null;
  }
  const model = (env.ORCA_MODEL_NAME ?? '').trim() || GEMINI_DEFAULT_MODEL;
  const timeoutRaw = Number(env.ORCA_MODEL_TIMEOUT_MS ?? '');
  return {
    provider: new GeminiProvider({
      apiKey,
      model,
      timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : undefined,
    }),
    model,
    configured: true,
  };
}
