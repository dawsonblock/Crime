import { LocationPrecisionType, ResolvedLocation } from "../types";

// Coordinate boundaries for metropolitan Saskatoon
export const SASKATOON_BOUNDS = {
  minLat: 52.05,
  maxLat: 52.25,
  minLng: -106.85,
  maxLng: -106.50
};

export function isWithinSaskatoonBounds(lat: number, lng: number): boolean {
  return lat >= SASKATOON_BOUNDS.minLat && lat <= SASKATOON_BOUNDS.maxLat &&
         lng >= SASKATOON_BOUNDS.minLng && lng <= SASKATOON_BOUNDS.maxLng;
}

// Saskatoon Known Neighborhood Centroids
export const saskatoonNeighborhoods: Record<string, { lat: number; lng: number }> = {
  "pleasant hill": { lat: 52.1265, lng: -106.6961 },
  "stonebridge": { lat: 52.0945, lng: -106.6267 },
  "nutana": { lat: 52.1194, lng: -106.6573 },
  "sutherland": { lat: 52.1384, lng: -106.6025 },
  "broadway": { lat: 52.1189, lng: -106.6565 },
  "riversdale": { lat: 52.1245, lng: -106.6781 },
  "downtown": { lat: 52.1301, lng: -106.6611 },
  "city park": { lat: 52.1402, lng: -106.6552 },
  "caswell hill": { lat: 52.1385, lng: -106.6788 },
  "silverwood heights": { lat: 52.1762, lng: -106.6288 },
  "westview": { lat: 52.1432, lng: -106.7262 },
  "confederation park": { lat: 52.1444, lng: -106.7111 },
  "briarwood": { lat: 52.1121, lng: -106.5762 },
  "evergreen": { lat: 52.1644, lng: -106.5655 },
  "hampton village": { lat: 52.1522, lng: -106.7277 },
  "willowgrove": { lat: 52.1431, lng: -106.5562 },
  "exhibition": { lat: 52.1022, lng: -106.6666 },
  "reid park": { lat: 52.1190, lng: -106.7100 },
  "forest grove": { lat: 52.1481, lng: -106.5862 },
  "mayfair": { lat: 52.1470, lng: -106.6770 },
  "meadowgreen": { lat: 52.1150, lng: -106.7050 },
  "mount royal": { lat: 52.1320, lng: -106.7110 },
  "lakewood": { lat: 52.1050, lng: -106.5920 },
  "wildwood": { lat: 52.1150, lng: -106.6050 },
  "rosewood": { lat: 52.0910, lng: -106.5800 },
  "lakeridge": { lat: 52.1110, lng: -106.5510 },
  "parkridge": { lat: 52.1180, lng: -106.7380 },
  "fairhaven": { lat: 52.1110, lng: -106.7280 },
  "dundonald": { lat: 52.1400, lng: -106.7320 },
  "kensington": { lat: 52.1410, lng: -106.7580 },
  "cooperstown": { lat: 52.1332, lng: -106.6700 } // city center fallback
};

// Major Saskatchewan City Centroids (Provincial scope)
export const saskatchewanCities: Record<string, { lat: number; lng: number }> = {
  "swift current": { lat: 50.2853, lng: -107.7977 },
  "north battleford": { lat: 52.7576, lng: -108.2861 },
  "battleford": { lat: 52.7167, lng: -108.3167 },
  "yorkton": { lat: 51.2139, lng: -102.4628 },
  "estevan": { lat: 49.1394, lng: -102.9856 },
  "weyburn": { lat: 49.6608, lng: -103.8525 },
  "lloydminster": { lat: 53.2785, lng: -110.0051 },
  "humboldt": { lat: 52.2019, lng: -105.1232 },
  "melfort": { lat: 52.8564, lng: -104.6172 },
  "melville": { lat: 50.9308, lng: -102.8075 },
  "meadow lake": { lat: 54.1245, lng: -108.4357 },
  "pelican narrows": { lat: 55.1719, lng: -102.8122 },
  "creighton": { lat: 54.7610, lng: -101.8845 },
  "kindersley": { lat: 51.4678, lng: -109.1601 },
  "rosetown": { lat: 51.5542, lng: -107.9897 },
  "outlook": { lat: 51.4939, lng: -107.0503 },
  "martensville": { lat: 52.2897, lng: -106.6667 },
  "warman": { lat: 52.3219, lng: -106.5842 },
  "regina": { lat: 50.4501, lng: -104.6181 },
  "prince albert": { lat: 53.2033, lng: -105.7531 },
  "moose jaw": { lat: 50.3933, lng: -105.5519 },
  "dundurn": { lat: 51.8105, lng: -106.5034 },
  "la ronge": { lat: 55.1017, lng: -105.2831 },
  "saskatchewan": { lat: 52.9399, lng: -106.4509 }
};

// Check if addressText is potentially a junk/unextractable phrase rather than a real street address
export function isValidSaskatoonAddressText(text: string): boolean {
  if (!text || text.trim() === "") return false;
  const cleaned = text.trim().toLowerCase();

  // Guard against short fragments or pure numbers
  if (cleaned.length < 4) return false;
  
  // Guard against common temporal, pronoun, or conversational words
  const temporalGunk = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night|yesterday|today|april|may|june|july|august|september|october|november|december|discovered|finding|discovering)$/i;
  if (temporalGunk.test(cleaned)) return false;

  // Guard against phrases indicating generic news text that leaked into geocoding
  const newsLeakedGunk = [
    "discovered monday", "discovered tuesday", "found monday", "police discovered", "reported a", 
    "that resulted in", "four guns", "shot on", "stabbing on", "assault on", "investigation on",
    "stolen on", "robbed on", "suspects were", "charges laid", "court hearing", "in court"
  ];
  if (newsLeakedGunk.some(phrase => cleaned.includes(phrase))) return false;

  return true;
}

// Parsing street patterns like: "300 Block of 20th Street West"
export function parseSaskatoonStreetPattern(text: string): string | null {
  const norm = text.toLowerCase().trim();
  
  // Regular expressions to match common Saskatoon block-level and street layouts
  const blockRegex = /\b(\d+)\s*(?:block\s*of|block)\s+([0-9a-z\s]+?\s+(?:avenue|ave|street|st|road|rd|crescent|cres|drive|dr|way|lane|ln|crossing|boulevard|blvd)(?:\s+(?:west|east|north|south|w|e|n|s))?)\b/i;
  const matchBlock = text.match(blockRegex);
  if (matchBlock) {
    const num = matchBlock[1];
    const street = matchBlock[2].trim();
    return `${num} Block of ${street.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`;
  }

  const intersectionRegex = /\b([a-z0-9\s]+?)\s+(?:and|at|\/|&)\s+([a-z0-9\s]+?)\s+(?:avenue|ave|street|st|road|rd|crescent|cres|drive|dr|way|boulevard|blvd)\b/i;
  const matchIntersection = text.match(intersectionRegex);
  if (matchIntersection) {
    return `${matchIntersection[1].trim()} & ${matchIntersection[2].trim()}`;
  }

  return null;
}

export function extractLocationText(text: string): string {
  const lower = text.toLowerCase();

  // 1. Try to find local registered neighborhoods first
  for (const [nbhood, coords] of Object.entries(saskatoonNeighborhoods)) {
    if (lower.includes(nbhood) && nbhood !== "cooperstown") {
      return `${nbhood.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}, Saskatoon, SK`;
    }
  }

  // 2. Try to find Saskatchewan cities
  for (const [city] of Object.entries(saskatchewanCities)) {
    if (lower.includes(city) && city !== "saskatchewan") {
      return `${city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}, SK`;
    }
  }

  // 3. Try to parse standard road block patterns
  const parsedBlock = parseSaskatoonStreetPattern(text);
  if (parsedBlock) {
    return `${parsedBlock}, Saskatoon, SK`;
  }

  // Regular expression to grab street context inside text
  const prepRegex = /\b(?:on|at|near|along|around|in)\s+([0-9A-Z][A-Za-z0-9\s#\-]{3,40}(?:Avenue|Ave|Street|St|Road|Rd|Crescent|Cres|Drive|Dr|Highway|Hwy|Way|Crossing|Bridge|Park)?)/;
  const match = text.match(prepRegex);
  if (match && isValidSaskatoonAddressText(match[1])) {
    return `${match[1].trim()}, Saskatoon, SK`;
  }

  return "Saskatoon, SK";
}

export async function geocodeLocation(addressText: string, sourceKey: string): Promise<ResolvedLocation> {
  let determinedPrecision: LocationPrecisionType = "unknown";
  const lowerAddress = addressText.toLowerCase().trim();

  // Clean the text to see if it's junk
  const isAddressLegitimate = isValidSaskatoonAddressText(addressText);

  if (!isAddressLegitimate) {
    // Return explicit low confidence, unlocatable city center centroid record
    return {
      latitude: 52.1332,
      longitude: -106.6700,
      displayLatitude: 52.1,
      displayLongitude: -106.7,
      locationPrecision: "unknown",
      locationConfidence: 0.10, // low confidence
      locationText: "Saskatoon Centroid (Low Confidence Extract)"
    };
  }

  // 1. Check for intersections and blocks
  if (lowerAddress.includes("&") || lowerAddress.includes(" and ") || lowerAddress.includes(" at ") || lowerAddress.includes("near") || lowerAddress.includes(" / ")) {
    determinedPrecision = "intersection";
  } else if (lowerAddress.includes("block of") || lowerAddress.includes("block")) {
    determinedPrecision = "block";
  } else {
    // Check if neighborbood
    for (const nbhood of Object.keys(saskatoonNeighborhoods)) {
      if (lowerAddress.includes(nbhood)) {
        determinedPrecision = "neighbourhood";
        break;
      }
    }
  }

  // 2. Exact address pattern
  const exactPattern = /\b([0-9]{1,5})\s+([a-zA-Z0-9]{3,})\s+(avenue|ave|street|st|road|rd|crescent|cres|drive|dr|way|lane|ln|court|ct|boulevard|blvd)\b/i;
  const matchExact = addressText.match(exactPattern);
  if (matchExact && determinedPrecision === "unknown") {
    determinedPrecision = "exact";
  }

  // Formulate Geocoding Query
  let query = addressText;
  if (!lowerAddress.includes("saskatchewan") && !lowerAddress.includes("sk") && !lowerAddress.includes("saskatoon")) {
    query = `${addressText}, Saskatoon, SK, Canada`;
  } else if (!lowerAddress.includes("canada")) {
    query = `${addressText}, Canada`;
  }

  let lat = 52.1332;
  let lng = -106.6700;
  let conf = 0.50;
  let successGeocoding = false;

  // Option A: Mapbox Geocoding Call
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) {
    try {
      const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=1`;
      const response = await fetch(mapboxUrl);
      if (response.ok) {
        const data = await response.json();
        if (data && data.features && data.features.length > 0) {
          const feature = data.features[0];
          lng = feature.center[0];
          lat = feature.center[1];
          conf = feature.relevance ? Math.round(feature.relevance * 100) / 100 : 0.85;
          
          // Verify bounding box constraint for Saskatoon mappings
          const fitsSaskatoon = isWithinSaskatoonBounds(lat, lng);
          if (fitsSaskatoon || lowerAddress.includes("sk") || lowerAddress.includes("saskatchewan")) {
            successGeocoding = true;
            if (feature.place_type && feature.place_type.includes("address")) {
              determinedPrecision = "exact";
            } else if (feature.place_type && feature.place_type.includes("neighborhood")) {
              determinedPrecision = "neighbourhood";
            } else if (feature.place_type && feature.place_type.includes("place")) {
              determinedPrecision = "city";
            }
          }
        }
      }
    } catch (err) {
      console.error(`[Geocoding API] Mapbox Service connection error:`, err);
    }
  }

  // Option B: OpenStreetMap Nominatim Geocoding Call
  if (!successGeocoding) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "SaskatoonSafetyMap/2.0 (BlockDawson@gmail.com)"
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const result = data[0];
          const tempLat = parseFloat(result.lat);
          const tempLng = parseFloat(result.lon);
          
          if (isWithinSaskatoonBounds(tempLat, tempLng) || lowerAddress.includes("sk") || lowerAddress.includes("saskatchewan")) {
            lat = tempLat;
            lng = tempLng;
            const importance = result.importance ? parseFloat(result.importance) : 0.5;
            conf = Math.round((0.5 + 0.5 * importance) * 100) / 100;
            successGeocoding = true;

            if (result.type === "house" || result._type === "house" || result.class === "place" && result.type === "house") {
              determinedPrecision = "exact";
            }
          }
        }
      }
    } catch (err) {
      console.error(`[Geocoding API] Nominatim Service connection error:`, err);
    }
  }

  // Option C: Deterministic Local Table Fallback
  if (!successGeocoding) {
    // 1. Check known neighborhood centroid list
    for (const [nbhood, coords] of Object.entries(saskatoonNeighborhoods)) {
      if (lowerAddress.includes(nbhood)) {
        lat = coords.lat;
        lng = coords.lng;
        conf = 0.70;
        determinedPrecision = "neighbourhood";
        successGeocoding = true;
        break;
      }
    }

    // 2. Check other Saskatchewan cities centroid
    if (!successGeocoding) {
      for (const [city, coords] of Object.entries(saskatchewanCities)) {
        if (lowerAddress.includes(city)) {
          lat = coords.lat;
          lng = coords.lng;
          conf = 0.80;
          determinedPrecision = "city";
          successGeocoding = true;
          break;
        }
      }
    }
  }

  // Option D: Graceful, Safe Default (Downtown Saskatoon Centroid with LOW confidence)
  if (!successGeocoding) {
    lat = 52.1332;
    lng = -106.6700;
    conf = 0.15; // explicit low confidence indicator
    determinedPrecision = "city";
  }

  // Localizing Precision Displays
  let finalLocationText = addressText;

  if (determinedPrecision === "exact") {
    if (matchExact) {
      const numStr = matchExact[1];
      const num = parseInt(numStr, 10);
      let roundedBlock = "0-100 Block of";
      if (num >= 100) {
        roundedBlock = `${Math.floor(num / 100) * 100} Block of`;
      }
      finalLocationText = addressText.replace(numStr, roundedBlock);
    } else {
      finalLocationText = addressText + " (Block-Level Approximation)";
    }
    // Generalize precision to block level for display & storage
    determinedPrecision = "block";
  }

  // Round display coordinates appropriately to preserve privacy & reflect the precision layer.
  // For 'exact' precision, we securely round to 3 decimal places (~100m, block approximation) on the map interface.
  let displayLat = lat;
  let displayLng = lng;

  if (determinedPrecision === "block" || determinedPrecision === "intersection") {
    displayLat = Math.round(lat * 1000) / 1000;
    displayLng = Math.round(lng * 1000) / 1000;
    // Overwrite exact coordinates with block-level generalized ones to guarantee privacy
    lat = displayLat;
    lng = displayLng;
  } else if (determinedPrecision === "neighbourhood") {
    displayLat = Math.round(lat * 100) / 100;
    displayLng = Math.round(lng * 100) / 100;
    lat = displayLat;
    lng = displayLng;
  } else {
    displayLat = Math.round(lat * 10) / 10;
    displayLng = Math.round(lng * 10) / 10;
    lat = displayLat;
    lng = displayLng;
  }

  if (determinedPrecision === "unknown") {
    determinedPrecision = "block";
  }

  return {
    latitude: lat,
    longitude: lng,
    displayLatitude: displayLat,
    displayLongitude: displayLng,
    locationPrecision: determinedPrecision,
    location_precision: determinedPrecision,
    locationConfidence: conf,
    locationText: finalLocationText
  };
}

export async function geocodeBatchLocation(addresses: string[], sourceKey: string): Promise<ResolvedLocation[]> {
  return Promise.all(addresses.map(addr => geocodeLocation(addr, sourceKey)));
}
