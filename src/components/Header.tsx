import { Fish, RotateCcw } from 'lucide-react';
import { LANGUAGES, type Strings } from '../i18n/strings';
import type { Locale } from '../types';

interface Props {
  strings: Strings;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onNewChat: () => void;
  /** True when the last answer came from live marine data. Badge-only change. */
  live?: boolean;
}

export default function Header({ strings, locale, onLocale, onNewChat, live }: Props) {
  return (
    <header className="relative z-10 flex items-center gap-3 px-4 pt-4 pb-3">
      {/* ORCA logo mark */}
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 via-cyan-400 to-blue-600 shadow-[0_0_24px_rgba(34,211,238,0.45)]">
        <Fish className="h-6 w-6 text-[#04121f]" strokeWidth={2.4} />
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-300 ring-2 ring-[#04121f]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold tracking-[0.18em] text-white">{strings.brand}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
              live
                ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/40'
                : 'bg-cyan-400/15 text-cyan-200 ring-cyan-300/30'
            }`}
          >
            {live ? strings.liveNote : strings.demoNote}
          </span>
        </div>
        <p className="truncate text-[13px] font-medium text-cyan-100/80">{strings.tagline}</p>
      </div>

      {/* Language: English live, Hindi/Marathi visibly "soon" */}
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => onLocale(e.target.value as Locale)}
        className="shrink-0 rounded-xl bg-white/10 px-2 py-2 text-xs font-semibold text-cyan-50 ring-1 ring-white/15 outline-none backdrop-blur focus:ring-cyan-300/60"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} disabled={!l.supported} className="text-slate-900">
            {l.nativeLabel}
          </option>
        ))}
      </select>

      <button
        onClick={onNewChat}
        title={strings.newChat}
        aria-label={strings.newChat}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-cyan-100 ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </header>
  );
}
