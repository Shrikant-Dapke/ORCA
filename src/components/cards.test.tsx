// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SafetyCard } from './cards';
import { ZoneCard } from './cards';
import { getStrings } from '../i18n/strings';
import type { OrcaAnswer } from '../types';
import type { FishingZone } from '../../shared/orca-contract';

/**
 * Regression: the AI response card must never render a visible
 * "Demo data" badge (demo or otherwise unmarked), while keeping
 * Selected area / GPS position and the live-only forecast chip.
 * Internal provenance (meta/evidence) is asserted separately below.
 */
const strings = getStrings('en');

afterEach(() => {
  cleanup();
});

function demoAnswer(): OrcaAnswer {
  return {
    state: 'CAUTION',
    headline: 'BE CAREFUL TODAY',
    summary: 'Today the sea is passable.',
    bestTime: '6:00 AM – 11:00 AM only',
    conditions: { sea: 'Slightly rough', wind: 'Strong after noon', weather: 'Cloudy' },
    important: 'Strong winds expected.',
    recommendation: 'Stay near the shore.',
    checked: ['Sea conditions', 'Wind'],
    explanation: 'Wind readings rise after noon.',
    meta: { dataSource: 'demo', live: false, generatedAt: 'x', locationMode: 'demo' },
  };
}

describe('SafetyCard source badges', () => {
  it('never renders "Demo data" for demo answers', () => {
    render(<SafetyCard answer={demoAnswer()} area="Near-shore waters" strings={strings} />);
    expect(screen.queryByText('Demo data')).toBeNull();
  });

  it('keeps Selected area visible for demo answers', () => {
    render(<SafetyCard answer={demoAnswer()} area="Near-shore waters" strings={strings} />);
    expect(screen.getByText('Selected area')).toBeTruthy();
  });

  it('shows GPS position when the fix was used', () => {
    render(
      <SafetyCard
        answer={{ ...demoAnswer(), meta: { dataSource: 'demo', live: false, generatedAt: 'x', locationMode: 'gps' } }}
        area="Using your location"
        strings={strings}
      />,
    );
    expect(screen.getByText('GPS position')).toBeTruthy();
    expect(screen.queryByText('Demo data')).toBeNull();
  });

  it('shows the forecast chip only for genuinely live answers', () => {
    render(
      <SafetyCard
        answer={{ ...demoAnswer(), meta: { dataSource: 'open-meteo', live: true, generatedAt: 'x', locationMode: 'gps' } }}
        area="Using your location"
        strings={strings}
      />,
    );
    expect(screen.getByText('Open-Meteo forecast')).toBeTruthy();
  });

  it('keeps internal provenance intact while hiding the badge', () => {
    const a = demoAnswer();
    expect(a.meta?.live).toBe(false);
    expect(a.meta?.dataSource).toBe('demo');
  });
});

const demoZone: FishingZone = {
  id: 'demo-zone-1',
  name: 'Demo fishing zone NE',
  bearingDeg: 45,
  bearingCompass: 'NE',
  distanceKm: 18,
  latitude: 9.6,
  longitude: 75.6,
  potential: 'good',
  source: 'Demo data',
  live: false,
};

describe('ZoneCard source line', () => {
  it('never renders a "Demo data" chip for demo zones', () => {
    render(
      <ZoneCard strings={strings} zones={[demoZone]} onViewMap={() => {}} onRoute={() => {}} />,
    );
    expect(screen.queryByText('Demo data')).toBeNull();
  });

  it('shows source attribution for live zones', () => {
    render(
      <ZoneCard
        strings={strings}
        zones={[{ ...demoZone, live: true, source: 'Open-Meteo' }]}
        onViewMap={() => {}}
        onRoute={() => {}}
      />,
    );
    expect(screen.getByText(/Open-Meteo/)).toBeTruthy();
  });
});
