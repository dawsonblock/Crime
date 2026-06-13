import { EventItem, SeverityType } from "../types";
import { getDistanceMeters } from "./routeSafety";

/**
 * Standard severity index values to represent base threat weights.
 * Using standard values: critical = 75, high = 50, medium = 25, low = 10
 */
export const SEVERITY_BASE_MAP: Record<SeverityType, number> = {
  critical: 75,
  high: 50,
  medium: 25,
  low: 10,
};

/**
 * Calculates a dedicated Cluster Score that represents the cumulative corridor density
 * and multi-source corroboration of a group of linked events without artificially inflating
 * individual incident severity.
 * 
 * @param linkedEvents Array of EventItem members within the cluster
 * @returns An aggregated score between 1 and 100
 */
export function calculateClusterScore(linkedEvents: EventItem[] | undefined): number {
  if (!linkedEvents || linkedEvents.length === 0) {
    return 0;
  }

  // 1. Calculate blended severity base (average severity of all linked events to prevent inflation)
  let totalSeverityBase = 0;
  linkedEvents.forEach((evt) => {
    totalSeverityBase += SEVERITY_BASE_MAP[evt.severity] || 15;
  });
  const blendedSeverityBase = totalSeverityBase / linkedEvents.length;

  // 2. Multi-source corroboration factor
  // Count unique source keys to gauge cross-platform verification
  const uniqueSources = new Set(linkedEvents.map((evt) => evt.sourceKey || evt.sourceName)).size;
  const sourceCorroborationBonus = uniqueSources * 8; // +8 points for every distinct reporting source

  // 3. Report density factor
  // Small incremental weight based on the total number of reports to capture localized pattern mass
  const densityBonus = (linkedEvents.length - 1) * 3;

  // 4. Combine and safely clamp between 1 and 100
  const finalClusterScore = blendedSeverityBase + sourceCorroborationBonus + densityBonus;
  return Math.max(1, Math.min(100, Math.round(finalClusterScore)));
}

/**
 * Dynamic Multi-Factor Weighted Threat Scoring Algorithm.
 * Computes a standardized numerical threat multiplier (1 to 100) based on six strict parameters:
 * 1. Base Severity (with blended group severity for clusters)
 * 2. Recency Component & Age Decay (custom 48-hour half-life model + active recent boost)
 * 3. Source Reliability Tiers (T1 official to T4 derived/AI)
 * 4. Location Precision Weighting (penalizing general citywide or neighbourhood-level coords)
 * 5. Proximity Bias (sliding extra points for proximity to user coordinates)
 * 6. Repeat Area / Hotspot Density Booster (overlapping incidents within 500m over last 10 days)
 * 
 * @param evt The target EventItem to compute score for
 * @param userLat Optional latitude of the user
 * @param userLng Optional longitude of the user
 * @param otherEvents Optional list of other current/recent events to compute neighborhood hotspot density
 * @returns A computed threat score clamped between 1 and 100
 */
export function calculateThreatScore(
  evt: EventItem,
  userLat?: number,
  userLng?: number,
  otherEvents: EventItem[] = []
): number {
  const isCluster = evt.id.startsWith("clust-") || !!evt.isDerived;

  // --- 1. Base Severity Component ---
  let baseSeverityScore = 15;
  if (isCluster && evt.linkedEvents && evt.linkedEvents.length > 0) {
    // Blended severity instead of "highest member wins" inflation
    let sumSeverities = 0;
    evt.linkedEvents.forEach((m) => {
      sumSeverities += SEVERITY_BASE_MAP[m.severity] || 15;
    });
    baseSeverityScore = sumSeverities / evt.linkedEvents.length;
  } else {
    baseSeverityScore = SEVERITY_BASE_MAP[evt.severity] || 15;
  }

  // Set the event's incident score to represent its underlying raw severity context (isolated from densities)
  evt.incidentScore = Math.round(baseSeverityScore);

  // Calculate separate cluster score if it is a cluster
  if (isCluster) {
    evt.clusterScore = calculateClusterScore(evt.linkedEvents);
  } else {
    evt.clusterScore = 0;
  }

  // --- 2. Recency Component & Age Decay ---
  const timeStr = evt.publishedAt || evt.createdAt || new Date().toISOString();
  const hrsSincePub = Math.max(0, (Date.now() - new Date(timeStr).getTime()) / 3600000);
  
  // Half-life decay model: standard 48 hours. Multiplier decays over time to low nominal floor.
  const recencyMultiplier = Math.min(1.0, Math.max(0.05, Math.pow(0.5, hrsSincePub / 48)));
  let threat = baseSeverityScore * recencyMultiplier;

  // Active status boost: very recent updates (within 4 hours) receive a temporary prominence weight
  if (hrsSincePub <= 4) {
    threat += 15 * (1 - hrsSincePub / 4);
  }

  // --- 3. Source Reliability Scale ---
  // T1: Official (Police, RCMP, SIRT, Fire, City authority logs) = 1.0 multiplier
  // T2: Verified News (CBC, Global, CTV news outlets) = 0.85 multiplier
  // T3: Advisory/Ad-hoc maps = 0.65 multiplier
  // T4: Derived Intelligence or uncorroborated clusters = 0.50 multiplier
  let reliabilityMultiplier = 0.65;
  const tier = evt.sourceTier || 3;
  if (tier === 1) reliabilityMultiplier = 1.0;
  else if (tier === 2) reliabilityMultiplier = 0.85;
  else if (tier === 3) reliabilityMultiplier = 0.65;
  else if (tier === 4) reliabilityMultiplier = 0.50;

  threat *= reliabilityMultiplier;

  // --- 4. Location Precision Weight ---
  // Prevents crime-map regional bulk data from contaminating local threat indices
  // exact = 1.0, block/intersection = 0.85, neighbourhood = 0.50, city = 0.15
  let precisionMultiplier = 0.50;
  const prec = evt.locationPrecision || "unknown";
  if (prec === "exact") precisionMultiplier = 1.0;
  else if (prec === "block" || prec === "intersection") precisionMultiplier = 0.85;
  else if (prec === "neighbourhood") precisionMultiplier = 0.50;
  else if (prec === "city") precisionMultiplier = 0.15;
  else if (prec === "unknown") precisionMultiplier = 0.50;

  threat *= precisionMultiplier;

  // --- 5. Proximity Bias ---
  // Sliding bonus based on physical distance to current user coordinates
  if (userLat !== undefined && userLng !== undefined && !isNaN(userLat) && !isNaN(userLng)) {
    const distM = getDistanceMeters(evt.latitude, evt.longitude, userLat, userLng);
    if (distM <= 400) {
      threat += 25 * (1 - distM / 400); // Max +25 pts for immediate neighborhood range
    } else if (distM <= 1500) {
      threat += 10 * (1 - (distM - 400) / 1100); // Max +10 pts for surrounding buffer zone
    }
  }

  // --- 6. Repeat Area / Hotspot Density Booster ---
  // Overlapping events occurring within a 500m radius over the last 10 days
  const tenDaysAgo = Date.now() - 10 * 24 * 3600 * 1000;
  const recentNearbyCount = otherEvents.filter((other) => {
    if (other.id === evt.id) return false;
    const otherTime = new Date(other.publishedAt || other.createdAt || 0).getTime();
    if (otherTime < tenDaysAgo) return false;
    const distM = getDistanceMeters(evt.latitude, evt.longitude, other.latitude, other.longitude);
    return distM <= 500;
  }).length;

  if (recentNearbyCount > 0) {
    // Non-linear localized scaling, capped at +20 points max to avoid linear runaway
    const repeatDensityBonus = Math.min(20, recentNearbyCount * 3.5);
    threat += repeatDensityBonus;
  }

  // Ensure absolute boundaries (clamp between 1 and 100)
  return Math.max(1, Math.min(100, Math.round(threat)));
}
