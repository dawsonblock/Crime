import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldAlert, AlertTriangle, Search, TrendingUp, TrendingDown, 
  HelpCircle, MapPin, Sparkles, AlertCircle, ShieldCheck, 
  ChevronRight, ChevronDown, CheckCircle2, Award, Info, Map 
} from "lucide-react";
import { EventItem, SeverityType } from "../types";

interface RiskAssessmentProps {
  events: EventItem[];
  onSelectNeighbourhood: (neighbourhood: string, firstEvent: EventItem | null) => void;
}

interface NeighbourhoodRisk {
  name: string;
  score: number;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  trajectory: "up" | "down" | "stable";
  percentChange: number;
  dominantType: string;
  dominantTypeCount: number;
  recentEvents: EventItem[];
  categoryBreakdown: Record<string, number>;
}

export default function RiskAssessment({ events, onSelectNeighbourhood }: RiskAssessmentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Helper to extract clean neighbourhood name
  const extractNeighbourhood = (evt: EventItem): string => {
    if (!evt.locationText) return "Saskatoon General";
    
    // Saskatoon Police Crime Map format: "LOCATION, NEIGHBOURHOOD, Saskatoon, SK"
    if (evt.sourceKey === "saskatoon_crime_map" || evt.locationText.toLowerCase().includes("saskatoon")) {
      const parts = evt.locationText.split(",");
      if (parts.length >= 3) {
        const nh = parts[1].trim();
        if (nh && nh.toLowerCase() !== "sk" && nh.toLowerCase() !== "canada" && nh.toLowerCase() !== "saskatoon") {
          return nh;
        }
      }
    }

    // Dynamic scan list of Saskatoon standard neighborhoods
    const textToSearch = `${evt.locationText} ${evt.summary} ${evt.title}`.toLowerCase();
    const knownNeighbourhoods = [
      "Pleasant Hill", "Riversdale", "Stonebridge", "Sutherland", "City Park", "Caswell Hill", 
      "Nutana", "Broadway", "Varsity View", "Avalon", "Evergreen", "Rosewood", "Lakeview", 
      "Silverwood Heights", "Lawson Heights", "Westmount", "Meadowgreen", "Mount Royal", 
      "Pacific Heights", "Fairhaven", "Dundonald", "Hampton Village", "Kensington", 
      "Mayfair", "Hudson Bay Park", "North Industrial", "Central Industrial", "Exhibition", 
      "King George", "Buena Vista", "Grosvenor Park", "Brevoort Park", "Holliston", 
      "Adelaide", "Churchill", "Wildwood", "Arbor Creek", "Erindale", "Forest Grove"
    ];

    for (const nh of knownNeighbourhoods) {
      if (textToSearch.includes(nh.toLowerCase())) {
        return nh;
      }
    }

    if (textToSearch.includes("warman")) return "Warman Region";
    if (textToSearch.includes("martensville")) return "Martensville Region";
    if (textToSearch.includes("regina")) return "Regina Region";

    // Grab first segment if it looks like a general town of Saskatchewan
    if (evt.sourceKey === "rcmp_saskatchewan_news") {
      const part = evt.locationText.split(",")[0]?.trim();
      if (part && !part.match(/\b(block|st|ave|intersection|road|rd)\b/i)) {
        return part;
      }
    }

    return "Saskatoon General";
  };

  // Group events by month (last 30 days) and compute metrics
  const neighbourhoodData = useMemo(() => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * ONE_DAY_MS);
    const fifteenDaysAgo = new Date(now.getTime() - 15 * ONE_DAY_MS);

    // Only assess events in the last 30 days
    const recentEvents = events.filter(e => {
      try {
        const d = new Date(e.publishedAt);
        return d >= thirtyDaysAgo;
      } catch {
        return false;
      }
    });

    // Grouping by neighborhood
    const groups: Record<string, EventItem[]> = {};
    recentEvents.forEach(evt => {
      const nhName = extractNeighbourhood(evt);
      if (!groups[nhName]) groups[nhName] = [];
      groups[nhName].push(evt);
    });

    const results: NeighbourhoodRisk[] = [];

    Object.entries(groups).forEach(([name, evts]) => {
      let score = 0;
      let critCount = 0;
      let highCount = 0;
      let medCount = 0;
      let lowCount = 0;

      const categoryCounts: Record<string, number> = {};

      // Trajectory splits (First 15 days vs Second 15 days)
      let firstHalfScore = 0;
      let secondHalfScore = 0;

      evts.forEach(e => {
        // Compute severity weight
        let weight = 1;
        if (e.severity === "critical") {
          weight = 5;
          critCount++;
        } else if (e.severity === "high") {
          weight = 3;
          highCount++;
        } else if (e.severity === "medium") {
          weight = 2;
          medCount++;
        } else {
          weight = 1;
          lowCount++;
        }

        score += weight;

        const date = new Date(e.publishedAt);
        if (date >= fifteenDaysAgo) {
          secondHalfScore += weight;
        } else {
          firstHalfScore += weight;
        }

        // Event type distribution
        const type = e.eventType || "other_public_safety";
        categoryCounts[type] = (categoryCounts[type] || 0) + 1;
      });

      // Find dominant crime category
      let dominantType = "Other Public Safety";
      let dominantTypeCount = 0;
      Object.entries(categoryCounts).forEach(([type, count]) => {
        if (count > dominantTypeCount) {
          dominantTypeCount = count;
          dominantType = type;
        }
      });

      // Determine Trajectory
      let trajectory: "up" | "down" | "stable" = "stable";
      let percentChange = 0;

      if (firstHalfScore > 0) {
        percentChange = Math.round(((secondHalfScore - firstHalfScore) / firstHalfScore) * 100);
        if (percentChange > 10) trajectory = "up";
        else if (percentChange < -10) trajectory = "down";
      } else if (secondHalfScore > 0) {
        percentChange = 100;
        trajectory = "up";
      }

      // Sort recent neighborhood news chronology
      const sortedRecent = [...evts].sort((a, b) => 
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      results.push({
        name,
        score,
        incidentCount: evts.length,
        criticalCount: critCount,
        highCount: highCount,
        mediumCount: medCount,
        lowCount: lowCount,
        trajectory,
        percentChange: Math.abs(percentChange),
        dominantType,
        dominantTypeCount,
        recentEvents: sortedRecent,
        categoryBreakdown: categoryCounts
      });
    });

    // Sort descending by calculated Risk Score
    return results.sort((a, b) => b.score - a.score);
  }, [events]);

  // Filter list based on lookup search bar
  const filteredNeighbourhoods = useMemo(() => {
    if (!searchQuery.trim()) return neighbourhoodData;
    const query = searchQuery.toLowerCase();
    return neighbourhoodData.filter(n => n.name.toLowerCase().includes(query));
  }, [neighbourhoodData, searchQuery]);

  // Retrieve matching details
  const selectedInfo = useMemo(() => {
    if (!selectedNeighbourhood) return null;
    return neighbourhoodData.find(n => n.name === selectedNeighbourhood) || null;
  }, [neighbourhoodData, selectedNeighbourhood]);

  // Get Risk Level configuration
  const getRiskLevel = (score: number) => {
    if (score >= 40) return { label: "Critical Risk Level", color: "text-red-650 bg-red-50 border-red-200", fill: "bg-red-500", text: "red" };
    if (score >= 20) return { label: "High Risk Level", color: "text-orange-700 bg-orange-50 border-orange-200", fill: "bg-orange-500", text: "orange" };
    if (score >= 8) return { label: "Moderate Risk Level", color: "text-yellow-800 bg-yellow-50 border-yellow-250", fill: "bg-yellow-500", text: "yellow" };
    return { label: "Low Risk Level", color: "text-slate-600 bg-slate-50 border-slate-200", fill: "bg-slate-400", text: "slate" };
  };

  // Get Advice based on Dominant Crimes
  const getSafetyRecommendation = (dominant: string) => {
    const formatted = dominant.replace(/_/g, " ").toLowerCase();
    if (formatted.includes("weapons") || formatted.includes("shooting") || formatted.includes("stabbing") || formatted.includes("homicide")) {
      return {
        tip: "Avoid unnecessary nighttime pedestrian traversal. Report unattended packages or suspicous behavior immediately, and remain in well-lit public facilities.",
        badge: "Enhanced Personal Awareness Recommended"
      };
    }
    if (formatted.includes("theft") || formatted.includes("break") || formatted.includes("robbery")) {
      return {
        tip: "Ensure all residential secondary gates, garage slots, and motor vehicle frames are locked securely. Maintain motion-sensor lighting on porches and alleys.",
        badge: "Secure Personal Property & Vehicles"
      };
    }
    if (formatted.includes("fire")) {
      return {
        tip: "Keep outdoor heating systems, waste containers, and flammable materials clear of immediate exterior siding and property borders.",
        badge: "Fire Safety Protocols Check"
      };
    }
    if (formatted.includes("collision") || formatted.includes("traffic")) {
      return {
        tip: "Practice extra defensive crossing and lower vehicle speeds. Be aware of active construction points or hazardous lane junctions in peak hours.",
        badge: "Traffic Caution Advisory"
      };
    }
    return {
      tip: "Monitor neighborhood feeds and register any recurring disruptions to community officers. Establish a neighborhood watch circle with adjacent tenants.",
      badge: "General Vigilance Suggested"
    };
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden font-sans">
      
      {/* Title & Info Banner */}
      <div className="bg-slate-50 border-b border-slate-200 p-2.5 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <ShieldAlert size={14} className="text-blue-600 animate-pulse" />
          <span className="text-xs font-black uppercase text-slate-800 tracking-wide">Neighborhood Risk Assessment</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowInfoModal(!showInfoModal)}
            className="p-1 text-slate-400 hover:text-slate-650 hover:bg-slate-100 rounded cursor-pointer"
            title="What is this assessment?"
          >
            <HelpCircle size={13} />
          </button>
          <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
            30D WEIGHTED INDEX
          </span>
        </div>
      </div>

      {showInfoModal && (
        <motion.div 
          initial={{ opacity: 0, y: -5 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-blue-50/90 border-b border-blue-150 p-3 text-[10.5px] text-blue-850 leading-relaxed font-semibold transition-all"
        >
          <div className="font-bold flex items-center gap-1.5 mb-1 text-blue-900 border-b border-blue-200/50 pb-1">
            <Info size={12} className="text-blue-600" />
            About Saskatoon Risk Index Methodology
          </div>
          <p>
            The risk weight matches historical Saskatoon reports and news over the last 30 days. Scores are calculated by placing relative severity values on reports: <strong>Critical (5 pts)</strong>, <strong>High (3 pts)</strong>, <strong>Medium (2 pts)</strong>, and <strong>Low (1 pt)</strong>. Areas with ongoing safety issues accumulate higher overall numbers.
          </p>
        </motion.div>
      )}

      {/* Main Body Grid */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-slate-50/30">
        
        {/* Search Bar */}
        <div className="p-2 border-b border-slate-150 shrink-0 bg-white shadow-soft">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Saskatoon neighborhoods (e.g. Pleasant Hill, City Park)..."
              className="w-full bg-slate-50 border border-slate-200 rounded px-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
          
          {/* Main overview stats widget */}
          {!selectedNeighbourhood && (
            <div className="grid grid-cols-2 gap-2 select-none shrink-0 mb-1">
              <div className="bg-white border border-slate-200 p-2.5 rounded-lg text-center shadow-soft">
                <span className="block text-[8px] font-mono font-bold uppercase text-slate-400">Total Analyzed Sectors</span>
                <span className="block text-base font-black text-slate-800 font-mono mt-0.5">{neighbourhoodData.length}</span>
                <p className="text-[8px] text-slate-400 font-semibold leading-relaxed mt-0.5">Saskatoon & surrounding divisions</p>
              </div>

              <div className="bg-white border border-slate-200 p-2.5 rounded-lg text-center shadow-soft">
                <span className="block text-[8px] font-mono font-bold uppercase text-slate-400">Primary Risk Driver</span>
                <span className="block text-xs font-black text-red-500 uppercase tracking-tight mt-1 truncate">
                  {neighbourhoodData[0]?.dominantType?.replace(/_/g, " ") || "property_display"}
                </span>
                <p className="text-[8px] text-slate-400 font-semibold leading-relaxed mt-0.5">At top safety junction</p>
              </div>
            </div>
          )}

          {/* Neighborhood Accordions List */}
          <div className="space-y-2">
            
            {filteredNeighbourhoods.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 font-semibold select-none bg-white rounded-lg border border-slate-150 p-4">
                <ShieldCheck size={20} className="mx-auto text-slate-300 mb-1.5" />
                No neighborhood records matching "{searchQuery}"
              </div>
            ) : (
              filteredNeighbourhoods.map((nh) => {
                const isExpanded = selectedNeighbourhood === nh.name;
                const rLevel = getRiskLevel(nh.score);
                const advice = getSafetyRecommendation(nh.dominantType);

                return (
                  <div 
                    key={nh.name}
                    className={`border rounded-lg overflow-hidden transition-all duration-200 ${
                      isExpanded 
                        ? "border-blue-400 bg-white shadow-md ring-1 ring-blue-400/10" 
                        : "border-slate-200 bg-white hover:border-slate-350 shadow-sm"
                    }`}
                  >
                    {/* Header bar of item */}
                    <div 
                      onClick={() => {
                        setSelectedNeighbourhood(isExpanded ? null : nh.name);
                        // Also trigger map centering on first event
                        if (nh.recentEvents.length > 0) {
                          onSelectNeighbourhood(nh.name, nh.recentEvents[0]);
                        }
                      }}
                      className="p-3 flex items-center justify-between gap-2.5 cursor-pointer select-none"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MapPin size={11} className={isExpanded ? "text-blue-500" : "text-slate-400"} />
                          <h4 className="font-black text-slate-800 text-[11px] truncate tracking-tight">{nh.name}</h4>
                          <span className={`text-[8.5px] px-1 py-0.5 rounded font-black uppercase tracking-wide border leading-none shrink-0 ${rLevel.color}`}>
                            {rLevel.label.split(" ")[0]}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 text-[10px] text-slate-450 font-mono">
                          <span>Reports: <strong className="font-bold text-slate-700">{nh.incidentCount}</strong></span>
                          <span>•</span>
                          <span>Dominant: <strong className="font-bold text-slate-600 capitalize">{nh.dominantType.replace(/_/g, " ")}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right shrink-0 select-none">
                          <span className="block text-[8px] font-mono font-bold text-slate-400 uppercase">30D Index</span>
                          <span className="block text-sm font-black text-slate-800 font-mono mt-0.5">{nh.score}</span>
                        </div>

                        <div className="shrink-0 text-slate-400 transition-transform">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="border-t border-slate-100 bg-slate-50/40 p-3 space-y-3 text-slate-800"
                        >
                          {/* Risk gauge or breakdown numbers */}
                          <div className="grid grid-cols-2 gap-2 select-none leading-relaxed">
                            <div className="bg-white p-2 rounded-lg border border-slate-150 shadow-soft">
                              <span className="block text-[8.5px] font-mono font-bold uppercase text-slate-400 mb-1">Risk Trajectory</span>
                              <div className="flex items-center gap-1">
                                {nh.trajectory === "up" ? (
                                  <>
                                    <div className="p-1 rounded bg-red-100 text-red-650">
                                      <TrendingUp size={12} />
                                    </div>
                                    <span className="text-[10.5px] font-bold text-red-600">Rising (+{nh.percentChange}%)</span>
                                  </>
                                ) : nh.trajectory === "down" ? (
                                  <>
                                    <div className="p-1 rounded bg-emerald-100 text-emerald-650">
                                      <TrendingDown size={12} />
                                    </div>
                                    <span className="text-[10.5px] font-bold text-emerald-600">Improving (-{nh.percentChange}%)</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="p-1 rounded bg-slate-100 text-slate-450">
                                      <CheckCircle2 size={12} />
                                    </div>
                                    <span className="text-[10.5px] font-bold text-slate-500">Stable Activity</span>
                                  </>
                                )}
                              </div>
                              <p className="text-[8px] text-slate-400 font-semibold leading-relaxed mt-1">Comparing past fortnight periods</p>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-slate-150 shadow-soft">
                              <span className="block text-[8.5px] font-mono font-bold uppercase text-slate-400 mb-1">Severity Levels</span>
                              <div className="flex gap-1 h-2 rounded overflow-hidden mt-1.5">
                                <div style={{ width: `${(nh.criticalCount / nh.incidentCount) * 100}%` }} className="bg-red-500 shrink-0" title="Critical"></div>
                                <div style={{ width: `${(nh.highCount / nh.incidentCount) * 100}%` }} className="bg-orange-500 shrink-0" title="High"></div>
                                <div style={{ width: `${(nh.mediumCount / nh.incidentCount) * 100}%` }} className="bg-yellow-400 shrink-0" title="Medium"></div>
                                <div style={{ width: `${(nh.lowCount / nh.incidentCount) * 100}%` }} className="bg-slate-300 shrink-0" title="Low"></div>
                              </div>
                              <div className="flex justify-between text-[8px] font-mono font-bold text-slate-400 mt-1 uppercase">
                                <span className="text-red-500">Crit: {nh.criticalCount}</span>
                                <span className="text-orange-500">High: {nh.highCount}</span>
                              </div>
                            </div>
                          </div>

                          {/* Horizontal category bars */}
                          <div className="space-y-1.5 select-none leading-relaxed">
                            <span className="block text-[8.5px] font-mono font-semibold uppercase text-slate-400">Incident Category Breakdown</span>
                            <div className="bg-white border border-slate-150 p-2 rounded-lg space-y-1.5 shadow-soft">
                              {Object.entries(nh.categoryBreakdown).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cat, val]) => (
                                <div key={cat} className="space-y-0.5">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-600">
                                    <span className="capitalize">{cat.replace(/_/g, " ")}</span>
                                    <span className="font-mono">{(val as number)} ({Math.round(((val as number) / nh.incidentCount) * 100)}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div style={{ width: `${((val as number) / nh.incidentCount) * 100}%` }} className={`h-full ${rLevel.fill} opacity-85`}></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Advisory dynamic warning */}
                          <div className="p-2.5 bg-blue-50/75 border border-blue-150 rounded-lg text-[10.5px] leading-relaxed">
                            <div className="font-bold text-blue-900 border-b border-blue-200/50 pb-1 mb-1 font-sans flex items-center gap-1 text-[10px] uppercase tracking-wider">
                              <Award size={11} className="text-blue-600" />
                              Advisory: {advice.badge}
                            </div>
                            <p className="text-slate-600 font-semibold">{advice.tip}</p>
                          </div>

                          {/* Coupled interactive Map Trigger */}
                          <button
                            type="button"
                            onClick={() => {
                              onSelectNeighbourhood(nh.name, nh.recentEvents[0]);
                            }}
                            className="w-full cursor-pointer bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-[10px] py-1.5 px-3 rounded shadow-sm transition-all flex items-center justify-center gap-1.5 uppercase tracking-wide"
                          >
                            <Map size={11} className="shrink-0" />
                            <span>Locate neighborhood alerts on map</span>
                          </button>

                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
