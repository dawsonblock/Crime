import { SeverityType } from "../types";

export function ruleBasedClassifier(title: string, summary: string): { eventType: string; severity: SeverityType; confidence: number } {
  const combined = (title + " " + summary).toLowerCase();
  
  const rules = [
    {
      type: "homicide",
      keywords: /\b(homicide|murder|manslaughter|killing|slaying|deceased person|suspicious death|dead body)\b|found dead/i,
      severity: "critical" as SeverityType,
      confidence: 0.95
    },
    {
      type: "shooting",
      keywords: /\b(shooting|shot|shots fired|gunshot|discharged firearm|opened fire|bullet wound)\b/i,
      severity: "critical" as SeverityType,
      confidence: 0.95
    },
    {
      type: "dangerous_person_alert",
      keywords: /\b(dangerous person|active threat|shelter in place|shelter immediately|secure doors|barricaded|hostage|armed threat|alert: dangerous)\b/i,
      severity: "critical" as SeverityType,
      confidence: 0.95
    },
    {
      type: "stabbing",
      keywords: /\b(stabbing|stabbed|knife attack|slashed|blade wound|stabbing incident)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.90
    },
    {
      type: "assault",
      keywords: /\b(assault|assaulted|physical fight|beaten|assaulting|attacked|domestic dispute|punched|kicked|battery)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.85
    },
    {
      type: "robbery",
      keywords: /\b(robbery|robbed|armed robbery|mugg|mugging|heist|commercial robbery|bank robbery|demand cash|hold up|holdup)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.90
    },
    {
      type: "weapons",
      keywords: /\b(weapons|firearms|pistol|revolver|shotgun|rifle|handgun|bullet|ammunition|body armour|body armor|illegal gun|seized gun|confiscated weapon|taser)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.85
    },
    {
      type: "police_operation",
      keywords: /\b(police operation|tactical search|heavy police presence|tactical unit|police perimeter|tactical officers|swat|blocked off|k9 unit|police dog|negotiators)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.85
    },
    {
      type: "missing_person",
      keywords: /\b(missing person|missing youth|missing teenager|missing girl|missing boy|disappeared|locate vulnerable|wander|missing senior|missing adult)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.90
    },
    {
      type: "break_and_enter",
      keywords: /\b(break and enter|break-and-enter|break & enter|b&e|burglary|burgle|residential alarm|broke into|forced entry|commercial break-in)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "vehicle_theft",
      keywords: /\b(vehicle theft|stolen vehicle|car theft|stolen truck|car stolen|truck stolen|tractor theft|stolen tractor|auto theft|stolen auto)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "drugs",
      keywords: /\b(drugs|meth|methamphetamine|fentanyl|cocaine|trafficking|seizure of drugs|drug bust|substances|drug charges|illicit compounds|drug possession)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "wanted_person",
      keywords: /\b(wanted|warrant|wanted person|wanted suspect|suspect wanted|fugitive|outstanding warrants|seek public assistance to find|wanted on province)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "sirt_investigation",
      keywords: /\b(sirt|serious incident response|sirt investigation|police arrest review|detention inquiry|officer review|custody investig|independent inquiry)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.95
    },
    {
      type: "fire",
      keywords: /\b(fire|wildfire|smoke|blaze|structure fire|arson|burning|firefighter|engulfed)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "traffic_collision",
      keywords: /\b(traffic collision|pileup|accident|roll-over|crash|car accident|vehicle crash|highway closure|multi-vehicle|collision warnings)\b/i,
      severity: "low" as SeverityType,
      confidence: 0.90
    },
    {
      type: "public_disorder",
      keywords: /\b(public disorder|disturbance|dispute|protest|riot|rowdy|public intoxication|trespass|trespassing|brawl|street fight|vandalism|property damage)\b/i,
      severity: "low" as SeverityType,
      confidence: 0.85
    }
  ];

  for (const rule of rules) {
    if (rule.keywords.test(combined)) {
      return {
        eventType: rule.type,
        severity: rule.severity,
        confidence: rule.confidence
      };
    }
  }

  // Fallback if no category matches
  return {
    eventType: "other_public_safety",
    severity: "low" as SeverityType,
    confidence: 0.50
  };
}
