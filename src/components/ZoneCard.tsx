import type { FishingZone, RouteInfo } from '../../shared/orca-contract';
import type { Strings } from '../i18n/strings';

interface ZoneProps {
  strings: Strings;
  zones: FishingZone[];
  onViewMap: (zone: FishingZone) => void;
  onRoute: (zone: FishingZone) => void;
}

/**
 * Recommended fishing zone card (Stitch result-card language): nearest zone
 * first, distance + bearing, demo/live source stated plainly. No catch
 * promises, no species, no PFZ-official claims.
 */
export function ZoneCard({ strings, zones, onViewMap, onRoute }: ZoneProps) {
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
              first.potential === 'good'
                ? 'bg-tertiary-fixed/50 text-tertiary'
                : 'bg-caution-bg text-caution-text'
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
          <span className="material-symbols-outlined text-[20px]">map</span>
          {strings.viewMap}
        </button>
        <button
          onClick={() => onRoute(first)}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-container px-3 text-[13px] font-bold text-primary transition hover:bg-surface-high active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">route</span>
          {strings.safestRoute}
        </button>
      </div>
    </div>
  );
}

interface RouteProps {
  strings: Strings;
  route: RouteInfo;
  onViewMap: () => void;
}

/** Calculated route card. Always labeled non-official. */
export function RouteCard({ strings, route, onViewMap }: RouteProps) {
  const tone =
    route.riskLevel === 'high'
      ? 'bg-error-container text-on-error-container'
      : route.riskLevel === 'moderate'
        ? 'bg-caution-bg text-caution-text'
        : 'bg-tertiary-fixed/50 text-tertiary';
  return (
    <div className="rounded-2xl bg-surface-lowest p-4 shadow-md">
      <p className="flex items-center gap-1.5 font-headline text-[14px] font-bold text-on-surface">
        <span className="material-symbols-outlined text-[20px] text-primary">route</span>
        {strings.routeTitle}
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
        <span className="material-symbols-outlined text-[20px]">map</span>
        {strings.viewMap}
      </button>
    </div>
  );
}
