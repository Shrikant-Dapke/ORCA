import type { ResponseLocale } from '../../shared/orca-contract.js';
import type { Topic } from '../providers/types.js';
import type { LocationMode } from '../../shared/orca-contract.js';

/**
 * Explicit deterministic planner. Turns intent + position into a structured
 * task graph BEFORE any agent runs. No LLM, no invented data — the plan is
 * a pure function of (topic, timeframe, position mode), fully traceable.
 */

export interface PlanTask {
  taskId: string;
  /** Agent name, 'pfz' (zone fetch), 'decide' or 'explain' (engine steps). */
  agent: string;
  objective: string;
  dependencies: string[];
  parameters: Record<string, string>;
  priority: number;
}

export interface TaskPlan {
  topic: Topic;
  tasks: PlanTask[];
}

const NO_DEPS: string[] = [];

export function planRequest(
  topic: Topic,
  positionMode: LocationMode,
  _locale: ResponseLocale,
): TaskPlan {
  const where =
    positionMode === 'gps' ? 'gps-fix' : positionMode === 'manual' ? 'matched-zone' : 'demo-waters';
  const tasks: PlanTask[] = [
    { taskId: 't1-locate', agent: 'location', objective: 'Resolve fishing position and provenance', dependencies: NO_DEPS, parameters: { mode: positionMode, where }, priority: 1 },
    { taskId: 't2-sea', agent: 'sea', objective: 'Read wave and sea-state conditions', dependencies: ['t1-locate'], parameters: { where }, priority: 2 },
    { taskId: 't3-weather', agent: 'weather', objective: 'Read wind, gust, and sky conditions', dependencies: ['t1-locate'], parameters: { where }, priority: 2 },
    { taskId: 't4-hazards', agent: 'hazard', objective: 'Collect official advisories and marine warnings', dependencies: ['t1-locate'], parameters: { where }, priority: 2 },
  ];
  if (topic === 'general' || topic === 'spot' || topic === 'zone') {
    tasks.push({ taskId: 't5-eco', agent: 'ecosystem', objective: 'Observe SST/chlorophyll context where available', dependencies: ['t1-locate'], parameters: { where }, priority: 3 });
  }
  if (topic === 'spot' || topic === 'zone' || topic === 'route') {
    tasks.push({ taskId: 't6-zones', agent: 'pfz', objective: 'List candidate fishing zones', dependencies: ['t1-locate'], parameters: { where }, priority: 3 });
    tasks.push({ taskId: 't7-geo', agent: 'geo', objective: 'Measure distances, bearings, and restricted-area status', dependencies: ['t1-locate', 't6-zones'], parameters: { where }, priority: 4 });
  }
  if (topic === 'route' || topic === 'spot' || topic === 'zone') {
    tasks.push({ taskId: 't8-route', agent: 'route', objective: 'Calculate safe-risk route to the nearest zone', dependencies: ['t1-locate', 't6-zones'], parameters: { where }, priority: 5 });
  }
  tasks.push({ taskId: 't9-decide', agent: 'decide', objective: 'Deterministic safety verdict with guardrail', dependencies: ['t2-sea', 't3-weather', 't4-hazards'], parameters: {}, priority: 6 });
  tasks.push({ taskId: 't10-explain', agent: 'explain', objective: 'Evidence-backed fisherman explanation', dependencies: ['t9-decide'], parameters: {}, priority: 7 });
  return { topic, tasks };
}

/**
 * Topological batches: tasks whose dependencies are all scheduled run
 * together. Pure function — the orchestrator awaits each batch in order.
 */
export function planBatches(plan: TaskPlan): string[][] {
  const done = new Set<string>();
  const remaining = new Map(plan.tasks.map((t) => [t.taskId, t]));
  const batches: string[][] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((t) => t.dependencies.every((d) => done.has(d)));
    if (ready.length === 0) break; // cycle guard — should never happen
    // Drop engine meta-tasks (decide/explain run inline in the orchestrator).
    const runnable = ready.filter((t) => t.agent !== 'decide' && t.agent !== 'explain');
    if (runnable.length > 0) batches.push(runnable.map((t) => t.taskId));
    for (const t of ready) {
      done.add(t.taskId);
      remaining.delete(t.taskId);
    }
  }
  return batches;
}
