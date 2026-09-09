import type { OrcaMeta } from '../shared/orca-contract';

export type SafetyState = 'SAFE' | 'CAUTION' | 'DANGER';

export interface MarineConditions {
  sea: string;
  wind: string;
  weather: string;
}

export interface OrcaAnswer {
  state: SafetyState;
  headline: string;
  summary: string;
  bestTime: string;
  conditions: MarineConditions;
  important: string;
  recommendation: string;
  checked: string[];
  explanation: string;
  /** Wire metadata passed through for the live/demo badge. Optional, render-safe. */
  meta?: OrcaMeta;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: OrcaAnswer;
  createdAt: number;
}

/** Supported locales. Only English ships strings in this MVP —
 *  Hindi/Marathi dictionaries are intentionally empty stubs so the
 *  architecture is ready without claiming support we don't have. */
export type Locale = 'en' | 'hi' | 'mr';
