import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';
import { askBackend, fetchHealth, type ChatQuery, type HealthState } from './services';
import type { ORCAResponse } from '../../shared/orca-contract';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  reload: () => void;
}

function toMessage(err: unknown, strings: { offline: string }): { error: string; offline: boolean } {
  if (err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT')) {
    return { error: strings.offline, offline: true };
  }
  return { error: err instanceof Error ? err.message : 'Request failed.', offline: false };
}

/** One backend question per page mount (plus manual reload). */
export function useChatQuery(
  query: ChatQuery | null,
  strings: { offline: string },
): QueryState<ORCAResponse> {
  const [data, setData] = useState<ORCAResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOffline(false);
    askBackend(query)
      .then((res) => {
        if (cancelled || !alive.current) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled || !alive.current) return;
        const m = toMessage(err, strings);
        setError(m.error);
        setOffline(m.offline);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, query?.message, query?.area, query?.locale]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, offline, reload };
}

export function useHealth(pollMs = 0): QueryState<HealthState> {
  const [data, setData] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHealth()
      .then((h) => {
        if (cancelled) return;
        setData(h);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Health check failed.');
        setLoading(false);
      });
    if (pollMs <= 0) return;
    const t = setInterval(() => setNonce((n) => n + 1), pollMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, offline: false, reload };
}
