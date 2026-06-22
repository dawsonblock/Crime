import { SeverityType } from "../types";

export interface ClassifierRule {
  id: string;
  type: string;
  keywords: RegExp | string[];
  severity: SeverityType;
  confidence: number;
}

// Global registry of rules to support dynamic extensibility downstream
export const classifierRulesRegistry: ClassifierRule[] = [
  {
    id: "homicide",
    type: "homicide",
    keywords: /\b(homicide|murder|manslaughter|killing|slaying|deceased person|suspicious death|dead body)\b|found dead/i,
    severity: "critical",
    confidence: 0.95
  },
  {
    id: "assault_and_violence",
    type: "assault",
    keywords: /\b(assault|assaulted|physical fight|beaten|assaulting|attacked|domestic dispute|punched|kicked|battery|shooting|shot|shots fired|gunshot|discharged firearm|opened fire|bullet wound|stabbing|stabbed|knife attack|slashed|blade wound|stabbing incident|weapons|firearms|pistol|revolver|shotgun|rifle|handgun|bullet|ammunition|body armour|body armor|illegal gun|seized gun|confiscated weapon|taser|stabbing on|assault on)\b/i,
    severity: "high",
    confidence: 0.90
  },
  {
    id: "robbery",
    type: "robbery",
    keywords: /\b(robbery|robbed|armed robbery|mugg|mugging|heist|commercial robbery|bank robbery|demand cash|hold up|holdup)\b/i,
    severity: "high",
    confidence: 0.90
  },
  {
    id: "missing_person",
    type: "missing_person",
    keywords: /\b(missing person|missing youth|missing teenager|missing girl|missing boy|disappeared|locate vulnerable|wander|missing senior|missing adult)\b/i,
    severity: "high",
    confidence: 0.90
  },
  {
    id: "traffic_collision",
    type: "traffic_collision",
    keywords: /\b(traffic collision|pileup|accident|roll-over|crash|car accident|vehicle crash|highway closure|multi-vehicle|collision warnings)\b/i,
    severity: "low",
    confidence: 0.90
  },
  {
    id: "public_safety_alert",
    type: "public_safety_alert",
    keywords: /\b(alert|public safety alert|warning|danger|hazard|evacuation|evacuate|active threat|shelter in place|dangerous person|immediate danger|armed threat|hostage|explosive|hazardous|convective cell|active shooter|heavy police presence|tactical unit|police perimeter|tactical officers|swat|blocked off|k9 unit|police dog|negotiators|wanted|warrant|wanted person|wanted suspect|suspect wanted|fugitive|outstanding warrants|seek public assistance to find|wanted on province|sirt|serious incident response|sirt investigation|police arrest review|detention inquiry|officer review|custody investig|independent inquiry|police operation|tactical search|fire|wildfire|smoke|blaze|structure fire|arson|burning|firefighter|engulfed|public disorder|disturbance|dispute|protest|riot|rowdy|public intoxication|trespass|trespassing|brawl|street fight|vandalism|property damage|drugs|meth|methamphetamine|fentanyl|cocaine|trafficking|seizure of drugs|drug bust|substances|drug charges|illicit compounds|drug possession)\b/i,
    severity: "medium",
    confidence: 0.85
  }
];

// Helper to register new rules or update existing ones later for dynamic extensions
export function registerClassifierRule(rule: ClassifierRule): void {
  const index = classifierRulesRegistry.findIndex(r => r.id === rule.id);
  if (index !== -1) {
    classifierRulesRegistry[index] = rule;
  } else {
    classifierRulesRegistry.push(rule);
  }
}

export function ruleBasedClassifier(title: string, summary: string): { eventType: string; severity: SeverityType; confidence: number } {
  const combined = (title + " " + summary).toLowerCase();
  
  let matchedType = "public_safety_alert";
  let baseSeverity: SeverityType = "low";
  let confidence = 0.50;
  let ruleFound = false;

  for (const rule of classifierRulesRegistry) {
    let match = false;
    if (rule.keywords instanceof RegExp) {
      match = rule.keywords.test(combined);
    } else if (Array.isArray(rule.keywords)) {
      match = rule.keywords.some(kw => combined.includes(kw.toLowerCase()));
    }

    if (match) {
      matchedType = rule.type;
      baseSeverity = rule.severity;
      confidence = rule.confidence;
      ruleFound = true;
      break;
    }
  }

  if (!ruleFound) {
    // If no specific rules match, it defaults to public_safety_alert with a low base severity
    matchedType = "public_safety_alert";
    baseSeverity = "low";
    confidence = 0.50;
  }

  // ----------------------------------------------------
  // Context-Aware Severity Adjustment Logic (Two-Axis)
  // ----------------------------------------------------
  
  // Context boosters: Indicate a more severe or dangerous unfolding situation
  const boosters = /\b(active threat|active shooter|shelter in place|dangerous person|immediate danger|armed threat|hostage|explosive|multiple victims|hazardous|convective cell|warning|evacuate|evacuation)\b/i;
  
  // Context inhibitors: Indicate historical references or court updates that pose no active threat
  const inhibitors = /\b(historical|anniversary|court date|sentenced|sentencing|pleaded guilty|pleads guilty|cold case|archived|years in prison|decade ago|historical incident)\b/i;

  let finalSeverity = baseSeverity;

  const isBoosted = boosters.test(combined);
  const isInhibited = inhibitors.test(combined);

  if (isBoosted && !isInhibited) {
    // Elevate severity level safely
    if (baseSeverity === "low") {
      finalSeverity = "medium";
    } else if (baseSeverity === "medium") {
      finalSeverity = "high";
    } else if (baseSeverity === "high") {
      finalSeverity = "critical";
    }
  } else if (isInhibited) {
    // Reduce severity level safely
    if (baseSeverity === "critical") {
      finalSeverity = "high";
    } else if (baseSeverity === "high") {
      finalSeverity = "medium";
    } else if (baseSeverity === "medium") {
      finalSeverity = "low";
    }
  }

  return {
    eventType: matchedType,
    severity: finalSeverity,
    confidence
  };
}

/**
 * Enriches an event item with two-axis risk intelligence:
 * 1. incident_severity: inherent severity of the event type.
 * 2. active_risk_state: active, resolved, historical, or unknown.
 * 3. current_risk_score: operational risk score from 0 to 100.
 * 4. geo_scope: Saskatoon, Saskatchewan, national, or unknown.
 * 5. confidence_score: how reliable the extraction is.
 */
export function enrichEventWithTwoAxisRisk(event: any): any {
  const title = event.title || "";
  const summary = event.summary || "";
  const locationText = event.locationText || "";
  const combined = (title + " " + summary + " " + locationText).toLowerCase();

  // 1. Establish Inherent Incident Severity
  let baseSeverity: SeverityType = (event.severity || "low") as SeverityType;
  if (!event.severity) {
    const cls = ruleBasedClassifier(title, summary);
    baseSeverity = cls.severity;
  }
  const incident_severity = baseSeverity;

  // 2. Determine Active Risk State based on textual cues and temporal patterns
  let active_risk_state: 'active' | 'resolved' | 'historical' | 'unknown' = 'unknown';

  const isHistorical = /(\b(court|sentenced|sentencing|pleads guilty|jail|years in|prison|trial|convicted|conviction|anniversary|cold case|historical|decade|years ago|appeal|pleaded guilty|fined|court case|sentence)\b)/i.test(combined);
  const isResolved = /(\b(located|found safe|arrested|charged|in custody|resolved|located safe|concluded|stood down|stands down|stands-down|cleared|reopened|re-opened|apprehended|under control|fire out| extinguished|extinguish)\b)/i.test(combined);
  const isActivePattern = /(\b(active threat|shelter in place|ongoing|barricaded|hostage|heavy police presence|tactical search|police perimeter|missing child|active fire|brush fire|hazard|convective cell|warning|closed roads|road closure|blockade|avoid the area|stay away|unfolding|avoid|assistance to identify)\b)/i.test(combined);

  if (isHistorical) {
    active_risk_state = 'historical';
  } else if (isResolved) {
    active_risk_state = 'resolved';
  } else if (isActivePattern) {
    active_risk_state = 'active';
  } else {
    // If it's fresh (within last 48 hours) and has high/critical keywords, default to active
    const publishTime = event.publishedAt ? new Date(event.publishedAt).getTime() : Date.now();
    const isFresh = (Date.now() - publishTime) < 48 * 3600 * 1000;
    if (isFresh && (incident_severity === "critical" || incident_severity === "high")) {
      active_risk_state = 'active';
    } else {
      active_risk_state = 'unknown';
    }
  }

  // 3. Establish Geographic Scope
  let geo_scope: 'Saskatoon' | 'Saskatchewan' | 'national' | 'unknown' = 'unknown';
  const containsSaskatoon = combined.includes("saskatoon") || event.sourceKey?.includes("saskatoon");
  const containsRegina = combined.includes("regina") || event.sourceKey?.includes("regina");
  const containsSaskatchewan = combined.includes("saskatchewan") || combined.includes(" rcmp") || event.sourceKey?.includes("saskatchewan") || event.sourceKey?.includes("rcmp");
  const hasInSaskatoonCoords = event.latitude >= 52.05 && event.latitude <= 52.25 && event.longitude >= -106.80 && event.longitude <= -106.50;

  if (containsSaskatoon || hasInSaskatoonCoords) {
    geo_scope = 'Saskatoon';
  } else if (containsRegina) {
    geo_scope = 'Saskatchewan'; // Regina is in SK
  } else if (containsSaskatchewan) {
    geo_scope = 'Saskatchewan';
  } else if (combined.includes("canada") || combined.includes("national")) {
    geo_scope = 'national';
  } else {
    geo_scope = 'unknown';
  }

  // 4. Calculate Operational Current Risk Score (0 - 100)
  let severityWeight = 15;
  if (incident_severity === "critical") severityWeight = 90;
  else if (incident_severity === "high") severityWeight = 70;
  else if (incident_severity === "medium") severityWeight = 40;

  let riskMultiplier = 0.8;
  if (active_risk_state === 'active') {
    riskMultiplier = 1.1; // active ongoing threat increases risk
  } else if (active_risk_state === 'resolved') {
    riskMultiplier = 0.20; // majorly reduced after resolution
  } else if (active_risk_state === 'historical') {
    riskMultiplier = 0.05; // historical news has minimal live threat
  }

  let current_risk_score = Math.round(severityWeight * riskMultiplier);

  // Time decay: diminish risk score for old events
  if (event.publishedAt) {
    const ageHours = (Date.now() - new Date(event.publishedAt).getTime()) / 3600000;
    if (ageHours > 168) {
      current_risk_score = Math.round(current_risk_score * 0.4); // > 1 week old
    } else if (ageHours > 72) {
      current_risk_score = Math.round(current_risk_score * 0.7); // > 3 days old
    } else if (ageHours > 24) {
      current_risk_score = Math.round(current_risk_score * 0.9); // > 24 hours old
    }
  }
  current_risk_score = Math.max(0, Math.min(100, current_risk_score));

  // 5. Establish Confidence Score based on source credibility and location precision
  let sourceTrust = 0.8;
  if (event.sourceType === 'official' || event.sourceType === 'government') {
    sourceTrust = 0.98;
  } else if (event.sourceType === 'media') {
    sourceTrust = 0.85;
  }

  let locationTrustAdd = -0.15;
  if (event.locationPrecision === 'exact' || event.locationPrecision === 'block' || event.locationPrecision === 'intersection') {
    locationTrustAdd = 0.02;
  } else if (event.locationPrecision === 'neighbourhood') {
    locationTrustAdd = -0.05;
  } else if (event.locationPrecision === 'city') {
    locationTrustAdd = -0.10;
  }

  // Deduct for low-quality address parsing or default coordinates indicator
  let locationConfidence = event.locationConfidence !== undefined ? event.locationConfidence : 0.7;
  if (event.locationText?.toLowerCase().includes("saskatoon, sk") && 
      (event.locationText?.toLowerCase() === "saskatoon, sk" || event.locationText?.toLowerCase() === "saskatoon") &&
      locationTrustAdd < 0) {
    locationConfidence = 0.3; // clear placeholder city centroid geoloc
  }

  const confidence_score = Math.max(0.1, Math.min(1.0, (sourceTrust * 0.6 + locationConfidence * 0.4) + locationTrustAdd));

  return {
    ...event,
    incident_severity,
    active_risk_state,
    current_risk_score,
    geo_scope,
    confidence_score: Number(confidence_score.toFixed(2))
  };
}
