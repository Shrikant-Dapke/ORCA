import type { OrcaStatus } from '../../shared/orca-contract.js';
import type { AgentResult, EvidenceItem } from '../agents/types.js';
import type { DomainAssessment } from './engine.js';

/**
 * EvidenceFusion — the ONLY place agent results are combined. Agents never
 * see each other; fusion preserves each item's provenance and resolves
 * disagreements by safety severity, never by averaging confidence.
 */

/** Coarse, documented confidence buckets — never fake precision. */
export const CONFIDENCE = {
  /** Fresh readings from a live provider. */
  live: 0.9,
  /** Closed-world scripted demo data. */
  demo: 0.7,
  /** Position fix less precise than GPS (manual zone label). */
  manual: 0.7,
  /** Default demo waters, unmatched label. */
  demoWaters: 0.6,
  /** Domain ran but has no source to assess (e.g. no advisory feed). */
  unknown: 0.3,
} as const;

export interface Conflict {
  agents: string[];
  /** Factual account of the disagreement, e.g. "sea: safe; weather: caution". */
  reason: string;
  /** Max severity involved — conflicts never resolve downward. */
  resolution: OrcaStatus;
}

export interface FusedEvidence {
  assessments: Record<string, DomainAssessment>;
  /** Deduplicated items; every item keeps its own source. */
  evidence: EvidenceItem[];
  conflicts: Conflict[];
  strongestSignal: { agent: string; assessment: 'safe' | 'caution' | 'danger' } | null;
  /** Agents that did not produce a usable assessment. */
  missingDomains: string[];
  /**
   * Conservative combination: weakest available confidence × coverage.
   * Internal only — never shown to fishermen, never a safety probability.
   */
  overallConfidence: number;
}

type Verdict = 'safe' | 'caution' | 'danger';

function rank(a: Verdict): number {
  return a === 'danger' ? 2 : a === 'caution' ? 1 : 0;
}

/**
 * Tie-break when several domains share the top severity: official warnings
 * first, then the fastest-changing killer (wind), then sea. Documented and
 * tested — never first-come-first-served, never an average.
 */
const SIGNAL_PRIORITY = ['hazard', 'weather', 'sea', 'location'];

function priority(agent: string): number {
  const i = SIGNAL_PRIORITY.indexOf(agent);
  return i === -1 ? SIGNAL_PRIORITY.length : i;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export function fuseEvidence(results: AgentResult[]): FusedEvidence {
  const assessments: Record<string, DomainAssessment> = {};
  for (const r of results) assessments[r.agent] = r.assessment;

  const seen = new Set<string>();
  const evidence: EvidenceItem[] = [];
  for (const r of results) {
    for (const e of r.evidence) {
      const key = `${e.label}|||${e.value}|||${e.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        evidence.push(e);
      }
    }
  }

  const available = results.filter(
    (r): r is AgentResult & { assessment: Verdict } =>
      r.status === 'available' && r.assessment !== 'unknown',
  );
  const missingDomains = results
    .filter((r) => r.status !== 'available' || r.assessment === 'unknown')
    .map((r) => r.agent);

  let strongestSignal: FusedEvidence['strongestSignal'] = null;
  for (const r of available) {
    if (
      !strongestSignal ||
      rank(r.assessment) > rank(strongestSignal.assessment) ||
      (rank(r.assessment) === rank(strongestSignal.assessment) &&
        priority(r.agent) < priority(strongestSignal.agent))
    ) {
      strongestSignal = { agent: r.agent, assessment: r.assessment };
    }
  }

  const conflicts: Conflict[] = [];
  const distinct = [...new Set(available.map((r) => r.assessment))];
  if (distinct.length > 1 && strongestSignal) {
    const parts = distinct
      .sort((a, b) => rank(a) - rank(b))
      .map((a) => `${available.filter((r) => r.assessment === a).map((r) => r.agent).join(', ')}: ${a}`);
    conflicts.push({
      agents: available.map((r) => r.agent),
      reason: `Conflicting signals — ${parts.join('; ')} — ${strongestSignal.assessment} takes precedence`,
      resolution: strongestSignal.assessment,
    });
  }

  const weakest =
    available.length > 0 ? Math.min(...available.map((r) => clamp01(r.confidence))) : 0;
  const coverage = results.length > 0 ? available.length / results.length : 0;
  const overallConfidence = Math.round(weakest * coverage * 100) / 100;

  return { assessments, evidence, conflicts, strongestSignal, missingDomains, overallConfidence };
}

/**
 * FINAL AUTHORITY guardrail. The fused domain signals can only raise the
 * engine's verdict, never lower it: a severe advisory or severe marine
 * reading anywhere forces DANGER even if every other domain reads safe.
 */
export function applyGuardrail(engineStatus: OrcaStatus, fused: FusedEvidence): OrcaStatus {
  if (!fused.strongestSignal) return engineStatus;
  return rank(fused.strongestSignal.assessment) > rank(engineStatus)
    ? fused.strongestSignal.assessment
    : engineStatus;
}

/** Wire rendering: one human line per item, provenance preserved. */
export function evidenceToStrings(items: EvidenceItem[]): string[] {
  return items.map((e) => `${e.label} — ${e.value} (${e.source})`);
}
