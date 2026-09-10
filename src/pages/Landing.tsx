import { useState } from 'react';
import { useApp } from '../app-context';
import { appHref } from '../App';

/** Public landing: hero, live search into the AI page, suggested starters. */
export default function Landing() {
  const { strings, locale, setLocale } = useApp();
  const [q, setQ] = useState('');

  const starters = [
    strings.suggested[3] ?? 'wind',
    strings.suggested[2] ?? 'zones',
    strings.suggested[1] ?? 'sea',
    strings.suggested[4] ?? 'danger',
  ];

  return (
    <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <span className="flex items-center gap-2 font-headline text-[18px] font-bold text-primary">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            sailing
          </span>
          ORCA
        </span>
        <nav className="hidden items-center gap-5 text-[13px] font-semibold text-on-surface-variant md:flex">
          <span>{strings.navHome}</span>
          <a href="#/app/map" className="hover:text-primary">{strings.navMap}</a>
          <a href="#/app/ai" className="hover:text-primary">{strings.navAi}</a>
          <a href="#/app/weather" className="hover:text-primary">{strings.navWeather}</a>
        </nav>
        <div className="flex items-center gap-2">
          <select
            aria-label="Language"
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="rounded-full bg-surface-low px-3 py-2 text-xs font-bold text-primary outline-none"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="mr">मराठी</option>
          </select>
          <a
            href="#/app/ai"
            className="rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-on-primary active:scale-95"
          >
            {strings.landingStart}
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 pb-10 pt-6 text-center sm:pt-12">
        <h1 className="font-headline text-[32px] font-bold leading-tight text-on-surface sm:text-[44px]">
          {strings.landingHero}
        </h1>
        <p className="mx-auto mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-on-surface-variant">
          {strings.landingSub}
        </p>
        <form
          className="mx-auto mt-6 flex max-w-[560px] items-center gap-2 rounded-2xl bg-surface-lowest p-2 pl-4 shadow-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) window.location.hash = appHref('ai', q.trim());
          }}
        >
          <span className="material-symbols-outlined text-[22px] text-primary">search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={strings.landingSearch}
            aria-label={strings.landingSearch}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none"
          />
          <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-on-primary active:scale-90">
            <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
          </button>
        </form>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {starters.map((s) => (
            <a
              key={s}
              href={appHref('ai', s)}
              className="rounded-full bg-surface-lowest px-4 py-2 text-[13px] font-semibold text-primary shadow-sm transition hover:bg-surface-container active:scale-95"
            >
              {s}
            </a>
          ))}
        </div>
        <p className="mt-6 text-[11px] text-on-surface-variant">{strings.guestNote}</p>
      </main>
    </div>
  );
}
