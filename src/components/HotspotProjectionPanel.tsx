import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Flame, ShieldAlert, BarChart3, Clock, Calendar, HelpCircle, MapPin, 
  Sparkles, CheckCircle2, Navigation, Eye, EyeOff, Layers, AlertTriangle, 
  ArrowRight, HeartHandshake, Compass, Users, Map 
} from "lucide-react";
import { EventItem, SeverityType } from "../types";
import { calculateHotspots, SpatialHotspot } from "../utils/hotspotEngine.ts";

interface HotspotProjectionPanelProps {
  events: EventItem[];
  showHeatmap: boolean;
  setShowHeatmap: (val: boolean) => void;
  heatmapOpacity: number;
  onToggleOpacity: () => void;
  onAlignMap: (coords: [number, number]) => void;
  heatmapRadiusMultiplier: number;
  setHeatmapRadiusMultiplier: (val: number) => void;
}

interface NeighborhoodKde {
  name: string;
  latitude: number;
  longitude: number;
}

const NEIGHBORHOODS: NeighborhoodKde[] = [
  { name: "Pleasant Hill", latitude: 52.1285, longitude: -106.6915 },
  { name: "Riversdale", latitude: 52.1230, longitude: -106.6780 },
  { name: "Stonebridge", latitude: 52.0915, longitude: -106.6210 },
  { name: "Sutherland", latitude: 52.1380, longitude: -106.5980 },
  { name: "City Park", latitude: 52.1430, longitude: -106.6570 },
  { name: "Caswell Hill", latitude: 52.1385, longitude: -106.6850 },
  { name: "Nutana", latitude: 52.1190, longitude: -106.6550 },
  { name: "Broadway", latitude: 52.1180, longitude: -106.6500 },
  { name: "Varsity View", latitude: 52.1280, longitude: -106.6350 },
  { name: "Evergreen", latitude: 52.1645, longitude: -106.5620 },
  { name: "Rosewood", latitude: 52.0980, longitude: -106.5750 },
  { name: "Lakeview", latitude: 52.1080, longitude: -106.5950 },
  { name: "Silverwood Heights", latitude: 52.1790, longitude: -106.6320 },
  { name: "Westmount", latitude: 52.1460, longitude: -106.6950 },
  { name: "Meadowgreen", latitude: 52.1290, longitude: -106.7115 },
  { name: "Mount Royal", latitude: 52.1435, longitude: -106.7085 },
  { name: "Fairhaven", latitude: 52.1155, longitude: -106.7410 },
  { name: "Saskatoon Downtown", latitude: 52.1310, longitude: -106.6630 },
];

// Haversine distance helper
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
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

export default function HotspotProjectionPanel({
  events,
  showHeatmap,
  setShowHeatmap,
  heatmapOpacity,
  onToggleOpacity,
  onAlignMap,
  heatmapRadiusMultiplier,
  setHeatmapRadiusMultiplier
}: HotspotProjectionPanelProps) {
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [projectionHorizon, setProjectionHorizon] = useState<"24h" | "7d" | "30d">("7d");
  const [showExplanation, setShowExplanation] = useState(false);

  // Dynamic Kernel Density Estimation (KDE) scores for standard Saskatoon neighborhoods
  const neighborhoodKdes = useMemo(() => {
    const h = 0.8 * heatmapRadiusMultiplier; // Bandwidth in km (800 meters scaled)
    return NEIGHBORHOODS.map((nh) => {
      let kdeSum = 0;
      let incidentCountInBandwidth = 0;

      events.forEach((evt) => {
        const dist = getDistanceKm(nh.latitude, nh.longitude, evt.latitude, evt.longitude);
        const u = dist / h;
        // Gaussian kernel
        const kernelValue = Math.exp(-0.5 * u * u);

        let weight = 1.0;
        if (evt.severity === "critical") weight = 4.0;
        else if (evt.severity === "high") weight = 2.5;
        else if (evt.severity === "medium") weight = 1.5;

        kdeSum += weight * kernelValue;

        if (dist <= 1.2 * heatmapRadiusMultiplier) {
          incidentCountInBandwidth++;
        }
      });

      const area = Math.PI * h * h;
      const densityValue = area > 0 ? (kdeSum / area) : 0;
      // Multiply by a scaling factor to make scores look standard (like a risk index from 0 to 100)
      const roundedScore = Math.round(densityValue * 8.5 * 10) / 10;

      return {
        ...nh,
        kdeScore: roundedScore,
        incidentsCount: incidentCountInBandwidth,
      };
    }).sort((a, b) => b.kdeScore - a.kdeScore);
  }, [events, heatmapRadiusMultiplier]);

  // Time-of-day projection counts
  const temporalBreakdown = useMemo(() => {
    let morningWeight = 0;   // 06:00 - 12:00
    let afternoonWeight = 0; // 12:00 - 18:00
    let eveningWeight = 0;   // 18:00 - 22:00
    let lateNightWeight = 0; // 22:00 - 06:00

    let morningCount = 0;
    let afternoonCount = 0;
    let eveningCount = 0;
    let lateNightCount = 0;

    events.forEach(e => {
      try {
        const d = new Date(e.publishedAt);
        const hours = d.getHours();
        
        let weight = 1;
        if (e.severity === "critical") weight = 5;
        else if (e.severity === "high") weight = 3;
        else if (e.severity === "medium") weight = 2;

        if (hours >= 6 && hours < 12) {
          morningWeight += weight;
          morningCount++;
        } else if (hours >= 12 && hours < 18) {
          afternoonWeight += weight;
          afternoonCount++;
        } else if (hours >= 18 && hours < 22) {
          eveningWeight += weight;
          eveningCount++;
        } else {
          lateNightWeight += weight;
          lateNightCount++;
        }
      } catch {
        // Fallback gracefully
        lateNightWeight++;
        lateNightCount++;
      }
    });

    const totalWeight = (morningWeight + afternoonWeight + eveningWeight + lateNightWeight) || 1;

    return [
      { 
        name: "Morning", 
        range: "06:00 – 12:00", 
        percentage: Math.round((morningWeight / totalWeight) * 100), 
        count: morningCount,
        riskLevel: morningWeight > 50 ? "Elevated" : morningWeight > 20 ? "Moderate" : "Low",
        colorClass: "bg-amber-400"
      },
      { 
        name: "Afternoon", 
        range: "12:00 – 18:00", 
        percentage: Math.round((afternoonWeight / totalWeight) * 100), 
        count: afternoonCount,
        riskLevel: afternoonWeight > 50 ? "Elevated" : afternoonWeight > 20 ? "Moderate" : "Low",
        colorClass: "bg-blue-400"
      },
      { 
        name: "Evening", 
        range: "18:00 – 22:00", 
        percentage: Math.round((eveningWeight / totalWeight) * 100), 
        count: eveningCount,
        riskLevel: eveningWeight > 60 ? "Severe" : eveningWeight > 30 ? "Elevated" : "Moderate",
        colorClass: "bg-orange-500"
      },
      { 
        name: "Late Night", 
        range: "22:00 – 06:00", 
        percentage: Math.round((lateNightWeight / totalWeight) * 100), 
        count: lateNightCount,
        riskLevel: lateNightWeight > 60 ? "Severe" : lateNightWeight > 30 ? "Elevated" : "Moderate",
        colorClass: "bg-violet-600"
      }
    ];
  }, [events]);

  // Day-of-week projection counts
  const weekendVsWeekday = useMemo(() => {
    let weekdayWeight = 0;
    let weekendWeight = 0;
    let weekdayCount = 0;
    let weekendCount = 0;

    events.forEach(e => {
      try {
        const d = new Date(e.publishedAt);
        const day = d.getDay(); // 0 is Sunday, 6 is Saturday
        const isWeekend = day === 0 || day === 6;

        let weight = 1;
        if (e.severity === "critical") weight = 5;
        else if (e.severity === "high") weight = 3;
        else if (e.severity === "medium") weight = 2;

        if (isWeekend) {
          weekendWeight += weight;
          weekendCount++;
        } else {
          weekdayWeight += weight;
          weekdayCount++;
        }
      } catch {
        weekdayWeight++;
      }
    });

    const weekdayAvg = weekdayWeight / 5;
    // Normalized to reflect daily average load since weekdays last 5 days
    const weekendAvg = weekendWeight / 2;
    const totalAvg = (weekdayAvg + weekendAvg) || 1;

    return {
      weekdayRatio: Math.round((weekdayAvg / totalAvg) * 100),
      weekendRatio: Math.round((weekendAvg / totalAvg) * 100),
      weekdayCount,
      weekendCount,
    };
  }, [events]);

  // Proximity clustering logic to compute Projected High-Stake Hotspots
  const hotspotsData = useMemo(() => {
    const resolvedHotspots = calculateHotspots(events, projectionHorizon);
    // Sort by density score descending and return top 5
    return resolvedHotspots
      .sort((a, b) => b.densityScore - a.densityScore)
      .slice(0, 5);
  }, [events, projectionHorizon]);

  // Active recommendations calculator depending on primary hazard
  const getProactiveTips = (hazard: string) => {
    const formatType = hazard.replace(/_/g, " ").toLowerCase();
    
    if (formatType.includes("assault") || formatType.includes("shooting") || formatType.includes("stabbing") || formatType.includes("weapons")) {
      return [
        "Avoid lone nighttime foot travel in dark alleyways or parking sectors.",
        "Maintain direct communication with security desks or designated escorts.",
        "Observe active light sources and relocate immediately if feeling followed."
      ];
    }
    
    if (formatType.includes("theft") || formatType.includes("break") || formatType.includes("robbery")) {
      return [
        "Store all portable high-value objects completely out of plain sight in parked vehicles.",
        "Verify all secondary access points, deadbolts, and rolling garage doors are locked.",
        "Verify motion detection perimeter spot lamps are operational."
      ];
    }

    if (formatType.includes("collision") || formatType.includes("traffic")) {
      return [
        "Observe defensive speed limits during peak transition shifts.",
        "Yield aggressively at multi-way junctions and construction detours.",
        "Decrease operating speeds on slick pavements and high-speed bridges."
      ];
    }

    return [
      "Maintain active awareness of local civil updates & public bulletins.",
      "Engage dynamic alerts on mobile devices to receive real-time warnings.",
      "Check in on neighboring tenants or elderly colleagues during risk windows."
    ];
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden font-sans">
      
      {/* Panel Top Heading */}
      <div className="bg-slate-50 border-b border-slate-200 p-2.5 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1.5 animate-duration-2000">
          <Flame size={14} className="text-red-500 fill-red-100 animate-pulse" />
          <span className="text-xs font-black uppercase text-slate-800 tracking-wide">
            Safety Hotspot Projections
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="p-1 text-slate-400 hover:text-slate-650 hover:bg-slate-100 rounded cursor-pointer"
            title="Algorithm explanation"
          >
            <HelpCircle size={13} />
          </button>
          <span className="text-[9px] font-mono font-bold text-red-650 bg-red-50 px-1.5 py-0.5 rounded border border-red-150 uppercase tracking-widest animate-pulse">
            PREDICTIVE HEAT
          </span>
        </div>
      </div>

      {/* Explanatory Banner */}
      <AnimatePresence>
        {showExplanation && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#0F172A] text-slate-300 p-3 text-[10.5px] leading-relaxed font-medium border-b border-slate-800 shrink-0"
          >
            <div className="font-bold flex items-center gap-1.5 mb-1.5 text-white border-b border-slate-700 pb-1 uppercase tracking-wide text-[10px]">
              <Sparkles size={11} className="text-red-400" />
              How Hotspots are Generated
            </div>
            <p>
              By scanning geographic cluster bounds, our localized projection algorithm models safety clusters within an <strong>800-meter threshold</strong>. Incidents are weighted dynamically according to severity scales: <em>Critical & High Stake</em> alerts represent high density hazards, whereas diurnal indices compute risk trajectories matched to peak timelines.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Body Layout */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-200">
        
        {/* Kernel Density Estimation (KDE) Heatmap Control Panel */}
        <div id="kde-heatmap-control-panel" className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded bg-indigo-50 border border-indigo-100 text-indigo-650">
                <Layers size={13} />
              </div>
              <div>
                <h3 className="text-[11px] font-black uppercase text-slate-800 tracking-wider font-sans">Neighborhood Density</h3>
                <p className="text-[8.5px] text-slate-400 font-semibold font-mono">Kernel Density Estimation (KDE)</p>
              </div>
            </div>

            {/* Custom Interactive Badges */}
            <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border uppercase transition-all font-mono tracking-wider ${
              showHeatmap 
                ? "bg-emerald-50 text-emerald-750 border-emerald-200" 
                : "bg-slate-50 text-slate-450 border-slate-200"
            }`}>
              {showHeatmap ? "KDE RUNNING" : "STANDBY"}
            </span>
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
            Evaluate localized public safety density over space. This mathematical surface uses a Gaussian kernel to model event proximity across Saskatoon's standard sectors.
          </p>

          <div className="bg-slate-50 border border-slate-150 p-3 rounded-lg space-y-3 shadow-inner">
            {/* Toggle switch for KDE simulation */}
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-bold text-slate-700">Display Heatmap Overlay</span>
              <button
                type="button"
                id="kde-toggle-btn"
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showHeatmap ? "bg-indigo-600" : "bg-slate-200"
                }`}
                title={showHeatmap ? "Disable Heatmap Overlay" : "Enable Heatmap Overlay"}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showHeatmap ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Controls only shown and active with high fidelity */}
            <div className="space-y-2.5 pt-1.5 border-t border-slate-200/60">
              {/* Opacity Selector */}
              <div className="flex items-center justify-between text-[10px] text-slate-650 font-semibold">
                <span>Contour Alpha (Opacity)</span>
                <button
                  type="button"
                  id="kde-opacity-cycle"
                  onClick={onToggleOpacity}
                  className="cursor-pointer font-mono font-black text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-150 px-1.5 py-0.5 rounded hover:bg-indigo-100 transition-colors uppercase"
                >
                  Opacity: {
                    heatmapOpacity < 0.10 ? "LOW (6%)" :
                    heatmapOpacity < 0.30 ? "MID (18%)" : "HIGH (35%)"
                  }
                </button>
              </div>

              {/* Bandwidth Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-655 font-semibold">
                  <span>Bandwidth (Kernel Radius)</span>
                  <span className="font-mono text-[9px] font-black text-indigo-650 bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">
                    {Math.round(800 * heatmapRadiusMultiplier)}m ({heatmapRadiusMultiplier.toFixed(1)}x)
                  </span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="2.5"
                  step="0.1"
                  value={heatmapRadiusMultiplier}
                  onChange={(e) => setHeatmapRadiusMultiplier(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  title="Slide to adjust Kernel Density bandwidth/radius"
                />
                <div className="flex justify-between text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest px-0.5">
                  <span>Narrow (320m)</span>
                  <span>Standard (800m)</span>
                  <span>Wide (2km)</span>
                </div>
              </div>
            </div>
          </div>

          {/* KDE Neighborhood Rankings List */}
          <div className="space-y-1.5">
            <span className="text-[9.5px] uppercase font-mono font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
              <Compass size={11} className="text-slate-500 animate-spin-slow" /> Neighborhood KDE Density Ranks
            </span>
            
            <div className="border border-slate-150 rounded-lg overflow-hidden bg-slate-50 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-250">
              {neighborhoodKdes.length === 0 ? (
                <div className="text-center py-4 text-[10px] text-slate-400 font-semibold bg-white">
                  No alerts available to model
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {neighborhoodKdes.map((nh) => {
                    const maxScore = Math.max(...neighborhoodKdes.map(n => n.kdeScore), 1);
                    const percentage = (nh.kdeScore / maxScore) * 100;
                    
                    // Style of indicator color
                    let barColor = "bg-indigo-500";
                    let textColor = "text-indigo-700";
                    let bgBadge = "bg-indigo-50/70 border-indigo-150";
                    
                    if (nh.kdeScore > 80) {
                      barColor = "bg-red-500 animate-pulse";
                      textColor = "text-red-700 font-black";
                      bgBadge = "bg-red-50 border-red-150";
                    } else if (nh.kdeScore > 30) {
                      barColor = "bg-amber-500";
                      textColor = "text-amber-700";
                      bgBadge = "bg-amber-50 border-amber-150";
                    }

                    return (
                      <div 
                        key={nh.name} 
                        className="p-2.5 bg-white hover:bg-slate-50 transition-all duration-150 flex flex-col gap-1 select-none"
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                          <button
                            type="button"
                            onClick={() => onAlignMap([nh.latitude, nh.longitude])}
                            className="flex items-center gap-1 hover:text-indigo-650 cursor-pointer font-bold text-left truncate max-w-[200px]"
                            title="Focus map on this neighborhood sector"
                          >
                            <MapPin size={10} className="text-slate-400 shrink-0" />
                            <span className="truncate">{nh.name}</span>
                          </button>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] text-slate-400 font-medium">
                              {nh.incidentsCount} alerts
                            </span>
                            <span className={`text-[9.5px] font-mono font-extrabold px-1.5 py-0.5 rounded border leading-none shrink-0 ${textColor} ${bgBadge}`}>
                              {nh.kdeScore.toFixed(0)} <span className="text-[7.5px] opacity-70">Scale</span>
                            </span>
                          </div>
                        </div>

                        {/* relative progress bar */}
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-0.5">
                          <div 
                            style={{ width: `${percentage}%` }} 
                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[8.5px] text-slate-400 font-sans leading-relaxed italic px-0.5">
              * Click any neighborhood name or pin icon above to target the live map viewport. Density scores denote relative high-priority alert frequency matching Gaussian clusters.
            </p>
          </div>
        </div>

        {/* Projection Horizon Tab Selectors */}
        <div className="space-y-1 select-none">
          <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400">
            Temporal Feed Memory Horizon:
          </label>
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-md">
            {(["24h", "7d", "30d"] as const).map((horizon) => (
              <button
                key={horizon}
                onClick={() => {
                  setProjectionHorizon(horizon);
                  setSelectedHotspotId(null);
                }}
                className={`py-1 text-[10px] font-extrabold rounded uppercase cursor-pointer transition-all ${
                  projectionHorizon === horizon
                    ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {horizon === "24h" ? "Last 24 Hours" : horizon === "7d" ? "Past 7 Days" : "Past 30 Days"}
              </button>
            ))}
          </div>
        </div>

        {/* Diurnal (Time-of-day) Projection Graph/Index */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 pb-3.5 shadow-sm">
          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
            <Clock size={13} className="text-slate-500" />
            <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">
              Diurnal Risk Factor Projection
            </span>
          </div>

          <div className="space-y-2 mt-2">
            {temporalBreakdown.map((item) => (
              <div key={item.name} className="space-y-1">
                <div id={`diurnal-label-${item.name.toLowerCase().replace(" ", "-")}`} className="flex justify-between items-center text-[10.5px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-800">{item.name}</span>
                    <span className="text-[9px] font-mono text-slate-400">{item.range}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-[9px] font-bold text-slate-400">({item.count} events)</span>
                    <span className="font-extrabold text-slate-700">{item.percentage}%</span>
                    <span className={`text-[8px] font-black px-1 py-0.2 rounded border uppercase tracking-wider ${
                      item.riskLevel === "Severe" 
                        ? "bg-red-50 text-red-650 border-red-200" 
                        : item.riskLevel === "Elevated" 
                        ? "bg-orange-50 text-orange-600 border-orange-200" 
                        : item.riskLevel === "Moderate" 
                        ? "bg-yellow-50 text-yellow-700 border-yellow-200" 
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}>
                      {item.riskLevel}
                    </span>
                  </div>
                </div>
                
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={`h-full ${item.colorClass} opacity-85`}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Weekend vs Weekday factor */}
          <div className="grid grid-cols-2 gap-2 text-center select-none pt-2 border-t border-slate-100/50 mt-2.5 bg-slate-50/50 p-2 rounded">
            <div className="space-y-0.5 border-r border-slate-200/60 pr-1">
              <span className="block text-[8px] uppercase font-bold tracking-wider text-slate-400">Weekly Distribution</span>
              <span className="block text-[10.5px] font-extrabold text-slate-700">Weekdays (Mon-Fri)</span>
              <span className="block text-xs font-mono font-black text-indigo-650">{weekendVsWeekday.weekdayRatio}% avg</span>
            </div>
            <div className="space-y-0.5 pl-1 col">
              <span className="block text-[8px] uppercase font-bold tracking-wider text-slate-400">Weekend Surge Ratio</span>
              <span className="block text-[10.5px] font-extrabold text-slate-700">Weekends (Sat-Sun)</span>
              <span className="block text-xs font-mono font-black text-rose-600">{weekendVsWeekday.weekendRatio}% avg</span>
            </div>
          </div>
        </div>

        {/* Spatial Projections Listing */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Compass size={13} className="text-slate-500" />
            <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">
              Projected High-Stakes Proximity Zones
            </span>
          </div>

          {hotspotsData.length === 0 ? (
            <div className="bg-slate-50 rounded-lg p-5 border border-slate-200 text-center text-xs text-slate-400 font-semibold">
              <CheckCircle2 size={18} className="text-emerald-500 mx-auto mb-1" />
              There are no active projections matching memory bounds
            </div>
          ) : (
            hotspotsData.map((hotspot, idx) => {
              const isSelected = selectedHotspotId === hotspot.id;
              const hazardLevel = hotspot.densityScore >= 16 ? "Severe Stakes" : hotspot.densityScore >= 8 ? "Moderate Stakes" : "Low Stakes";
              const hazardClasses = 
                hotspot.densityScore >= 16 
                  ? "border-red-200 bg-red-50 text-red-750" 
                  : hotspot.densityScore >= 8 
                  ? "border-orange-200 bg-orange-50 text-orange-755" 
                  : "border-slate-200 bg-slate-50 text-slate-600";

              return (
                <div
                  key={hotspot.id}
                  id={`hotspot-card-${hotspot.id}`}
                  className={`border rounded-lg overflow-hidden transition-all duration-200 bg-white ${
                    isSelected 
                      ? "border-indigo-500 ring-2 ring-indigo-500/10 shadow-md" 
                      : "border-slate-200 hover:border-slate-350 shadow-sm"
                  }`}
                >
                  {/* Card head summary */}
                  <div
                    onClick={() => {
                      setSelectedHotspotId(isSelected ? null : hotspot.id);
                      // Center the map immediately
                      onAlignMap([hotspot.latitude, hotspot.longitude]);
                    }}
                    className="p-3 flex items-start justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="font-mono text-[9.5px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-150 rounded w-4 h-4 flex items-center justify-center shrink-0 leading-none">
                          {idx + 1}
                        </span>
                        <h4 className="font-black text-[11px] text-slate-800 tracking-tight truncate">
                          {hotspot.name}
                        </h4>
                        <span className={`text-[8.5px] px-1 py-0.2 rounded font-black border leading-none uppercase ${hazardClasses}`}>
                          {hazardLevel.split(" ")[0]}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 text-[9.5px] text-slate-450 font-mono">
                        <span className="flex items-center gap-0.5">
                          <MapPin size={10} className="text-slate-400" />
                          {hotspot.neighborhood}
                        </span>
                        <span>•</span>
                        <span>Density: <strong className="font-bold text-slate-700">{hotspot.incidentCount} events</strong></span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="block text-[8px] font-mono font-bold text-slate-400 uppercase">Hazard Index</span>
                      <span className="block text-sm font-black text-slate-800 font-mono mt-0.5">{hotspot.densityScore}</span>
                    </div>
                  </div>

                  {/* Expanded advisory details */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-slate-100 bg-slate-50/50 p-3 space-y-3"
                      >
                        {/* Analytical breakdowns */}
                        <div className="grid grid-cols-2 gap-2 select-none text-[10px] leading-relaxed font-semibold">
                          <div className="bg-white p-2 border border-slate-150 rounded-lg shadow-soft">
                            <span className="block text-[8px] font-mono text-slate-400 uppercase">Worst Catalyst Hazard</span>
                            <span className="block text-[10.5px] font-extrabold text-amber-600 capitalize mt-1">
                              {hotspot.primaryHazard.replace(/_/g, " ")}
                            </span>
                          </div>

                          <div className="bg-white p-2 border border-slate-150 rounded-lg shadow-soft">
                            <span className="block text-[8px] font-mono text-slate-400 uppercase">Projected Peak Window</span>
                            <span className="block text-[10.5px] font-extrabold text-indigo-600 mt-1 truncate">
                              {hotspot.peakPeriod.split(" ")[0]}
                            </span>
                          </div>
                        </div>

                        {/* Proactive community instructions */}
                        <div className="space-y-1.5">
                          <span className="text-[8px] font-mono font-bold text-slate-400 uppercase flex items-center gap-1">
                            <HeartHandshake size={11} className="text-indigo-650" />
                            Proactive Community Action Steps
                          </span>
                          <div className="bg-white border border-slate-150 p-2.5 rounded-lg space-y-1.5 shadow-soft">
                            {getProactiveTips(hotspot.primaryHazard).map((tip, idx) => (
                              <div key={idx} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-650 font-semibold">
                                <ArrowRight size={10} className="text-indigo-500 mt-1 shrink-0" />
                                <p>{tip}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Centering map triggers */}
                        <div className="flex gap-2.5">
                          <button
                            type="button"
                            onClick={() => onAlignMap([hotspot.latitude, hotspot.longitude])}
                            className="flex-1 select-none cursor-pointer bg-slate-800 hover:bg-slate-750 text-white font-extrabold text-[9.5px] py-1.5 rounded transition-colors uppercase tracking-wider flex items-center justify-center gap-1"
                          >
                            <Map size={10} />
                            <span>Align Live Map View</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Proactive Community Safety Checklist Footer Banner */}
        <div id="safety-hotspot-curriculum-banner" className="p-3 bg-red-50 border border-red-150 rounded-lg text-slate-800 relative overflow-hidden select-none">
          <div className="absolute right-2 bottom-1 opacity-10 pointer-events-none">
            <Users size={64} className="text-red-900" />
          </div>
          <div className="flex items-center gap-1 mb-1 font-bold text-[10.5px] text-red-900 uppercase tracking-wide">
            <ShieldAlert size={12} className="text-red-500" />
            Empowering Proactive Awareness
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed font-semibold">
            These calculations help citizens and neighbourhood watches prioritize vigilances. By pairing predictive times of risk feeds with micro-coordinates on the live safety board, you can plan safer foot transits, ensure private assets are completely secured, and coordinate safer shared routes.
          </p>
        </div>

      </div>

    </div>
  );
}
