import { AlertTriangle, CheckCircle2, OctagonX, Waves, Wind, CloudSun, LifeBuoy, MessageCircle } from 'lucide-react';
import type { Strings } from '../i18n/strings';

/** Simple companion panels for bottom-nav tabs (no dashboard — just sea summary, alerts, help). */

export function SeaPanel({ strings, area }: { strings: Strings; area: string }) {
  const rows = [
    { icon: Waves, label: strings.seaLabel, value: 'Slightly rough after noon' },
    { icon: Wind, label: strings.windLabel, value: 'Moderate now, strong later' },
    { icon: CloudSun, label: strings.weatherLabel, value: 'Cloudy, clearing tomorrow' },
  ];
  return (
    <div className="px-4 pb-4">
      <div className="rounded-3xl bg-white/[0.07] p-4 ring-1 ring-cyan-200/15 backdrop-blur">
        <h2 className="text-base font-extrabold text-white">{strings.seaTitle}</h2>
        <p className="text-xs text-cyan-100/60">{area}</p>
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 rounded-2xl bg-[#04121f]/60 px-3 py-2.5 ring-1 ring-white/10">
              <r.icon className="h-5 w-5 shrink-0 text-cyan-300" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-200/70">{r.label}</p>
                <p className="text-sm font-bold text-white">{r.value}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-2xl bg-amber-400/10 px-3 py-2.5 text-[13px] text-amber-50 ring-1 ring-amber-300/25">
          ⚠️ {strings.importantLabel}: winds rise after 12:00 PM — plan a morning return.
        </p>
      </div>
    </div>
  );
}

export function AlertsPanel({ strings, area }: { strings: Strings; area: string }) {
  const alerts = [
    {
      icon: OctagonX,
      tone: 'text-rose-200 bg-rose-500/15 ring-rose-400/40',
      title: 'Marine warning — strong winds',
      body: `Active for ${area}. Small boats should not go far from shore after noon.`,
    },
    {
      icon: AlertTriangle,
      tone: 'text-amber-200 bg-amber-400/15 ring-amber-300/40',
      title: 'High waves after 12:00 PM',
      body: 'Waves may grow through the afternoon. Return before conditions worsen.',
    },
    {
      icon: CheckCircle2,
      tone: 'text-emerald-200 bg-emerald-400/15 ring-emerald-300/40',
      title: 'Tomorrow morning looks safe',
      body: 'Calm sea and clear skies expected 6:00 AM – 12:00 PM.',
    },
  ];
  return (
    <div className="px-4 pb-4">
      <div className="rounded-3xl bg-white/[0.07] p-4 ring-1 ring-cyan-200/15 backdrop-blur">
        <h2 className="text-base font-extrabold text-white">{strings.alertsTitle}</h2>
        <p className="text-xs text-cyan-100/60">{area}</p>
        <div className="mt-3 space-y-2">
          {alerts.map((a) => (
            <div key={a.title} className="flex gap-3 rounded-2xl bg-[#04121f]/60 p-3 ring-1 ring-white/10">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${a.tone}`}>
                <a.icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">{a.title}</p>
                <p className="text-[13px] leading-snug text-slate-300">{a.body}</p>
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
      <div className="rounded-3xl bg-white/[0.07] p-4 ring-1 ring-cyan-200/15 backdrop-blur">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-white">
          <LifeBuoy className="h-5 w-5 text-cyan-300" /> {strings.helpTitle}
        </h2>
        <ul className="mt-3 space-y-2">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-2.5 rounded-2xl bg-[#04121f]/60 px-3 py-2.5 text-[13px] leading-snug text-slate-200 ring-1 ring-white/10">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-400/20 text-xs font-extrabold text-cyan-200 ring-1 ring-cyan-300/30">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ul>
        <button
          onClick={() => onAsk('Can I go fishing tomorrow?')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-extrabold text-[#04121f] transition hover:brightness-110 active:scale-[0.99]"
        >
          <MessageCircle className="h-4 w-4" /> Try an example question
        </button>
      </div>
    </div>
  );
}
