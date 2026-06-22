import { EventItem, SeverityType } from "../types";

// Token Jaccard String overlapping similarity helper
export function calculateStringSimilarity(str1: string, str2: string): number {
  const getTokens = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(t => t.length > 2);
  const tokens1 = new Set(getTokens(str1));
  const tokens2 = new Set(getTokens(str2));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let intersectionSize = 0;
  tokens1.forEach(t => {
    if (tokens2.has(t)) intersectionSize++;
  });
  
  return intersectionSize / Math.max(tokens1.size, tokens2.size);
}

// Haversine distance calculator in meters
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Related event types helper
export function areRelatedEventTypes(type1: string, type2: string): boolean {
  if (type1 === type2) return true;
  const groups = [
    ["assault", "shooting", "stabbing", "weapons", "homicide", "robbery", "dangerous_person_alert", "police_operation"],
    ["theft", "break_enter", "break_and_enter", "vehicle_theft", "property"],
    ["traffic", "traffic_collision", "collision"]
  ];
  for (const group of groups) {
    if (group.includes(type1) && group.includes(type2)) {
      return true;
    }
  }
  return false;
}

/**
 * Server-side deduplication and Incident Clustering Core Algorithm.
 * Merges reports that describe the exact same physical event into nested fused cluster objects.
 */
export function deduplicateAndClusterEvents(allEvents: EventItem[]): EventItem[] {
  // Sort by published time descending
  const sorted = [...allEvents].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  
  const mergedIds = new Set<string>();
  const finalizedEvents: EventItem[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const primary = sorted[i];
    if (mergedIds.has(primary.id)) continue;
    
    // Find all duplicates / candidates for merging
    const clusterCandidates: EventItem[] = [primary];
    
    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      if (mergedIds.has(candidate.id)) continue;
      
      // Calculate proximity rules:
      const dist = getDistanceMeters(primary.latitude, primary.longitude, candidate.latitude, candidate.longitude);
      
      // Tighten geographic rules based on precision to avoid spatial grouping errors
      let maxDistThreshold = 200;
      if (primary.locationPrecision === "exact" && candidate.locationPrecision === "exact") {
        maxDistThreshold = 100;
      } else if (primary.locationPrecision === "neighbourhood" || candidate.locationPrecision === "neighbourhood") {
        maxDistThreshold = 500;
      } else if (primary.locationPrecision === "city" || candidate.locationPrecision === "city") {
        maxDistThreshold = 50; // Only merge if nearly identical location geocodes
      }

      const isCloseGeographically = dist <= maxDistThreshold;
      
      // Tighten time window: 16 hours instead of 24h
      const timeDiffMs = Math.abs(new Date(primary.publishedAt).getTime() - new Date(candidate.publishedAt).getTime());
      const isWithinTimeWindow = timeDiffMs < 16 * 3600 * 1000;
      
      // Same publisher protection
      const shareSameSource = primary.sourceKey === candidate.sourceKey;
      const isRelatedType = areRelatedEventTypes(primary.eventType, candidate.eventType);
      const sim = calculateStringSimilarity(primary.title + " " + primary.summary, candidate.title + " " + candidate.summary);
      
      let isSameEvent = false;
      if (isCloseGeographically && isWithinTimeWindow) {
        if (shareSameSource) {
          // If from the same source, they are only duplicate records if text matches near-perfectly
          if (sim > 0.82) {
            isSameEvent = true;
          }
        } else {
          // Cross-source intelligence corroboration:
          // Must have matching related categories AND a reasonable semantic overlapping context
          if (isRelatedType && (sim > 0.28 || primary.title.split(" ").some(word => word.length > 4 && candidate.title.includes(word)))) {
            isSameEvent = true;
          } else if (sim > 0.40) {
            // Excellent text match (e.g. media article detailing a specific police operation at same block)
            isSameEvent = true;
          }
        }
      }
      
      if (isSameEvent) {
        clusterCandidates.push(candidate);
        mergedIds.add(candidate.id);
      }
    }
    
    mergedIds.add(primary.id);
    
    if (clusterCandidates.length === 1) {
      primary.sourcesList = [{ name: primary.sourceName, url: primary.originalUrl, key: primary.sourceKey }];
      primary.dedupeHash = primary.sourceHash || ("single-hash-" + primary.id);
      primary.linkedEvents = []; // Avoid circular [primary] self-reference
      finalizedEvents.push(primary);
    } else {
      // Gather unique sources list
      const sourcesListMap = new Map<string, { name: string; url: string; key: string }>();
      clusterCandidates.forEach(c => {
        sourcesListMap.set(c.sourceKey, { name: c.sourceName, url: c.originalUrl, key: c.sourceKey });
      });
      const sourcesList = Array.from(sourcesListMap.values());
      
      // Choose primary item for coordinates/metadata (prefer police alerts over standard map reports)
      const selectPriority = (item: EventItem) => {
        if (item.sourceKey.includes("alert")) return 10;
        if (item.sourceType === "official" && item.sourceKey !== "saskatoon_crime_map") return 8;
        if (item.sourceType === "media") return 6;
        if (item.sourceType === "government") return 5;
        return 1;
      };
      
      const bestEvent = clusterCandidates.reduce((best, curr) => {
        return selectPriority(curr) > selectPriority(best) ? curr : best;
      }, primary);
      
      // Anchor severity & threat metrics directly on the highest-trusted official source
      const canonicalSeverity = bestEvent.severity || "low" as SeverityType;
      const canonicalIncidentSeverity = bestEvent.incident_severity || canonicalSeverity;
      const canonicalActiveRiskState = bestEvent.active_risk_state || "unknown";
      const canonicalGeoScope = bestEvent.geo_scope || "unknown";
      const canonicalCurrentRiskScore = bestEvent.current_risk_score !== undefined ? bestEvent.current_risk_score : 15;
      
      // Assemble aggregated summary detailing original sources
      let combinedSummary = `**Saskatoon Public Safety Intelligence Fusion [${clusterCandidates.length} linked reports]**:\n`;
      clusterCandidates.forEach(c => {
        combinedSummary += `• **${c.sourceName}**: *${c.title}* – ${c.summary.length > 155 ? c.summary.substring(0, 155) + "..." : c.summary}\n`;
      });
      
      // Boost confidence slightly as multiple sources confirm, starting from the best event's base confidence
      const baseConf = bestEvent.confidence_score !== undefined ? bestEvent.confidence_score : (bestEvent.confidence || 0.7);
      const blendedConfidence = Math.min(1.0, Math.round((baseConf + 0.03 * (clusterCandidates.length - 1)) * 100) / 100);
      
      // Clean clone of candidates to strip any potential nested circular structures
      const cleanCandidates = clusterCandidates.map(c => {
        const copy = { ...c };
        delete copy.linkedEvents;
        return copy;
      });

      const mergedEvent: EventItem = {
        ...bestEvent,
        id: `clust-${bestEvent.id}`,
        title: bestEvent.title.includes("Cluster") ? bestEvent.title : `${bestEvent.title} (Incident Cluster)`,
        summary: combinedSummary,
        severity: canonicalSeverity,
        incident_severity: canonicalIncidentSeverity,
        active_risk_state: canonicalActiveRiskState,
        geo_scope: canonicalGeoScope,
        current_risk_score: canonicalCurrentRiskScore,
        confidence: blendedConfidence,
        confidence_score: blendedConfidence,
        sourcesList: sourcesList,
        dedupeHash: `fused-${bestEvent.id}-${clusterCandidates.length}`,
        linkedEvents: cleanCandidates
      };
      
      finalizedEvents.push(mergedEvent);
    }
  }
  
  // Map intelligence metrics, source tiers, and derived annotations
  return finalizedEvents.map(evt => {
    let sourceTier = 3;
    let isGenerated = false;
    let isDerived = false;

    const key = (evt.sourceKey || "").toLowerCase();
    const type = (evt.sourceType || "").toLowerCase();
    const idStr = (evt.id || "").toLowerCase();
    const title = (evt.title || "").toLowerCase();

    if (idStr.startsWith("clust-") || title.includes("(incident cluster)") || title.includes("cluster") || key.includes("ai-")) {
      sourceTier = 4;
      isDerived = true;
      isGenerated = true; // derived
    } else if (type === "official" && !key.includes("crime_map") && !key.includes("council")) {
      sourceTier = 1;
    } else if (type === "media") {
      sourceTier = 2;
    } else if (type === "government" || key.includes("crime") || key.includes("map") || key.includes("weather") || key.includes("council")) {
      sourceTier = 3;
    }

    return {
      ...evt,
      sourceTier,
      isGenerated: evt.isGenerated || isGenerated,
      isDerived: evt.isDerived || isDerived,
    };
  });
}
