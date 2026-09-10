import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getStrings, type Strings } from './i18n/strings';
import { requestBrowserLocation, type GpsCoordinates } from './location/geolocation';
import type { Locale } from './types';

export type GpsUiState = 'idle' | 'requesting' | 'active' | 'failed';
export type DistanceUnit = 'km' | 'nm';
export const KM_TO_NM = 0.539957;

interface AppState {
  strings: Strings;
  locale: Locale;
  setLocale: (l: Locale) => void;
  area: string;
  setArea: (a: string) => void;
  coords: GpsCoordinates | null;
  gpsUi: GpsUiState;
  useLocation: () => void;
  clearLocation: () => void;
  units: DistanceUnit;
  setUnits: (u: DistanceUnit) => void;
  fmtKm: (km: number) => string;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [area, setArea] = useState(getStrings('en').fishingAreaValue);
  const [coords, setCoords] = useState<GpsCoordinates | null>(null);
  const [gpsUi, setGpsUi] = useState<GpsUiState>('idle');
  const [units, setUnits] = useState<DistanceUnit>('km');

  const strings = useMemo(() => getStrings(locale), [locale]);

  const useLocation = useCallback(async () => {
    setGpsUi('requesting');
    try {
      setCoords(await requestBrowserLocation());
      setGpsUi('active');
    } catch {
      setCoords(null);
      setGpsUi('failed');
    }
  }, []);

  const clearLocation = useCallback(() => {
    setCoords(null);
    setGpsUi('idle');
  }, []);

  const fmtKm = useCallback(
    (km: number) => (units === 'nm' ? `${(km * KM_TO_NM).toFixed(1)} NM` : `${km} km`),
    [units],
  );

  const value: AppState = {
    strings, locale, setLocale, area, setArea, coords, gpsUi,
    useLocation, clearLocation, units, setUnits, fmtKm,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
