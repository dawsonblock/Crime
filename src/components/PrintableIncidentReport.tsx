import React from "react";
import { ShieldAlert, Calendar, MapPin, Compass, Shield, Clock, Bookmark, AlertOctagon, ShieldAlert as AlertIcon, Info, ShieldCheck } from "lucide-react";
import { EventItem } from "../types";

interface PrintableIncidentReportProps {
  event: EventItem;
  bookmarkNote: string;
  isBookmarked: boolean;
}

export default function PrintableIncidentReport({
  event,
  bookmarkNote,
  isBookmarked,
}: PrintableIncidentReportProps) {
  
  // Tactical vicinity classification helper
  const getVicinityClassification = (locationText: string) => {
    const text = locationText.toLowerCase();
    if (text.includes("ave") || text.includes("avenue")) {
      return {
        zone: "Residential Core Division",
        infrastructure: "Medium density residential grid",
        riskAssessed: "Standard Municipal Patrolled Sector",
        lighting: "SaskPower Sodium street lamps active",
      };
    } else if (text.includes("st") || text.includes("street")) {
      return {
        zone: "Commercial Transit corridor",
        infrastructure: "High density commercial storefronts",
        riskAssessed: "Retail zone priority grid",
        lighting: "High-pressure LED municipal array active",
      };
    } else if (text.includes("hwy") || text.includes("expressway") || text.includes("dr") || text.includes("drive")) {
      return {
        zone: "High-speed Arterial Thoroughfare",
        infrastructure: "Divided vehicular roadway grid",
        riskAssessed: "Traffic corridor safety oversight active",
        lighting: "Dual-mast luminaire systems installed",
      };
    } else {
      return {
        zone: "Mixed Urban Sector Block",
        infrastructure: "Multi-purpose zoning sector",
        riskAssessed: "General precinct operations area",
        lighting: "Ambient architectural illumination active",
      };
    }
  };

  const vicinity = getVicinityClassification(event.locationText);

  // Safety Recommended protocol based on tier criteria
  const getSeverityProtocol = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          header: "Tier 4 - Active Civic Danger Alert",
          guideline: "IMMEDIATE CAUTION REQUIRED: Evacuate immediately if recommended by municipal siren alerts. Otherwise, shelter in place in lockable quarters, lock all residential and commercial access gates, sustain active local situational alert awareness, and avoid approaching the designated emergency containment sectors under any circumstances.",
          borderClass: "border-red-650 bg-red-50/20 text-red-900"
        };
      case "high":
        return {
          header: "Tier 3 - Serious Defensive Threat Advisory",
          guideline: "BLOCK RECON SECURITY: Steer clear of direct city block lines. Avoid civilian presence inside active defense perimeters. Keep vehicles and residential barriers strictly locked. Advise neighbors and report suspect matches or matching vehicle tags immediately to first response channels.",
          borderClass: "border-orange-500 bg-orange-50/20 text-orange-900"
        };
      case "medium":
        return {
          header: "Tier 2 - Material Hazard & Asset Mischief Notice",
          guideline: "VIGILANCE RECOMMENDATION: Confirm neighborhood or retail gate security camera activity. Audit padlocks and mechanical locks. Record and report historical camera footage or clues matching Saskatoon police non-emergency files.",
          borderClass: "border-yellow-500 bg-yellow-50/20 text-yellow-900"
        };
      default:
        return {
          header: "Tier 1 - Public Safety Notice / Controlled State",
          guideline: "STANDARD MONITOR: Maintain baseline street situational awareness, route around minor traffic blockages, observe official weather delay warnings, and sustain regular safety procedures.",
          borderClass: "border-slate-400 bg-slate-50/20 text-slate-800"
        };
    }
  };

  const protocolData = getSeverityProtocol(event.severity || "low");

  return (
    <div className="print-report-only hidden w-full p-10 font-serif bg-white text-slate-900 border border-slate-300 shadow-md">
      {/* Official Header */}
      <div className="border-b-4 border-slate-900 pb-4 mb-6 flex justify-between items-start font-sans">
        <div className="space-y-1">
          <span className="text-[9px] font-extrabold tracking-widest text-slate-500 font-mono block uppercase">
            Saskatchewan Safety Hub
          </span>
          <h1 className="text-xl font-black text-slate-900 tracking-tight font-sans uppercase">
            Safety Incident Dossier Sheet
          </h1>
          <p className="text-[10px] text-slate-400 font-bold font-mono leading-none uppercase">
            Geocoded Community Intelligence Incident Report
          </p>
        </div>
        <div className="text-right space-y-1 font-mono text-[10px] text-slate-600">
          <div><span className="font-bold">REPORT REF:</span> #OSR-{event.id.substring(0, 8).toUpperCase()}</div>
          <div><span className="font-bold">GENERATED DATE:</span> {new Date().toLocaleString()}</div>
          <div className="inline-block px-2.5 py-0.5 mt-1.5 bg-slate-900 border border-slate-800 text-white font-extrabold text-[9px] rounded uppercase tracking-widest">
            AUTHORIZED PHYSICAL ARCHIVE
          </div>
        </div>
      </div>

      {/* Safety Notice Strip */}
      <div className="border border-slate-300 rounded p-3.5 mb-6 bg-slate-50/60 text-[11px] font-sans text-slate-650 leading-relaxed font-normal">
        <strong className="text-slate-900 font-bold uppercase tracking-wider text-[10px] font-mono mr-1.5 block mb-1">
          ⚠️ OFFICIAL CIVIC USE AND ARCHIVE DISCLAIMER STATEMENT:
        </strong>
        The safety records compiled in this dossier are parsed from community feeds and official public hazard reporting channels. Exact addresses are rounded to the nearest city block or neighborhood sector to preserve privacy. Citizens are advised to treat coordinates as approximate and delay-adjusted. Do not attempt direct civilian interception, citizen policing actions, or profiling based on this intelligence.
      </div>

      {/* Main Title Block */}
      <div className="space-y-2 mb-6">
        <span className="text-[10px] bg-slate-105 border border-slate-300 text-slate-700 font-mono font-bold px-2 py-0.5 rounded">
          SOURCE CHANNEL: {event.sourceName.toUpperCase()} ({event.sourceType.toUpperCase()})
        </span>
        <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">
          {event.title}
        </h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-500 font-sans border-b border-dashed border-slate-200 pb-3">
          <div><strong>Published date:</strong> {new Date(event.publishedAt).toLocaleString()}</div>
          {event.sourceHash && (
            <div><strong>Source Hash Key:</strong> <span className="font-mono text-[10px] font-semibold">{event.sourceHash}</span></div>
          )}
          <div><strong>Original Release Release URL:</strong> <span className="underline select-all font-mono text-[9.5px] break-all leading-none">{event.originalUrl}</span></div>
        </div>
      </div>

      {/* Coordinates Table Grid */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-extrabold font-mono mb-2">
          I. REGIONAL INCIDENT CHARACTERISTICS
        </h3>
        <div className="grid grid-cols-2 border border-slate-300 rounded overflow-hidden font-sans text-xs">
          
          <div className="border-r border-b border-slate-305 p-3 bg-slate-50/50">
            <span className="text-[8.5px] uppercase font-bold text-slate-400 font-mono block leading-none mb-1">
              Safety Urgency Severity
            </span>
            <span className={`font-mono font-extrabold uppercase text-[11px] ${
              event.severity === "critical" ? "text-red-700" :
              event.severity === "high" ? "text-orange-700" :
              event.severity === "medium" ? "text-yellow-750 font-bold" : "text-slate-600 font-bold"
            }`}>
              ★ {event.severity.toUpperCase()} SEVERITY LEVEL
            </span>
          </div>

          <div className="border-b border-slate-305 p-3 bg-slate-50/50">
            <span className="text-[8.5px] uppercase font-bold text-slate-400 font-mono block leading-none mb-1">
              Assessed Incident Category
            </span>
            <span className="font-mono font-extrabold uppercase text-[11px] text-slate-800">
              {event.eventType?.replace(/_/g, " ").toUpperCase() || "OTHER ACTIONABLE"}
            </span>
          </div>

          <div className="border-r border-b border-slate-305 p-3 bg-slate-50/50">
            <span className="text-[8.5px] uppercase font-bold text-slate-400 font-mono block leading-none mb-1">
              Geographic Region & Address
            </span>
            <span className="font-bold text-slate-800 text-[11px] leading-tight">
              {event.locationText}
            </span>
          </div>

          <div className="border-b border-slate-305 p-3 bg-slate-50/50">
            <span className="text-[8.5px] uppercase font-bold text-slate-400 font-mono block leading-none mb-1">
              Precise Coordinate Anchor
            </span>
            <span className="font-mono text-slate-800 font-bold text-[11px]">
              {event.latitude.toFixed(5)}° N, {event.longitude.toFixed(5)}° W
            </span>
          </div>

          <div className="border-r border-slate-305 p-3 bg-slate-50/50">
            <span className="text-[8.5px] uppercase font-bold text-slate-400 font-mono block leading-none mb-1">
              Location Precision Tier
            </span>
            <span className="font-bold text-slate-700 text-[11px] capitalize">
              {event.locationPrecision} (Certainty Index: {(event.locationConfidence * 100).toFixed(0)}%)
            </span>
          </div>

          <div className="p-3 bg-slate-50/50">
            <span className="text-[8.5px] uppercase font-bold text-slate-400 font-mono block leading-none mb-1">
              Retrieved / Geocoded At
            </span>
            <span className="font-mono text-slate-700 text-[11px]">
              {event.retrievedAt ? new Date(event.retrievedAt).toLocaleString() : "Real-time parsing"}
            </span>
          </div>

        </div>
      </div>

      {/* Summary Narrative Section */}
      <div className="mb-6 space-y-2">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-extrabold font-mono border-b border-slate-205 pb-1">
          II. CORE DATA INCIDENT NARRATIVE SUMMARY
        </h3>
        <p className="text-sm text-slate-850 leading-relaxed font-serif whitespace-pre-line text-justify p-1">
          {event.summary || "No active text summary provided. Check online original releases for secondary media files."}
        </p>
      </div>

      {/* Vicinity Profile Section */}
      <div className="mb-6 space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-extrabold font-mono border-b border-slate-205 pb-1">
          III. CIVIL INFRASTRUCTURE & ZONE ASSESSMENTS
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/80 border border-slate-250 p-3.5 rounded font-sans text-xs">
          <div>
            <span className="text-[8.5px] uppercase font-bold text-slate-400 block leading-tight mb-0.5">Municipal Sector Zone</span>
            <span className="font-bold text-slate-800 text-[10.5px]">{vicinity.zone}</span>
          </div>
          <div>
            <span className="text-[8.5px] uppercase font-bold text-slate-400 block leading-tight mb-0.5">Physical Infrastructure</span>
            <span className="font-bold text-slate-800 text-[10.5px]">{vicinity.infrastructure}</span>
          </div>
          <div>
            <span className="text-[8.5px] uppercase font-bold text-slate-400 block leading-tight mb-0.5">Assigned Risk Index</span>
            <span className="font-bold text-slate-800 text-[10.5px]">{vicinity.riskAssessed}</span>
          </div>
          <div>
            <span className="text-[8.5px] uppercase font-bold text-slate-400 block leading-tight mb-0.5">Lighting Coverage Grid</span>
            <span className="font-bold text-slate-800 text-[10.5px]">{vicinity.lighting}</span>
          </div>
        </div>
      </div>

      {/* Workspace Bookmarked notes section if present */}
      {isBookmarked && bookmarkNote && (
        <div className="border-l-4 border-slate-900 bg-slate-100 p-4 mb-6 rounded-r font-sans">
          <span className="text-[8.5px] uppercase font-extrabold tracking-widest text-slate-550 font-mono block mb-1">
            ⚠️ USER SPECIFIED FIELD-NOTE ANNOTATIONS (LIVE ARCHIVAL WORKSPACE)
          </span>
          <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-mono">
            {bookmarkNote}
          </p>
        </div>
      )}

      {/* Official Safety Protocols Guideline */}
      <div className={`border border-slate-350 rounded p-4 mb-8 text-[11px] font-sans flex items-start gap-3 bg-slate-50/60`}>
        <span className="text-lg leading-none shrink-0">📋</span>
        <div className="space-y-1">
          <span className="text-[9px] uppercase font-extrabold tracking-wider text-slate-600 font-mono block leading-none">
            {protocolData.header}
          </span>
          <p className="text-[10px] text-slate-805 leading-relaxed">
            {protocolData.guideline}
          </p>
        </div>
      </div>

      {/* Sign-off Stamps */}
      <div className="pt-10 border-t-2 border-slate-400 grid grid-cols-2 gap-12 font-sans text-[11px] text-slate-500 mt-12 pb-4">
        <div className="space-y-8">
          <div className="border-b-2 border-slate-300 h-10"></div>
          <div>
            <span className="font-bold text-slate-700 block uppercase font-mono text-[9px] tracking-wide leading-none">
              COMMAND COMMANDER AUDIT SIGNATURE
            </span>
            <span className="text-[8.5px] text-slate-400 block leading-none mt-1">
              Saskatchewan Emergency & Community Safety Advisory Hub
            </span>
          </div>
        </div>
        <div className="space-y-8">
          <div className="border-b-2 border-slate-300 h-10"></div>
          <div>
            <span className="font-bold text-slate-700 block uppercase font-mono text-[9px] tracking-wide leading-none">
              PRINT SEALS VALIDATION ARCHIVIST
            </span>
            <span className="text-[8.5px] text-slate-400 block leading-none mt-1">
              Citizen Verified Community Records Custodian
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
