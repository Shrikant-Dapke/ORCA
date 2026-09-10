import { useState } from 'react';
import type { Strings } from '../i18n/strings';

export type GpsUiState = 'idle' | 'requesting' | 'active' | 'failed';

interface Props {
  strings: Strings;
  area: string;
  onArea: (a: string) => void;
  gps: GpsUiState;
  onUseLocation: () => void;
  onClearLocation: () => void;
  /** One-line live sea summary for the card, e.g. "Sea: Calm • Wind: 18 kph". */
  seaLine: string;
  /** True when the last answer came from live backend data. */
  live: boolean;
}

/**
 * Stitch fishing-area card: anchor emblem, area name + live sea line, and a
 * source stamp on the right. The "Use My Location" action sits beneath as a
 * Stitch-style pill — same GPS feature, new clothes.
 */
export default function FishingAreaBar({
  strings,
  area,
  onArea,
  gps,
  onUseLocation,
  onClearLocation,
  seaLine,
  live,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(area);

  return (
    <div className="relative z-10 px-4">
      <div className="rounded-2xl bg-tertiary-fixed/30 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tertiary-container text-on-tertiary">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                anchor
              </span>
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
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-on-primary"
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
                  className="group flex min-w-0 items-center gap-1 text-left"
                >
                  <span className="truncate font-headline text-[15px] font-bold leading-tight text-primary">
                    {area}
                  </span>
                  <span className="material-symbols-outlined shrink-0 text-[14px] text-on-surface-variant group-hover:text-primary">
                    edit
                  </span>
                </button>
              )}
              <p className="truncate text-[12px] text-on-surface-variant">{seaLine || strings.fishingAreaHint}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className={`flex items-center gap-1 text-[11px] font-bold ${live ? 'text-tertiary' : 'text-on-surface-variant'}`}>
              <span className={`h-2 w-2 rounded-full ${live ? 'animate-ping bg-tertiary' : 'bg-outline'}`} />
              {live ? strings.liveNote : strings.demoNote}
            </span>
          </div>
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
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </span>
          ) : (
            <button
              onClick={onUseLocation}
              disabled={gps === 'requesting'}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-lowest px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm transition hover:bg-surface-container active:scale-95 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[14px]">navigation</span>
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
