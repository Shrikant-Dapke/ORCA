import { Sparkles } from 'lucide-react';
import type { Strings } from '../i18n/strings';

interface Props {
  strings: Strings;
  onAsk: (q: string) => void;
  disabled?: boolean;
}

export default function SuggestedQuestions({ strings, onAsk, disabled }: Props) {
  return (
    <div className="px-4 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-200/70">
        <Sparkles className="h-3.5 w-3.5" /> {strings.suggestedTitle}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {strings.suggested.map((q) => (
          <button
            key={q}
            disabled={disabled}
            onClick={() => onAsk(q)}
            className="shrink-0 rounded-full bg-white/[0.08] px-4 py-2.5 text-[13px] font-medium text-cyan-50 ring-1 ring-cyan-200/20 backdrop-blur transition hover:bg-cyan-400/20 hover:ring-cyan-300/50 active:scale-95 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
