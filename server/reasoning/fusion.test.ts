import { describe, expect, it } from 'vitest';
import type { AgentResult } from '../agents/types.js';
import type { DomainAssessment } from './engine.js';
import { applyGuardrail, evidenceToStrings, fuseEvidence } from './fusion.js';

function result(
  agent: string,
  assessment: DomainAssessment,
  over: Partial<AgentResult> = {},
): AgentResult {
  return {
    agent,
    status: 'available',
    assessment,
    confidence: 0.9,
    evidence: [{ label: `${agent} reading`, value: 'ok', source: 'Test' }],
    reasoning: `${agent} reasoning`,
    data: null,
    ...over,
  };
}

describe('fuseEvidence', () => {
  it('fuses all-safe domains with no conflicts', () => {
    const fused = fuseEvidence([result('sea', 'safe'), result('weather', 'safe')]);
    expect(fused.conflicts).toEqual([]);
    // tie-break by domain priority even when all agree
    expect(fused.strongestSignal).toEqual({ agent: 'weather', assessment: 'safe' });
    expect(fused.missingDomains).toEqual([]);
    expect(fused.overallConfidence).toBe(0.9);
    expect(applyGuardrail('safe', fused)).toBe('safe');
  });

  it('flags one caution among safe domains (spec Case A)', () => {
    const fused = fuseEvidence([result('sea', 'safe'), result('weather', 'caution')]);
    expect(fused.conflicts).toHaveLength(1);
    expect(fused.conflicts[0].resolution).toBe('caution');
    expect(fused.conflicts[0].reason).toContain('sea: safe');
    expect(fused.conflicts[0].reason).toContain('weather: caution');
    expect(fused.strongestSignal?.assessment).toBe('caution');
    expect(applyGuardrail('safe', fused)).toBe('caution');
  });

  it('forces DANGER when hazard disagrees with safe domains (spec Case B)', () => {
    const fused = fuseEvidence([
      result('sea', 'safe'),
      result('weather', 'safe'),
      result('hazard', 'danger'),
    ]);
    expect(fused.conflicts).toHaveLength(1);
    expect(fused.conflicts[0].resolution).toBe('danger');
    expect(applyGuardrail('safe', fused)).toBe('danger');
    expect(applyGuardrail('caution', fused)).toBe('danger');
  });

  it('resolves sea-caution over safe peers to CAUTION (spec Case C)', () => {
    const fused = fuseEvidence([
      result('sea', 'caution'),
      result('weather', 'safe'),
      result('hazard', 'safe'),
    ]);
    expect(applyGuardrail('safe', fused)).toBe('caution');
  });

  it('never downgrades: engine DANGER survives all-safe domains', () => {
    const fused = fuseEvidence([result('sea', 'safe'), result('weather', 'safe')]);
    expect(applyGuardrail('danger', fused)).toBe('danger');
  });

  it('breaks top-severity ties by domain priority (hazard > weather > sea)', () => {
    const fused = fuseEvidence([
      result('sea', 'caution'),
      result('weather', 'caution'),
      result('hazard', 'caution'),
    ]);
    expect(fused.strongestSignal?.agent).toBe('hazard');
    const seaWeather = fuseEvidence([result('sea', 'caution'), result('weather', 'caution')]);
    expect(seaWeather.strongestSignal?.agent).toBe('weather');
  });

  it('ignores unknown assessments for the verdict but lists them missing', () => {
    const fused = fuseEvidence([result('sea', 'safe'), result('hazard', 'unknown', { confidence: 0.3 })]);
    expect(fused.conflicts).toEqual([]);
    expect(fused.strongestSignal?.assessment).toBe('safe');
    expect(fused.missingDomains).toEqual(['hazard']);
    expect(applyGuardrail('safe', fused)).toBe('safe');
  });

  it('represents unavailable agents as missing without pretending safe', () => {
    const fused = fuseEvidence([
      result('sea', 'safe'),
      result('weather', 'unknown', { status: 'unavailable', confidence: 0 }),
    ]);
    expect(fused.missingDomains).toEqual(['weather']);
    expect(applyGuardrail('safe', fused)).toBe('safe');
    // coverage penalty: weakest(0.9) × 1/2
    expect(fused.overallConfidence).toBe(0.45);
  });

  it('deduplicates identical evidence while preserving distinct sources', () => {
    const dup = { label: 'Wave height', value: '1.3 m', source: 'Open-Meteo' };
    const other = { label: 'Wave height', value: '1.3 m', source: 'Demo data' };
    const fused = fuseEvidence([
      result('sea', 'safe', { evidence: [dup, other] }),
      result('weather', 'safe', { evidence: [dup] }),
    ]);
    expect(fused.evidence).toHaveLength(2);
    expect(fused.evidence.map((e) => e.source).sort()).toEqual(['Demo data', 'Open-Meteo']);
  });

  it('renders wire strings with provenance', () => {
    const fused = fuseEvidence([result('sea', 'safe')]);
    expect(evidenceToStrings(fused.evidence)).toEqual(['sea reading — ok (Test)']);
  });
});
