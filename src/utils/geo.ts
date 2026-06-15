import { LocationPrecisionType } from "../types";

export const saskatchewanCoordinatesMap: Record<string, { lat: number; lng: number }> = {
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
  "lumsden": { lat: 50.6436, lng: -104.8694 },
  "fort qu'appelle": { lat: 50.7672, lng: -103.7917 },
  "indian head": { lat: 50.5311, lng: -103.6681 },
  "moosomin": { lat: 50.1417, lng: -101.6833 },
  "carlyle": { lat: 49.6333, lng: -102.2667 },
  "nipawin": { lat: 53.3644, lng: -104.0042 },
  "tisdale": { lat: 52.8500, lng: -104.0531 },
  "buffalo narrows": { lat: 55.8500, lng: -108.4833 },
  "ile-a-la-crosse": { lat: 55.4500, lng: -107.9000 },
  "la loche": { lat: 56.4833, lng: -109.4333 },
  "rosthern": { lat: 52.6667, lng: -106.3333 },
  "spiritwood": { lat: 53.3667, lng: -107.5167 },
  "unity": { lat: 52.4500, lng: -109.1667 },
  "biggar": { lat: 52.0500, lng: -107.9833 },
  "davidson": { lat: 51.2667, lng: -105.9833 },
  "watrous": { lat: 51.6833, lng: -105.4667 },
  "wynyard": { lat: 51.7667, lng: -104.1833 },
  "canora": { lat: 51.6333, lng: -102.4333 },
  "kamsack": { lat: 51.5667, lng: -101.9000 },
  "saskatchewan": { lat: 52.9399, lng: -106.4509 }
};

export const saskatoonCoordinatesMap: Record<string, { lat: number; lng: number }> = saskatchewanCoordinatesMap;

export function resolveSaskatchewanCoordinates(text: string, defaultLat = 52.1332, defaultLng = -106.6700) {
  const norm = text.toLowerCase();
  for (const [key, coords] of Object.entries(saskatchewanCoordinatesMap)) {
    if (norm.includes(key)) {
      return coords;
    }
  }
  return { lat: defaultLat, lng: defaultLng };
}

export function resolveSaskatoonCoordinates(text: string, defaultLat = 52.1332, defaultLng = -106.6700) {
  return resolveSaskatchewanCoordinates(text, defaultLat, defaultLng);
}

export function extractLocationText(text: string): string {
  const lower = text.toLowerCase();
  
  for (const landmark of Object.keys(saskatoonCoordinatesMap)) {
    if (lower.includes(landmark)) {
      if (landmark === "broadway") return "Broadway Avenue, Saskatoon, SK";
      if (landmark === "8th street") return "8th Street East, Saskatoon, SK";
      if (landmark === "preston") return "Preston Avenue Crossing, Saskatoon, SK";
      if (landmark === "33rd street") return "33rd Street West, Saskatoon, SK";
      if (landmark === "circle drive") return "Circle Drive, Saskatoon, SK";
      if (landmark === "20th street") return "20th Street West, Saskatoon, SK";
      if (landmark === "central avenue") return "Central Avenue, Saskatoon, SK";
      if (landmark === "sutherland") return "Sutherland, Saskatoon, SK";
      if (landmark === "spadina") return "Spadina Crescent, Saskatoon, SK";
      if (landmark === "downtown") return "Downtown Saskatoon, SK";
      if (landmark === "pleasant hill") return "Pleasant Hill, Saskatoon, SK";
      if (landmark === "kinsmen") return "Kinsmen Park, Saskatoon, SK";
      if (landmark === "stonebridge") return "Stonebridge, Saskatoon, SK";
      if (landmark === "warman") return "Warman, SK";
      if (landmark === "dundurn") return "Dundurn, SK";
      if (landmark === "prince albert") return "Prince Albert, SK";
      if (landmark === "regina") return "Regina, SK";
      if (landmark === "la ronge") return "La Ronge, SK";
      if (landmark === "swift current") return "Swift Current, SK";
      if (landmark === "north battleford") return "North Battleford, SK";
    }
  }

  const prepRegex = /\b(?:on|at|near|along|around|in|of)\s+([0-9A-Z][A-Za-z0-9\s#\-]{3,40}(?:Avenue|Ave|Street|St|Road|Rd|Crescent|Cres|Drive|Dr|Highway|Hwy|Way|Crossing|Bridge|Park|Facility|Complex)?)/;
  const match = text.match(prepRegex);
  if (match) {
    return match[1].trim();
  }

  return "Saskatoon, SK";
}

export type ResolvedLocation = {
  latitude: number;
  longitude: number;
  displayLatitude: number;
  displayLongitude: number;
  locationPrecision: LocationPrecisionType;
  locationConfidence: number;
  locationText: string;
};

export async function geocodeLocation(addressText: string, sourceKey: string): Promise<ResolvedLocation> {
  let determinedPrecision: LocationPrecisionType = "unknown";
  const lowerAddress = addressText.toLowerCase();

  if (lowerAddress.includes("&") || lowerAddress.includes(" and ") || lowerAddress.includes(" at ") || lowerAddress.includes("near") || lowerAddress.includes(" / ")) {
    determinedPrecision = "intersection";
  } else if (lowerAddress.includes("block of") || lowerAddress.includes("block")) {
    determinedPrecision = "block";
  } else if (lowerAddress.includes("neighbourhood") || lowerAddress.includes("district") || lowerAddress.includes("ward") || lowerAddress.includes("area") || lowerAddress.includes("park") || lowerAddress.includes("crossing") || lowerAddress.includes("hill") || lowerAddress.includes("sutherland") || lowerAddress.includes("nutana") || lowerAddress.includes("pleasant h")) {
    determinedPrecision = "neighbourhood";
  } else if (lowerAddress.includes("saskatchewan") || lowerAddress.includes("saskatoon") || lowerAddress.includes("regina") || lowerAddress.includes("prince albert") || lowerAddress.includes("warman") || lowerAddress.includes("dundurn") || lowerAddress.includes("la ronge") || lowerAddress.includes("swift current") || lowerAddress.includes("north battleford")) {
    determinedPrecision = "city";
  }

  const exactPattern = /\b([0-9]{1,5})\s+([a-zA-Z]{3,})\s+(avenue|ave|street|st|road|rd|crescent|cres|drive|dr|way|lane|ln|court|ct|boulevard|blvd)\b/i;
  const matchExact = addressText.match(exactPattern);
  if (matchExact && determinedPrecision === "unknown") {
    determinedPrecision = "exact";
  }

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
    } catch (err) {
      console.error(`[Geocoding API] Mapbox Service connection error:`, err);
    }
  }

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
          lat = parseFloat(result.lat);
          lng = parseFloat(result.lon);
          
          const importance = result.importance ? parseFloat(result.importance) : 0.5;
          conf = Math.round((0.5 + 0.5 * importance) * 100) / 100;
          successGeocoding = true;

          if (result.type === "house" || result._type === "house" || (result.class === "place" && result.type === "house")) {
            determinedPrecision = "exact";
          }
        }
      }
    } catch (err) {
      console.error(`[Geocoding API] Nominatim Service connection error:`, err);
    }
  }

  if (!successGeocoding) {
    const localCoords = resolveSaskatoonCoordinates(addressText);
    lat = localCoords.lat;
    lng = localCoords.lng;
    conf = 0.65;
    if (determinedPrecision === "unknown") {
      determinedPrecision = "block";
    }
  }

  let finalLocationText = addressText;

  if (determinedPrecision === "exact") {
    if (matchExact) {
      const numStr = matchExact[1];
      const num = parseInt(numStr, 10);
      let roundedBlock = "0-100 block of";
      if (num >= 100) {
        roundedBlock = `${Math.floor(num / 100) * 100} block of`;
      }
      finalLocationText = addressText.replace(numStr, roundedBlock);
    } else {
      finalLocationText = addressText + " (Block-Level Approximation)";
    }
    determinedPrecision = "block";
  }

  let displayLat = lat;
  let displayLng = lng;

  if (determinedPrecision === "block" || determinedPrecision === "intersection") {
    displayLat = Math.round(lat * 1000) / 1000;
    displayLng = Math.round(lng * 1000) / 1000;
  } else if (determinedPrecision === "neighbourhood") {
    displayLat = Math.round(lat * 100) / 100;
    displayLng = Math.round(lng * 100) / 100;
  } else if (determinedPrecision === "city" || determinedPrecision === "unknown") {
    displayLat = Math.round(lat * 10) / 10;
    displayLng = Math.round(lng * 10) / 10;
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
    locationConfidence: conf,
    locationText: finalLocationText
  };
}

export async function geocodeBatchLocation(addresses: string[], sourceKey: string): Promise<ResolvedLocation[]> {
  return Promise.all(addresses.map(addr => geocodeLocation(addr, sourceKey)));
}
