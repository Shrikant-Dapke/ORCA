import type { Strings } from '../i18n/strings';

interface Props {
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
}

/**
 * Stitch voice-first composer: mic status row, text input with live voice
 * bars, and a prominent gradient mic button beside Send.
 */
export default function Composer({
  strings,
  value,
  onChange,
  onSend,
  onMic,
  micSupported,
  listening,
  interim,
  busy,
  voiceFallback,
}: Props) {
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
            <span className="material-symbols-outlined text-[14px]">language</span>
            English
          </span>
        </div>

        {(listening || interim) && (
          <p className="msg-in mt-2 rounded-xl bg-error-container/60 px-3 py-2 text-center text-xs font-semibold text-on-error-container">
            🎙️ {strings.listening}…{interim ? ` “${interim}”` : ''}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-low px-3.5 py-2.5 shadow-inner ring-1 ring-transparent focus-within:ring-secondary/50">
            <span className="material-symbols-outlined shrink-0 text-[20px] text-primary">hearing</span>
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
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            )}
          </div>
          <button
            onClick={onMic}
            aria-label={listening ? 'Stop listening' : 'Speak your question'}
            title={strings.voiceHint}
            className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-on-primary shadow-lg transition active:scale-90 ${
              listening
                ? 'mic-live bg-error'
                : 'bg-gradient-to-tr from-primary to-secondary-container hover:brightness-110'
            }`}
          >
            <span className="material-symbols-outlined text-[30px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              mic
            </span>
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-on-surface-variant">
        {micSupported ? `🎤 ${strings.voiceHint}` : `⌨️ ${strings.voiceNotSupported}`}
      </p>
    </div>
  );
}
