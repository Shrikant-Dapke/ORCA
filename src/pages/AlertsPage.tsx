import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { useChatQuery } from '../api/hooks';
import { QUERIES } from '../api/services';
import { Card, PageHeader, SourceLine, StateView, StatusBadge } from '../components/ui';
import type { OrcaStatus } from '../../shared/orca-contract';

/** Alerts derived from a real backend danger-question — never manufactured. */
type Filter = 'all' | 'critical' | 'high' | 'warning' | 'info';

export default function AlertsPage() {
  const { strings, area, coords, locale } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useMemo(() => ({ message: QUERIES.dangerNearby, area, coords, locale }), [area, coords, locale]);
  const res = useChatQuery(query, { offline: strings.locationDenied });

  const alerts: { severity: 'critical' | 'warning'; status: OrcaStatus; title: string; body: string; source: string }[] =
    res.data && res.data.status !== 'safe'
      ? [
          {
            severity: res.data.status === 'danger' ? 'critical' : 'warning',
            status: res.data.status as OrcaStatus,
            title: res.data.headline,
            body: res.data.warning ?? res.data.summary,
            source: res.data.meta?.live ? 'live' : 'demo',
          },
        ]
      : [];

  const shown = alerts.filter((a) => filter === 'all' || a.severity === filter);
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: strings.filterAll },
    { id: 'critical', label: strings.filterCritical },
    { id: 'high', label: strings.filterHigh },
    { id: 'warning', label: strings.filterWarning },
    { id: 'info', label: strings.filterInfo },
  ];

  return (
    <div className="mx-auto max-w-[720px] space-y-3 px-4 pb-4">
      <PageHeader title={strings.alertsTitle} />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition active:scale-95 ${
              filter === f.id ? 'bg-primary text-on-primary' : 'bg-surface-lowest text-on-surface-variant shadow-sm'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <StateView strings={strings} loading={res.loading} error={res.error} offline={res.offline} onRetry={res.reload}>
        {shown.length === 0 ? (
          <Card>
            <p className="text-center text-[14px] font-bold text-on-surface">{strings.noAlertsTitle}</p>
            <p className="mt-1 text-center text-[13px] text-on-surface-variant">{strings.noAlertsBody}</p>
          </Card>
        ) : (
          shown.map((a, i) => (
            <Card key={i}>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge state={a.status === 'safe' ? 'safe' : a.status === 'danger' ? 'danger' : 'caution'} />
                <span className="text-[11px] font-bold uppercase text-on-surface-variant">{a.severity}</span>
              </div>
              <p className="mt-2 font-headline text-[15px] font-bold text-on-surface">{a.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">{a.body}</p>
              <SourceLine text={a.source} />
            </Card>
          ))
        )}
      </StateView>
    </div>
  );
}
