import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  OctagonX,
  Volume2,
  Waves,
  Wind,
  CloudSun,
  TriangleAlert,
  Compass,
} from 'lucide-react';
import type { OrcaAnswer, SafetyState } from '../types';
import type { Strings } from '../i18n/strings';
import { speak } from '../hooks/useSpeech';

const STATE_STYLE: Record<
  SafetyState,
  { dot: string; badge: string; ring: string; glow: string; icon: typeof CheckCircle2 }
> = {
  SAFE: {
    dot: '🟢',
    badge: 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/40',
    ring: 'ring-emerald-300/25',
    glow: 'shadow-[0_0_36px_rgba(52,211,153,0.18)]',
    icon: CheckCircle2,
  },
  CAUTION: {
    dot: '🟡',
    badge: 'bg-amber-400/15 text-amber-200 ring-amber-300/40',
    ring: 'ring-amber-300/30',
    glow: 'shadow-[0_0_36px_rgba(251,191,36,0.20)]',
    icon: AlertTriangle,
  },
  DANGER: {
    dot: '🔴',
    badge: 'bg-rose-500/15 text-rose-200 ring-rose-400/50',
    ring: 'ring-rose-400/35',
    glow: 'shadow-[0_0_36px_rgba(244,63,94,0.28)]',
    icon: OctagonX,
  },
};

interface Props {
  answer: OrcaAnswer;
  area: string;
  strings: Strings;
}

export default function SafetyCard({ answer, area, strings }: Props) {
  const [open, setOpen] = useState(false);
  const s = STATE_STYLE[answer.state];
  const Icon = s.icon;

  return (
    <div className={`rounded-3xl bg-white/[0.07] p-4 ring-1 ${s.ring} ${s.glow} backdrop-blur`}>
      {/* Safety badge */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-extrabold tracking-wide ring-1 ${s.badge}`}
        >
          <Icon className="h-4 w-4" />
          {s.dot} {answer.headline}
        </span>
        <button
          onClick={() => speak(`${answer.headline}. ${answer.summary} ${strings.recommendationLabel}: ${answer.recommendation}`)}
          title="Listen"
          aria-label="Listen to this answer"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-cyan-100 ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95"
        >
          <Volume2 className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2.5 text-[15px] leading-relaxed text-white">{answer.summary}</p>
      <p className="mt-1 text-xs text-cyan-100/60">For: {area}</p>

      {/* Best time */}
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-[#04121f]/60 px-3 py-2.5 ring-1 ring-white/10">
        <Clock className="h-4 w-4 shrink-0 text-cyan-300" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-200/70">
            {strings.bestTimeLabel}
          </p>
          <p className="text-sm font-bold text-white">{answer.bestTime}</p>
        </div>
      </div>

      {/* Marine conditions */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[
          { icon: Waves, label: strings.seaLabel, value: answer.conditions.sea },
          { icon: Wind, label: strings.windLabel, value: answer.conditions.wind },
          { icon: CloudSun, label: strings.weatherLabel, value: answer.conditions.weather },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-2xl bg-[#04121f]/60 px-2.5 py-2.5 text-center ring-1 ring-white/10"
          >
            <c.icon className="mx-auto h-4 w-4 text-cyan-300" />
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/70">
              {c.label}
            </p>
            <p className="mt-0.5 text-[13px] font-bold leading-snug text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Important warning */}
      <div className="mt-2 flex gap-2.5 rounded-2xl bg-amber-400/10 px-3 py-2.5 ring-1 ring-amber-300/25">
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">
            {strings.importantLabel}
          </p>
          <p className="text-[13px] leading-snug text-amber-50">{answer.important}</p>
        </div>
      </div>

      {/* Recommendation */}
      <div className="mt-2 flex gap-2.5 rounded-2xl bg-cyan-400/10 px-3 py-2.5 ring-1 ring-cyan-300/25">
        <Compass className="h-4 w-4 shrink-0 text-cyan-300" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-200/80">
            {strings.recommendationLabel}
          </p>
          <p className="text-[13px] leading-snug text-cyan-50">{answer.recommendation}</p>
        </div>
      </div>

      {/* Why explanation */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-between rounded-2xl bg-white/[0.06] px-3.5 py-3 text-sm font-bold text-cyan-100 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.99]"
      >
        <span>🔍 {strings.whyTitle}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="msg-in mt-2 rounded-2xl bg-[#04121f]/60 p-3.5 ring-1 ring-white/10">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200/70">
            {strings.whyCheckedLabel}
          </p>
          <ul className="mt-1.5 space-y-1">
            {answer.checked.map((c) => (
              <li key={c} className="flex items-center gap-2 text-[13px] text-cyan-50">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 border-t border-white/10 pt-2.5 text-[13px] leading-relaxed text-slate-200">
            {answer.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
