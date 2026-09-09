import { describe, expect, it } from 'vitest';
import { GeoError, requestBrowserLocation } from './geolocation';

function mockGeo(
  impl: (
    ok: (pos: GeolocationPosition) => void,
    err: (e: GeolocationPositionError) => void,
  ) => void,
): Geolocation {
  return { getCurrentPosition: impl } as unknown as Geolocation;
}

function pos(lat: number, lon: number): GeolocationPosition {
  return { coords: { latitude: lat, longitude: lon } } as GeolocationPosition;
}

function geoErr(code: number): GeolocationPositionError {
  return { code } as GeolocationPositionError;
}

describe('requestBrowserLocation (mocked browser, no real GPS)', () => {
  it('resolves the fix on success', async () => {
    const geo = mockGeo((ok) => ok(pos(19.05, 71.9)));
    await expect(requestBrowserLocation(geo)).resolves.toEqual({ latitude: 19.05, longitude: 71.9 });
  });

  it('maps PERMISSION_DENIED to denied', async () => {
    const geo = mockGeo((_ok, err) => err(geoErr(1)));
    await expect(requestBrowserLocation(geo)).rejects.toMatchObject({ name: 'GeoError', code: 'denied' });
  });

  it('maps POSITION_UNAVAILABLE to unavailable', async () => {
    const geo = mockGeo((_ok, err) => err(geoErr(2)));
    await expect(requestBrowserLocation(geo)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('maps browser TIMEOUT to timeout', async () => {
    const geo = mockGeo((_ok, err) => err(geoErr(3)));
    await expect(requestBrowserLocation(geo)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('rejects unusable (non-finite) fixes instead of sending them', async () => {
    const geo = mockGeo((ok) => ok(pos(Number.NaN, 71.9)));
    await expect(requestBrowserLocation(geo)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('times out a hung browser call on its own', async () => {
    const geo = mockGeo(() => {});
    await expect(requestBrowserLocation(geo, 20)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reports unsupported when the browser has no geolocation', async () => {
    await expect(requestBrowserLocation(undefined)).rejects.toMatchObject({ code: 'unsupported' });
  });
});
