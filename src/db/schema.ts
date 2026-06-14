import { pgTable, text, timestamp, doublePrecision, real, boolean, customType } from "drizzle-orm/pg-core";

// Custom PostGIS Geometry Point Type (SRID 4326)
const geometryPoint = customType<{ data: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
  toDriver(value: string) {
    return value; // E.g., 'SRID=4326;POINT(-106.67 52.13)'
  },
  fromDriver(value: any) {
    return value;
  }
});

// Raw ingestion feed table
export const rawItems = pgTable("raw_items", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  originalUrl: text("original_url").notNull(),
  publishedAt: timestamp("published_at").notNull(),
  retrievedAt: timestamp("retrieved_at").defaultNow().notNull()
});

// Canonical, deduplicated, geocoded, and scored analytical incidents
export const canonicalIncidents = pgTable("canonical_incidents", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull(), // 'official', 'media', 'government'
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  originalUrl: text("original_url").notNull(),
  publishedAt: timestamp("published_at").notNull(),
  retrievedAt: timestamp("retrieved_at").defaultNow().notNull(),
  eventType: text("event_type").notNull(), // e.g. 'assault', 'weapons'
  severity: text("severity").notNull(), // 'low', 'medium', 'high', 'critical'
  confidence: real("confidence").notNull(),
  locationText: text("location_text").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  locationPrecision: text("location_precision").notNull(), // 'block', 'intersection', etc.
  locationConfidence: real("location_confidence").notNull(),
  sourceHash: text("source_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  threatScore: real("threat_score").notNull(),
  isVerified: boolean("is_verified").default(true).notNull(),
  
  // PostGIS spatial coordinate column for geospatial queries, radius search, and corridor routing
  geom: geometryPoint("geom")
});
