/**
 * Browser geolocation wrapper — one fisherman-friendly action ("Use My
 * Location") with explicit failure modes. DOM-free and unit-testable: pass a
 * mock Geolocation in tests, omit it in the app (uses navigator).
 *
 * Privacy: the fix lives only in frontend state for the session and is sent
 * solely to our own /api/chat, which uses it for the current marine request.
 */

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

export type GeoErrorCode = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export class GeoError extends Error {
  readonly code: GeoErrorCode;
  constructor(code: GeoErrorCode, message: string) {
    super(message);
    this.name = 'GeoError';
    this.code = code;
  }
}

type GeoProvider = Pick<Geolocation, 'getCurrentPosition'> | undefined;

function defaultProvider(): GeoProvider {
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    return navigator.geolocation;
  }
  return undefined;
}

export function requestBrowserLocation(
  provider: GeoProvider = defaultProvider(),
  timeoutMs = 12000,
): Promise<GpsCoordinates> {
  if (!provider) {
    return Promise.reject(
      new GeoError('unsupported', 'This browser cannot share location.'),
    );
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new GeoError('timeout', 'Finding your location took too long.'));
      }
    }, timeoutMs);

    provider.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new GeoError('unavailable', 'The location reading was not usable.'));
          return;
        }
        resolve({ latitude, longitude });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err.code === 1) reject(new GeoError('denied', 'Location permission was not granted.'));
        else if (err.code === 3) reject(new GeoError('timeout', 'Finding your location took too long.'));
        else reject(new GeoError('unavailable', 'Your location is not available right now.'));
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: timeoutMs },
    );
  });
}
