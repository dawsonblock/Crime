-- Enable the PostGIS extension for spatial index queries, distance operations, and corridor routing
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Table: raw_items
-- Standard raw incoming scraped feed repository
CREATE TABLE IF NOT EXISTS raw_items (
    id VARCHAR(255) PRIMARY KEY,
    source_key VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    original_url TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Table: canonical_incidents
-- Cleaned, deduplicated, geocoded, and scored safety incident data warehouse
CREATE TABLE IF NOT EXISTS canonical_incidents (
    id VARCHAR(255) PRIMARY KEY,
    source_key VARCHAR(255) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'official', 'media', 'government'
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    original_url TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Ingestion Trust & Classification Taxonomy
    event_type VARCHAR(100) NOT NULL, -- e.g., 'assault', 'weapons', 'shooting'
    severity VARCHAR(50) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    confidence REAL NOT NULL, -- range 0.00 - 1.00
    
    -- Spatial Location & Confidence Metadata
    location_text TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_precision VARCHAR(100) NOT NULL, -- 'exact', 'block', 'intersection', 'neighbourhood', 'city', 'unknown'
    location_confidence REAL NOT NULL, -- range 0.00 - 1.00
    
    -- Synchronization & Quality Integrity Guards
    source_hash VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    threat_score REAL NOT NULL, -- range 0.00 - 100.00 computed from spatial threat rules
    is_verified BOOLEAN DEFAULT TRUE NOT NULL,
    
    -- PostGIS geospatial point indexing element (SRID 4326 for WGS 84 GPS standard coords)
    geom GEOMETRY(Point, 4326)
);

-- 3. Core Geospatial Indexes
-- Enable high-speed radius, clustering, and corridor searches using GIST PostGIS spatial indexes
CREATE INDEX IF NOT EXISTS idx_canonical_incidents_geom 
ON canonical_incidents USING GIST (geom);

-- 4. Analytical Performance Indexes
-- Boost performance for safety feeds, dashboards, trend charts, and date searches
CREATE INDEX IF NOT EXISTS idx_canonical_incidents_published_at 
ON canonical_incidents (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_incidents_event_type 
ON canonical_incidents (event_type);

CREATE INDEX IF NOT EXISTS idx_canonical_incidents_severity 
ON canonical_incidents (severity);

CREATE INDEX IF NOT EXISTS idx_canonical_incidents_threat_score 
ON canonical_incidents (threat_score DESC);
