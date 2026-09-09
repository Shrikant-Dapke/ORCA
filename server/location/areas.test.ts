import { describe, expect, it } from 'vitest';
import { DEMO_FISHING_AREAS, resolveArea, resolvePosition } from './areas.js';

describe('resolveArea (DEMO LOCATION mode)', () => {
  it('matches the Bay of Bengal demo zone by keyword', () => {
    const r = resolveArea('Bay of Bengal Demo Zone');
    expect(r.area.id).toBe('bay-of-bengal-south');
    expect(r.matched).toBe(true);
    expect(r.mode).toBe('demo');
  });

  it('matches the northern Arabian Sea zone', () => {
    const r = resolveArea('arabian-sea-north');
    expect(r.area.id).toBe('arabian-sea-north');
    expect(r.matched).toBe(true);
  });

  it('falls back to the default zone for unknown free text — never invents coordinates', () => {
    const r = resolveArea('Your Fishing Area');
    expect(r.area.id).toBe('arabian-sea-south');
    expect(r.matched).toBe(false);
    expect(r.mode).toBe('demo');
  });

  it('keeps every demo zone on the Indian coast (rough offshore bounds)', () => {
    expect(DEMO_FISHING_AREAS.length).toBeGreaterThanOrEqual(2);
    for (const a of DEMO_FISHING_AREAS) {
      expect(a.lat).toBeGreaterThanOrEqual(5);
      expect(a.lat).toBeLessThanOrEqual(24);
      expect(a.lon).toBeGreaterThanOrEqual(68);
      expect(a.lon).toBeLessThanOrEqual(90);
    }
  });
});

describe('resolvePosition (gps / manual / demo)', () => {
  it('uses browser coordinates verbatim in gps mode', () => {
    const r = resolvePosition('Bay of Bengal Demo Zone', { latitude: 19.05, longitude: 71.9 });
    expect(r.mode).toBe('gps');
    expect(r.lat).toBe(19.05);
    expect(r.lon).toBe(71.9);
  });

  it('GPS overrides even a matching zone label', () => {
    const r = resolvePosition('arabian-sea-north', { latitude: 8.1, longitude: 77.2 });
    expect(r.mode).toBe('gps');
    expect(r.lat).toBe(8.1);
  });

  it('reports manual for a matched zone without coordinates', () => {
    const r = resolvePosition('Bay of Bengal Demo Zone');
    expect(r.mode).toBe('manual');
    expect(r.lat).toBe(12.5);
    expect(r.matched).toBe(true);
  });

  it('reports demo for unknown labels without coordinates', () => {
    const r = resolvePosition('Your Fishing Area');
    expect(r.mode).toBe('demo');
    expect(r.matched).toBe(false);
  });
});
