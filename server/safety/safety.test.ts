import { afterEach, describe, expect, it, vi } from 'vitest';
import { orchestrate } from '../orchestrator.js';
import { DemoMarineProvider } from '../providers/demo.js';
import { ProviderError, type MarineDataProvider } from '../providers/types.js';
import { safetyFromEnv } from '../providers/select.js';
import { DeterministicReasoningEngine } from '../reasoning/engine.js';
import { DemoSafetyProvider } from './demoSafety.js';
import { IncoisSafetyProvider } from './incois.js';
import { NullEcosystem } from '../ecosystem/types.js';
import {
  NullSafetyProvider,
  activeAdvisories,
  advisoryToWarning,
  type MarineSafetyProvider,
  type SafetyAdvisory,
} from './types.js';

function advisory(over: Partial<SafetyAdvisory> = {}): SafetyAdvisory {
  return {
    severity: 'moderate',
    type: 'small-vessel',
    headline: 'Rough-sea caution for small vessels',
    validFrom: '2020-01-01T00:00:00Z',
    validUntil: '2099-01-01T00:00:00Z',
    area: 'your selected fishing area',
    source: 'INCOIS SVAS',
    live: true,
    ...over,
  };
}

/** Calm seas, no marine warnings — isolates the advisory effect on reasoning. */
function calmMarine(): MarineDataProvider {
  return {
    name: 'CalmStub',
    dataSource: 'demo',
    getSea: async () => ({ waveHeightM: 0.6, seaText: 'Calm' }),
    getWeather: async () => ({ windKph: 12, gustKph: 18, skyText: 'Clear', windText: 'Light' }),
    getHazards: async () => ({ activeWarnings: [] }),
    getAdvice: async () => ({
      bestTime: 'Early morning',
      warning: 'Sea can change fast.',
      recommendation: 'Go in the morning.',
    }),
  };
}

function stubSafety(list: SafetyAdvisory[]): MarineSafetyProvider {
  return { name: 'StubSafety', advisorySource: 'demo', getAdvisories: async () => list };
}

function depsWith(safety: MarineSafetyProvider) {
  return { provider: calmMarine(), reasoning: new DeterministicReasoningEngine(), safety, ecosystem: new NullEcosystem() };
}

describe('advisoryToWarning (central mapping)', () => {
  it('maps severe → severe warning with source label', () => {
    expect(advisoryToWarning(advisory({ severity: 'severe' }))).toEqual({
      level: 'severe',
      title: 'INCOIS SVAS: Rough-sea caution for small vessels',
    });
  });

  it('maps moderate → moderate warning', () => {
    expect(advisoryToWarning(advisory()))?.toMatchObject({ level: 'moderate' });
  });

  it('drops info advisories from status (evidence-only)', () => {
    expect(advisoryToWarning(advisory({ severity: 'info' }))).toBeNull();
  });

  it('suffixes demo items — never labeled live', () => {
    expect(advisoryToWarning(advisory({ live: false, source: 'Demo safety watch' }))?.title).toContain(
      '(demo)',
    );
  });
});

describe('activeAdvisories (validity window)', () => {
  it('keeps currently-valid advisories', () => {
    expect(activeAdvisories([advisory()])).toHaveLength(1);
  });

  it('ignores expired advisories', () => {
    const expired = advisory({ validFrom: '2020-01-01T00:00:00Z', validUntil: '2020-02-01T00:00:00Z' });
    expect(activeAdvisories([expired])).toHaveLength(0);
  });

  it('ignores not-yet-valid advisories', () => {
    const future = advisory({ validFrom: '2099-01-01T00:00:00Z', validUntil: '2099-06-01T00:00:00Z' });
    expect(activeAdvisories([future])).toHaveLength(0);
  });

  it('keeps advisories with unparseable dates (fail-open: fisherman-safe default)', () => {
    expect(activeAdvisories([advisory({ validFrom: 'n/a', validUntil: 'n/a' })])).toHaveLength(1);
  });
});

describe('DemoSafetyProvider (scripted, never live)', () => {
  const demo = new DemoSafetyProvider();

  it('issues a severe advisory for danger questions', async () => {
    const list = await demo.getAdvisories({ label: 'X', topic: 'danger', timeframe: 'general' });
    expect(list).toHaveLength(1);
    expect(list[0].severity).toBe('severe');
    expect(list[0].live).toBe(false);
  });

  it('issues a moderate advisory for wind/spot/sea questions', async () => {
    for (const topic of ['wind', 'spot', 'sea'] as const) {
      const list = await demo.getAdvisories({ label: 'X', topic, timeframe: 'general' });
      expect(list[0]?.severity).toBe('moderate');
    }
  });

  it('issues nothing for calm/general questions (SAFE stays reachable)', async () => {
    await expect(
      demo.getAdvisories({ label: 'X', topic: 'general', timeframe: 'general' }),
    ).resolves.toEqual([]);
  });

  it('issues advisories valid right now', async () => {
    const now = Date.now();
    const list = await demo.getAdvisories({ label: 'X', topic: 'danger', timeframe: 'general' });
    expect(Date.parse(list[0].validFrom) <= now && now <= Date.parse(list[0].validUntil)).toBe(true);
  });
});

describe('IncoisSafetyProvider (honest stub)', () => {
  it('fails with ProviderError instead of inventing an endpoint', async () => {
    await expect(new IncoisSafetyProvider().getAdvisories({ label: 'X', topic: 'sea', timeframe: 'today' }))
      .rejects.toBeInstanceOf(ProviderError);
  });
});

describe('orchestrator: official advisories drive the existing engine', () => {
  it('severe advisory + calm seas → DANGER (no weather reading overrides it)', async () => {
    const res = await orchestrate(
      { message: 'Can I go fishing tomorrow?', location: 'Your Fishing Area' },
      depsWith(stubSafety([advisory({ severity: 'severe' })])),
    );
    expect(res.status).toBe('danger');
    expect(res.evidence?.join(' ')).toContain('INCOIS SVAS');
  });

  it('caution advisory + calm seas → CAUTION', async () => {
    const res = await orchestrate(
      { message: 'How is the sea?', location: 'Your Fishing Area' },
      depsWith(stubSafety([advisory({ severity: 'moderate' })])),
    );
    expect(res.status).toBe('caution');
  });

  it('expired severe advisory + calm seas → SAFE (ignored, existing marine reasoning)', async () => {
    const res = await orchestrate(
      { message: 'How is the sea?', location: 'Your Fishing Area' },
      depsWith(
        stubSafety([advisory({ severity: 'severe', validUntil: '2020-02-01T00:00:00Z' })]),
      ),
    );
    expect(res.status).toBe('safe');
  });

  it('no advisories + calm seas → SAFE (existing marine reasoning untouched)', async () => {
    const res = await orchestrate(
      { message: 'How is the sea?', location: 'Your Fishing Area' },
      depsWith(new NullSafetyProvider()),
    );
    expect(res.status).toBe('safe');
  });

  it('demo safety + demo marine still script every state for judges', async () => {
    const deps = {
      provider: new DemoMarineProvider(),
      reasoning: new DeterministicReasoningEngine(),
      safety: new DemoSafetyProvider(),
      ecosystem: new NullEcosystem(),
    };
    const safe = await orchestrate({ message: 'Hello', location: 'X' }, deps);
    const caution = await orchestrate({ message: 'Will there be strong winds?', location: 'X' }, deps);
    const danger = await orchestrate({ message: 'Is there any danger nearby?', location: 'X' }, deps);
    expect(safe.status).toBe('safe');
    expect(caution.status).toBe('caution');
    expect(danger.status).toBe('danger');
  });

  it('safety provider failure propagates (API maps to 502)', async () => {
    const failing: MarineSafetyProvider = {
      name: 'FailingSafety',
      advisorySource: 'incois',
      getAdvisories: async () => {
        throw new ProviderError('FailingSafety', 'upstream down');
      },
    };
    await expect(
      orchestrate({ message: 'How is the sea?', location: 'X' }, depsWith(failing)),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('safetyFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('selects demo explicitly', () => {
    vi.stubEnv('ORCA_ADVISORY_SOURCE', 'demo');
    expect(safetyFromEnv().advisorySource).toBe('demo');
  });

  it('selects incois explicitly', () => {
    vi.stubEnv('ORCA_ADVISORY_SOURCE', 'incois');
    expect(safetyFromEnv().advisorySource).toBe('incois');
  });

  it('selects none explicitly', () => {
    vi.stubEnv('ORCA_ADVISORY_SOURCE', 'none');
    expect(safetyFromEnv().advisorySource).toBe('none');
  });

  it('pairs demo advisories with demo marine by default', () => {
    vi.stubEnv('ORCA_ADVISORY_SOURCE', '');
    expect(safetyFromEnv(process.env, 'demo').advisorySource).toBe('demo');
  });

  it('pairs NO advisories with live marine by default (never pollute live readings)', () => {
    vi.stubEnv('ORCA_ADVISORY_SOURCE', '');
    expect(safetyFromEnv(process.env, 'open-meteo').advisorySource).toBe('none');
  });
});
