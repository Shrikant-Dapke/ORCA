import { useApp } from '../app-context';
import { useHealth } from '../api/hooks';
import { Card, PageHeader, StateView } from '../components/ui';

/** Settings: real prefs + real source status. No accounts exist — said plainly. */
export default function SettingsPage() {
  const { strings, locale, setLocale, area, units, setUnits, gpsUi, useLocation, clearLocation } = useApp();
  const health = useHealth();

  const sources: Array<[string, string | undefined, boolean | undefined]> = health.data
    ? [
        ['marine', health.data.dataSource, health.data.live],
        ['advisory', health.data.advisorySource, health.data.advisoryLive],
        ['ecosystem', health.data.ecosystemSource, health.data.ecosystemLive],
        ['pfz', health.data.pfzSource, health.data.pfzSource !== 'demo' && health.data.pfzSource !== 'none'],
        ['mosdac', health.data.mosdac, false],
      ]
    : [];

  return (
    <div className="mx-auto max-w-[720px] space-y-3 px-4 pb-4">
      <PageHeader title={strings.navSettings} sub={strings.guestNote} />

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.settingsLanguage}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              ['en', 'English'],
              ['hi', 'हिन्दी'],
              ['mr', 'मराठी'],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`h-11 rounded-xl text-[13px] font-bold transition active:scale-95 ${
                locale === code ? 'bg-primary text-on-primary' : 'bg-surface-low text-on-surface-variant'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.settingsRegion}</p>
        <p className="mt-1 text-[14px] font-bold text-on-surface">{area}</p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => void useLocation()}
            disabled={gpsUi === 'requesting'}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-container text-[13px] font-bold text-on-primary active:scale-[0.98] disabled:opacity-60"
          >
            📍 {gpsUi === 'active' ? strings.usingYourLocation : strings.useMyLocation}
          </button>
          {gpsUi === 'active' && (
            <button
              onClick={clearLocation}
              className="h-11 rounded-xl bg-surface-low px-4 text-[13px] font-bold text-primary active:scale-95"
            >
              {strings.stopUsingLocation}
            </button>
          )}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.settingsUnits}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ['km', strings.unitKm],
              ['nm', strings.unitNm],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setUnits(code)}
              aria-pressed={units === code}
              className={`h-11 rounded-xl text-[13px] font-bold transition active:scale-95 ${
                units === code ? 'bg-primary text-on-primary' : 'bg-surface-low text-on-surface-variant'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.settingsSources}</p>
        <StateView strings={strings} loading={health.loading} error={health.error} onRetry={health.reload}>
          <ul className="mt-1.5 space-y-1.5">
            {sources.map(([name, value, live]) => (
              <li key={name} className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-on-surface">{name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-tertiary-fixed/50 text-tertiary' : 'bg-surface-high text-on-surface-variant'}`}>
                  {value ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </StateView>
      </Card>

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{strings.settingsAbout}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
          ORCA — {strings.tagline}. {strings.guestNote}
        </p>
      </Card>
    </div>
  );
}
