import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { useChatQuery } from '../api/hooks';
import { QUERIES } from '../api/services';
import { Card, PageHeader, SourceLine, StateView } from '../components/ui';

/**
 * Marine weather: current sea/wind/weather from the backend. Temperature,
 * pressure, rainfall, visibility, and forecasts have no backend source, so
 * they render honest unavailable states — never invented values.
 */
export default function WeatherPage() {
  const { strings, area, coords, locale } = useApp();
  const [tab, setTab] = useState<'now' | 'd24' | 'd7'>('now');
  const query = useMemo(() => ({ message: QUERIES.seaToday, area, coords, locale }), [area, coords, locale]);
  const res = useChatQuery(query, { offline: strings.locationDenied });
  const c = res.data?.conditions;

  return (
    <div className="mx-auto max-w-[720px] space-y-3 px-4 pb-4">
      <PageHeader title={strings.navWeather} />
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['now', '●'],
            ['d24', '24H'],
            ['d7', '7D'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`h-10 rounded-xl text-[13px] font-bold transition active:scale-95 ${
              tab === id ? 'bg-primary text-on-primary' : 'bg-surface-lowest text-on-surface-variant shadow-sm'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'now' ? (
        <Card>
          <p className="text-center text-[14px] font-bold text-on-surface">{strings.forecastUnavailable}</p>
          <SourceLine text={res.data?.meta?.live ? 'live' : 'demo'} />
        </Card>
      ) : (
        <StateView strings={strings} loading={res.loading} error={res.error} offline={res.offline} onRetry={res.reload}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: 'waves', label: strings.seaLabel, value: c?.sea },
              { icon: 'air', label: strings.windLabel, value: c?.wind },
              { icon: 'partly_cloudy_day', label: strings.weatherLabel, value: c?.weather },
            ].map((r) => (
              <Card key={r.label}>
                <span className="material-symbols-outlined text-[24px] text-primary">{r.icon}</span>
                <p className="mt-1 text-[11px] font-semibold uppercase text-on-surface-variant">{r.label}</p>
                <p className="text-[15px] font-bold text-on-surface">{r.value ?? '—'}</p>
              </Card>
            ))}
            <Card>
              <span className="material-symbols-outlined text-[24px] text-on-surface-variant">device_unknown</span>
              <p className="mt-1 text-[11px] font-semibold uppercase text-on-surface-variant">
                {strings.tempLabel} · {strings.pressureLabel} · {strings.rainLabel} · {strings.visibilityLabel}
              </p>
              <p className="text-[13px] font-bold text-on-surface-variant">{strings.unavailable}</p>
            </Card>
          </div>
          {res.data && <SourceLine text={res.data.meta?.live ? 'live' : 'demo'} />}
        </StateView>
      )}
    </div>
  );
}
