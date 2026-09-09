import { useCallback, useEffect, useRef, useState } from 'react';
import { Fish, Waves } from 'lucide-react';
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

  return (
    <div className="ocean-bg flex h-full justify-center">
      {/* Desktop ambience: keep the chat a phone-like column, ocean fills the sides */}
      <div className="relative flex h-full w-full max-w-[520px] flex-col overflow-hidden sm:my-0 sm:border-x sm:border-cyan-200/10">
        {/* soft top glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-56 bg-gradient-to-b from-cyan-400/15 to-transparent" />

        <Header strings={strings} locale={locale} onLocale={setLocale} onNewChat={newChat} live={liveData} />
        <FishingAreaBar
          strings={strings}
          area={area}
          onArea={setArea}
          gps={gpsUi}
          onUseLocation={() => void handleUseLocation()}
          onClearLocation={handleClearLocation}
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
                <section className="msg-in rounded-3xl bg-white/[0.07] p-5 text-center ring-1 ring-cyan-200/15 backdrop-blur">
                  <div className="orca-float mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-cyan-300 via-cyan-400 to-blue-600 shadow-[0_0_32px_rgba(34,211,238,0.5)]">
                    <Fish className="h-9 w-9 text-[#04121f]" strokeWidth={2.2} />
                  </div>
                  <h2 className="mt-3 text-lg font-extrabold leading-snug text-white">
                    {strings.greetingTitle}
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-cyan-50/80">
                    {strings.greetingBody}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-cyan-200/60">
                    <Waves className="h-3.5 w-3.5" />
                    <span>🟢 Safe &nbsp;·&nbsp; 🟡 Careful &nbsp;·&nbsp; 🔴 Danger</span>
                  </div>
                </section>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="msg-in flex justify-end">
                    <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-cyan-400 px-4 py-3 text-[14.5px] font-medium leading-relaxed text-[#04121f] shadow-[0_4px_20px_rgba(34,211,238,0.3)]">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="msg-in">
                    {m.answer && (
                      <SafetyCard
                        answer={m.answer}
                        area={coords ? strings.usingYourLocation : area}
                        strings={strings}
                      />
                    )}
                  </div>
                ),
              )}

              {busy && (
                <div className="msg-in flex items-center gap-2.5 rounded-3xl bg-white/[0.07] px-4 py-3.5 ring-1 ring-white/10">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/20 ring-1 ring-cyan-300/30">
                    <Fish className="h-4 w-4 text-cyan-200" />
                  </div>
                  <div className="flex gap-1.5">
                    <span className="typing-dot h-2 w-2 rounded-full bg-cyan-300" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-cyan-300" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-cyan-300" />
                  </div>
                  <span className="text-xs text-cyan-100/60">ORCA is checking the sea…</span>
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
                className="msg-in relative z-10 mx-4 mb-1 rounded-xl bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-100 ring-1 ring-amber-300/25"
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
