import React, { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp, AlertOctagon, ShieldAlert, BadgeInfo, Info, MapPin, EyeOff, ShieldCheck, HeartPulse } from "lucide-react";
import { SeverityType } from "../types";

interface MapLegendProps {
  onShowHelp: () => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  heatmapOpacity: number;
  onToggleOpacity: () => void;
}

export default function MapLegend({ 
  onShowHelp,
  showHeatmap,
  onToggleHeatmap,
  heatmapOpacity,
  onToggleOpacity
}: MapLegendProps) {
  const [isGuideExpanded, setIsGuideExpanded] = useState(false);

  const severities: { type: SeverityType; label: string; colorClass: string; bgClass: string }[] = [
    { type: "critical", label: "Critical Urgent (Active Threats)", colorClass: "text-red-600", bgClass: "bg-red-600" },
    { type: "high", label: "High Severity (Assaults, Robbins, Weapons)", colorClass: "text-orange-500", bgClass: "bg-orange-500" },
    { type: "medium", label: "Medium (B&E, SIRT, Traffic, Drugs)", colorClass: "text-yellow-400", bgClass: "bg-yellow-400" },
    { type: "low", label: "Low Severity (Minor Disputes, Controlled Fires)", colorClass: "text-slate-300", bgClass: "bg-slate-300" },
  ];

  const detailedSeverities = [
    {
      type: "critical" as SeverityType,
      title: "Critical Priority",
      subtitle: "Tier 4 - Active Danger Alerts",
      pingColor: "bg-red-500",
      coreColor: "bg-red-600",
      textClass: "text-red-700",
      bgCardClass: "bg-red-50/40 border-red-150",
      badgeClass: "bg-red-100 text-red-800",
      icon: <AlertOctagon size={14} className="text-red-600 shrink-0" />,
      description: "Immediate critical threats demanding active area security containment and community caution.",
      triggerKeywords: "Homicides, firearms discharged, shooting reports, dangerous person sirens, hostage threats.",
      protocol: "Evacuate if recommended, shelter in place, monitor official safety feeds, and yield emergency routes."
    },
    {
      type: "high" as SeverityType,
      title: "High Priority",
      subtitle: "Tier 3 - Serious Threats / Weapons",
      pingColor: "bg-orange-400",
      coreColor: "bg-orange-500",
      textClass: "text-orange-700",
      bgCardClass: "bg-orange-50/40 border-orange-150",
      badgeClass: "bg-orange-100 text-orange-850",
      icon: <ShieldAlert size={14} className="text-orange-600 shrink-0" />,
      description: "Incidents posing significant risk of direct bodily harm or ongoing defensive police perimeters.",
      triggerKeywords: "Stabbing casualties, arm-robberies, tactical police operation lockdowns, weapons brandishing, severe assaults.",
      protocol: "Avoid direct vicinity, lock residential/vehicular gates, stay indoors, and report suspicious matching suspect signs."
    },
    {
      type: "medium" as SeverityType,
      title: "Medium Priority",
      subtitle: "Tier 2 - Material Crime / Asset Mischief",
      pingColor: "bg-yellow-300",
      coreColor: "bg-yellow-400",
      textClass: "text-yellow-700 font-bold",
      bgCardClass: "bg-yellow-50/30 border-yellow-150",
      badgeClass: "bg-yellow-100 text-yellow-800",
      icon: <Info size={14} className="text-yellow-600 shrink-0" />,
      description: "Non-immediate property crime, major regulatory traffic disruptions, or official oversight processes.",
      triggerKeywords: "Break and enters, stolen auto transport, large-scale drug seizures, SIRT investigation starts, wildfire warnings.",
      protocol: "Confirm local security camera visibility, audit lockups, report historical clues, and check highway smoke delays."
    },
    {
      type: "low" as SeverityType,
      title: "Low Priority",
      subtitle: "Tier 1 - Public Disturbances / Minor Events",
      pingColor: "bg-slate-200",
      coreColor: "bg-slate-300",
      textClass: "text-slate-600",
      bgCardClass: "bg-slate-50/70 border-slate-150",
      badgeClass: "bg-slate-100 text-slate-700",
      icon: <ShieldCheck size={14} className="text-slate-500 shrink-0" />,
      description: "Controlled incidents, minor neighborhood disputes, or informational public safety bulletins.",
      triggerKeywords: "Public disorder complaints, multi-vehicle delay crashes, minor controlled burns, baseline local hazard drills.",
      protocol: "No action necessary, detour minor traffic delay bottlenecks, and sustain routine situational awareness."
    }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs space-y-3.5 text-slate-850 transition-all duration-300">
      {/* Top action block with help and expanding trigger */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-slate-400 uppercase tracking-widest text-[9px] font-mono select-none">
            Main Safety Legend
          </h4>
          <button
            type="button"
            id="legend-details-toggle-btn"
            onClick={() => setIsGuideExpanded(!isGuideExpanded)}
            className="cursor-pointer bg-slate-50 hover:bg-slate-100 text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded-full border border-slate-200 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
            title="Open comprehensive public safety severity criteria and guidelines matrix"
          >
            <span>{isGuideExpanded ? "Hide Description Guide" : "Show Pin Reference Guide"}</span>
            {isGuideExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>

        <button
          onClick={onShowHelp}
          className="text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer font-semibold"
        >
          <HelpCircle size={13} />
          <span>Dashboard Guide</span>
        </button>
      </div>

      {/* Default Inline Color Row - beautiful micro-circles */}
      {!isGuideExpanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-slate-100 font-medium select-none">
          {severities.map((item) => (
            <div key={item.type} className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                {item.type !== "low" && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-70 ${item.bgClass}`}></span>
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${item.bgClass}`}></span>
              </span>
              <div className="flex flex-col">
                <span className="text-slate-700 font-semibold lowercase first-letter:uppercase text-[11px] leading-tight">
                  {item.type}
                </span>
                <span className="text-[9.5px] text-slate-400 leading-none truncate max-w-[160px] md:max-w-[200px]">
                  {item.type === "critical" ? "Severe Active Sirens" :
                   item.type === "high" ? "Assault & Weapons" :
                   item.type === "medium" ? "B&E & Investigations" : "Collisions & Minor"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded Severity Reference Matrix Guide */}
      {isGuideExpanded && (
        <div className="pt-3.5 border-t border-slate-200 space-y-4 animate-fadeIn">
          {/* Informational intro banner */}
          <div className="flex items-start gap-2 bg-blue-50/50 border border-blue-100 rounded-lg p-2.5">
            <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h5 className="font-bold text-blue-900 text-[11px] font-mono uppercase tracking-wider">
                Saskatchewan Severity Assessment Matrix
              </h5>
              <p className="text-[10px] text-blue-700 leading-relaxed">
                Incidents are parsed by a rule-based classifier matching keywords, then mapped to four risk urgency brackets. Map markers pulse with color-coded rings to depict alert intensity. Exact coordinates are rounded to maintain civic privacy.
              </p>
            </div>
          </div>

          {/* Cards Grid for each Severity Tier */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {detailedSeverities.map((item) => (
              <div 
                key={item.type} 
                className={`border rounded-xl p-3 flex flex-col justify-between space-y-2.5 shadow-sm transition-all hover:shadow hover:border-slate-300 ${item.bgCardClass}`}
              >
                {/* Header info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Pulsing Pin Preview matching Leaflet styling */}
                    <span className="relative flex h-6 w-6 items-center justify-center bg-white rounded-full border border-slate-250 shadow-sm shrink-0">
                      {item.type !== "low" && (
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${item.pingColor}`}></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${item.coreColor}`}></span>
                    </span>
                    <div>
                      <h5 className={`font-bold text-[11px] leading-tight ${item.textClass}`}>
                        {item.title}
                      </h5>
                      <span className="text-[9.5px] text-slate-400 font-mono font-medium block leading-none">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${item.badgeClass}`}>
                    {item.type}
                  </span>
                </div>

                {/* Body Details */}
                <p className="text-[10px] text-slate-600 leading-relaxed font-sans">
                  {item.description}
                </p>

                {/* Keyword triggers */}
                <div className="space-y-0.5 pt-1.5 border-t border-slate-100">
                  <span className="text-[8px] uppercase font-bold tracking-widest text-slate-400 block font-mono">
                    System Match Triggers
                  </span>
                  <p className="text-[9.5px] text-slate-600 leading-tight italic font-mono truncate hover:text-clip hover:overflow-visible hover:whitespace-normal" title={item.triggerKeywords}>
                    "{item.triggerKeywords}"
                  </p>
                </div>

                {/* Protocol recommendation */}
                <div className="bg-white/80 rounded-md p-2 mt-1 border border-slate-100 flex items-start gap-1.5 shrink-0">
                  {item.icon}
                  <div className="space-y-0.5">
                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-slate-500 font-mono block leading-none">
                      Safety Protocol
                    </span>
                    <p className="text-[9px] text-slate-600 leading-snug">
                      {item.protocol}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* User dropped pin reference row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl p-3 transition-colors">
            {/* Custom Manual Personal Pins dropped by user */}
            <div className="flex items-start gap-3">
              <span className="relative flex h-8 w-8 items-center justify-center bg-white rounded-full border border-slate-250 shadow-md shrink-0 mt-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-violet-600 items-center justify-center shadow-inner">
                  <span className="text-[8px] text-white font-extrabold">★</span>
                </span>
              </span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <h5 className="font-extrabold text-slate-800 text-[11px] leading-none">Custom Personal Pin</h5>
                  <span className="text-[8.5px] font-mono text-violet-700 bg-violet-50 px-1.5 rounded font-extrabold uppercase border border-violet-100">User dropped</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Represents manual bookmarks or localized reminders dropped by custom clicking onto the interactive map workspace canvas. They do not trigger automated sirens, but persists user-added descriptive logs, routes, and custom safety annotations.
                </p>
              </div>
            </div>

            {/* Privacy indicator & exact vs neighborhood precision description */}
            <div className="flex items-start gap-3 pt-3 md:pt-0 border-t border-slate-200 md:border-t-0 md:border-l md:pl-5">
              <div className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full h-8 w-8 flex items-center justify-center shrink-0">
                <HeartPulse size={15} className="text-slate-600" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <h5 className="font-extrabold text-slate-800 text-[11px] leading-none">Location Privacy & Masking</h5>
                  <span className="text-[8.5px] font-mono text-emerald-700 bg-emerald-50 px-1.5 rounded font-extrabold uppercase border border-emerald-100">Enabled</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Exact house numbers are truncated to the nearest intersecting city block or neighborhood sectors (e.g. 100 block, 2400 block, Saskatoon North-West sector) protecting victim/officer location safety. Live system scores coordinate certainty metrics.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main control line */}
      <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between text-[11px] text-slate-500 gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold select-none">
            SASKATOON CENTER
          </span>
          <span className="bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-mono select-none">
            52.1332° N, 106.6700° W
          </span>
        </div>

        {/* Heatmap Density controls inside Map Legend Area */}
        <div className="flex items-center gap-2 select-none">
          <button
            type="button"
            id="legend-heatmap-toggle-btn"
            onClick={onToggleHeatmap}
            className={`cursor-pointer px-2.5 py-1 text-[9.5px] font-mono font-extrabold uppercase rounded border transition-all ${
              showHeatmap
                ? "bg-blue-50 border-blue-250 text-blue-700"
                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            Heatmap: {showHeatmap ? "ON" : "OFF"}
          </button>
          
          {showHeatmap && (
            <button
              type="button"
              id="legend-heatmap-opacity-btn"
              onClick={onToggleOpacity}
              className="cursor-pointer px-2.5 py-1 text-[9.5px] font-mono font-extrabold uppercase rounded border bg-slate-900 border-slate-800 text-white hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm animate-fadeIn"
              title="Toggle Heatmap Opacity layer density for clearer view of pins"
            >
              <span>Opacity:</span>
              <span className="text-blue-400 font-semibold">{
                heatmapOpacity < 0.10 ? "Low (6%)" :
                heatmapOpacity < 0.30 ? "Mid (18%)" : "High (35%)"
              }</span>
            </button>
          )}
        </div>

        <p className="italic text-slate-400 hidden xl:block select-none">
          * Coordinates of incidents are approximate and rounded for safety.
        </p>
      </div>
    </div>
  );
}

