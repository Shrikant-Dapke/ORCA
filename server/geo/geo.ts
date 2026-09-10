/**
 * Small deterministic geospatial toolkit. Pure math, no data, no network.
 * Shared by the GeoAgent and the RouteAgent so distance/bearing logic lives
 * in exactly one place.
 */

export interface LatLon {
  latitude: number;
  longitude: number;
}

const EARTH_KM = 6371;
const DEG = Math.PI / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = (b.latitude - a.latitude) * DEG;
  const dLon = (b.longitude - a.longitude) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * DEG) * Math.cos(b.latitude * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const dLon = (b.longitude - a.longitude) * DEG;
  const y = Math.sin(dLon) * Math.cos(b.latitude * DEG);
  const x =
    Math.cos(a.latitude * DEG) * Math.sin(b.latitude * DEG) -
    Math.sin(a.latitude * DEG) * Math.cos(b.latitude * DEG) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

const COMPASS16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export function compass16(bearing: number): string {
  return COMPASS16[Math.round(bearing / 22.5) % 16];
}

/** Great-circle destination point from start, bearing degrees, km. */
export function destinationPoint(from: LatLon, bearing: number, distanceKm: number): LatLon {
  const br = bearing * DEG;
  const lat1 = from.latitude * DEG;
  const lon1 = from.longitude * DEG;
  const d = distanceKm / EARTH_KM;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 =
    lon1 +
    Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { latitude: lat2 / DEG, longitude: ((lon2 / DEG + 540) % 360) - 180 };
}

/** Evenly interpolated waypoints inclusive of both ends. */
export function interpolateWaypoints(from: LatLon, to: LatLon, legs: number): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= legs; i++) {
    const f = i / legs;
    pts.push({
      latitude: from.latitude + (to.latitude - from.latitude) * f,
      longitude: from.longitude + (to.longitude - from.longitude) * f,
    });
  }
  return pts;
}

/** Ray-casting point-in-polygon. Polygon = [lat, lon] rings. */
export function pointInPolygon(point: LatLon, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lati, loni] = polygon[i];
    const [latj, lonj] = polygon[j];
    if (
      lonj > point.longitude !== loni > point.longitude &&
      point.latitude < ((lati - latj) * (point.longitude - lonj)) / (loni - lonj) + latj
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Minimum distance from point to segment a–b (km, equirectangular approx). */
export function distToSegmentKm(p: LatLon, a: LatLon, b: LatLon): number {
  const kx = 111.32 * Math.cos(((a.latitude + b.latitude) / 2) * DEG);
  const ky = 110.57;
  const px = p.longitude * kx;
  const py = p.latitude * ky;
  const ax = a.longitude * kx;
  const ay = a.latitude * ky;
  const bx = b.longitude * kx;
  const by = b.latitude * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True when any leg of the route passes within radiusKm of the point. */
export function routePassesNear(
  waypoints: LatLon[],
  point: LatLon,
  radiusKm: number,
): boolean {
  for (let i = 0; i + 1 < waypoints.length; i++) {
    if (distToSegmentKm(point, waypoints[i], waypoints[i + 1]) <= radiusKm) return true;
  }
  return false;
}
