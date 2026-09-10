import type { Strings } from '../i18n/strings';
import type { OrcaAnswer } from '../types';

/** Simple companion panels for bottom-nav tabs (no dashboard — just sea summary, alerts, help). */

export function SeaPanel({ strings, area, live }: { strings: Strings; area: string; live?: OrcaAnswer | null }) {
  if (!live) {
    return (
      <div className="px-4 pb-4">
        <div className="rounded-2xl bg-surface-lowest p-4 text-center shadow-md">
          <span className="material-symbols-outlined text-[32px] text-secondary">waves</span>
          <h2 className="mt-1 font-headline text-base font-bold text-on-surface">{strings.seaTitle}</h2>
          <p className="mt-1 text-[13px] text-on-surface-variant">{strings.askSeaPrompt}</p>
        </div>
      </div>
    );
  }
  const rows = [
    { icon: 'waves', label: strings.seaLabel, value: live.conditions.sea ?? '—' },
    { icon: 'air', label: strings.windLabel, value: live.conditions.wind ?? '—' },
    { icon: 'partly_cloudy_day', label: strings.weatherLabel, value: live.conditions.weather ?? '—' },
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
        {live.state !== 'SAFE' && (
          <p className="mt-3 rounded-xl bg-caution-bg px-3 py-2.5 text-[13px] font-medium text-caution-text ring-1 ring-caution-ring/60">
            ⚠️ {strings.importantLabel}: {live.important}
          </p>
        )}
      </div>
    </div>
  );
}

export function AlertsPanel({ strings, area, live }: { strings: Strings; area: string; live?: OrcaAnswer | null }) {
  const liveAlert =
    live && live.state !== 'SAFE'
      ? [
          {
            icon: live.state === 'DANGER' ? 'crisis_alert' : 'warning',
            tone: live.state === 'DANGER' ? 'bg-error-container text-on-error-container' : 'bg-caution-bg text-caution-text',
            title: live.headline,
            body: live.important,
          },
        ]
      : [];
  const alerts = [...liveAlert];
  if (alerts.length === 0) {
    alerts.push({
      icon: 'check_circle',
      tone: 'bg-tertiary-fixed/40 text-tertiary',
      title: strings.noAlertsTitle,
      body: strings.noAlertsBody,
    });
  }
  alerts.push(
    {
      icon: 'schedule',
      tone: 'bg-surface-container text-primary',
      title: strings.tipReturnTitle,
      body: strings.tipReturnBody,
    },
    {
      icon: 'visibility',
      tone: 'bg-surface-container text-primary',
      title: strings.tipSkyTitle,
      body: strings.tipSkyBody,
    },
  );
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
