import { useState } from 'react';
import type { OrcaAnswer, SafetyState } from '../types';
import type { Locale } from '../types';
import type { Strings } from '../i18n/strings';
import { speak } from '../hooks/useSpeech';

const STATE_STYLE: Record<
  SafetyState,
  { badge: string; verdictBg: string; verdictText: string; icon: string }
> = {
  SAFE: {
    badge: 'bg-tertiary text-on-tertiary',
    verdictBg: 'bg-tertiary-fixed/40',
    verdictText: 'text-tertiary',
    icon: 'verified',
  },
  CAUTION: {
    badge: 'bg-caution-bg text-caution-text ring-1 ring-caution-ring',
    verdictBg: 'bg-caution-bg',
    verdictText: 'text-caution-text',
    icon: 'warning',
  },
  DANGER: {
    badge: 'bg-error text-on-primary',
    verdictBg: 'bg-error-container',
    verdictText: 'text-on-error-container',
    icon: 'crisis_alert',
  },
};

interface Props {
  answer: OrcaAnswer;
  area: string;
  strings: Strings;
  locale?: Locale;
}

/**
 * Stitch assistant message: source chips, verdict block, sea/wind/weather,
 * warning, recommendation, expandable explanation, Listen + Share actions.
 * Every value comes from the ORCA backend — no Stitch demo copy.
 */
export default function SafetyCard({ answer, area, strings, locale }: Props) {
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const s = STATE_STYLE[answer.state];
  const live = answer.meta?.live === true;
  const gps = answer.meta?.locationMode === 'gps';

  const shareText = `${answer.headline} — ${answer.summary} Best time: ${answer.bestTime}. ${strings.recommendationLabel}: ${answer.recommendation}`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ORCA', text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setShared(strings.copied);
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
        setShared(strings.copied);
      } catch {
        setShared(null);
      }
    }
    window.setTimeout(() => setShared(null), 2500);
  };

  return (
    <div className="rounded-2xl rounded-tl-md bg-surface-lowest p-4 shadow-md">
      {/* Source chips — real provenance only */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-secondary-fixed">
          <span className="material-symbols-outlined text-[14px] text-tertiary">check_circle</span>
          {live ? 'Open-Meteo forecast' : 'Demo data'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-secondary-fixed">
          <span className="material-symbols-outlined text-[14px] text-tertiary">check_circle</span>
          {gps ? 'GPS position' : 'Selected area'}
        </span>
      </div>

      {/* Verdict */}
      <div className={`mt-2.5 flex items-start gap-2.5 rounded-xl p-3 ${s.verdictBg}`}>
        <span className={`material-symbols-outlined text-[22px] ${s.verdictText} mt-0.5 shrink-0`} style={{ fontVariationSettings: "'FILL' 1" }}>
          {s.icon}
        </span>
        <div>
          <p className={`font-headline text-[13px] font-bold uppercase tracking-wide ${s.verdictText}`}>
            {answer.headline}
          </p>
          <p className="mt-0.5 text-[14px] leading-relaxed text-on-surface">{answer.summary}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">For: {area}</p>
        </div>
      </div>

      {/* Best time */}
      <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-surface-low px-3 py-2.5">
        <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {strings.bestTimeLabel}
          </p>
          <p className="text-sm font-bold text-on-surface">{answer.bestTime}</p>
        </div>
      </div>

      {/* Marine conditions */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[
          { icon: 'waves', label: strings.seaLabel, value: answer.conditions.sea },
          { icon: 'air', label: strings.windLabel, value: answer.conditions.wind },
          { icon: 'partly_cloudy_day', label: strings.weatherLabel, value: answer.conditions.weather },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-surface-low px-2 py-2.5 text-center">
            <span className="material-symbols-outlined text-[20px] text-primary">{c.icon}</span>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              {c.label}
            </p>
            <p className="mt-0.5 text-[12.5px] font-bold leading-snug text-on-surface">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Important warning */}
      <div className="mt-2 flex gap-2.5 rounded-xl bg-caution-bg px-3 py-2.5 ring-1 ring-caution-ring/60">
        <span className="material-symbols-outlined text-[18px] text-caution-text">warning</span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-caution-text">
            {strings.importantLabel}
          </p>
          <p className="text-[13px] leading-snug text-on-surface">{answer.important}</p>
        </div>
      </div>

      {/* Recommendation */}
      <div className="mt-2 flex gap-2.5 rounded-xl bg-secondary-fixed/40 px-3 py-2.5">
        <span className="material-symbols-outlined text-[18px] text-primary">explore</span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {strings.recommendationLabel}
          </p>
          <p className="text-[13px] leading-snug text-on-surface">{answer.recommendation}</p>
        </div>
      </div>

      {/* Why explanation */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-[13px] font-bold text-secondary transition hover:bg-surface-high active:scale-[0.99]"
      >
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">psychology</span>
          🔍 {strings.whyTitle}
        </span>
        <span className={`material-symbols-outlined text-[18px] transition-transform ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="msg-in mt-2 rounded-xl bg-surface-low p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {strings.whyCheckedLabel}
          </p>
          <ul className="mt-1.5 space-y-1">
            {answer.checked.map((c) => (
              <li key={c} className="flex items-center gap-2 text-[13px] text-on-surface">
                <span className="material-symbols-outlined text-[14px] text-tertiary">check_circle</span>
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 border-t border-outline-variant pt-2.5 text-[13px] leading-relaxed text-on-surface">
            {answer.explanation}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-2.5 flex flex-col gap-2 pt-1">
        <button
          onClick={() => speak(`${answer.headline}. ${answer.summary} ${strings.recommendationLabel}: ${answer.recommendation}`, locale)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 font-headline text-[14px] font-bold text-on-primary shadow-sm transition hover:bg-primary active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">volume_up</span>
          {strings.listen}
        </button>
        <button
          onClick={() => void handleShare()}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-surface-container px-3 text-[13px] font-semibold text-primary transition hover:bg-surface-high active:scale-[0.99]"
        >
          <span className="material-symbols-outlined text-[20px] text-secondary">share</span>
          {shared ?? strings.share}
        </button>
      </div>
    </div>
  );
}
