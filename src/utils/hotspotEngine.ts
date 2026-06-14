import { EventItem } from "../types";

export interface SpatialHotspot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  densityScore: number;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  primaryHazard: string;
  peakPeriod: string;
  neighborhood: string;
  associatedEvents: EventItem[];
}

// Haversine distance helper in kilometers
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes localized high-stakes safety hotspots by clustering raw events.
 * Identifies spatial clusters within a sliding 800-meter (0.8 km) threshold.
 */
export function calculateHotspots(events: EventItem[], projectionHorizon: string): SpatialHotspot[] {
  // 1. Filter events containing valid coordinates within the active horizon range
  const now = new Date();
  const daysOffset = projectionHorizon === "24h" ? 1 : projectionHorizon === "7d" ? 7 : 30;
  const horizonCutoff = new Date(now.getTime() - daysOffset * 24 * 60 * 60 * 1000);

  const geoEvents = events.filter(e => {
    if (!e.latitude || !e.longitude) return false;
    try {
      const d = new Date(e.publishedAt);
      return d >= horizonCutoff;
    } catch {
      return false;
    }
  });

  // 2. Cluster geographically (events within 0.8 km are grouped)
  const clusters: Array<{
    centerLat: number;
    centerLng: number;
    events: EventItem[];
  }> = [];

  geoEvents.forEach(evt => {
    let matchedCluster = null;
    for (const cluster of clusters) {
      const dist = getDistanceKm(evt.latitude, evt.longitude, cluster.centerLat, cluster.centerLng);
      if (dist <= 0.8) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.events.push(evt);
      // Recompute average coordinates centroid
      const len = matchedCluster.events.length;
      matchedCluster.centerLat = matchedCluster.events.reduce((s, e) => s + e.latitude, 0) / len;
      matchedCluster.centerLng = matchedCluster.events.reduce((s, e) => s + e.longitude, 0) / len;
    } else {
      clusters.push({
        centerLat: evt.latitude,
        centerLng: evt.longitude,
        events: [evt]
      });
    }
  });

  // 3. Score and resolve metadata for clusters
  return clusters.map((cluster, index) => {
    let score = 0;
    let crit = 0;
    let high = 0;
    let med = 0;
    let low = 0;
    const typeCounts: Record<string, number> = {};
    const hourCounts = [0, 0, 0, 0]; // Morning, Afternoon, Evening, Night

    cluster.events.forEach(e => {
      let wt = 1;
      if (e.severity === "critical") {
        wt = 5;
        crit++;
      } else if (e.severity === "high") {
        wt = 3;
        high++;
      } else if (e.severity === "medium") {
        wt = 2;
        med++;
      } else {
        wt = 1;
        low++;
      }
      score += wt;

      const t = e.eventType || "other_public_safety";
      typeCounts[t] = (typeCounts[t] || 0) + 1;

      try {
        const hr = new Date(e.publishedAt).getHours();
        if (hr >= 6 && hr < 12) hourCounts[0]++;
        else if (hr >= 12 && hr < 18) hourCounts[1]++;
        else if (hr >= 18 && hr < 22) hourCounts[2]++;
        else hourCounts[3]++;
      } catch {
        hourCounts[3]++;
      }
    });

    // Dominant incident type
    let dominantType = "Other Public Safety";
    let maxCount = 0;
    Object.entries(typeCounts).forEach(([type, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    });

    // Peak projection window
    const peakIdx = hourCounts.indexOf(Math.max(...hourCounts));
    const peakLabels = ["Morning (06:00-12:00)", "Afternoon (12:00-18:00)", "Evening (18:00-22:00)", "Late Night (22:00-06:00)"];
    const peakPeriod = peakLabels[peakIdx];

    // Reverse geocode descriptive label
    const firstEvt = cluster.events[0];
    let locationLabel = "Projected Zone Centroid";
    let nbName = "Saskatoon Region";

    if (firstEvt.locationText) {
      const parts = firstEvt.locationText.split(",");
      if (parts.length >= 2) {
        locationLabel = parts[0].trim();
        nbName = parts[1].trim();
      } else {
        locationLabel = firstEvt.locationText;
      }
    }

    // Safeguard names from becoming generic city-wide tags
    const labelLower = locationLabel.toLowerCase();
    if (labelLower.includes("saskatoon") || labelLower === "canada" || labelLower === "sk") {
      locationLabel = "Strategic Sector";
    }
    const nbLower = nbName.toLowerCase();
    if (nbLower === "saskatoon" || nbLower === "canada" || nbLower === "sk") {
      nbName = "Saskatoon General";
    }

    return {
      id: `hotspot-${index}`,
      name: `${locationLabel} Sector`,
      latitude: cluster.centerLat,
      longitude: cluster.centerLng,
      densityScore: score,
      incidentCount: cluster.events.length,
      criticalCount: crit,
      highCount: high,
      mediumCount: med,
      lowCount: low,
      primaryHazard: dominantType,
      peakPeriod,
      neighborhood: nbName,
      associatedEvents: cluster.events
    };
  });
}
