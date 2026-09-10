import { describe, expect, it } from 'vitest';
import { defaultDeps, detectIntent, orchestrate } from './orchestrator.js';
import { ProviderError, type MarineDataProvider } from './providers/types.js';

describe('detectIntent', () => {
  it('routes danger questions', () => {
    expect(detectIntent('Is there any danger nearby?').topic).toBe('danger');
  });
  it('routes safer-spot questions', () => {
    expect(detectIntent('Where is it safer to fish?').topic).toBe('spot');
  });
  it('routes wind questions', () => {
    expect(detectIntent('Will there be strong winds?').topic).toBe('wind');
  });
  it('detects tomorrow timeframe', () => {
    expect(detectIntent('Can I go fishing tomorrow morning?').timeframe).toBe('tomorrow');
  });
  it('routes zone questions (incl. singular zone follow-ups)', () => {
    expect(detectIntent('Where should I fish today?').topic).toBe('spot');
    expect(detectIntent('Show me the nearest PFZ.').topic).toBe('zone');
    expect(detectIntent('Why this zone?').topic).toBe('zone');
  });
  it('routes navigation questions', () => {
    expect(detectIntent('Show me the safest route to that zone.').topic).toBe('route');
  });
});

describe('orchestrate (demo provider + deterministic reasoning)', () => {
  it('returns SAFE for a tomorrow-morning question', async () => {
    const res = await orchestrate(
      { message: 'Can I go fishing tomorrow morning?', location: 'Your Fishing Area' },
      defaultDeps(),
    );
    expect(res.status).toBe('safe');
    expect(res.headline).toBe('SAFE TO GO');
    expect(res.summary).toContain('Tomorrow morning');
    expect(res.conditions.sea).toBe('Calm');
    expect(res.meta?.dataSource).toBe('demo');
    expect(res.meta?.live).toBe(false);
    expect(res.evidence!.length).toBeGreaterThan(0);
  });

  it('returns CAUTION for a today question', async () => {
    const res = await orchestrate(
      { message: 'How is the sea today?', location: 'Your Fishing Area' },
      defaultDeps(),
    );
    expect(res.status).toBe('caution');
    expect(res.bestTime).toBeTruthy();
    expect(res.warning).toBeTruthy();
    expect(res.recommendation).toBeTruthy();
  });

  it('returns DANGER for a nearby-danger question', async () => {
    const res = await orchestrate(
      { message: 'Is there any danger nearby?', location: 'Your Fishing Area' },
      defaultDeps(),
    );
    expect(res.status).toBe('danger');
    expect(res.headline).toBe('DO NOT GO — DANGER');
  });

  it('handles unknown questions with a complete, safe-shaped response', async () => {
    const res = await orchestrate(
      { message: 'blabla random words', location: 'Your Fishing Area' },
      defaultDeps(),
    );
    expect(['safe', 'caution', 'danger']).toContain(res.status);
    expect(res.summary).toBeTruthy();
    expect(res.headline).toBeTruthy();
    expect(res.conditions.sea).toBeTruthy();
    expect(res.explanation).toBeTruthy();
  });

  it('propagates provider failures instead of inventing data', async () => {
    const failing: MarineDataProvider = {
      name: 'FailingProvider',
      dataSource: 'demo',
      getSea: async () => {
        throw new ProviderError('FailingProvider', 'sea source down');
      },
      getWeather: async () => {
        throw new ProviderError('FailingProvider', 'weather source down');
      },
      getHazards: async () => {
        throw new ProviderError('FailingProvider', 'hazard source down');
      },
      getAdvice: async () => {
        throw new ProviderError('FailingProvider', 'advice source down');
      },
    };
    const deps = { ...defaultDeps(), provider: failing };
    await expect(
      orchestrate({ message: 'Can I go fishing tomorrow?', location: 'X' }, deps),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
