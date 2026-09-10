import { LANGUAGES, type Strings } from '../i18n/strings';
import type { Locale } from '../types';

interface Props {
  strings: Strings;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onNewChat: () => void;
  gpsActive: boolean;
  live: boolean;
}

/**
 * Stitch app bar: brand row (emblem + name + language + new chat) and a
 * live status row. Every indicator reflects real state — GPS pill follows
 * the browser fix, source pill follows the backend meta.
 */
export default function Header({ strings, locale, onLocale, onNewChat, gpsActive, live }: Props) {
  return (
    <header className="relative z-10 bg-surface/85 px-4 pb-2 pt-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary shadow-sm">
            <span className="material-symbols-outlined text-[22px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              sailing
            </span>
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-headline text-[17px] font-bold leading-tight text-primary">
              {strings.brand}
            </span>
            <span className="truncate text-[11px] font-medium text-on-surface-variant">
              {strings.tagline}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex h-9 items-center gap-1 rounded-full bg-surface-low px-3 text-[12px] font-semibold text-primary">
            <span className="material-symbols-outlined text-[16px]">translate</span>
            <select
              aria-label="Language"
              value={locale}
              onChange={(e) => onLocale(e.target.value as Locale)}
              className="bg-transparent outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} disabled={!l.supported}>
                  {l.nativeLabel}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={onNewChat}
            title={strings.newChat}
            aria-label={strings.newChat}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-low text-primary transition hover:bg-surface-high active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">refresh</span>
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            gpsActive ? 'bg-tertiary-fixed/40 text-tertiary' : 'bg-surface-high text-on-surface-variant'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${gpsActive ? 'animate-pulse bg-tertiary' : 'bg-outline'}`} />
          {gpsActive ? strings.gpsLocked : strings.demoWaters}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold ${
            live ? 'text-tertiary' : 'text-on-surface-variant'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">sensors</span>
          {live ? strings.liveNote : strings.demoNote}
        </span>
      </div>
    </header>
  );
}
