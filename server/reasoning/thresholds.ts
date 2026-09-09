/**
 * Centralized safety thresholds — the ONLY place magic numbers live.
 * Tuned for small-boat fishermen; revisit with real data + domain review.
 */
export const THRESHOLDS = {
  /** Sustained wind (kph) at/above which a trip needs caution. */
  windCautionKph: 35,
  /** Sustained wind (kph) at/above which going out is dangerous. */
  windDangerKph: 60,
  /** Gust (kph) at/above which going out is dangerous regardless of average. */
  gustDangerKph: 75,
  /** Wave height (m) at/above which a trip needs caution. */
  waveCautionM: 2.0,
  /** Wave height (m) at/above which going out is dangerous. */
  waveDangerM: 3.5,
} as const;
