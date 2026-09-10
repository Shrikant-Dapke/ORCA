import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  compass16,
  destinationPoint,
  distToSegmentKm,
  haversineKm,
  interpolateWaypoints,
  pointInPolygon,
  routePassesNear,
} from './geo.js';

describe('geo math', () => {
  it('measures Mumbai offshore distances plausibly', () => {
    // ~1 degree of latitude ≈ 111 km
    expect(haversineKm({ latitude: 19, longitude: 72 }, { latitude: 20, longitude: 72 })).toBeCloseTo(111.2, 0);
    expect(haversineKm({ latitude: 9.5, longitude: 75.5 }, { latitude: 9.5, longitude: 75.5 })).toBe(0);
  });

  it('computes bearings and compass points', () => {
    expect(Math.round(bearingDeg({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }))).toBe(90);
    expect(compass16(45)).toBe('NE');
    expect(compass16(200)).toBe('SSW');
  });

  it('projects destinations and interpolates legs', () => {
    const to = destinationPoint({ latitude: 9.5, longitude: 75.5 }, 45, 18);
    expect(haversineKm({ latitude: 9.5, longitude: 75.5 }, to)).toBeCloseTo(18, 0);
    expect(interpolateWaypoints({ latitude: 0, longitude: 0 }, { latitude: 2, longitude: 2 }, 2)).toHaveLength(3);
  });

  it('detects point-in-polygon containment', () => {
    const square: Array<[number, number]> = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(pointInPolygon({ latitude: 0.5, longitude: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ latitude: 5, longitude: 5 }, square)).toBe(false);
  });

  it('detects route proximity to a point', () => {
    const legs = interpolateWaypoints({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 2 }, 4);
    expect(routePassesNear(legs, { latitude: 0.01, longitude: 1 }, 5)).toBe(true);
    expect(routePassesNear(legs, { latitude: 2, longitude: 1 }, 5)).toBe(false);
    expect(distToSegmentKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 })).toBe(0);
  });
});
