import { describe, expect, it } from 'vitest';
import { DeterministicReasoningEngine } from './reasoning/engine.js';
import type { ReasoningInput } from './reasoning/engine.js';

function input(over: Partial<ReasoningInput> = {}): ReasoningInput {
  return {
    sea: { waveHeightM: 0.8, seaText: 'Calm' },
    weather: { windKph: 18, gustKph: 26, skyText: 'Clear', windText: 'Moderate' },
    hazard: { activeWarnings: [] },
    ...over,
  };
}

describe('DeterministicReasoningEngine', () => {
  const engine = new DeterministicReasoningEngine();

  it('returns SAFE for calm sea + acceptable wind + no hazard', () => {
    const out = engine.decide(input());
    expect(out.status).toBe('safe');
    expect(out.reasons.length).toBeGreaterThan(0);
  });

  it('returns CAUTION for moderate/high wind', () => {
    const out = engine.decide(
      input({ weather: { windKph: 42, gustKph: 55, skyText: 'Cloudy', windText: 'Strong' } }),
    );
    expect(out.status).toBe('caution');
  });

  it('returns CAUTION for worsening waves without warnings', () => {
    const out = engine.decide(input({ sea: { waveHeightM: 2.3, seaText: 'Slightly rough' } }));
    expect(out.status).toBe('caution');
  });

  it('returns CAUTION for a moderate advisory alone', () => {
    const out = engine.decide(
      input({ hazard: { activeWarnings: [{ level: 'moderate', title: 'Advisory' }] } }),
    );
    expect(out.status).toBe('caution');
  });

  it('returns DANGER for severe conditions', () => {
    const out = engine.decide(
      input({
        sea: { waveHeightM: 4.2, seaText: 'Very rough' },
        weather: { windKph: 72, gustKph: 90, skyText: 'Stormy', windText: 'Very strong' },
      }),
    );
    expect(out.status).toBe('danger');
  });

  it('returns DANGER for an active severe hazard even when readings look mild', () => {
    const out = engine.decide(
      input({ hazard: { activeWarnings: [{ level: 'severe', title: 'Storm warning' }] } }),
    );
    expect(out.status).toBe('danger');
  });

  it('returns DANGER for dangerous gusts alone', () => {
    const out = engine.decide(
      input({ weather: { windKph: 30, gustKph: 80, skyText: 'Cloudy', windText: 'Gusty' } }),
    );
    expect(out.status).toBe('danger');
  });
});
