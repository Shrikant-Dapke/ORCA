import { useState } from 'react';
import { Anchor, ChevronDown, MapPin, Navigation, Pencil, X } from 'lucide-react';
import type { Strings } from '../i18n/strings';

export type GpsUiState = 'idle' | 'requesting' | 'active' | 'failed';

interface Props {
  strings: Strings;
  area: string;
  onArea: (a: string) => void;
  gps: GpsUiState;
  onUseLocation: () => void;
  onClearLocation: () => void;
}

/**
 * "Your Fishing Area" — a free-text label, never a hardcoded port/city.
 * Defaults to a generic near-shore label; fishermen can rename it.
 */
export default function FishingAreaBar({ strings, area, onArea, gps, onUseLocation, onClearLocation }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(area);

  return (
    <div className="relative z-10 px-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-cyan-200/15 backdrop-blur">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/25">
          <Anchor className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-200/70">
            <MapPin className="h-3 w-3" /> {strings.fishingAreaLabel}
          </p>
          {editing ? (
            <form
              className="mt-1 flex items-center gap-2"
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
                className="w-full rounded-lg bg-[#04121f]/70 px-2 py-1 text-sm text-white ring-1 ring-cyan-300/40 outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-cyan-400 px-2.5 py-1 text-xs font-bold text-[#04121f]"
              >
                OK
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setDraft(area);
                setEditing(true);
              }}
              className="group flex w-full items-center gap-1 text-left"
            >
              <span className="truncate text-[15px] font-bold text-white">{area}</span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-cyan-200/50 group-hover:text-cyan-200" />
            </button>
          )}
          <p className="text-[11px] text-cyan-100/60">{strings.fishingAreaHint}</p>
          {/* One simple fisherman action: use the phone's real location. */}
          <div className="mt-1.5">
            {gps === 'active' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-200 ring-1 ring-emerald-300/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                📍 {strings.usingYourLocation}
                <button
                  onClick={onClearLocation}
                  aria-label={strings.stopUsingLocation}
                  title={strings.stopUsingLocation}
                  className="grid h-4 w-4 place-items-center rounded-full bg-white/10 transition hover:bg-white/25 active:scale-90"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                onClick={onUseLocation}
                disabled={gps === 'requesting'}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-cyan-100 ring-1 ring-cyan-200/25 transition hover:bg-cyan-400/20 active:scale-95 disabled:opacity-60"
              >
                <Navigation className="h-3 w-3" />
                {gps === 'requesting' ? strings.findingLocation : strings.useMyLocation}
              </button>
            )}
            {gps === 'failed' && (
              <p className="msg-in mt-1 text-[11px] text-amber-200/90">{strings.locationDenied}</p>
            )}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-cyan-200/50" />
      </div>
    </div>
  );
}
