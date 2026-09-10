import type { Strings } from '../i18n/strings';

/** Simple companion panels for bottom-nav tabs (no dashboard — just sea summary, alerts, help). */

export function SeaPanel({ strings, area }: { strings: Strings; area: string }) {
  const rows = [
    { icon: 'waves', label: strings.seaLabel, value: 'Slightly rough after noon' },
    { icon: 'air', label: strings.windLabel, value: 'Moderate now, strong later' },
    { icon: 'partly_cloudy_day', label: strings.weatherLabel, value: 'Cloudy, clearing tomorrow' },
  ];
  return (
    <div className="px-4 pb-4">
      <div className="rounded-2xl bg-surface-lowest p-4 shadow-md">
        <h2 className="font-headline text-base font-bold text-on-surface">{strings.seaTitle}</h2>
        <p className="text-xs text-on-surface-variant">{area}</p>
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 rounded-xl bg-surface-low px-3 py-2.5">
              <span className="material-symbols-outlined text-[22px] text-primary">{r.icon}</span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{r.label}</p>
                <p className="text-sm font-bold text-on-surface">{r.value}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-caution-bg px-3 py-2.5 text-[13px] font-medium text-caution-text ring-1 ring-caution-ring/60">
          ⚠️ {strings.importantLabel}: winds rise after 12:00 PM — plan a morning return.
        </p>
      </div>
    </div>
  );
}

export function AlertsPanel({ strings, area }: { strings: Strings; area: string }) {
  const alerts = [
    {
      icon: 'crisis_alert',
      tone: 'bg-error-container text-on-error-container',
      title: 'Marine warning — strong winds',
      body: `Active for ${area}. Small boats should not go far from shore after noon.`,
    },
    {
      icon: 'warning',
      tone: 'bg-caution-bg text-caution-text',
      title: 'High waves after 12:00 PM',
      body: 'Waves may grow through the afternoon. Return before conditions worsen.',
    },
    {
      icon: 'check_circle',
      tone: 'bg-tertiary-fixed/40 text-tertiary',
      title: 'Tomorrow morning looks safe',
      body: 'Calm sea and clear skies expected 6:00 AM – 12:00 PM.',
    },
  ];
  return (
    <div className="px-4 pb-4">
      <div className="rounded-2xl bg-surface-lowest p-4 shadow-md">
        <h2 className="font-headline text-base font-bold text-on-surface">{strings.alertsTitle}</h2>
        <p className="text-xs text-on-surface-variant">{area}</p>
        <div className="mt-3 space-y-2">
          {alerts.map((a) => (
            <div key={a.title} className="flex gap-3 rounded-xl bg-surface-low p-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.tone}`}>
                <span className="material-symbols-outlined text-[20px]">{a.icon}</span>
              </span>
              <div>
                <p className="text-sm font-bold text-on-surface">{a.title}</p>
                <p className="text-[13px] leading-snug text-on-surface-variant">{a.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HelpPanel({ strings, onAsk }: { strings: Strings; onAsk: (q: string) => void }) {
  const tips = [
    'Ask in simple words, like talking to a friend.',
    'Tap the mic button to speak instead of typing.',
    'Tap “Why did ORCA say this?” to see the checks behind any answer.',
    'Green means go, yellow means be careful, red means stay on land.',
  ];
  return (
    <div className="px-4 pb-4">
      <div className="rounded-2xl bg-surface-lowest p-4 shadow-md">
        <h2 className="flex items-center gap-2 font-headline text-base font-bold text-on-surface">
          <span className="material-symbols-outlined text-[22px] text-primary">help</span>
          {strings.helpTitle}
        </h2>
        <ul className="mt-3 space-y-2">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-2.5 rounded-xl bg-surface-low px-3 py-2.5 text-[13px] leading-snug text-on-surface">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary-fixed text-xs font-extrabold text-on-secondary-fixed">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ul>
        <button
          onClick={() => onAsk('Can I go fishing tomorrow?')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 py-3 font-headline text-sm font-bold text-on-primary transition hover:bg-primary active:scale-[0.99]"
        >
          <span className="material-symbols-outlined text-[20px]">smart_toy</span>
          Try an example question
        </button>
      </div>
    </div>
  );
}
