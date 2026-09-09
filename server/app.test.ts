import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { createApp } from './app.js';
import type { OrchestratorDeps } from './orchestrator.js';
import { DeterministicReasoningEngine } from './reasoning/engine.js';
import { HazardAgent, LocationAgent, SeaAgent, WeatherAgent } from './agents/index.js';
import { OpenMeteoMarineProvider } from './providers/openMeteoMarine.js';
import { DemoMarineProvider } from './providers/demo.js';
import { DemoSafetyProvider } from './safety/demoSafety.js';
import { NullSafetyProvider } from './safety/types.js';
import { DemoEcosystemProvider } from './ecosystem/demoEcosystem.js';
import { NullEcosystem } from './ecosystem/types.js';
import { ProviderError, type MarineDataProvider } from './providers/types.js';
import type { ApiErrorBody, ORCAResponse } from '../shared/orca-contract.js';

/** Start an app with explicit deps on an ephemeral port. Caller must close it. */
async function startApp(
  deps: OrchestratorDeps,
): Promise<{ base: string; close: () => Promise<void> }> {
  const app = createApp(deps);
  const server = await new Promise<ReturnType<Express['listen']>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function testDeps(provider: MarineDataProvider): OrchestratorDeps {
  return {
    provider,
    reasoning: new DeterministicReasoningEngine(),
    safety: new DemoSafetyProvider(),
    ecosystem: new DemoEcosystemProvider(),
    agents: [new SeaAgent(), new WeatherAgent(), new HazardAgent(), new LocationAgent()],
  }
}

let app: Express;
let server: ReturnType<Express['listen']>;
let base = '';

beforeAll(async () => {
  app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function postChat(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe('POST /api/chat', () => {
  it('answers a tomorrow question with the ORCAResponse contract (SAFE)', async () => {
    const { status, json } = await postChat({
      message: 'Can I go fishing tomorrow morning?',
      location: 'Your Fishing Area',
    });
    expect(status).toBe(200);
    const res = json as ORCAResponse;
    expect(res.status).toBe('safe');
    expect(res.headline).toBeTruthy();
    expect(res.summary).toBeTruthy();
    expect(res.meta?.live).toBe(false);
  });

  it('answers a danger question with DANGER', async () => {
    const { status, json } = await postChat({ message: 'Is there any danger nearby?' });
    expect(status).toBe(200);
    expect((json as ORCAResponse).status).toBe('danger');
  });

  it('rejects a missing message with 400 INVALID_REQUEST', async () => {
    const { status, json } = await postChat({ location: 'X' });
    expect(status).toBe(400);
    expect((json as ApiErrorBody).error.code).toBe('INVALID_REQUEST');
  });

  it('rejects an empty message with 400', async () => {
    const { status } = await postChat({ message: '   ' });
    expect(status).toBe(400);
  });

  it('rejects a non-string message with 400', async () => {
    const { status } = await postChat({ message: 42 });
    expect(status).toBe(400);
  });

  it('rejects an over-long message with 400', async () => {
    const { status } = await postChat({ message: 'x'.repeat(501) });
    expect(status).toBe(400);
  });

  it('rejects a non-object body with 400', async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/health', () => {
  it('reports ok + demo (never claims live)', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      status: string;
      live: boolean;
      dataSource: string;
      advisorySource: string;
      advisoryLive: boolean;
      ecosystemSource: string;
      ecosystemLive: boolean;
      ecosystemDataset: string;
    };
    expect(json.status).toBe('ok');
    expect(json.live).toBe(false);
    expect(json.dataSource).toBe('demo');
    expect(json.advisorySource).toBe('demo');
    expect(json.advisoryLive).toBe(false);
    expect(json.ecosystemSource).toBe('demo');
    expect(json.ecosystemLive).toBe(false);
    expect(json.ecosystemDataset).toBe('demo');
  });

  it('reports live marine + no advisories for the open-meteo default pairing', async () => {
    const { base: liveBase, close } = await startApp({
      ...testDeps(new OpenMeteoMarineProvider()),
      safety: new NullSafetyProvider(),
      ecosystem: new NullEcosystem(),
    });
    try {
      const json = (await (await fetch(`${liveBase}/api/health`)).json()) as {
        dataSource: string;
        live: boolean;
        advisorySource: string;
        advisoryLive: boolean;
        ecosystemSource: string;
        ecosystemLive: boolean;
        ecosystemDataset: string;
      };
      expect(json.dataSource).toBe('open-meteo');
      expect(json.live).toBe(true);
      expect(json.advisorySource).toBe('none');
      expect(json.advisoryLive).toBe(false);
      expect(json.ecosystemSource).toBe('none');
      expect(json.ecosystemLive).toBe(false);
      expect(json.ecosystemDataset).toBe('none');
    } finally {
      await close();
    }
  });
});

describe('POST /api/chat coordinates (optional GPS fix)', () => {
  it.each([
    ['latitude too high', { latitude: 91, longitude: 72 }],
    ['latitude too low', { latitude: -91, longitude: 72 }],
    ['longitude too high', { latitude: 19, longitude: 181 }],
    ['longitude too low', { latitude: 19, longitude: -181 }],
    ['missing longitude', { latitude: 19 }],
    ['missing latitude', { longitude: 72 }],
    ['string latitude', { latitude: '19.05', longitude: 72 }],
    ['null latitude', { latitude: null, longitude: 72 }],
    ['non-object', '19.05,71.9'],
  ])('rejects %s with 400 INVALID_REQUEST', async (_name, coordinates) => {
    const { status, json } = await postChat({ message: 'How is the sea?', coordinates });
    expect(status).toBe(400);
    expect((json as ApiErrorBody).error.code).toBe('INVALID_REQUEST');
  });

  it('accepts boundary coordinates', async () => {
    for (const coordinates of [
      { latitude: 90, longitude: 180 },
      { latitude: -90, longitude: -180 },
    ]) {
      const { status } = await postChat({ message: 'How is the sea?', coordinates });
      expect(status).toBe(200);
    }
  });

  it('reports locationMode gps when coordinates are supplied', async () => {
    const { status, json } = await postChat({
      message: 'How is the sea?',
      coordinates: { latitude: 19.05, longitude: 71.9 },
    });
    expect(status).toBe(200);
    expect((json as ORCAResponse).meta?.locationMode).toBe('gps');
  });

  it('reports locationMode manual for a matched zone without coordinates', async () => {
    const { json } = await postChat({ message: 'Hi', location: 'Bay of Bengal Demo Zone' });
    expect((json as ORCAResponse).meta?.locationMode).toBe('manual');
  });

  it('reports locationMode demo when coordinates are absent and unmatched', async () => {
    const { json } = await postChat({ message: 'Hi' });
    expect((json as ORCAResponse).meta?.locationMode).toBe('demo');
  });
});

describe('unknown API routes', () => {
  it('returns JSON 404, not HTML', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiErrorBody;
    expect(json.error.code).toBe('NOT_FOUND');
  });
});

describe('provider selection on the wire', () => {
  it('health accurately reports open-meteo + live when configured', async () => {
    const { base: liveBase, close } = await startApp(
      testDeps(new OpenMeteoMarineProvider()),
    );
    try {
      const res = await fetch(`${liveBase}/api/health`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { status: string; live: boolean; dataSource: string };
      expect(json.dataSource).toBe('open-meteo');
      expect(json.live).toBe(true);
    } finally {
      await close();
    }
  });

  it('maps a dead live provider to 502 PROVIDER_UNAVAILABLE (never fake-live)', async () => {
    const dead: MarineDataProvider = {
      name: 'DeadProvider',
      dataSource: 'open-meteo',
      getSea: async () => {
        throw new ProviderError('DeadProvider', 'upstream down');
      },
      getWeather: async () => {
        throw new ProviderError('DeadProvider', 'upstream down');
      },
      getHazards: async () => {
        throw new ProviderError('DeadProvider', 'upstream down');
      },
      getAdvice: async () => {
        throw new ProviderError('DeadProvider', 'upstream down');
      },
    };
    const { base: deadBase, close } = await startApp(testDeps(dead));
    try {
      const res = await fetch(`${deadBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'How is the sea today?' }),
      });
      expect(res.status).toBe(502);
      const json = (await res.json()) as ApiErrorBody;
      expect(json.error.code).toBe('PROVIDER_UNAVAILABLE');
    } finally {
      await close();
    }
  });

  it('maps a dead safety provider to 502 as well', async () => {
    const { base: deadBase, close } = await startApp({
      ...testDeps(new DemoMarineProvider()),
      safety: {
        name: 'DeadSafety',
        advisorySource: 'incois' as const,
        getAdvisories: async () => {
          throw new ProviderError('DeadSafety', 'upstream down');
        },
      },
    });
    try {
      const res = await fetch(`${deadBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'How is the sea today?' }),
      });
      expect(res.status).toBe(502);
      expect(((await res.json()) as ApiErrorBody).error.code).toBe('PROVIDER_UNAVAILABLE');
    } finally {
      await close();
    }
  });

  it('keeps answering (200) when only the ecosystem provider is dead', async () => {
    const { base: ecoBase, close } = await startApp({
      ...testDeps(new DemoMarineProvider()),
      ecosystem: {
        name: 'DeadEco',
        ecosystemSource: 'incois' as const,
        dataset: 'test',
        getConditions: async () => {
          throw new ProviderError('DeadEco', 'stale observation');
        },
      },
    });
    try {
      const res = await fetch(`${ecoBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Can I go fishing tomorrow?' }),
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as ORCAResponse).status).toBe('safe');
    } finally {
      await close();
    }
  });
});
