import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ORCAResponse } from '../../shared/orca-contract';
import { ApiError, sendChat, toOrcaAnswer } from './client';

const wire = (over: Partial<ORCAResponse> = {}): ORCAResponse => ({
  status: 'safe',
  headline: 'SAFE TO GO',
  summary: 'Tomorrow morning looks suitable.',
  bestTime: '6:00 AM – 12:00 PM',
  conditions: { sea: 'Calm', wind: 'Moderate', weather: 'Clear' },
  warning: 'Winds may strengthen later.',
  recommendation: 'Return before noon.',
  explanation: 'Checked sea, wind, weather.',
  evidence: ['Sea: calm (0.8 m waves)', 'Wind: 18 kph'],
  meta: { dataSource: 'demo', live: false, generatedAt: new Date().toISOString() },
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('toOrcaAnswer (wire contract → UI model)', () => {
  it.each(['safe', 'caution', 'danger'] as const)('maps status %s to the UI badge state', (status) => {
    const a = toOrcaAnswer(wire({ status }));
    expect(a.state).toBe(status.toUpperCase());
    expect(a.headline).toBeTruthy();
    expect(a.summary).toBeTruthy();
    expect(a.conditions.sea).toBeTruthy();
    expect(a.important).toBeTruthy();
    expect(a.explanation).toBeTruthy();
  });

  it('uses server evidence as the "checked" list', () => {
    const a = toOrcaAnswer(wire({ evidence: ['Sea: calm', 'Wind: 18 kph'] }));
    expect(a.checked).toEqual(['Sea: calm', 'Wind: 18 kph']);
  });

  it('passes wire meta through for the live/demo badge', () => {
    const a = toOrcaAnswer(wire({ meta: { dataSource: 'open-meteo', live: true, generatedAt: 'x', locationMode: 'demo' } }));
    expect(a.meta?.live).toBe(true);
    expect(a.meta?.dataSource).toBe('open-meteo');
  });

  it('passes the conversational message through, absent when missing', () => {
    expect(toOrcaAnswer(wire({ message: 'Hello, friend!' })).message).toBe('Hello, friend!');
    expect(toOrcaAnswer(wire({})).message).toBeUndefined();
  });

  it('falls back safely on partial payloads instead of crashing render', () => {
    const a = toOrcaAnswer({ status: 'danger' } as ORCAResponse);
    expect(a.state).toBe('DANGER');
    expect(a.headline).toBe('DO NOT GO — DANGER');
    expect(a.checked.length).toBeGreaterThan(0);
  });
});

describe('sendChat', () => {
  it('POSTs {message, location} and adapts the response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(wire()), { status: 200 }));
    const answer = await sendChat('Can I go fishing tomorrow?', 'Your Fishing Area', {
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/chat');
    expect(JSON.parse(init.body as string)).toEqual({
      message: 'Can I go fishing tomorrow?',
      location: 'Your Fishing Area',
    });
    expect(answer.state).toBe('SAFE');
  });

  it('includes browser coordinates in the body when provided', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(wire()), { status: 200 }));
    await sendChat('How is the sea?', 'Your Fishing Area', {
      fetchFn: fetchMock as unknown as typeof fetch,
      coordinates: { latitude: 19.05, longitude: 71.9 },
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      message: 'How is the sea?',
      location: 'Your Fishing Area',
      coordinates: { latitude: 19.05, longitude: 71.9 },
    });
  });

  it('omits coordinates from the body when absent (demo/manual mode)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(wire()), { status: 200 }));
    await sendChat('hi', 'X', { fetchFn: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi', location: 'X' });
  });

  it('surfaces server error codes (frontend fallback trigger)', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'busy' } }), {
        status: 502,
      })) as unknown as typeof fetch;
    await expect(sendChat('hi', 'X', { fetchFn })).rejects.toMatchObject({
      name: 'ApiError',
      code: 'PROVIDER_UNAVAILABLE',
    } satisfies Partial<ApiError>);
  });

  it('maps network failure to NETWORK (frontend falls back to mock brain)', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(sendChat('hi', 'X', { fetchFn })).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('maps a hung server to TIMEOUT', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          rej(e);
        });
      })) as unknown as typeof fetch;
    await expect(sendChat('hi', 'X', { fetchFn, timeoutMs: 20 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});
