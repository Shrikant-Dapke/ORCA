import type { ReactNode } from 'react';
import { useApp } from '../app-context';
import type { AppPage } from '../App';

const TABS: { id: AppPage; labelKey: 'navHome' | 'navMap' | 'navAi' | 'navFishing' | 'navWeather' | 'navAlerts' | 'navSettings'; icon: string }[] = [
  { id: 'home', labelKey: 'navHome', icon: 'home' },
  { id: 'map', labelKey: 'navMap', icon: 'map' },
  { id: 'ai', labelKey: 'navAi', icon: 'smart_toy' },
  { id: 'fishing', labelKey: 'navFishing', icon: 'phishing' },
  { id: 'weather', labelKey: 'navWeather', icon: 'partly_cloudy_day' },
  { id: 'alerts', labelKey: 'navAlerts', icon: 'crisis_alert' },
  { id: 'settings', labelKey: 'navSettings', icon: 'settings' },
];

/** App shell: persistent sidebar (desktop) / bottom nav (mobile) + top header. */
export default function Shell({ page, children }: { page: AppPage; children: ReactNode }) {
  const { strings, locale, setLocale } = useApp();
  return (
    <div className="flex min-h-0 flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-outline-variant/60 bg-surface-lowest/70 p-3 md:flex">
        <a href="#/" className="mb-2 flex items-center gap-2 px-2 pt-1 font-headline text-[17px] font-bold text-primary">
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            sailing
          </span>
          ORCA
        </a>
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#/app/${t.id}`}
            aria-current={page === t.id ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition ${
              page === t.id ? 'bg-primary-container/15 font-bold text-primary' : 'text-on-surface-variant hover:bg-surface-low'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">{t.icon}</span>
            {strings[t.labelKey]}
          </a>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="z-10 flex items-center gap-2 bg-surface/85 px-4 py-2.5 backdrop-blur-xl">
          <a href="#/" className="flex items-center gap-1.5 font-headline text-[15px] font-bold text-primary md:hidden">
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              sailing
            </span>
            ORCA
          </a>
          <a
            href="#/app/ai"
            className="hidden min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-low px-4 py-2 text-[13px] text-on-surface-variant md:flex"
            aria-label={strings.landingSearch}
          >
            <span className="material-symbols-outlined text-[18px]">search</span>
            <span className="truncate">{strings.landingSearch}</span>
          </a>
          <div className="ml-auto flex items-center gap-2">
            <select
              aria-label={strings.settingsLanguage}
              value={locale}
              onChange={(e) => setLocale(e.target.value as typeof locale)}
              className="rounded-full bg-surface-low px-2.5 py-2 text-xs font-bold text-primary outline-none"
            >
              <option value="en">EN</option>
              <option value="hi">हिं</option>
              <option value="mr">मराठी</option>
            </select>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-low text-[11px] font-extrabold text-primary" title={strings.guestNote}>
              G
            </span>
          </div>
        </header>

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto pb-20 md:pb-6">{children}</div>

        {/* Mobile bottom nav */}
        <nav aria-label="Main" className="bg-surface/90 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))' }}>
          <div className="grid grid-cols-7 gap-0.5 px-1 pt-1">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#/app/${t.id}`}
                aria-current={page === t.id ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] ${
                  page === t.id ? 'font-bold text-primary' : 'text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">{t.icon}</span>
                {strings[t.labelKey]}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
