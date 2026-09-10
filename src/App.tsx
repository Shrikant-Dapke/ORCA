import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import FishingAreaBar from './components/FishingAreaBar';
import SuggestedQuestions from './components/SuggestedQuestions';
import SafetyCard from './components/SafetyCard';
import Composer from './components/Composer';
import BottomNav, { type Tab } from './components/BottomNav';
import { AlertsPanel, HelpPanel, SeaPanel } from './components/Panels';
import { getStrings } from './i18n/strings';
import { answerFor } from './mock/brain';
import { sendChat } from './api/client';
import { requestBrowserLocation, type GpsCoordinates } from './location/geolocation';
import type { GpsUiState } from './components/FishingAreaBar';
import { useSpeechRecognition } from './hooks/useSpeech';
import type { ChatMessage, Locale } from './types';

let idCounter = 0;
const nid = () => `m${Date.now()}_${idCounter++}`;

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
  // Browser GPS fix for the session only — never persisted, sent solely
  // to our own API with each chat request. Null = demo/manual label mode.
  const [coords, setCoords] = useState<GpsCoordinates | null>(null);
  const [gpsUi, setGpsUi] = useState<GpsUiState>('idle');

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

      // Real backend first (POST /api/chat via same-origin/Vite proxy),
      // offline mock brain as graceful fallback so chat never breaks.
      // The GPS fix (when granted) rides along for live positioning.
      try {
        const answer = await sendChat(q, area, coords ? { coordinates: coords } : {});
        setApiError(null);
        setLiveData(answer.meta?.live === true);
        setMessages((m) => [
          ...m,
          { id: nid(), role: 'assistant', text: '', answer, createdAt: Date.now() },
        ]);
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
    [busy, area, coords],
  );

  const handleUseLocation = useCallback(async () => {
    setGpsUi('requesting');
    try {
      const fix = await requestBrowserLocation();
      setCoords(fix);
      setGpsUi('active');
    } catch {
      // Permission denied, timeout, or no browser support: stay in
      // demo/manual label mode and say so — never invent a location.
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
        // Auto-send the recognised question for a hands-free feel.
        void ask(text);
      },
      [ask],
    ),
  );

  const handleMic = useCallback(() => {
    if (!speech.supported) {
      // Graceful mock/fallback: don't break — explain and keep typing path.
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

  // Live one-line sea summary for the area card, from the latest answer.
  const seaLine = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.answer);
    if (!last?.answer) return '';
    const c = last.answer.conditions;
    return `Sea: ${c.sea} • Wind: ${c.wind}`;
  }, [messages]);

  return (
    <div className="orca-bg flex h-full justify-center">
      {/* Desktop: phone-like column centered on a light backdrop */}
      <div className="relative flex h-full w-full max-w-[520px] flex-col overflow-hidden sm:border-x sm:border-outline-variant/60">
        <Header
          strings={strings}
          locale={locale}
          onLocale={setLocale}
          onNewChat={newChat}
          gpsActive={gpsUi === 'active'}
          live={liveData}
        />
        <FishingAreaBar
          strings={strings}
          area={area}
          onArea={setArea}
          gps={gpsUi}
          onUseLocation={() => void handleUseLocation()}
          onClearLocation={handleClearLocation}
          seaLine={seaLine}
          live={liveData}
        />

        {tab === 'chat' && (
          <SuggestedQuestions strings={strings} onAsk={(q) => void ask(q)} disabled={busy} />
        )}

        {/* Main scroll region */}
        <main ref={scrollRef} className="chat-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
          {tab === 'sea' && <SeaPanel strings={strings} area={area} />}
          {tab === 'alerts' && <AlertsPanel strings={strings} area={area} />}
          {tab === 'help' && <HelpPanel strings={strings} onAsk={(q) => void ask(q)} />}

          {tab === 'chat' && (
            <div className="space-y-3">
              {showGreeting && (
                <section className="msg-in rounded-2xl bg-surface-lowest p-5 text-center shadow-md">
                  <div className="orca-float mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-tr from-primary to-secondary-container shadow-lg">
                    <span className="material-symbols-outlined text-[34px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      sailing
                    </span>
                  </div>
                  <h2 className="mt-3 font-headline text-lg font-bold leading-snug text-on-surface">
                    {strings.greetingTitle}
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-on-surface-variant">
                    {strings.greetingBody}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px] text-secondary">waves</span>
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
                      <span className="material-symbols-outlined text-[18px]">person</span>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="msg-in flex items-start gap-2 pr-1">
                    <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary shadow-sm">
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        sailing
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {m.answer && (
                        <SafetyCard
                          answer={m.answer}
                          area={coords ? strings.usingYourLocation : area}
                          strings={strings}
                        />
                      )}
                    </div>
                  </div>
                ),
              )}

              {busy && (
                <div className="msg-in flex items-center gap-2.5 rounded-2xl bg-surface-lowest px-4 py-3.5 shadow-sm">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container/30">
                    <span className="material-symbols-outlined text-[18px] text-primary">sailing</span>
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

        <BottomNav
          strings={strings}
          tab={tab}
          onTab={setTab}
          alertCount={2}
        />
      </div>
    </div>
  );
}
