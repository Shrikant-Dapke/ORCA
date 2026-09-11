/**
 * Shared ORCA response contract.
 */
export type OrcaStatus = 'safe' | 'caution' | 'danger';
export type ResponseLocale = 'en' | 'hi' | 'mr';
export type DataSource = 'demo' | 'open-meteo' | 'incois';
export interface OrcaConditions { sea?: string; wind?: string; weather?: string; }
export interface OrcaMeta { dataSource: DataSource; live: boolean; generatedAt: string; locationMode?: LocationMode; }
export type LocationMode = 'demo' | 'gps' | 'manual';
export interface Coordinates { latitude:number; longitude:number; }
export interface ORCAResponse {
  status:OrcaStatus; headline:string; summary:string; bestTime?:string; conditions:OrcaConditions;
  warning?:string; recommendation?:string; explanation?:string; evidence?:string[]; meta?:OrcaMeta;
  locale?:ResponseLocale; zones?:FishingZone[]; route?:RouteInfo; sessionId?:string; message?:string;
}
export interface RouteWaypoint { latitude:number; longitude:number; }
export interface RouteInfo { distanceKm:number; bearingDeg:number; bearingCompass:string; waypoints:RouteWaypoint[]; riskScore:number; riskLevel:'low'|'moderate'|'high'; note:string; source:string; }
export interface FishingZone {
  id:string; name:string; bearingDeg:number; bearingCompass:string; distanceKm:number; latitude:number; longitude:number;
  sst?:string; chlorophyll?:string; potential:'moderate'|'good'; source:string; live:boolean;
}
export interface ChatRequestBody { message:unknown; location?:unknown; coordinates?:unknown; locale?:unknown; sessionId?:unknown; }
export interface ChatRequest {
  message:string; location:string; coordinates?:Coordinates; locale?:ResponseLocale; sessionId?:string;
}
export interface ApiErrorBody { error:{code:'INVALID_REQUEST'|'PROVIDER_UNAVAILABLE'|'INTERNAL_ERROR'|'NOT_FOUND';message:string}; }
