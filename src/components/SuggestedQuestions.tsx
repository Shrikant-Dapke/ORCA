import type { Strings } from '../i18n/strings';

interface Props {
  strings: Strings;
  onAsk: (q: string) => void;
  disabled?: boolean;
}

const CHIP_EMOJI = ['🌊', '🌤️', '📍', '💨', '⚠️'];

/**
 * Stitch "Quick Inquiries" card: 1-tap fisherman questions in a horizontal
 * chip rail. Questions stay ours; only presentation follows Stitch.
 */
export default function SuggestedQuestions({ strings, onAsk, disabled }: Props) {
  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl bg-surface-lowest p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {strings.quickTitle}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-secondary">
            <span className="material-symbols-outlined text-[14px]">touch_app</span> 1-Tap
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {strings.suggested.map((q, i) => (
            <button
              key={q}
              disabled={disabled}
              onClick={() => onAsk(q)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium shadow-sm transition active:scale-95 disabled:opacity-50 ${
                i === 0
                  ? 'bg-secondary-fixed text-on-secondary-fixed'
                  : 'bg-surface-container text-on-surface'
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
