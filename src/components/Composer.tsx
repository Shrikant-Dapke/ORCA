import { Mic, SendHorizontal } from 'lucide-react';
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
        <p className="msg-in mb-2 rounded-xl bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-100 ring-1 ring-amber-300/25">
          {voiceFallback}
        </p>
      )}
      {(listening || interim) && (
        <p className="msg-in mb-2 rounded-xl bg-rose-500/10 px-3 py-2 text-center text-xs font-semibold text-rose-100 ring-1 ring-rose-400/30">
          {listening ? `🎙️ ${strings.listening}…` : ''}
          {interim ? ` “${interim}”` : ''}
        </p>
      )}

      <div className="flex items-end gap-2.5">
        {/* Prominent microphone control */}
        <button
          onClick={onMic}
          aria-label={listening ? 'Stop listening' : 'Speak your question'}
          title={strings.voiceHint}
          className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full transition active:scale-90 ${
            listening
              ? 'mic-live bg-rose-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.6)]'
              : 'bg-gradient-to-br from-cyan-300 to-cyan-500 text-[#04121f] shadow-[0_0_24px_rgba(34,211,238,0.45)] hover:brightness-110'
          }`}
        >
          <Mic className="h-6 w-6" strokeWidth={2.4} />
        </button>

        {/* Text input */}
        <div className="flex min-w-0 flex-1 items-end gap-2 rounded-3xl bg-white/[0.08] p-2 pl-4 ring-1 ring-white/15 backdrop-blur focus-within:ring-cyan-300/60">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={micSupported ? strings.inputPlaceholder : strings.inputPlaceholder}
            aria-label="Type your question"
            disabled={busy}
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-white placeholder:text-slate-400 outline-none disabled:opacity-60"
          />
          <button
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cyan-400 text-[#04121f] transition hover:brightness-110 active:scale-90 disabled:opacity-30 disabled:hover:brightness-100"
          >
            <SendHorizontal className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-cyan-100/50">
        {micSupported ? `🎤 ${strings.voiceHint}` : `⌨️ ${strings.voiceNotSupported}`}
      </p>
    </div>
  );
}
