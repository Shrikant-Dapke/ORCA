import { useMemo } from 'react';
import { useApp } from '../app-context';
import { useChatQuery } from '../api/hooks';
import { QUERIES } from '../api/services';
import { Card, PageHeader, SourceLine, StateView } from '../components/ui';

/** Fishing intelligence: backend zones + conditions; no species/history feeds exist. */
export default function FishingPage() {
  const { strings, area, coords, locale, fmtKm } = useApp();
  const query = useMemo(() => ({ message: QUERIES.zonesToday, area, coords, locale }), [area, coords, locale]);
  const res = useChatQuery(query, { offline: strings.locationDenied });
  const zones = res.data?.zones ?? [];

  return (
    <div className="mx-auto max-w-[720px] space-y-3 px-4 pb-4">
      <PageHeader title={`${strings.navFishing} · ${strings.zoneTitle}`} />
      <StateView strings={strings} loading={res.loading} error={res.error} offline={res.offline} onRetry={res.reload}>
        {zones.length === 0 ? (
          <Card>
            <p className="text-center text-[14px] font-bold text-on-surface">{strings.zonesUnavailable}</p>
            <SourceLine text={res.data?.meta?.live ? 'live' : 'demo'} />
          </Card>
        ) : (
          zones.map((z) => (
            <Card key={z.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-headline text-[20px] font-bold text-primary">
                  {fmtKm(z.distanceKm)} {z.bearingCompass}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    z.potential === 'good' ? 'bg-tertiary-fixed/50 text-tertiary' : 'bg-caution-bg text-caution-text'
                  }`}
                >
                  {z.name}
                </span>
              </div>
              {z.sst && (
                <p className="mt-1 text-[13px] text-on-surface-variant">
                  {strings.seaLabel}: SST {z.sst}
                </p>
              )}
              <SourceLine text={`${z.source} · ${z.live ? strings.liveNote : strings.demoNote}`} />
              <a
                href="#/app/map"
                className="mt-2.5 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-container font-headline text-[13px] font-bold text-on-primary active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[20px]">map</span>
                {strings.viewMap}
              </a>
            </Card>
          ))
        )}
        <Card>
          <p className="text-[13px] font-bold text-on-surface">{strings.speciesUnavailable}</p>
          <p className="mt-1 text-[13px] font-bold text-on-surface">{strings.historyUnavailable}</p>
          {res.data && <SourceLine text={res.data.meta?.live ? 'live' : 'demo'} />}
        </Card>
      </StateView>
    </div>
  );
}
