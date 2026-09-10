import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getStrings, LANGUAGES, type Strings } from './i18n/strings';
import { answerFor } from './mock/brain';
import { sendChat } from './api/client';
import { requestBrowserLocation, type GpsCoordinates } from './location/geolocation';
import { speak, useSpeechRecognition } from './hooks/useSpeech';
import type { ChatMessage, Locale, OrcaAnswer, SafetyState } from './types';
import type { FishingZone, RouteInfo } from '../shared/orca-contract';

/* =====================================================================
   ORCA — single-file fisherman UI.
   Everything the fisherman sees lives here: header, area card, quick
   questions, chat (safety / zone / route cards), voice composer, bottom
   nav (sea / alerts / help), and the map overlay. The backend contract
   (ORCAResponse) is consumed unchanged.
   ===================================================================== */

type Tab = 'chat' | 'sea' | 'alerts' | 'help';

type GpsUiState = 'idle' | 'requesting' | 'active' | 'failed';

let idCounter = 0;
const nid = () => `m${Date.now()}_${idCounter++}`;

const CHIP_EMOJI = ['🌊', '🌤️', '📍', '💨', '⚠️'];

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

/* ------------------------------- header ------------------------------- */

function Header(props: {
  strings: Strings;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onNewChat: () => void;
  gpsActive: boolean;
  live: boolean;
}) {
  const { strings, locale, onLocale, onNewChat, gpsActive, live } = props;
  return (
    <header className="relative z-10 bg-surface/85 px-4 pb-2 pt-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary shadow-sm">
            <Icon name="sailing" size={22} fill className="text-on-primary" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-headline text-[17px] font-bold leading-tight text-primary">
              {strings.brand}
            </span>
            <span className="truncate text-[11px] font-medium text-on-surface-variant">{strings.tagline}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex h-9 items-center gap-1 rounded-full bg-surface-low px-3 text-[12px] font-semibold text-primary">
            <Icon name="translate" size={16} />
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
            <Icon name="refresh" />
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
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${live ? 'text-tertiary' : 'text-on-surface-variant'}`}>
          <Icon name="sensors" size={14} />
          {live ? strings.liveNote : strings.demoNote}
        </span>
      </div>
    </header>
  );
}

/* ------------------------------ area card ----------------------------- */

function AreaCard(props: {
  strings: Strings;
  area: string;
  onArea: (a: string) => void;
  gps: GpsUiState;
  onUseLocation: () => void;
  onClearLocation: () => void;
  seaLine: string;
  live: boolean;
}) {
  const { strings, area, onArea, gps, onUseLocation, onClearLocation, seaLine, live } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(area);
  return (
    <div className="relative z-10 px-4">
      <div className="rounded-2xl bg-tertiary-fixed/30 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tertiary-container text-on-tertiary">
              <Icon name="anchor" fill />
            </div>
            <div className="flex min-w-0 flex-col">
              {editing ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim()) onArea(draft.trim());
                    setEditing(false);
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={strings.fishingAreaValue}
                    maxLength={60}
                    className="w-full rounded-lg bg-surface-lowest px-2 py-1 text-sm text-on-surface outline outline-1 outline-outline-variant"
                  />
                  <button type="submit" className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-on-primary">
                    OK
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setDraft(area);
                    setEditing(true);
                  }}
                  className="group flex min-w-0 items-center gap-1 text-left"
                >
                  <span className="truncate font-headline text-[15px] font-bold leading-tight text-primary">{area}</span>
                  <Icon name="edit" size={14} className="text-on-surface-variant group-hover:text-primary" />
                </button>
              )}
              <p className="truncate text-[12px] text-on-surface-variant">{seaLine || strings.fishingAreaHint}</p>
            </div>
          </div>
          <span className={`flex shrink-0 items-center gap-1 text-[11px] font-bold ${live ? 'text-tertiary' : 'text-on-surface-variant'}`}>
            <span className={`h-2 w-2 rounded-full ${live ? 'animate-ping bg-tertiary' : 'bg-outline'}`} />
            {live ? strings.liveNote : strings.demoNote}
          </span>
        </div>
        <div className="mt-2">
          {gps === 'active' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tertiary px-2.5 py-1 text-[11px] font-bold text-on-tertiary">
              <span className="h-1.5 w-1.5 rounded-full bg-on-tertiary" />
              📍 {strings.usingYourLocation}
              <button
                onClick={onClearLocation}
                aria-label={strings.stopUsingLocation}
                title={strings.stopUsingLocation}
                className="grid h-4 w-4 place-items-center rounded-full bg-black/15 transition hover:bg-black/25 active:scale-90"
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ) : (
            <button
              onClick={onUseLocation}
              disabled={gps === 'requesting'}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-lowest px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm transition hover:bg-surface-container active:scale-95 disabled:opacity-60"
            >
              <Icon name="navigation" size={14} />
              {gps === 'requesting' ? strings.findingLocation : strings.useMyLocation}
            </button>
          )}
          {gps === 'failed' && (
            <p className="msg-in mt-1 text-[11px] font-medium text-on-error-container">{strings.locationDenied}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- quick questions -------------------------- */

function QuickAsk(props: { strings: Strings; onAsk: (q: string) => void; disabled?: boolean }) {
  const { strings, onAsk, disabled } = props;
  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl bg-surface-lowest p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {strings.quickTitle}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-secondary">
            <Icon name="touch_app" size={14} /> 1-Tap
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {strings.suggested.map((q, i) => (
            <button
              key={q}
              disabled={disabled}
              onClick={() => onAsk(q)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium shadow-sm transition active:scale-95 disabled:opacity-50 ${
                i === 0 ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container text-on-surface'
              }`}
            >
              <span>{CHIP_EMOJI[i % CHIP_EMOJI.length]}</span>
              <span>{q}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ safety card --------------------------- */

const STATE_STYLE: Record<SafetyState, { verdictBg: string; verdictText: string; icon: string }> = {
  SAFE: { verdictBg: 'bg-tertiary-fixed/40', verdictText: 'text-tertiary', icon: 'verified' },
  CAUTION: { verdictBg: 'bg-caution-bg', verdictText: 'text-caution-text', icon: 'warning' },
  DANGER: { verdictBg: 'bg-error-container', verdictText: 'text-on-error-container', icon: 'crisis_alert' },
};

function SafetyCard(props: { answer: OrcaAnswer; area: string; strings: Strings; locale: Locale }) {
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
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-secondary-fixed">
          <Icon name="check_circle" size={14} className="text-tertiary" />
          {live ? 'Open-Meteo forecast' : 'Demo data'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-secondary-fixed">
          <Icon name="check_circle" size={14} className="text-tertiary" />
          {gps ? 'GPS position' : 'Selected area'}
        </span>
      </div>

      <div className={`mt-2.5 flex items-start gap-2.5 rounded-xl p-3 ${s.verdictBg}`}>
        <Icon name={s.icon} size={22} fill className={`${s.verdictText} mt-0.5`} />
        <div>
          <p className={`font-headline text-[13px] font-bold uppercase tracking-wide ${s.verdictText}`}>
            {answer.headline}
          </p>
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

/* --------------------------- zone + route cards ------------------------ */

function ZoneCard(props: {
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
      <p className="flex items-center gap-1.5 font-headline text-[14px] font-bold text-on-surface">
        🎣 {strings.zoneTitle}
      </p>
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
        <p className="mt-1 text-[12px] text-on-surface-variant">
          {first.live ? strings.liveNote : strings.demoNote} · {first.source}
        </p>
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

function RouteCard(props: { strings: Strings; route: RouteInfo; onViewMap: () => void }) {
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

/* -------------------------------- composer ----------------------------- */

function Composer(props: {
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
    <div className="relative z-10 px-4 pb-2 pt-2">
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

/* ------------------------------- bottom nav ---------------------------- */

function BottomNav(props: { strings: Strings; tab: Tab; onTab: (t: Tab) => void; alertCount: number }) {
  const { strings, tab, onTab, alertCount } = props;
  const items: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'chat', label: strings.navChat, icon: 'smart_toy' },
    { id: 'sea', label: strings.navSea, icon: 'waves' },
    { id: 'alerts', label: strings.navAlerts, icon: 'crisis_alert', badge: alertCount },
    { id: 'help', label: strings.navHelp, icon: 'help' },
  ];
  return (
    <nav aria-label="Main" className="relative z-10 bg-surface/85 backdrop-blur-xl" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-4 grid grid-cols-4 gap-1 rounded-t-3xl px-2 pt-1 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onTab(it.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition active:scale-95 ${
                active ? 'font-bold text-primary-container' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name={it.icon} size={26} />
              {it.label}
              {typeof it.badge === 'number' && it.badge > 0 && (
                <span className="absolute right-4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-extrabold text-on-primary">
                  {it.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* --------------------------------- panels ------------------------------ */

function SeaPanel(props: { strings: Strings; area: string; live?: OrcaAnswer | null }) {
  const { strings, area, live } = props;
  if (!live) {
    return (
      <div className="px-4 pb-4">
        <div className="rounded-2xl bg-surface-lowest p-4 text-center shadow-md">
          <Icon name="waves" size={32} className="mx-auto text-secondary" />
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
              <Icon name={r.icon} size={22} className="text-primary" />
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

function AlertsPanel(props: { strings: Strings; area: string; live?: OrcaAnswer | null }) {
  const { strings, area, live } = props;
  const alerts: { icon: string; tone: string; title: string; body: string }[] = [];
  if (live && live.state !== 'SAFE') {
    alerts.push({
      icon: live.state === 'DANGER' ? 'crisis_alert' : 'warning',
      tone: live.state === 'DANGER' ? 'bg-error-container text-on-error-container' : 'bg-caution-bg text-caution-text',
      title: live.headline,
      body: live.important,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      icon: 'check_circle',
      tone: 'bg-tertiary-fixed/40 text-tertiary',
      title: strings.noAlertsTitle,
      body: strings.noAlertsBody,
    });
  }
  alerts.push(
    { icon: 'schedule', tone: 'bg-surface-container text-primary', title: strings.tipReturnTitle, body: strings.tipReturnBody },
    { icon: 'visibility', tone: 'bg-surface-container text-primary', title: strings.tipSkyTitle, body: strings.tipSkyBody },
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
                <Icon name={a.icon} />
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

function HelpPanel(props: { strings: Strings; onAsk: (q: string) => void }) {
  const { strings, onAsk } = props;
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
          <Icon name="help" size={22} className="text-primary" /> {strings.helpTitle}
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
          <Icon name="smart_toy" /> Try an example question
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- map -------------------------------- */

export interface MapUser {
  latitude: number;
  longitude: number;
}

const OFFLINE_TILE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce9f2"/><path d="M0 200 Q64 188 128 200 T256 200 V256 H0 Z" fill="#c2d8e6"/><path d="M0 216 Q64 206 128 216 T256 216 V256 H0 Z" fill="#b0cddd"/></svg>`,
  );

function emojiIcon(emoji: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${emoji}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function MapOverlay(props: {
  strings: Strings;
  user: MapUser | null;
  zones: FishingZone[];
  route?: RouteInfo | null;
  demoWaters: boolean;
  onClose: () => void;
}) {
  const { strings, user, zones, route, demoWaters, onClose } = props;
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [tilesDown, setTilesDown] = useState(false);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true }).setView([12, 77], 5);
    mapRef.current = map;
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
      errorTileUrl: OFFLINE_TILE,
    });
    layer.on('tileerror', () => setTilesDown(true));
    layer.addTo(map);
    const bounds: Array<[number, number]> = [];
    if (user) {
      L.marker([user.latitude, user.longitude], { icon: emojiIcon('🧍'), title: 'You' }).addTo(map);
      bounds.push([user.latitude, user.longitude]);
    }
    for (const z of zones) {
      L.marker([z.latitude, z.longitude], { icon: emojiIcon('🎣'), title: z.name }).addTo(map);
      bounds.push([z.latitude, z.longitude]);
    }
    if (route && route.waypoints.length >= 2) {
      L.polyline(
        route.waypoints.map((w) => [w.latitude, w.longitude] as [number, number]),
        { color: '#00507d', weight: 4 },
      ).addTo(map);
    }
    if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds).pad(0.35));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [user, zones, route]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-label={strings.viewMap}>
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <p className="font-headline text-[16px] font-bold text-on-surface">{strings.viewMap}</p>
        <button
          onClick={onClose}
          aria-label={strings.closeMap}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface-low text-primary active:scale-95"
        >
          <Icon name="close" size={22} />
        </button>
      </div>
      <div ref={divRef} className="min-h-0 flex-1" />
      {tilesDown && (
        <p role="status" className="msg-in bg-caution-bg px-4 py-1.5 text-center text-[11px] font-semibold text-caution-text">
          {strings.mapTilesDown}
        </p>
      )}
      <p className="px-4 py-2 text-center text-[11px] text-on-surface-variant">
        {demoWaters ? `${strings.demoMapNote} · ` : ''}
        {!user ? `${strings.locationDenied}` : ''}
      </p>
    </div>
  );
}

/* ---------------------------------- app --------------------------------- */

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const strings = getStrings(locale);

  const [area, setArea] = useState<string>(strings.fishingAreaValue);
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [liveData, setLiveData] = useState(false);
  const [coords, setCoords] = useState<GpsCoordinates | null>(null);
  const [gpsUi, setGpsUi] = useState<GpsUiState>('idle');
  const [mapView, setMapView] = useState<{
    user: MapUser | null;
    zones: FishingZone[];
    route?: RouteInfo | null;
    demoWaters: boolean;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, tab]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setTab('chat');
      setBusy(true);
      setMessages((m) => [...m, { id: nid(), role: 'user', text: q, createdAt: Date.now() }]);
      setInput('');
      try {
        const answer = await sendChat(q, area, {
          ...(coords ? { coordinates: coords } : {}),
          locale,
        });
        setApiError(null);
        setLiveData(answer.meta?.live === true);
        setMessages((m) => [...m, { id: nid(), role: 'assistant', text: '', answer, createdAt: Date.now() }]);
      } catch {
        setApiError('Offline mode — could not reach the ORCA server. Showing a saved demo answer.');
        setLiveData(false);
        setMessages((m) => [
          ...m,
          { id: nid(), role: 'assistant', text: '', answer: answerFor(q), createdAt: Date.now() },
        ]);
      }
      setBusy(false);
    },
    [busy, area, coords, locale],
  );

  const handleUseLocation = useCallback(async () => {
    setGpsUi('requesting');
    try {
      const fix = await requestBrowserLocation();
      setCoords(fix);
      setGpsUi('active');
    } catch {
      setCoords(null);
      setGpsUi('failed');
    }
  }, []);

  const handleClearLocation = useCallback(() => {
    setCoords(null);
    setGpsUi('idle');
  }, []);

  const speech = useSpeechRecognition(
    useCallback(
      (text: string) => {
        setInput(text);
        void ask(text);
      },
      [ask],
    ),
    locale,
  );

  const handleMic = useCallback(() => {
    if (!speech.supported) {
      setVoiceFallback(strings.voiceNotSupported);
      window.setTimeout(() => setVoiceFallback(null), 4500);
      return;
    }
    setVoiceFallback(null);
    if (speech.listening) speech.stop();
    else speech.start();
  }, [strings.voiceNotSupported, speech.supported, speech.listening, speech.start, speech.stop]);

  const newChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setApiError(null);
    setLiveData(false);
    setTab('chat');
  }, []);

  const showGreeting = messages.length === 0 && !busy;

  const openMap = useCallback(
    (zones: FishingZone[], route?: RouteInfo | null) => {
      setMapView({
        user: coords ? { latitude: coords.latitude, longitude: coords.longitude } : null,
        zones,
        route: route ?? null,
        demoWaters: !coords,
      });
    },
    [coords],
  );

  const askRoute = useCallback(
    (zone: FishingZone) => {
      void ask(`Show me the safest route to ${zone.name}.`);
    },
    [ask],
  );

  const lastAnswer = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.answer);
    return last?.answer ?? null;
  }, [messages]);
  const alertCount = lastAnswer && lastAnswer.state !== 'SAFE' ? 1 : 0;

  const seaLine = useMemo(() => {
    if (!lastAnswer) return '';
    const c = lastAnswer.conditions;
    return `Sea: ${c.sea} • Wind: ${c.wind}`;
  }, [lastAnswer]);

  return (
    <div className="orca-bg flex h-full justify-center">
      <div className="relative flex h-full w-full max-w-[520px] flex-col overflow-hidden sm:border-x sm:border-outline-variant/60">
        <Header
          strings={strings}
          locale={locale}
          onLocale={setLocale}
          onNewChat={newChat}
          gpsActive={gpsUi === 'active'}
          live={liveData}
        />
        <AreaCard
          strings={strings}
          area={area}
          onArea={setArea}
          gps={gpsUi}
          onUseLocation={() => void handleUseLocation()}
          onClearLocation={handleClearLocation}
          seaLine={seaLine}
          live={liveData}
        />

        {tab === 'chat' && <QuickAsk strings={strings} onAsk={(q) => void ask(q)} disabled={busy} />}

        <main ref={scrollRef} className="chat-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
          {tab === 'sea' && <SeaPanel strings={strings} area={area} live={lastAnswer} />}
          {tab === 'alerts' && <AlertsPanel strings={strings} area={area} live={lastAnswer} />}
          {tab === 'help' && <HelpPanel strings={strings} onAsk={(q) => void ask(q)} />}

          {tab === 'chat' && (
            <div className="space-y-3">
              {showGreeting && (
                <section className="msg-in rounded-2xl bg-surface-lowest p-5 text-center shadow-md">
                  <div className="orca-float mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-tr from-primary to-secondary-container shadow-lg">
                    <Icon name="sailing" size={34} fill className="text-on-primary" />
                  </div>
                  <h2 className="mt-3 font-headline text-lg font-bold leading-snug text-on-surface">
                    {strings.greetingTitle}
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-on-surface-variant">
                    {strings.greetingBody}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                    <Icon name="waves" size={14} className="text-secondary" />
                    <span>🟢 Safe &nbsp;·&nbsp; 🟡 Careful &nbsp;·&nbsp; 🔴 Danger</span>
                  </div>
                </section>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="msg-in flex items-end justify-end gap-2 pl-8">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary p-3.5 text-[14.5px] font-medium leading-snug text-on-primary shadow-sm">
                      {m.text}
                    </div>
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-on-primary shadow-sm">
                      <Icon name="person" size={18} />
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="msg-in flex items-start gap-2 pr-1">
                    <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary shadow-sm">
                      <Icon name="sailing" size={18} fill />
                    </div>
                    <div className="min-w-0 flex-1">
                      {m.answer && (
                        <SafetyCard
                          answer={m.answer}
                          area={coords ? strings.usingYourLocation : area}
                          strings={strings}
                          locale={locale}
                        />
                      )}
                      {m.answer?.zones && m.answer.zones.length > 0 && (
                        <div className="mt-2">
                          <ZoneCard
                            strings={strings}
                            zones={m.answer.zones}
                            onViewMap={(z) => openMap(m.answer?.zones ?? [z], m.answer?.route)}
                            onRoute={askRoute}
                          />
                        </div>
                      )}
                      {m.answer?.route && (
                        <div className="mt-2">
                          <RouteCard
                            strings={strings}
                            route={m.answer.route}
                            onViewMap={() => openMap(m.answer?.zones ?? [], m.answer?.route)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}

              {busy && (
                <div className="msg-in flex items-center gap-2.5 rounded-2xl bg-surface-lowest px-4 py-3.5 shadow-sm">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container/30">
                    <Icon name="sailing" size={18} className="text-primary" />
                  </div>
                  <div className="flex gap-1.5">
                    <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
                  </div>
                  <span className="text-xs text-on-surface-variant">ORCA is checking the sea…</span>
                </div>
              )}
            </div>
          )}
        </main>

        {tab === 'chat' && (
          <>
            {apiError && (
              <p
                role="alert"
                className="msg-in relative z-10 mx-4 mb-1 rounded-xl bg-caution-bg px-3 py-2 text-center text-xs font-medium text-caution-text ring-1 ring-caution-ring"
              >
                {apiError}
              </p>
            )}
            <Composer
              strings={strings}
              value={input}
              onChange={setInput}
              onSend={() => void ask(input)}
              onMic={handleMic}
              micSupported={speech.supported}
              listening={speech.listening}
              interim={speech.interim}
              busy={busy}
              voiceFallback={voiceFallback}
            />
          </>
        )}

        <BottomNav strings={strings} tab={tab} onTab={setTab} alertCount={alertCount} />
        {mapView && (
          <MapOverlay
            strings={strings}
            user={mapView.user}
            zones={mapView.zones}
            route={mapView.route}
            demoWaters={mapView.demoWaters}
            onClose={() => setMapView(null)}
          />
        )}
      </div>
    </div>
  );
}
