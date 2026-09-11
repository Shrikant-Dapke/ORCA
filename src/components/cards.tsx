import { useState } from 'react';
import type { OrcaAnswer, SafetyState } from '../types';
import type { Locale } from '../types';
import type { Strings } from '../i18n/strings';
import { speak } from '../hooks/useSpeech';
import type { FishingZone, RouteInfo } from '../../shared/orca-contract';

/** Shared chat cards: safety answer, zone, route, voice composer. */

const STATE_STYLE: Record<SafetyState, { verdictBg: string; verdictText: string; icon: string }> = {
  SAFE: { verdictBg: 'bg-tertiary-fixed/40', verdictText: 'text-tertiary', icon: 'verified' },
  CAUTION: { verdictBg: 'bg-caution-bg', verdictText: 'text-caution-text', icon: 'warning' },
  DANGER: { verdictBg: 'bg-error-container', verdictText: 'text-on-error-container', icon: 'crisis_alert' },
};

function Icon({ name, size = 20, fill = false, className = '' }: { name: string; size?: number; fill?: boolean; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined shrink-0 ${className}`}
      style={{ fontSize: size, fontVariationSettings: fill ? "'FILL' 1" : undefined }}
    >
      {name}
    </span>
  );
}

export function SafetyCard(props: { answer: OrcaAnswer; area: string; strings: Strings; locale?: Locale }) {
  const { answer, area, strings, locale } = props;
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const s = STATE_STYLE[answer.state];
  const live = answer.meta?.live === true;
  const gps = answer.meta?.locationMode === 'gps';
  const shareText = `${answer.headline} — ${answer.summary} Best time: ${answer.bestTime}. ${strings.recommendationLabel}: ${answer.recommendation}`;

  const handleShare = async () => {
    const copy = async () => {
      await navigator.clipboard.writeText(shareText);
      setShared(strings.copied);
    };
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ORCA', text: shareText });
        return;
      }
      await copy();
    } catch {
      try {
        await copy();
      } catch {
        setShared(null);
      }
    }
    window.setTimeout(() => setShared(null), 2500);
  };

  return (
    <div className="rounded-2xl rounded-tl-md bg-surface-lowest p-4 shadow-md">
      <div className="flex flex-wrap items-center gap-1.5">
        {live && (
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-secondary-fixed">
            <Icon name="check_circle" size={14} className="text-tertiary" />
            Open-Meteo forecast
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-secondary-fixed">
          <Icon name="check_circle" size={14} className="text-tertiary" />
          {gps ? 'GPS position' : 'Selected area'}
        </span>
      </div>
      <div className={`mt-2.5 flex items-start gap-2.5 rounded-xl p-3 ${s.verdictBg}`}>
        <Icon name={s.icon} size={22} fill className={`${s.verdictText} mt-0.5`} />
        <div>
          <p className={`font-headline text-[13px] font-bold uppercase tracking-wide ${s.verdictText}`}>{answer.headline}</p>
          <p className="mt-0.5 text-[14px] leading-relaxed text-on-surface">{answer.summary}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">For: {area}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-surface-low px-3 py-2.5">
        <Icon name="schedule" size={18} className="text-primary" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.bestTimeLabel}</p>
          <p className="text-sm font-bold text-on-surface">{answer.bestTime}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[
          { icon: 'waves', label: strings.seaLabel, value: answer.conditions.sea },
          { icon: 'air', label: strings.windLabel, value: answer.conditions.wind },
          { icon: 'partly_cloudy_day', label: strings.weatherLabel, value: answer.conditions.weather },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-surface-low px-2 py-2.5 text-center">
            <Icon name={c.icon} className="mx-auto text-primary" />
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">{c.label}</p>
            <p className="mt-0.5 text-[12.5px] font-bold leading-snug text-on-surface">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2.5 rounded-xl bg-caution-bg px-3 py-2.5 ring-1 ring-caution-ring/60">
        <Icon name="warning" size={18} className="text-caution-text" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-caution-text">{strings.importantLabel}</p>
          <p className="text-[13px] leading-snug text-on-surface">{answer.important}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-2.5 rounded-xl bg-secondary-fixed/40 px-3 py-2.5">
        <Icon name="explore" size={18} className="text-primary" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{strings.recommendationLabel}</p>
          <p className="text-[13px] leading-snug text-on-surface">{answer.recommendation}</p>
        </div>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-[13px] font-bold text-secondary transition hover:bg-surface-high active:scale-[0.99]"
      >
        <span className="flex items-center gap-1.5">
          <Icon name="psychology" size={16} />🔍 {strings.whyTitle}
        </span>
        <Icon name="expand_more" size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="msg-in mt-2 rounded-xl bg-surface-low p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.whyCheckedLabel}</p>
          <ul className="mt-1.5 space-y-1">
            {answer.checked.map((c) => (
              <li key={c} className="flex items-center gap-2 text-[13px] text-on-surface">
                <Icon name="check_circle" size={14} className="text-tertiary" />
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 border-t border-outline-variant pt-2.5 text-[13px] leading-relaxed text-on-surface">
            {answer.explanation}
          </p>
        </div>
      )}
      <div className="mt-2.5 flex flex-col gap-2 pt-1">
        <button
          onClick={() => speak(`${answer.headline}. ${answer.summary} ${strings.recommendationLabel}: ${answer.recommendation}`, locale)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 font-headline text-[14px] font-bold text-on-primary shadow-sm transition hover:bg-primary active:scale-[0.98]"
        >
          <Icon name="volume_up" /> {strings.listen}
        </button>
        <button
          onClick={() => void handleShare()}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-surface-container px-3 text-[13px] font-semibold text-primary transition hover:bg-surface-high active:scale-[0.99]"
        >
          <Icon name="share" className="text-secondary" /> {shared ?? strings.share}
        </button>
      </div>
    </div>
  );
}

export function ZoneCard(props: {
  strings: Strings;
  zones: FishingZone[];
  onViewMap: (zone: FishingZone) => void;
  onRoute: (zone: FishingZone) => void;
}) {
  const { strings, zones, onViewMap, onRoute } = props;
  const [first, ...rest] = zones;
  if (!first) return null;
  return (
    <div className="rounded-2xl bg-surface-lowest p-4 shadow-md">
      <p className="flex items-center gap-1.5 font-headline text-[14px] font-bold text-on-surface">🎣 {strings.zoneTitle}</p>
      <div className="mt-2 rounded-xl bg-surface-low p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-headline text-[22px] font-bold text-primary">
            {first.distanceKm} km {first.bearingCompass}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              first.potential === 'good' ? 'bg-tertiary-fixed/50 text-tertiary' : 'bg-caution-bg text-caution-text'
            }`}
          >
            {first.potential === 'good' ? '●' : '◐'} {first.name}
          </span>
        </div>
        {first.live && (
          <p className="mt-1 text-[12px] text-on-surface-variant">
            {strings.liveNote} · {first.source}
          </p>
        )}
        {rest.length > 0 && (
          <p className="mt-1 text-[12px] text-on-surface-variant">
            +{rest.length} {rest[0].distanceKm} km {rest[0].bearingCompass}
          </p>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          onClick={() => onViewMap(first)}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-container px-3 font-headline text-[13px] font-bold text-on-primary transition hover:bg-primary active:scale-[0.98]"
        >
          <Icon name="map" /> {strings.viewMap}
        </button>
        <button
          onClick={() => onRoute(first)}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-container px-3 text-[13px] font-bold text-primary transition hover:bg-surface-high active:scale-[0.98]"
        >
          <Icon name="route" /> {strings.safestRoute}
        </button>
      </div>
    </div>
  );
}

export function RouteCard(props: { strings: Strings; route: RouteInfo; onViewMap: () => void }) {
  const { strings, route, onViewMap } = props;
  const tone =
    route.riskLevel === 'high'
      ? 'bg-error-container text-on-error-container'
      : route.riskLevel === 'moderate'
        ? 'bg-caution-bg text-caution-text'
        : 'bg-tertiary-fixed/50 text-tertiary';
  return (
    <div className="rounded-2xl bg-surface-lowest p-4 shadow-md">
      <p className="flex items-center gap-1.5 font-headline text-[14px] font-bold text-on-surface">
        <Icon name="route" className="text-primary" /> {strings.routeTitle}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-surface-low p-3">
        <p className="font-headline text-[20px] font-bold text-primary">
          {route.distanceKm} km {route.bearingCompass}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
          {route.riskLevel} ({route.riskScore}/100)
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-on-surface-variant">{route.note}</p>
      <button
        onClick={onViewMap}
        className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary-container px-3 font-headline text-[13px] font-bold text-on-primary transition hover:bg-primary active:scale-[0.98]"
      >
        <Icon name="map" /> {strings.viewMap}
      </button>
    </div>
  );
}

export function Composer(props: {
  strings: Strings;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  micSupported: boolean;
  listening: boolean;
  interim: string;
  busy: boolean;
  voiceFallback: string | null;
}) {
  const { strings, value, onChange, onSend, onMic, micSupported, listening, interim, busy, voiceFallback } = props;
  const canSend = value.trim().length > 0 && !busy;
  return (
    <div className="px-4 pb-2 pt-2">
      {voiceFallback && (
        <p className="msg-in mb-2 rounded-xl bg-caution-bg px-3 py-2 text-center text-xs font-medium text-caution-text ring-1 ring-caution-ring">
          {voiceFallback}
        </p>
      )}
      <div className="rounded-2xl bg-surface-lowest p-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-bold text-on-surface">
            <span className={`h-2.5 w-2.5 rounded-full ${listening ? 'animate-pulse bg-error' : 'bg-secondary'}`} />
            {listening ? strings.listening : strings.micTitle}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-medium text-primary">
            <Icon name="language" size={14} /> English
          </span>
        </div>
        {(listening || interim) && (
          <p className="msg-in mt-2 rounded-xl bg-error-container/60 px-3 py-2 text-center text-xs font-semibold text-on-error-container">
            🎙️ {strings.listening}…{interim ? ` “${interim}”` : ''}
          </p>
        )}
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-low px-3.5 py-2.5 shadow-inner ring-1 ring-transparent focus-within:ring-secondary/50">
            <Icon name="hearing" className="text-primary" />
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={strings.inputPlaceholder}
              aria-label="Type your question"
              disabled={busy}
              maxLength={500}
              className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-on-surface placeholder:text-on-surface-variant/70 outline-none disabled:opacity-60"
            />
            {listening ? (
              <span className="flex shrink-0 items-center gap-1 px-1" aria-hidden>
                <span className="voice-bar h-3 w-1 rounded-full bg-secondary" />
                <span className="voice-bar h-5 w-1 rounded-full bg-primary" style={{ animationDelay: '0.15s' }} />
                <span className="voice-bar h-2 w-1 rounded-full bg-secondary" style={{ animationDelay: '0.3s' }} />
                <span className="voice-bar h-6 w-1 rounded-full bg-primary-container" style={{ animationDelay: '0.45s' }} />
              </span>
            ) : (
              <button
                onClick={onSend}
                disabled={!canSend}
                aria-label="Send"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition hover:bg-secondary active:scale-90 disabled:opacity-30"
              >
                <Icon name="send" />
              </button>
            )}
          </div>
          <button
            onClick={onMic}
            aria-label={listening ? 'Stop listening' : 'Speak your question'}
            title={strings.voiceHint}
            className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-on-primary shadow-lg transition active:scale-90 ${
              listening ? 'mic-live bg-error' : 'bg-gradient-to-tr from-primary to-secondary-container hover:brightness-110'
            }`}
          >
            <Icon name="mic" size={30} fill />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-on-surface-variant">
        {micSupported ? `🎤 ${strings.voiceHint}` : `⌨️ ${strings.voiceNotSupported}`}
      </p>
    </div>
  );
}
