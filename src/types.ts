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
  locationText: string;
  latitude: number;
  longitude: number;
  locationPrecision: LocationPrecisionType;
  locationConfidence: number;
  sourceHash: string;
  createdAt: string;
  imageUrls?: string[];
  threatScore?: number;
  sourcesList?: Array<{ name: string; url: string; key: string }>;
  dedupeHash?: string;
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

