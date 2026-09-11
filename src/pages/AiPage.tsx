import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { answerFor } from '../mock/brain';
import { sendChat } from '../api/client';
import { useSpeechRecognition } from '../hooks/useSpeech';
import type { ChatMessage } from '../types';
import { Composer, RouteCard, SafetyCard, ZoneCard } from '../components/cards';

let idCounter = 0;
const nid = () => `m${Date.now()}_${idCounter++}`;

function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** ORCA AI: the real conversational interface over POST /api/chat. */
export default function AiPage({ initialQuery }: { initialQuery?: string }) {
  const { strings, locale, area, coords } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [, setLiveData] = useState(false);
  // Opaque server-side conversation id (multi-turn memory). Rotated only
  // when the user starts a new chat via the header button (remount key).
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setBusy(true);
      setMessages((m) => [...m, { id: nid(), role: 'user', text: q, createdAt: Date.now() }]);
      setInput('');
      try {
        const answer = await sendChat(q, area, {
          ...(coords ? { coordinates: coords } : {}),
          locale,
          sessionId,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, area, coords, locale, sessionId],
  );

  // Landing deep-links (?q=...) send once.
  useEffect(() => {
    if (initialQuery && initialSent.current !== initialQuery && !busy) {
      initialSent.current = initialQuery;
      void ask(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

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

  const showGreeting = useMemo(() => messages.length === 0 && !busy, [messages, busy]);

  const newConversation = useCallback(() => {
    setMessages([]);
    setInput('');
    setApiError(null);
    setSessionId(newSessionId());
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!showGreeting && (
        <div className="mx-auto flex w-full max-w-[640px] justify-end px-4 pt-2">
          <button
            onClick={newConversation}
            className="flex items-center gap-1.5 rounded-full bg-surface-lowest px-3.5 py-2 text-[12px] font-bold text-primary shadow-sm transition hover:bg-surface-container active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            {strings.newChat}
          </button>
        </div>
      )}
      <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
        <div className="mx-auto max-w-[640px] space-y-3">
          {showGreeting && (
            <section className="msg-in rounded-2xl bg-surface-lowest p-5 text-center shadow-md">
              <div className="orca-float mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-tr from-primary to-secondary-container shadow-lg">
                <span className="material-symbols-outlined text-[34px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  sailing
                </span>
              </div>
              <h2 className="mt-3 font-headline text-lg font-bold leading-snug text-on-surface">{strings.greetingTitle}</h2>
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-on-surface-variant">
                {strings.greetingBody}
              </p>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px] text-secondary">waves</span>
                <span>🟢 Safe &nbsp;·&nbsp; 🟡 Careful &nbsp;·&nbsp; 🔴 Danger</span>
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {strings.suggested.slice(0, 3).map((q: string) => (
                  <button
                    key={q}
                    onClick={() => void ask(q)}
                    disabled={busy}
                    className="rounded-full bg-surface-container px-3.5 py-2 text-[12.5px] font-semibold text-primary transition hover:bg-surface-high active:scale-95 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
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
                  {m.answer?.message && (
                    <div className="msg-in mb-2 max-w-[95%] rounded-2xl rounded-tl-md bg-surface-lowest px-4 py-3 text-[14.5px] leading-relaxed text-on-surface shadow-md">
                      {m.answer.message}
                    </div>
                  )}
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
                        onViewMap={() => {
                          window.location.hash = '#/app/map';
                        }}
                        onRoute={(z) => void ask(`Show me the safest route to ${z.name}.`)}
                      />
                    </div>
                  )}
                  {m.answer?.route && (
                    <div className="mt-2">
                      <RouteCard
                        strings={strings}
                        route={m.answer.route}
                        onViewMap={() => {
                          window.location.hash = '#/app/map';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="msg-in flex items-center gap-2.5 rounded-2xl bg-surface-lowest px-4 py-3.5 shadow-sm">
              <div className="flex gap-1.5">
                <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
                <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
                <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
              </div>
              <span className="text-xs text-on-surface-variant">ORCA is checking the sea…</span>
            </div>
          )}
        </div>
      </div>

      {apiError && (
        <p role="alert" className="msg-in mx-4 mb-1 rounded-xl bg-caution-bg px-3 py-2 text-center text-xs font-medium text-caution-text ring-1 ring-caution-ring">
          {apiError}
        </p>
      )}
      <div className="mx-auto w-full max-w-[640px]">
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
      </div>
    </div>
  );
}
