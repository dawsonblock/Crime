import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, BarChart3, Search, TrendingUp, AlertTriangle, ArrowUpDown, ChevronRight, 
  MapPin, Info, Shield, Percent, ShieldAlert
} from "lucide-react";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from "recharts";
import { EventItem, SeverityType } from "../types";

interface RegionalMetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: EventItem[];
  onSelectNeighbourhood: (name: string) => void;
}

interface NeighbourhoodStat {
  name: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  score: number; // Weighted severity score
  dominantType: string;
  typeCounts: Record<string, number>;
}

// Saskatoon neighborhoods list
const KNOWN_NEIGHBOURHOODS = [
  "Pleasant Hill", "Riversdale", "Stonebridge", "Sutherland", "City Park", "Caswell Hill", 
  "Nutana", "Broadway", "Varsity View", "Avalon", "Evergreen", "Rosewood", "Lakeview", 
  "Silverwood Heights", "Lawson Heights", "Westmount", "Meadowgreen", "Mount Royal", 
  "Pacific Heights", "Fairhaven", "Dundonald", "Hampton Village", "Kensington", 
  "Mayfair", "Hudson Bay Park", "North Industrial", "Central Industrial", "Exhibition", 
  "King George", "Buena Vista", "Grosvenor Park", "Brevoort Park", "Holliston", 
  "Adelaide", "Churchill", "Wildwood", "Arbor Creek", "Erindale", "Forest Grove"
];

export default function RegionalMetricsModal({ 
  isOpen, 
  onClose, 
  events, 
  onSelectNeighbourhood 
}: RegionalMetricsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"total" | "score" | "name">("total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedBarName, setSelectedBarName] = useState<string | null>(null);

  // Helper code to extract neighborhood name matching RiskAssessment standard
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

    for (const nh of KNOWN_NEIGHBOURHOODS) {
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

  // Compile stats for all neighborhoods based on given events
  const statsList = useMemo(() => {
    const dataMap: Record<string, NeighbourhoodStat> = {};

    events.forEach(evt => {
      const nh = extractNeighbourhood(evt);
      if (!dataMap[nh]) {
        dataMap[nh] = {
          name: nh,
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          score: 0,
          dominantType: "N/A",
          typeCounts: {}
        };
      }

      const stat = dataMap[nh];
      stat.total += 1;

      // Severity weights
      let weight = 1;
      if (evt.severity === "critical") {
        stat.critical += 1;
        weight = 5;
      } else if (evt.severity === "high") {
        stat.high += 1;
        weight = 3;
      } else if (evt.severity === "medium") {
        stat.medium += 1;
        weight = 2;
      } else {
        stat.low += 1;
        weight = 1;
      }
      stat.score += weight;

      // Event type tracking
      const eType = evt.eventType || "unknown";
      stat.typeCounts[eType] = (stat.typeCounts[eType] || 0) + 1;
    });

    // Finalize dominant types
    return Object.values(dataMap).map(stat => {
      let maxCount = -1;
      let dominant = "General Alert";
      Object.entries(stat.typeCounts).forEach(([type, count]) => {
        if (count > maxCount) {
          maxCount = count;
          dominant = type;
        }
      });
      return {
        ...stat,
        dominantType: dominant.replace(/_/g, " ")
      };
    });
  }, [events]);

  // Compute aggregate stats for the header badge elements
  const overviewStats = useMemo(() => {
    let maxScore = -1;
    let highestRiskNeighbourhood = "N/A";
    let highestRiskScore = 0;

    let maxTotal = -1;
    let highestFrequencyNeighbourhood = "N/A";

    const totalTrackedEvents = events.length;
    const distinctNeighbourhoods = statsList.length;

    statsList.forEach(stat => {
      if (stat.score > maxScore) {
        maxScore = stat.score;
        highestRiskNeighbourhood = stat.name;
        highestRiskScore = stat.score;
      }
      if (stat.total > maxTotal) {
        maxTotal = stat.total;
        highestFrequencyNeighbourhood = stat.name;
      }
    });

    // Find overall dominant incident type
    const globalTypeCounts: Record<string, number> = {};
    events.forEach(e => {
      const type = e.eventType || "unknown";
      globalTypeCounts[type] = (globalTypeCounts[type] || 0) + 1;
    });
    let maxGlobalCount = -1;
    let globalDominantType = "N/A";
    Object.entries(globalTypeCounts).forEach(([type, count]) => {
      if (count > maxGlobalCount) {
        maxGlobalCount = count;
        globalDominantType = type.replace(/_/g, " ");
      }
    });

    return {
      distinctNeighbourhoods,
      totalTrackedEvents,
      highestRiskNeighbourhood,
      highestRiskScore,
      highestFrequencyNeighbourhood,
      maxTotal,
      globalDominantType
    };
  }, [statsList, events]);

  // Handle Filtering & Sorting
  const processedStats = useMemo(() => {
    let list = statsList.slice();

    // Text search query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(stat => stat.name.toLowerCase().includes(query));
    }

    // Sort order
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === "name") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
    });

    return list;
  }, [statsList, searchQuery, sortField, sortOrder]);

  const handleToggleSort = (field: "total" | "score" | "name") => {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc"); // Default to desc for numerical scores, asc for names checks later
      if (field === "name") setSortOrder("asc");
    }
  };

  const handleSelectArea = (name: string) => {
    onSelectNeighbourhood(name);
    onClose();
  };

  // Recharts custom interactive tooltip
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-750 p-3 rounded-lg shadow-xl text-white font-mono text-[10.5px] select-none max-w-[210px] space-y-1.5 leading-normal">
          <p className="font-sans font-black text-xs border-b border-slate-700 pb-1 uppercase tracking-tight text-blue-400">
            {data.name}
          </p>
          <div className="space-y-0.5 pt-0.5">
            <p className="flex justify-between font-bold">
              <span>Total Alerts:</span> 
              <span className="text-white font-extrabold">{data.total}</span>
            </p>
            <p className="flex justify-between text-red-400">
              <span>Critical (5x):</span> 
              <span>{data.critical}</span>
            </p>
            <p className="flex justify-between text-orange-400">
              <span>High (3x):</span> 
              <span>{data.high}</span>
            </p>
            <p className="flex justify-between text-yellow-400">
              <span>Medium (2x):</span> 
              <span>{data.medium}</span>
            </p>
            <p className="flex justify-between text-slate-400">
              <span>Low (1x):</span> 
              <span>{data.low}</span>
            </p>
          </div>
          <div className="border-t border-slate-850/60 pt-1 mt-1 text-[9px] flex justify-between tracking-wide font-black uppercase">
            <span className="text-slate-400">Hazard Weight:</span>
            <span className="text-violet-400">{data.score}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Take top 10 neighbourhoods for a cleaner bar chart visual representation
  const topChartData = useMemo(() => {
    return statsList
      .slice()
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [statsList]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        id="regional-metrics-modal-wrapper" 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-hidden"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          id="regional-metrics-modal-content"
          className="bg-white border border-slate-205 w-full max-w-5xl h-[88vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden font-sans select-none"
        >
          {/* Modal Header */}
          <div className="p-4 bg-slate-900 border-b border-slate-750 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-600 rounded text-white shadow-inner">
                <BarChart3 size={16} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-1.5">
                  Saskatoon Regional Safety Analysis
                  <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-blue-400 font-mono tracking-widest font-black uppercase">
                    STATS CORE
                  </span>
                </h3>
                <p className="text-[10.5px] text-slate-300">
                  Statistical metrics representing alert density and hazard trajectory inside city sectors.
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              id="close-metrics-modal-btn"
              aria-label="Close Metrics Panel"
              className="p-1.5 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Quick Metrics Bento Header Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-150 bg-slate-50 p-3.5 gap-3 shrink-0">
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-sm">
              <span className="block text-[8px] font-mono font-black uppercase text-slate-400 tracking-wider">Sectors Assessed</span>
              <span className="block text-lg font-black text-slate-800 mt-0.5 font-mono">
                {overviewStats.distinctNeighbourhoods}
              </span>
              <span className="block text-[8.5px] text-slate-405 font-medium mt-0.5">Saskatoon & Areas</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-sm">
              <span className="block text-[8px] font-mono font-black uppercase text-slate-400 tracking-wider">Most Alert Activity</span>
              <span className="block text-sm font-extrabold text-sky-600 mt-1 truncate">
                {overviewStats.highestFrequencyNeighbourhood}
              </span>
              <span className="block text-[8.5px] text-slate-405 font-mono mt-0.5 font-semibold">
                {overviewStats.maxTotal} cumulative alerts
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-sm">
              <span className="block text-[8px] font-mono font-black uppercase text-red-500 tracking-wider flex items-center justify-center gap-1">
                <ShieldAlert size={10} className="animate-pulse" />
                Highest Risk rating
              </span>
              <span className="block text-sm font-extrabold text-red-650 mt-1 truncate">
                {overviewStats.highestRiskNeighbourhood}
              </span>
              <span className="block text-[8.5px] text-slate-405 font-mono mt-0.5 font-semibold">
                Score: {overviewStats.highestRiskScore} points
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-sm">
              <span className="block text-[8px] font-mono font-black uppercase text-slate-400 tracking-wider">Dominant Incident</span>
              <span className="block text-sm font-extrabold text-violet-600 mt-1 truncate uppercase tracking-tight text-[11px]">
                {overviewStats.globalDominantType}
              </span>
              <span className="block text-[8.5px] text-slate-405 font-medium mt-0.5">Across entire feed</span>
            </div>
          </div>

          {/* Modal Split Columns */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Left Content Column: Graphic Bar Chart Stage */}
            <div className="flex-1 p-5 flex flex-col overflow-y-auto space-y-4 border-b md:border-b-0 md:border-r border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 select-none shrink-0">
                <span className="text-[10px] uppercase font-mono font-extrabold tracking-wider text-slate-500 flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-emerald-500" /> 
                  Top 10 High-Frequency Areas (Stacked Alerts)
                </span>
                <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">
                  Ranked by total incidents
                </span>
              </div>

              {topChartData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-xs text-slate-405 select-none bg-slate-50 rounded-xl border border-slate-150">
                  <AlertTriangle size={24} className="text-slate-300 mb-1" />
                  <p className="font-semibold text-slate-600">No regional data compiled</p>
                  <p className="text-[10px] text-slate-405 mt-0.5">Add safety feeds or ingest bulletins to sync charts.</p>
                </div>
              ) : (
                <div className="flex-1 min-h-[290px] w-full text-[10.5px] font-mono py-2 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topChartData}
                      margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
                      onClick={(data) => {
                        if (data && data.activeLabel) {
                          setSelectedBarName(String(data.activeLabel));
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={true} vertical={false} />
                      <XAxis type="number" stroke="#64748B" axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        stroke="#475569" 
                        width={110} 
                        axisLine={{ stroke: "#E2E8F0" }} 
                        tickLine={false} 
                        style={{ fontFamily: "sans-serif", fontSize: "10.5px", fontWeight: "600" }}
                      />
                      <Tooltip content={<CustomBarTooltip />} />
                      <Legend 
                        iconType="circle"
                        iconSize={5}
                        wrapperStyle={{ fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase", paddingTop: "8px" }}
                      />
                      {/* Stacked values matched to severity levels */}
                      <Bar dataKey="low" name="Minor (Low)" stackId="a" fill="#94A3B8" />
                      <Bar dataKey="medium" name="Moderate (Med)" stackId="a" fill="#FACC15" />
                      <Bar dataKey="high" name="Severe (High)" stackId="a" fill="#F97316" />
                      <Bar dataKey="critical" name="Critical" stackId="a" fill="#EF4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Informational Disclaimer box */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 select-none flex items-start gap-2 text-[10.5px] shrink-0 mt-auto leading-normal">
                <Info size={13} className="text-sky-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-slate-800">Chart Interactivity Guide</p>
                  <p className="text-[9.5px] text-slate-500 mt-0.5">
                    Hover on bars to audit specific incident categories. Click on any bar to isolate its statistical parameters in the searchable list. Click the focus pin icon next to any neighborhood to filter the main map.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Content Column: Search & Filterable Ledger List */}
            <div className="w-full md:w-[350px] bg-slate-50/55 p-4 flex flex-col overflow-hidden h-full">
              
              {/* Filter controls ledger header */}
              <div className="space-y-3 shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search neighbourhoods..."
                    id="stats-search-input"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedBarName(null); // Reset highlight on manual search
                    }}
                    className="w-full pl-9 pr-8 py-2 border border-slate-205 rounded-xl text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-medium text-slate-800"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Ledger Sort Toggle selectors */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono font-bold select-none border-b border-slate-200/60 pb-2">
                  <span className="uppercase text-[9.5px] font-black text-slate-500">
                    Saskatoon Sectors
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleSort("name")}
                      className={`py-0.5 px-1.5 rounded cursor-pointer transition-all flex items-center gap-0.5 ${
                        sortField === "name" ? "bg-slate-200 text-slate-800 font-extrabold" : "hover:text-slate-600"
                      }`}
                    >
                      Alpha
                      <ArrowUpDown size={9} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSort("total")}
                      className={`py-0.5 px-1.5 rounded cursor-pointer transition-all flex items-center gap-0.5 ${
                        sortField === "total" ? "bg-slate-200 text-slate-800 font-extrabold" : "hover:text-slate-600"
                      }`}
                    >
                      Count
                      <ArrowUpDown size={9} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSort("score")}
                      className={`py-0.5 px-1.5 rounded cursor-pointer transition-all flex items-center gap-0.5 ${
                        sortField === "score" ? "bg-slate-200 text-slate-800 font-extrabold" : "hover:text-slate-600"
                      }`}
                    >
                      Risk
                      <ArrowUpDown size={9} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable list sector of all compiled stats */}
              <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1 scrollbar-thin scrollbar-thumb-slate-205">
                {processedStats.length === 0 ? (
                  <div className="py-20 text-center select-none font-sans text-slate-400 font-bold text-xs space-y-1">
                    <AlertTriangle size={18} className="mx-auto text-slate-350" />
                    <p>No matches found</p>
                    <p className="text-[10px] font-normal font-mono text-slate-400">Try adjusting your query term.</p>
                  </div>
                ) : (
                  processedStats.map((stat) => {
                    const isIsolated = selectedBarName === stat.name;
                    
                    return (
                      <div
                        key={stat.name}
                        onClick={() => setSelectedBarName(selectedBarName === stat.name ? null : stat.name)}
                        className={`p-3 rounded-xl border transition-all text-xs flex flex-col space-y-2.5 cursor-pointer relative bg-white ${
                          isIsolated 
                            ? "border-blue-500 ring-2 ring-blue-50/70 shadow-md" 
                            : "border-slate-200 hover:border-slate-300 shadow-sm"
                        }`}
                      >
                        {/* Title Row with map filter focus link trigger */}
                        <div className="flex justify-between items-start gap-1">
                          <div className="overflow-hidden">
                            <span className="font-extrabold text-slate-800 hover:text-blue-600 tracking-tight block truncate uppercase text-[11px]">
                              {stat.name}
                            </span>
                            <span className="text-[9.5px] font-medium text-slate-400 flex items-center gap-1 leading-none mt-0.5">
                              <span className="font-bold text-slate-500">Dominant:</span> {stat.dominantType}
                            </span>
                          </div>

                          <button
                            type="button"
                            title={`Filter main list to show only ${stat.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectArea(stat.name);
                            }}
                            className="p-1 px-1.5 bg-slate-50 hover:bg-blue-650 hover:text-white border border-slate-200 hover:border-blue-600 rounded text-slate-500 transition-all flex items-center gap-0.5 cursor-pointer text-[9px] font-bold font-mono uppercase tracking-wider shrink-0"
                          >
                            <MapPin size={9} />
                            PIN
                          </button>
                        </div>

                        {/* Counts grid elements metrics */}
                        <div className="grid grid-cols-5 text-center font-mono text-[10px] gap-1 select-none pt-0.5 border-t border-slate-100">
                          <div className="bg-slate-50 rounded py-0.5 border border-slate-100">
                            <span className="block text-[7.5px] text-slate-400 font-extrabold">ALL</span>
                            <span className="font-extrabold text-slate-700">{stat.total}</span>
                          </div>
                          <div className={`rounded py-0.5 border ${stat.critical > 0 ? "bg-red-50/50 border-red-100 text-red-600" : "bg-slate-50 border-slate-100 text-slate-400"}`}>
                            <span className="block text-[7.5px] font-extrabold uppercase">CRT</span>
                            <span className="font-extrabold">{stat.critical}</span>
                          </div>
                          <div className={`rounded py-0.5 border ${stat.high > 0 ? "bg-orange-50/50 border-orange-100 text-orange-600" : "bg-slate-50 border-slate-100 text-slate-400"}`}>
                            <span className="block text-[7.5px] font-extrabold uppercase">HI</span>
                            <span className="font-extrabold">{stat.high}</span>
                          </div>
                          <div className={`rounded py-0.5 border ${stat.medium > 0 ? "bg-yellow-50/50 border-yellow-100 text-yellow-600" : "bg-slate-50 border-slate-100 text-slate-400"}`}>
                            <span className="block text-[7.5px] font-extrabold uppercase">MED</span>
                            <span className="font-extrabold">{stat.medium}</span>
                          </div>
                          <div className="bg-slate-50 rounded py-0.5 border border-slate-100 text-slate-440">
                            <span className="block text-[7.5px] font-black uppercase">LOW</span>
                            <span className="font-bold">{stat.low}</span>
                          </div>
                        </div>

                        {/* Hazard core score banner value */}
                        <div className="flex items-center justify-between text-[10px] font-mono select-none pt-1">
                          <span className="text-slate-405 font-bold uppercase tracking-wider text-[8.5px]">Hazard Rating:</span>
                          <span className={`px-1.5 py-0.5 font-black rounded text-[9.5px] ${
                            stat.score >= 15 
                              ? "bg-red-100 text-red-700 border border-red-200" 
                              : stat.score >= 8 
                              ? "bg-orange-100 text-orange-700 border border-orange-200"
                              : "bg-blue-50 text-blue-700 border border-blue-150"
                          }`}>
                            {stat.score} points
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* Modal Footer block */}
          <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-right shrink-0 flex items-center justify-between select-none">
            <span className="text-[10px] text-slate-405 font-mono leading-none tracking-wide">
              UTC Sync Active: {new Date().toISOString().substring(0, 16).replace("T", " ")}
            </span>
            <button
              onClick={onClose}
              className="py-1.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg cursor-pointer transition-colors"
            >
              Close Panel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
