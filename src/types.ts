import type { FishingZone, OrcaMeta, RouteInfo } from '../shared/orca-contract';

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
  /** Candidate zones / calculated route (present for where-to-go questions). */
  zones?: FishingZone[];
  route?: RouteInfo;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: OrcaAnswer;
  createdAt: number;
}

/** Supported locales. English, Hindi, and Marathi dictionaries ship. */
export type Locale = 'en' | 'hi' | 'mr';
