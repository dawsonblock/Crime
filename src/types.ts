export type SeverityType = 'low' | 'medium' | 'high' | 'critical';

export type LocationPrecisionType = 'exact' | 'block' | 'intersection' | 'neighbourhood' | 'city' | 'unknown';

export type SourceType = 'official' | 'government' | 'media' | 'unknown';

export interface EventSource {
  key: string;
  name: string;
  sourceType: SourceType;
  baseUrl: string;
  enabled: boolean;
}

export interface EventItem {
  id: string;
  sourceKey: string;
  sourceName: string;
  sourceType: SourceType;
  title: string;
  summary: string;
  originalUrl: string;
  publishedAt: string;
  retrievedAt: string;
  eventType: string; // e.g. 'assault', 'shooting', 'robbery', 'dangerous_person_alert'
  severity: SeverityType;
  confidence: number;
  location_precision?: LocationPrecisionType;
  incident_severity?: SeverityType;
  active_risk_state?: 'active' | 'resolved' | 'historical' | 'unknown';
  current_risk_score?: number;
  geo_scope?: 'Saskatoon' | 'Saskatchewan' | 'national' | 'unknown';
  confidence_score?: number;
  locationText: string;
  latitude: number;
  longitude: number;
  displayLatitude?: number;
  displayLongitude?: number;
  locationPrecision: LocationPrecisionType;
  locationConfidence: number;
  sourceHash: string;
  createdAt: string;
  imageUrls?: string[];
  threatScore?: number;
  sourcesList?: Array<{ name: string; url: string; key: string }>;
  dedupeHash?: string;
  isVerified?: boolean;
  isGenerated?: boolean;
  isDerived?: boolean;
  sourceTier?: number;
  clusterScore?: number;
  incidentScore?: number;
  linkedEvents?: EventItem[];
}

export interface IngestionResult {
  success: boolean;
  count: number;
  message: string;
  addedEvents: EventItem[];
}

export interface CustomRouteItem {
  id: string;
  title: string;
  note: string;
  path: Array<[number, number]>; // Array of [latitude, longitude] tuples
  createdAt: string;
  isActive?: boolean;
}

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  displayLatitude?: number;
  displayLongitude?: number;
  locationPrecision: LocationPrecisionType;
  location_precision?: LocationPrecisionType;
  locationConfidence: number;
  locationText: string;
}


