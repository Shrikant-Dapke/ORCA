import { useMemo } from 'react';
import { useApp } from '../app-context';
import { useChatQuery, useHealth } from '../api/hooks';
import { QUERIES } from '../api/services';
import { Card, PageHeader, SourceLine, StateView, StatusBadge } from '../components/ui';

/** Home dashboard — every number below comes from one backend answer. */
export default function HomePage() {
  const { strings, locale, area, coords } = useApp();
  const query = useMemo(
    () => ({ message: QUERIES.seaToday, area, coords, locale }),
    [area, coords, locale],
  );
  const sea = useChatQuery(query, { offline: strings.locationDenied });
  const health = useHealthLine();

  return (
    <div className="mx-auto max-w-[720px] space-y-3 px-4 pb-4">
      <PageHeader title={`${strings.brand} · ${strings.navHome}`} sub={strings.tagline} />
      <StateView strings={strings} loading={sea.loading} error={sea.error} offline={sea.offline} onRetry={sea.reload}>
        {sea.data && (
          <>
            <Card>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge state={sea.data.status === 'safe' ? 'safe' : sea.data.status === 'danger' ? 'danger' : 'caution'} />
                <span className="text-[11px] font-bold text-on-surface-variant">
                  {sea.data.meta?.live ? strings.liveNote : strings.demoNote}
                </span>
              </div>
              <p className="mt-2 font-headline text-[17px] font-bold leading-snug text-on-surface">{sea.data.headline}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-on-surface-variant">{sea.data.summary}</p>
              <SourceLine text={sourceText(sea.data)} />
            </Card>
            <Card>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.seaTitle}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[
                  [strings.seaLabel, sea.data.conditions.sea],
                  [strings.windLabel, sea.data.conditions.wind],
                  [strings.weatherLabel, sea.data.conditions.weather],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-surface-low px-2 py-2.5">
                    <p className="text-[10px] font-semibold uppercase text-on-surface-variant">{label}</p>
                    <p className="mt-0.5 text-[13px] font-bold text-on-surface">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {strings.recommendationLabel}
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-on-surface">{sea.data.recommendation}</p>
              {sea.data.zones && sea.data.zones.length > 0 && (
                <a
                  href="#/app/fishing"
                  className="mt-2.5 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-container font-headline text-[13px] font-bold text-on-primary active:scale-[0.98]"
                >
                  🎣 {strings.zoneTitle}: {sea.data.zones[0].distanceKm} km {sea.data.zones[0].bearingCompass}
                </a>
              )}
            </Card>
          </>
        )}
      </StateView>
      {health}
    </div>
  );
}

function sourceText(res: { meta?: { live?: boolean; dataSource?: string } }): string {
  if (!res.meta) return 'backend';
  return `Source: ${res.meta.dataSource}${res.meta.live ? ' · live' : ''}`;
}

function useHealthLine() {
  const h = useHealth();
  const { strings } = useApp();
  if (h.loading || h.error || !h.data) return null;
  const parts = [h.data.dataSource, h.data.advisorySource, h.data.ecosystemSource, h.data.pfzSource].filter(
    (x): x is string => !!x,
  );
  return (
    <p className="px-1 text-center text-[11px] text-on-surface-variant">
      {strings.settingsSources}: {parts.length > 0 ? parts.join(' · ') : strings.waitingData}
    </p>
  );
}
