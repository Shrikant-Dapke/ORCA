/**
 * Shared ORCA response contract — the ONLY shape the API promises.
 * Both `server/` and `src/api/client.ts` import from here so the
 * frontend UI model (`OrcaAnswer`) never has to change when the
 * backend evolves. Internal agent details must never leak through it.
 */

export type OrcaStatus = 'safe' | 'caution' | 'danger';

/** Fisherman-facing response locale. Evidence/source names stay English. */
export type ResponseLocale = 'en' | 'hi' | 'mr';

/** Named reading source. Widen this union (never narrow) when adding providers. */
export type DataSource = 'demo' | 'open-meteo';

export interface OrcaConditions {
  sea?: string;
  wind?: string;
  weather?: string;
}

export interface OrcaMeta {
  /** Where the underlying readings came from. */
  dataSource: DataSource;
  /** True ONLY when readings come from a real live marine data source. */
  live: boolean;
  generatedAt: string;
  /**
   * How the fishing area was positioned for this request:
   *  gps    — browser coordinates supplied and used (never demo coords);
   *  manual — no coordinates, but the label matched a known demo zone;
   *  demo   — no coordinates and no match; default demo waters.
   * Raw coordinates are never echoed in metadata (privacy).
   */
  locationMode?: LocationMode;
}

export type LocationMode = 'demo' | 'gps' | 'manual';

/** Browser geolocation fix. Optional on the wire; validated server-side. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ORCAResponse {
  status: OrcaStatus;
  /** Short badge-style headline, e.g. "SAFE TO GO". */
  headline: string;
  /** One plain-language sentence a fisherman can act on. */
  summary: string;
  bestTime?: string;
  conditions: OrcaConditions;
  warning?: string;
  recommendation?: string;
  /** Short human-readable account of what was checked and why. */
  explanation?: string;
  /** Internal check trail (agent names + key readings). No agent internals. */
  evidence?: string[];
  meta?: OrcaMeta;
  /** Locale this response is written in (evidence stays English). */
  locale?: ResponseLocale;
  /** Candidate fishing zones, when the question asks where to fish. */
  zones?: FishingZone[];
  /** Calculated safe-risk route, when the question asks how to reach a zone. */
  route?: RouteInfo;
  /** Echoed conversation session id (client-generated, opaque). */
  sessionId?: string;
  /**
   * Conversational LLM reply, present only when model synthesis succeeded
   * and passed validation. The structured fields above (status, headline,
   * conditions, zones, route, explanation) always stay deterministic.
   */
  message?: string;
}

/** Waypoint on a calculated route. Never official navigation. */
export interface RouteWaypoint {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  distanceKm: number;
  bearingDeg: number;
  bearingCompass: string;
  waypoints: RouteWaypoint[];
  /** 0–100 environmental risk score (higher = riskier). */
  riskScore: number;
  riskLevel: 'low' | 'moderate' | 'high';
  note: string;
  source: string;
}

/** Candidate fishing zone. `live:false` + demo source = scripted demo. */
export interface FishingZone {
  id: string;
  name: string;
  bearingDeg: number;
  bearingCompass: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  sst?: string;
  chlorophyll?: string;
  potential: 'moderate' | 'good';
  source: string;
  live: boolean;
}

/** Raw wire shape of POST /api/chat — validated server-side. */
export interface ChatRequestBody {
  message: unknown;
  location?: unknown;
  coordinates?: unknown;
  locale?: unknown;
  sessionId?: unknown;
}

/** Validated request handed to the orchestrator. */
export interface ChatRequest {
  /** Fisherman's question, trimmed, 1..500 chars. */
  message: string;
  /** Free-text area label. Never treated as a real geolocation. */
  location: string;
  /**
   * Browser GPS fix when the fisherman tapped "Use My Location".
   * Used only for the current request (never persisted) and only sent to
   * the configured marine/weather providers. Absent in demo/manual mode.
   */
  coordinates?: Coordinates;
  /** Response language. UI locale default; Devanagari input auto-detects. */
  locale?: ResponseLocale;
  /** Opaque client-generated conversation id (validated shape only). */
  sessionId?: string;
}

export interface ApiErrorBody {
  error: {
    code: 'INVALID_REQUEST' | 'PROVIDER_UNAVAILABLE' | 'INTERNAL_ERROR' | 'NOT_FOUND';
    message: string;
  };
}
