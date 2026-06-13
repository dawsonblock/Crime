import { EventItem, SeverityType } from "../types";

// Helper to square numbers
function sqr(x: number): number {
  return x * x;
}

/**
 * Calculates the shortest distance in meters from a point P to a line segment AB.
 * Employs a flat-Earth projection calibrated to Saskatoon, SK latitude (approx 52.13° N)
 * which provides exceptional mathematical precision for municipal-scale distances.
 */
export function getDistanceToSegmentMeters(
  latP: number,
  lngP: number,
  latA: number,
  lngA: number,
  latB: number,
  lngB: number
): number {
  const latToMeters = 111132;
  // Account for longitude shrinkage relative to latitude degree scaling
  const lngToMeters = 111132 * Math.cos((52.1332 * Math.PI) / 180);

  const p = { x: lngP * lngToMeters, y: latP * latToMeters };
  const a = { x: lngA * lngToMeters, y: latA * latToMeters };
  const b = { x: lngB * lngToMeters, y: latB * latToMeters };

  const l2 = sqr(a.x - b.x) + sqr(a.y - b.y);
  if (l2 === 0) {
    return Math.sqrt(sqr(p.x - a.x) + sqr(p.y - a.y));
  }

  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));

  const nearestX = a.x + t * (b.x - a.x);
  const nearestY = a.y + t * (b.y - a.y);

  return Math.sqrt(sqr(p.x - nearestX) + sqr(p.y - nearestY));
}

/**
 * Calculates the direct distance in meters between two geocoordinated points
 */
export function getDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes the minimum distance in meters between a point P and a polyline path.
 */
export function getDistanceToPolylineMeters(
  latP: number,
  lngP: number,
  path: Array<[number, number]>
): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) {
    const [wLat, wLng] = path[0];
    return getDistanceMeters(latP, lngP, wLat, wLng);
  }

  let minDistance = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const [latA, lngA] = path[i];
    const [latB, lngB] = path[i + 1];
    const dist = getDistanceToSegmentMeters(latP, lngP, latA, lngA, latB, lngB);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

export interface RouteRiskCalculation {
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  intersectingEventsCount: number;
  intersectingEvents: Array<{
    event: EventItem;
    distanceM: number;
  }>;
}

/**
 * Inspects all active community public safety incidents and generates a custom risk profile
 * for the user's travel route corridor.
 */
export function calculateRouteRiskScore(
  path: Array<[number, number]>,
  events: EventItem[]
): RouteRiskCalculation {
  if (path.length === 0) {
    return {
      score: 0,
      riskLevel: "low",
      intersectingEventsCount: 0,
      intersectingEvents: [],
    };
  }

  let rawScore = 0;
  const intersectingEvents: Array<{ event: EventItem; distanceM: number }> = [];

  events.forEach((evt) => {
    const dist = getDistanceToPolylineMeters(evt.latitude, evt.longitude, path);

    // Filter incidents within an active warning corridor (1000 meters / 1km range)
    if (dist <= 1000) {
      intersectingEvents.push({ event: evt, distanceM: dist });

      if (dist <= 350) {
        // Direct intersection proximity (high danger weighting)
        if (evt.severity === "critical") rawScore += 35;
        else if (evt.severity === "high") rawScore += 22;
        else if (evt.severity === "medium") rawScore += 10;
        else rawScore += 3;
      } else {
        // Perimeter buffer proximity (moderate advisory weighting)
        if (evt.severity === "critical") rawScore += 15;
        else if (evt.severity === "high") rawScore += 8;
        else if (evt.severity === "medium") rawScore += 4;
        else rawScore += 1;
      }
    }
  });

  // Clamp Route Risk Score directly between 0 and 100
  const score = Math.max(0, Math.min(100, rawScore));

  // Categorize risk scale
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (score >= 70) {
    riskLevel = "critical";
  } else if (score >= 40) {
    riskLevel = "high";
  } else if (score >= 15) {
    riskLevel = "medium";
  }

  // Sort intersecting events by proximity distance (closest first)
  intersectingEvents.sort((a, b) => a.distanceM - b.distanceM);

  return {
    score,
    riskLevel,
    intersectingEventsCount: intersectingEvents.length,
    intersectingEvents,
  };
}
