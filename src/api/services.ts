import { postChatRaw, type SendChatOptions } from './client';
import type { ApiErrorBody, ORCAResponse } from '../../shared/orca-contract';
import type { GpsCoordinates } from '../location/geolocation';
import type { Locale } from '../types';

/**
 * Typed frontend services. Every function below reads from the real ORCA
 * backend (POST /api/chat, GET /api/health). Nothing here invents values:
 * unavailable data surfaces as thrown ApiError or explicit nulls, and UI
 * renders honest empty/error states from those.
 */

export interface ChatQuery {
  message: string;
  area: string;
  coords?: GpsCoordinates | null;
  locale?: Locale;
}

function optsOf(q: ChatQuery, extra: SendChatOptions = {}): SendChatOptions {
  return {
    ...(q.coords ? { coordinates: q.coords } : {}),
    ...(q.locale ? { locale: q.locale } : {}),
    ...extra,
  };
}

export async function askBackend(q: ChatQuery, extra?: SendChatOptions): Promise<ORCAResponse> {
  return postChatRaw(q.message, q.area, { ...optsOf(q, extra) });
}

export interface HealthState {
  status: string;
  version?: string;
  dataSource?: string;
  live?: boolean;
  advisorySource?: string;
  advisoryLive?: boolean;
  ecosystemSource?: string;
  ecosystemLive?: boolean;
  ecosystemDataset?: string;
  pfzSource?: string;
  mosdac?: string;
}

export async function fetchHealth(baseUrl = '', fetchFn: typeof fetch = fetch): Promise<HealthState> {
  const res = await fetchFn(`${baseUrl.replace(/\/+$/, '')}/api/health`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(body?.error?.message ?? `health failed: ${res.status}`);
  }
  return (await res.json()) as HealthState;
}

/** Standard page queries — fixed fisherman questions, backend answers. */
export const QUERIES = {
  seaToday: 'How is the sea today?',
  dangerNearby: 'Is there any danger nearby?',
  zonesToday: 'Where should I fish today?',
  routeToZone: 'Show me the safest route to that zone.',
} as const;
