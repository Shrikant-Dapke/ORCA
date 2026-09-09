import type { OrcaAnswer } from '../types';

/**
 * Local mock marine reasoning for the MVP.
 * Replaces the future multi-agent backend with deterministic,
 * fisherman-friendly answers covering SAFE / CAUTION / DANGER.
 *
 * Swap this module for real API calls (VITE_ORCA_API_URL) later —
 * the ChatMessage/OrcaAnswer contract stays the same.
 */

const CHECKED_STANDARD = [
  'Sea conditions',
  'Wind',
  'Weather',
  'Satellite observations',
  'Marine advisories',
];

const SAFE_TOMORROW: OrcaAnswer = {
  state: 'SAFE',
  headline: 'SAFE TO GO',
  summary: 'Tomorrow morning looks suitable for fishing in your selected area.',
  bestTime: '6:00 AM – 12:00 PM',
  conditions: { sea: 'Calm', wind: 'Moderate', weather: 'Clear' },
  important: 'Winds may become stronger after 3:00 PM.',
  recommendation: 'Go in the morning and return before conditions worsen.',
  checked: CHECKED_STANDARD,
  explanation:
    'The sea is calm in the morning and the wind stays moderate till noon. Satellite pictures show clear skies over your area and there is no warning from marine authorities. That is why the morning is marked safe — but the wind rises in the afternoon, so come back early.',
};

const CAUTION_TODAY: OrcaAnswer = {
  state: 'CAUTION',
  headline: 'BE CAREFUL TODAY',
  summary: 'Today the sea is passable, but the afternoon looks rough in your area.',
  bestTime: '6:00 AM – 11:00 AM only',
  conditions: { sea: 'Slightly rough', wind: 'Strong after noon', weather: 'Cloudy' },
  important: 'Strong winds and high waves expected after 12:00 PM. Small boats should stay close to shore.',
  recommendation: 'If you go, fish only in the early morning and stay near the shore.',
  checked: CHECKED_STANDARD,
  explanation:
    'Morning waves are small, so early fishing is possible. But wind reports and satellite data show the wind picking up sharply after noon with bigger waves. There is no red alert, only a caution — so ORCA says go early, stay close, and return before noon.',
};

const CAUTION_WIND: OrcaAnswer = {
  state: 'CAUTION',
  headline: 'STRONG WINDS EXPECTED',
  summary: 'Yes — strong winds are expected later today in your fishing area.',
  bestTime: 'Before 10:00 AM, near shore only',
  conditions: { sea: 'Getting rough', wind: 'Strong (gusty)', weather: 'Cloudy, possible rain' },
  important: 'Gusts can push small boats off course. Do not go far from shore.',
  recommendation: 'Avoid deep water today. If you must go, stay close and return by 10:00 AM.',
  checked: CHECKED_STANDARD,
  explanation:
    'Wind readings are rising through the day and satellite pictures show clouds moving toward your area. Waves will grow with the wind. ORCA marks this as caution — not full danger — because the morning window is still usable near the shore.',
};

const CAUTION_SAFER_SPOT: OrcaAnswer = {
  state: 'CAUTION',
  headline: 'STAY CLOSE, STAY SHALLOW',
  summary: 'Open waters look rough. The calmer option is near-shore, sheltered water.',
  bestTime: '6:00 AM – 11:00 AM',
  conditions: { sea: 'Rough outside, calmer near shore', wind: 'Moderate to strong', weather: 'Cloudy' },
  important: 'Avoid deep/open water today — waves are higher there.',
  recommendation: 'Fish close to shore in sheltered water and return before noon.',
  checked: CHECKED_STANDARD,
  explanation:
    'Open-water readings show bigger waves, while near-shore water stays calmer because the coastline blocks some wind. Satellite and advisory inputs agree there is no storm, only rough outer water. So ORCA advises the safer near-shore option instead of stopping you fully.',
};

const DANGER_NEARBY: OrcaAnswer = {
  state: 'DANGER',
  headline: 'DO NOT GO — DANGER',
  summary: 'There is danger near your fishing area. Stay on land today.',
  bestTime: 'No safe window today',
  conditions: { sea: 'Very rough', wind: 'Very strong', weather: 'Stormy' },
  important: 'A marine warning is active for your area. High waves and storm winds can sink small boats.',
  recommendation: 'Do not go fishing today. Wait for the next safe update from ORCA.',
  checked: CHECKED_STANDARD,
  explanation:
    'Marine authorities have issued a warning for your area, and wind plus wave readings are at dangerous levels. Satellite pictures confirm storm clouds overhead. When an official warning and dangerous readings agree, ORCA always says DANGER — no fishing today.',
};

const SAFE_GENERAL: OrcaAnswer = {
  state: 'SAFE',
  headline: 'LOOKS GOOD FOR NOW',
  summary: 'Conditions in your fishing area look suitable at the moment.',
  bestTime: 'Early morning – 12:00 PM',
  conditions: { sea: 'Calm', wind: 'Light to moderate', weather: 'Mostly clear' },
  important: 'Weather at sea can change fast. Check again before you leave.',
  recommendation: 'Plan a morning trip and keep an eye on the sky.',
  checked: CHECKED_STANDARD,
  explanation:
    'Current sea, wind and weather readings are all normal, satellite pictures show no storm clouds, and there is no active marine warning. With all five checks clear, ORCA marks it safe — but always re-check before leaving, because the sea can change.',
};

function norm(q: string): string {
  return q.toLowerCase();
}

/** Keyword router — simple by design so demo judges can hit every state. */
export function answerFor(question: string): OrcaAnswer {
  const q = norm(question);

  if (/(danger|storm|cyclone|warning|alert|nearby|near me)/.test(q)) return DANGER_NEARBY;
  if (/(safer|where.*fish|which side|location|place|spot|area)/.test(q)) return CAUTION_SAFER_SPOT;
  if (/(wind|gust|stormy|wave)/.test(q)) return CAUTION_WIND;
  if (/(today|now|right now|this morning|this afternoon)/.test(q)) return CAUTION_TODAY;
  if (/(tomorrow|morning|next day|weekend|can i go)/.test(q)) return SAFE_TOMORROW;
  if (/(hello|hi|namaste|hey|good morning|who are you|help)/.test(q)) return SAFE_GENERAL;
  if (/(rain|cloud|weather)/.test(q)) return CAUTION_WIND;
  return SAFE_GENERAL;
}

/** Fake latency so the UI can show a typing state like a real backend. */
export function mockLatency(): Promise<void> {
  const ms = 900 + Math.random() * 700;
  return new Promise((res) => setTimeout(res, ms));
}
