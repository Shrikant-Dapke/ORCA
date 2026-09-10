import type { Locale } from '../types';

/**
 * i18n-ready string table.
 * MVP ships full English only. Hindi / Marathi entries are marked
 * `supported: false` so the UI can show them as "coming soon" without
 * ever claiming they work.
 */
interface LanguageMeta {
  code: Locale;
  label: string;
  nativeLabel: string;
  supported: boolean;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', supported: true },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी (soon)', supported: false },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी (soon)', supported: false },
];

const en = {
  brand: 'ORCA',
  tagline: 'Your Marine Assistant',
  greetingTitle: 'Namaste! Ready to fish safe today?',
  greetingBody:
    "Ask me in simple words. I'll tell you if the sea is safe, when to go, and when to return.",
  fishingAreaLabel: 'Your Fishing Area',
  fishingAreaValue: 'Near-shore waters',
  fishingAreaHint: 'Set for your coast',
  suggestedTitle: 'Try asking',
  quickTitle: 'Quick questions',
  suggested: [
    'Can I go fishing tomorrow?',
    'How is the sea today?',
    'Where is it safer to fish?',
    'Will there be strong winds?',
    'Is there any danger nearby?',
  ] as string[],
  inputPlaceholder: 'Ask ORCA… e.g. Can I go fishing tomorrow?',
  voiceHint: 'Tap the mic and speak',
  micTitle: 'Voice input ready',
  listening: 'Listening… speak now',
  voiceNotSupported: 'Voice typing is not available in this browser — please type instead.',
  whyTitle: 'Why did ORCA say this?',
  whyCheckedLabel: 'ORCA checked:',
  bestTimeLabel: 'Best time',
  seaLabel: 'Sea',
  windLabel: 'Wind',
  weatherLabel: 'Weather',
  importantLabel: 'Important',
  recommendationLabel: 'Recommendation',
  listen: 'Listen',
  share: 'Share this advice',
  copied: 'Copied to clipboard',
  navChat: 'Chat',
  navSea: 'Sea',
  navAlerts: 'Alerts',
  navHelp: 'Help',
  newChat: 'New chat',
  demoNote: 'Demo data',
  liveNote: 'Live • Open-Meteo',
  gpsLocked: 'GPS Locked',
  demoWaters: 'Demo waters',
  useMyLocation: 'Use My Location',
  findingLocation: 'Finding your location…',
  usingYourLocation: 'Using your location',
  stopUsingLocation: 'Stop',
  locationDenied: 'Location unavailable — using area name instead',
  alertsTitle: 'Safety alerts',
  seaTitle: "Today's sea",
  helpTitle: 'How to use ORCA',
} as const;

export type Strings = typeof en;

/** Placeholders for future locales — undefined until translated. */
const hi: Partial<Strings> | undefined = undefined;
const mr: Partial<Strings> | undefined = undefined;

export function getStrings(locale: Locale): Strings {
  // Fall back to English for any locale without a full dictionary.
  if (locale === 'hi' && hi) return { ...en, ...hi };
  if (locale === 'mr' && mr) return { ...en, ...mr };
  return en;
}
