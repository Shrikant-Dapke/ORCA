import type { LLMMessage } from './types.js';
import type { FishingZone, OrcaStatus, RouteInfo } from '../../shared/orca-contract.js';

/**
 * In-memory multi-turn conversation store. Sessions live only for the
 * process lifetime: no database, no persistence, TTL + caps so memory
 * cannot grow unboundedly. GPS fixes are NEVER stored here — only text
 * turns plus small zone/route/status snapshots the backend already sent
 * to this client.
 */

export interface SessionSnapshot {
  lastStatus?: OrcaStatus;
  lastZones?: FishingZone[];
  lastRoute?: RouteInfo | null;
  lastArea?: string;
}

export interface Session {
  turns: LLMMessage[];
  snapshot: SessionSnapshot;
  updatedAt: number;
}

const MAX_TURNS = 12;
const MAX_SESSIONS = 200;
const TTL_MS = 30 * 60 * 1000;

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  static validId(id: unknown): id is string {
    return typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id);
  }

  get(id: string): Session {
    const now = this.clock();
    // Opportunistic expiry sweep.
    for (const [key, s] of this.sessions) {
      if (now - s.updatedAt > TTL_MS) this.sessions.delete(key);
    }
    let session = this.sessions.get(id);
    if (!session) {
      session = { turns: [], snapshot: {}, updatedAt: now };
      if (this.sessions.size >= MAX_SESSIONS) {
        const oldest = [...this.sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
        if (oldest) this.sessions.delete(oldest[0]);
      }
      this.sessions.set(id, session);
    }
    return session;
  }

  append(id: string, messages: LLMMessage[], snapshot?: Partial<SessionSnapshot>): void {
    const session = this.get(id);
    session.turns.push(...messages);
    if (session.turns.length > MAX_TURNS) {
      session.turns = session.turns.slice(session.turns.length - MAX_TURNS);
    }
    if (snapshot) session.snapshot = { ...session.snapshot, ...snapshot };
    session.updatedAt = this.clock();
  }

  size(): number {
    return this.sessions.size;
  }
}

/** Compact context block so follow-ups ("which one?", "how far?") resolve. */
export function snapshotContext(snapshot: SessionSnapshot): string {
  const lines: string[] = [];
  if (snapshot.lastStatus) {
    lines.push(
      `A previous turn's verdict was ${snapshot.lastStatus.toUpperCase()} — HISTORICAL context only, ` +
        'never reuse it as the current verdict.',
    );
  }
  if (snapshot.lastZones && snapshot.lastZones.length > 0) {
    const z = snapshot.lastZones
      .map((zone, i) => `#${i + 1} "${zone.name}" ${zone.distanceKm} km ${zone.bearingCompass} (potential: ${zone.potential})`)
      .join('; ');
    lines.push(`Previously discussed fishing zones: ${z}.`);
  }
  if (snapshot.lastRoute) {
    lines.push(
      `Previously calculated route: ${snapshot.lastRoute.distanceKm} km ${snapshot.lastRoute.bearingCompass}, risk ${snapshot.lastRoute.riskLevel} (${snapshot.lastRoute.riskScore}/100).`,
    );
  }
  if (snapshot.lastArea) lines.push(`Fishing area label: "${snapshot.lastArea}".`);
  return lines.join('\n');
}
