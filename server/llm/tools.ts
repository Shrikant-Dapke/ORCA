import type { LLMToolDef } from './types.js';
import type { FishingZone, OrcaStatus, RouteInfo } from '../../shared/orca-contract.js';

/**
 * ORCA tool surface for the LLM. Every tool maps to a REAL backend
 * capability (the deterministic pipeline); there are no fake tools.
 * Executors receive an injected backend runner so this module never
 * imports the orchestrator (no cycles, fully testable with stubs).
 */

export interface BackendFacts {
  status: OrcaStatus;
  headline: string;
  summary: string;
  sea: string;
  wind: string;
  weather: string;
  bestTime?: string;
  warning?: string;
  recommendation?: string;
  zones?: FishingZone[];
  route?: RouteInfo | null;
  live: boolean;
  dataSource: string;
}

export type BackendRunner = (question: string) => Promise<BackendFacts>;

export const ORCA_TOOLS: LLMToolDef[] = [
  {
    name: 'get_safety_status',
    description: 'Get the deterministic SAFE/CAUTION/DANGER safety verdict for a fishing question. Use for any safety question.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Full fishing safety question, e.g. "Is it safe to fish tomorrow morning?"' } },
      required: ['question'],
    },
  },
  {
    name: 'get_sea_conditions',
    description: 'Get current sea, wind, weather readings and best fishing time. Use for sea/weather questions.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Full sea/weather question' } },
      required: ['question'],
    },
  },
  {
    name: 'get_fishing_zones',
    description: 'Get candidate fishing zones with distance and bearing. Use for where-to-fish questions.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Full zone question, e.g. "Where should I fish today?"' } },
      required: ['question'],
    },
  },
  {
    name: 'calculate_route',
    description: 'Calculate a safe-risk route to the nearest fishing zone. Use for route/navigation questions.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Full route question' } },
      required: ['question'],
    },
  },
  {
    name: 'get_alerts',
    description: 'Get active marine warnings/advisories. Use for danger/alert questions.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Full hazard question' } },
      required: ['question'],
    },
  },
];

const KNOWN_TOOLS = new Set(ORCA_TOOLS.map((t) => t.name));

export function isKnownTool(name: string): boolean {
  return KNOWN_TOOLS.has(name);
}

function questionOf(args: Record<string, unknown>, fallback: string): string {
  const q = args['question'];
  return typeof q === 'string' && q.trim().length > 0 ? q : fallback;
}

/** Execute one validated tool call against the real backend. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  runBackend: BackendRunner,
  userMessage: string,
): Promise<string> {
  if (!isKnownTool(name)) {
    return JSON.stringify({ error: `unknown tool: ${name}` });
  }
  const facts = await runBackend(questionOf(args, userMessage));
  switch (name) {
    case 'get_safety_status':
      return JSON.stringify({
        status: facts.status,
        headline: facts.headline,
        summary: facts.summary,
        recommendation: facts.recommendation,
        live: facts.live,
        dataSource: facts.dataSource,
      });
    case 'get_sea_conditions':
      return JSON.stringify({
        sea: facts.sea,
        wind: facts.wind,
        weather: facts.weather,
        bestTime: facts.bestTime,
        warning: facts.warning,
        live: facts.live,
        dataSource: facts.dataSource,
      });
    case 'get_fishing_zones':
      return JSON.stringify({
        zones: (facts.zones ?? []).map((z) => ({
          name: z.name,
          distanceKm: z.distanceKm,
          bearingCompass: z.bearingCompass,
          potential: z.potential,
          live: z.live,
          source: z.source,
        })),
        live: facts.live,
      });
    case 'calculate_route':
      return JSON.stringify({
        route: facts.route
          ? {
              distanceKm: facts.route.distanceKm,
              bearingCompass: facts.route.bearingCompass,
              riskLevel: facts.route.riskLevel,
              riskScore: facts.route.riskScore,
              note: facts.route.note,
            }
          : null,
        live: facts.live,
      });
    case 'get_alerts':
      return JSON.stringify({
        status: facts.status,
        headline: facts.headline,
        warning: facts.warning,
        recommendation: facts.recommendation,
        live: facts.live,
        dataSource: facts.dataSource,
      });
    default:
      return JSON.stringify({ error: `unhandled tool: ${name}` });
  }
}
