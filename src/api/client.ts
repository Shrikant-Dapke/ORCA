import type { ApiErrorBody, Coordinates, ORCAResponse, OrcaStatus, ResponseLocale } from '../../shared/orca-contract';
import type { OrcaAnswer, SafetyState } from '../types';

/**
 * Frontend API client — the replacement for `src/mock/brain.ts`.
 * Speaks the shared ORCAResponse contract and adapts it to the existing
 * `OrcaAnswer` UI model, so SafetyCard and the rest of the UI are untouched.
 *
 * DOM-free on purpose so it stays unit-testable in Node.
 */

export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'BAD_RESPONSE'
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus?: number;
  constructor(code: ApiErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Same-origin by default (Vite proxies /api → the ORCA server in dev).
 *  Set VITE_ORCA_API_URL to point at a remote server instead. */
export function apiBaseUrl(): string {
  const configured = (import.meta.env.VITE_ORCA_API_URL as string | undefined)?.trim();
  if (!configured) return '';
  return configured.replace(/\/+$/, '');
}

const FALLBACK_HEADLINE: Record<OrcaStatus, string> = {
  safe: 'SAFE TO GO',
  caution: 'BE CAREFUL',
  danger: 'DO NOT GO — DANGER',
};

const STANDARD_CHECKS = [
  'Sea conditions',
  'Wind',
  'Weather',
  'Satellite observations',
  'Marine advisories',
];

function toState(status: OrcaStatus): SafetyState {
  return status.toUpperCase() as SafetyState;
}

function isStatus(s: unknown): s is OrcaStatus {
  return s === 'safe' || s === 'caution' || s === 'danger';
}

/** Adapt the wire contract to the UI model. Never throws on partial payloads. */
export function toOrcaAnswer(res: ORCAResponse): OrcaAnswer {
  const status = isStatus(res?.status) ? res.status : 'caution';
  return {
    state: toState(status),
    headline: res?.headline?.trim() || FALLBACK_HEADLINE[status],
    summary: res?.summary?.trim() || 'ORCA could not form a clear answer. Please ask again.',
    bestTime: res?.bestTime?.trim() || 'Check again before leaving',
    conditions: {
      sea: res?.conditions?.sea?.trim() || 'Unknown',
      wind: res?.conditions?.wind?.trim() || 'Unknown',
      weather: res?.conditions?.weather?.trim() || 'Unknown',
    },
    important: res?.warning?.trim() || 'Weather at sea can change fast. Check again before you leave.',
    recommendation: res?.recommendation?.trim() || 'Ask ORCA again before you decide.',
    checked:
      Array.isArray(res?.evidence) && res.evidence.length > 0 ? res.evidence : STANDARD_CHECKS,
    explanation:
      res?.explanation?.trim() ||
      'ORCA checked sea, wind, weather and marine advisories before answering.',
    meta: res?.meta,
    zones: Array.isArray(res?.zones) ? res.zones : undefined,
    route: res?.route && typeof res.route === 'object' ? res.route : undefined,
  };
}

export interface SendChatOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Browser GPS fix — sent only to our own API for the current request. */
  coordinates?: Coordinates;
  /** UI language for the response (server may auto-detect from script). */
  locale?: ResponseLocale;
}

export async function sendChat(
  message: string,
  location: string,
  opts: SendChatOptions = {},
): Promise<OrcaAnswer> {
  const base = opts.baseUrl ?? apiBaseUrl();
  const timeoutMs = opts.timeoutMs ?? 8000;
  const fetchFn = opts.fetchFn ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchFn(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          location,
          ...(opts.coordinates ? { coordinates: opts.coordinates } : {}),
          ...(opts.locale ? { locale: opts.locale } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError('TIMEOUT', 'ORCA took too long to answer. Please try again.');
      }
      throw new ApiError('NETWORK', 'Could not reach the ORCA server.');
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const errBody = body as ApiErrorBody | null;
      const code = (errBody?.error?.code ?? 'UNKNOWN') as ApiErrorCode;
      const msg =
        errBody?.error?.message || `ORCA server answered with status ${res.status}.`;
      throw new ApiError(code, msg, res.status);
    }

    if (!body || typeof body !== 'object' || !isStatus((body as ORCAResponse).status)) {
      throw new ApiError('BAD_RESPONSE', 'ORCA gave an unclear answer. Please try again.', res.status);
    }
    return toOrcaAnswer(body as ORCAResponse);
  } finally {
    clearTimeout(timer);
  }
}
