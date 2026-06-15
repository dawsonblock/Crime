import React from "react";
import { motion } from "motion/react";
import { X, ExternalLink, Bookmark, Navigation, AlertTriangle, ShieldCheck, Calendar, MapPin, Sparkles, Camera, Eye, Radio, Compass, Shield, Activity, Clock, ChevronLeft, ChevronRight, Maximize2, Minus, Share2, Twitter, Facebook, Copy, Check, Send, Printer, FileSpreadsheet, TrendingUp, TrendingDown } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip as RechartsTooltip, XAxis } from "recharts";
import { EventItem } from "../types";
import SourceBadge from "./SourceBadge";

interface TimelineUpdate {
  status: string;
  timestamp: string;
  description: string;
  iconType: "info" | "warning" | "success" | "neutral" | "danger";
}

interface EventDrawerProps {
  selectedEvent: EventItem | null;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (eventId: string) => void;
  bookmarkNote: string;
  onUpdateBookmarkNote: (eventId: string, noteText: string) => void;
  sizes?: any;
  toggleSizing?: (component: string, targetSize: "normal" | "enlarge" | "minimize") => void;
  allEvents?: EventItem[];
  userLat?: number | null;
  userLng?: number | null;
}

export default function EventDrawer({
  selectedEvent,
  onClose,
  isBookmarked,
  onToggleBookmark,
  bookmarkNote,
  onUpdateBookmarkNote,
  sizes,
  toggleSizing,
  allEvents = [],
  userLat = null,
  userLng = null,
}: EventDrawerProps) {
  if (!selectedEvent) return null;

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedEvent?.id]);

  // Local state for smooth notes typing
  const [localNote, setLocalNote] = React.useState("");

  // Right side adjustable sliders for local element size customization
  const [textScale, setTextScale] = React.useState<number>(1.0);
  const [paddingScale, setPaddingScale] = React.useState<number>(1.0);
  const [scanDuration, setScanDuration] = React.useState<number>(4);

  // Tactical vicinity view states
  const [showStreetViewModal, setShowStreetViewModal] = React.useState<boolean>(false);
  const [viewMode, setViewMode] = React.useState<"tactical" | "thermal" | "sonar">("tactical");
  const [viewAngle, setViewAngle] = React.useState<number>(-20);
  const [zoomLevel, setZoomLevel] = React.useState<number>(1.0);
  const [isScanning, setIsScanning] = React.useState<boolean>(true);

  // Image carousel and Lightbox/Theater state
  const [currentImgIndex, setCurrentImgIndex] = React.useState<number>(0);
  const [showLightbox, setShowLightbox] = React.useState<boolean>(false);

  // Share menu expanding and copying states
  const [showShareOptions, setShowShareOptions] = React.useState<boolean>(false);
  const [copiedText, setCopiedText] = React.useState<boolean>(false);
  const [exportedCsv, setExportedCsv] = React.useState<boolean>(false);

  // 7-day category trend data calculation
  const trendData = React.useMemo(() => {
    if (!selectedEvent) return [];
    const eventsList = allEvents || [];
    const category = selectedEvent.eventType || "unknown";
    
    // Find the anchor (use the latest event of this type, or today, or selected event)
    let anchor = new Date(selectedEvent.publishedAt);
    const eventsOfCategory = eventsList.filter(e => e.eventType === category);
    eventsOfCategory.forEach(e => {
      const d = new Date(e.publishedAt);
      if (d > anchor) {
        anchor = d;
      }
    });

    // Calculate the last 7 days ending at anchor
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const dateObj = anchor.getDate();
    const anchorMidnight = new Date(year, month, dateObj);

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(anchorMidnight);
      day.setDate(anchorMidnight.getDate() - i);
      const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const label = day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const weekday = day.toLocaleDateString("en-US", { weekday: "short" });
      
      days.push({
        dateKey,
        label,
        weekday,
        count: 0,
        timestamp: day.getTime()
      });
    }

    // Populate counts
    eventsOfCategory.forEach(evt => {
      const evtDate = new Date(evt.publishedAt);
      const evtY = evtDate.getFullYear();
      const evtM = evtDate.getMonth() + 1;
      const evtD = evtDate.getDate();
      const evtKey = `${evtY}-${String(evtM).padStart(2, "0")}-${String(evtD).padStart(2, "0")}`;
      
      const matched = days.find(d => d.dateKey === evtKey);
      if (matched) {
        matched.count++;
      }
    });

    return days;
  }, [allEvents, selectedEvent?.eventType, selectedEvent?.publishedAt]);

  const neighborhoodTrendData = React.useMemo(() => {
    if (!selectedEvent) return [];
    
    // Helper: Distance in meters (copy)
    const getDist = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const severityMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const eventsList = allEvents || [];
    const radius = 2000; // 2km
    
    const anchor = new Date(selectedEvent.publishedAt);
    const anchorMidnight = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(anchorMidnight);
      day.setDate(anchorMidnight.getDate() - i);
      const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      days.push({ dateKey, label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }), avgSeverity: 0, count: 0 });
    }

    eventsList.forEach(evt => {
      const dist = getDist(selectedEvent.latitude, selectedEvent.longitude, evt.latitude, evt.longitude);
      if (dist <= radius) {
        const evtDate = new Date(evt.publishedAt);
        const evtKey = `${evtDate.getFullYear()}-${String(evtDate.getMonth() + 1).padStart(2, "0")}-${String(evtDate.getDate()).padStart(2, "0")}`;
        const matched = days.find(d => d.dateKey === evtKey);
        if (matched) {
          matched.count++;
          matched.avgSeverity += severityMap[evt.severity] || 0;
        }
      }
    });

    days.forEach(d => {
      if (d.count > 0) d.avgSeverity = Math.round(d.avgSeverity / d.count);
    });

    return days;
  }, [allEvents, selectedEvent?.latitude, selectedEvent?.longitude, selectedEvent?.publishedAt]);

  const totalInCategoryLastWeek = React.useMemo(() => {
    return trendData.reduce((sum, d) => sum + d.count, 0);
  }, [trendData]);

  const trendDirection = React.useMemo(() => {
    if (trendData.length < 2) return "neutral";
    const midPoint = Math.floor(trendData.length / 2); // 3 days
    const firstHalfSum = trendData.slice(0, midPoint).reduce((sum, d) => sum + d.count, 0);
    const secondHalfSum = trendData.slice(midPoint + 1).reduce((sum, d) => sum + d.count, 0);
    if (secondHalfSum > firstHalfSum) return "up";
    if (secondHalfSum < firstHalfSum) return "down";
    return "flat";
  }, [trendData]);

  const handleExportCSV = () => {
    if (!selectedEvent) return;

    const headers = [
      "Incident ID",
      "Title",
      "Severity Level",
      "Incident Type",
      "Published Timestamp",
      "Approximate Location",
      "Latitude",
      "Longitude",
      "Summary Details",
      "Source Publisher",
      "Original Source URL"
    ];

    const escapeCSVField = (val: any) => {
      if (val === null || val === undefined) return "";
      const s = String(val).replace(/\r?\n|\r/g, " "); // flatten line breaks in CSV for cell consistency
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const row = [
      selectedEvent.id,
      selectedEvent.title,
      selectedEvent.severity,
      selectedEvent.eventType || "unknown",
      selectedEvent.publishedAt,
      selectedEvent.locationText || "Saskatoon, SK",
      selectedEvent.latitude,
      selectedEvent.longitude,
      selectedEvent.summary || "",
      selectedEvent.sourceName,
      selectedEvent.originalUrl || ""
    ];

    const csvContent = [
      headers.map(escapeCSVField).join(","),
      row.map(escapeCSVField).join(",")
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    const sanitizedTitle = selectedEvent.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .substring(0, 40);
    const dateFormatted = new Date().toISOString().split("T")[0];
    
    link.download = `incident_${sanitizedTitle || "details"}_${dateFormatted}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportedCsv(true);
    setTimeout(() => setExportedCsv(false), 2000);
  };

  const handlePrintReport = () => {
    document.body.classList.add("printing-incident-report");
    
    const cleanUp = () => {
      document.body.classList.remove("printing-incident-report");
      window.removeEventListener("afterprint", cleanUp);
    };
    
    window.addEventListener("afterprint", cleanUp);
    window.print();
  };

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

  const renderGroundPlane = () => {
    return (
      <div 
        className="absolute inset-0 flex items-center justify-center transition-all duration-300 pointer-events-none"
        style={{
          transform: `perspective(600px) rotateX(55deg) rotateZ(${viewAngle}deg) scale(${zoomLevel})`,
        }}
      >
        {/* Grid container */}
        <div className={`relative w-[450px] h-[450px] rounded-lg transition-all border-2 ${
          viewMode === "thermal" 
            ? "bg-purple-950/40 border-pink-500/60" 
            : viewMode === "sonar"
            ? "bg-emerald-950/30 border-emerald-500/60"
            : "bg-slate-900 border-indigo-500/50"
        }`}>
          {/* Fine grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
          
          {/* Intersection Roads */}
          <div className={`absolute top-0 bottom-0 left-[200px] w-12 border-l border-r ${
            viewMode === "thermal" 
              ? "bg-pink-900/30 border-pink-500/40" 
              : viewMode === "sonar"
              ? "bg-emerald-900/30 border-emerald-500/40"
              : "bg-slate-800/80 border-indigo-500/30"
          } flex flex-col justify-between items-center`}>
            <div className="h-full border-l border-dashed border-slate-500/50 w-0 left-1/2 absolute" />
          </div>
          
          <div className={`absolute left-0 right-0 top-[200px] h-12 border-t border-b ${
            viewMode === "thermal" 
              ? "bg-pink-900/30 border-pink-500/40" 
              : viewMode === "sonar"
              ? "bg-emerald-900/30 border-emerald-500/40"
              : "bg-slate-800/80 border-indigo-500/30"
          } flex items-center justify-between`}>
            <div className="w-full border-t border-dashed border-slate-500/50 h-0 top-1/2 absolute" />
          </div>

          {(selectedEvent.displayLatitude ?? selectedEvent.latitude) % 2 !== 0 && (
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-full border-l-4 border-b-4 ${
              viewMode === "thermal"
                ? "bg-red-950/20 border-red-500/40"
                : viewMode === "sonar"
                ? "bg-teal-950/20 border-teal-500/40"
                : "bg-blue-950/30 border-blue-500/40"
            }`}>
              <span className="absolute bottom-5 right-5 font-mono text-[9px] text-blue-400 font-extrabold rotate-[-45deg]">
                South Sask River
              </span>
            </div>
          )}

          {/* Buildings */}
          <div className={`absolute top-[40px] left-[40px] w-24 h-24 border rounded ${
            viewMode === "thermal"
              ? "bg-purple-900/40 border-pink-500/50"
              : viewMode === "sonar"
              ? "bg-emerald-900/40 border-emerald-500/50"
              : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
          } transition-all p-2 font-mono text-[8px] text-slate-500`}>
            <div className="font-bold text-slate-400">SECTOR A</div>
            <div>Bldg A-12</div>
            <div className="mt-2 text-blue-500">Residential</div>
          </div>

          <div className={`absolute top-[40px] right-[40px] w-24 h-24 border rounded ${
            viewMode === "thermal"
              ? "bg-purple-900/40 border-pink-500/50"
              : viewMode === "sonar"
              ? "bg-emerald-900/40 border-emerald-500/50"
              : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
          } transition-all p-2 font-mono text-[8px] text-slate-500`}>
            <div className="font-bold text-slate-400">SECTOR B</div>
            <div>Bldg B-4</div>
            <div className="mt-2 text-blue-500">Commercial</div>
          </div>

          <div className={`absolute bottom-[40px] left-[40px] w-24 h-24 border rounded ${
            viewMode === "thermal"
              ? "bg-purple-900/40 border-pink-500/50"
              : viewMode === "sonar"
              ? "bg-emerald-900/40 border-emerald-500/50"
              : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
          } transition-all p-2 font-mono text-[8px] text-slate-500`}>
            <div className="font-bold text-slate-400">SECTOR C</div>
            <div>Civic Hub</div>
            <div className="mt-2 text-blue-500">Active Municipal</div>
          </div>

          <div className={`absolute bottom-[40px] right-[40px] w-24 h-24 border rounded ${
            viewMode === "thermal"
              ? "bg-purple-900/40 border-pink-500/50"
              : viewMode === "sonar"
              ? "bg-emerald-900/40 border-emerald-500/50"
              : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
          } transition-all p-2 font-mono text-[8px] text-slate-500`}>
            <div className="font-bold text-slate-400">SECTOR D</div>
            <div>Retail Block</div>
            <div className="mt-2 text-blue-500">Unoccupied</div>
          </div>

          {/* Incident Occurrence Zone Marker */}
          <div className="absolute left-[210px] top-[210px] w-8 h-8 flex items-center justify-center pointer-events-none">
            <div className={`absolute w-12 h-12 rounded-full border animate-ping ${
              viewMode === "thermal" 
                ? "border-pink-500 bg-pink-500/10" 
                : viewMode === "sonar"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-red-500 bg-red-500/10"
            }`} style={{ animationDuration: "3s" }} />
            
            <div className={`absolute w-6 h-6 rounded-full border animate-pulse ${
              viewMode === "thermal" 
                ? "border-yellow-400 bg-yellow-400/20" 
                : viewMode === "sonar"
                ? "border-cyan-400 bg-cyan-400/20"
                : "border-orange-500 bg-orange-500/20"
            }`} />

            <div className={`w-3 h-3 rounded-full flex items-center justify-center ${
              viewMode === "thermal" 
                ? "bg-yellow-400" 
                : viewMode === "sonar"
                ? "bg-cyan-400"
                : "bg-red-600"
            } relative`}>
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            </div>

            <div className="absolute top-6 left-6 whitespace-nowrap bg-slate-950/90 border border-slate-800 rounded px-1.5 py-0.5 text-[8px] font-mono text-slate-300 shadow-lg flex flex-col gap-0.5 leading-none">
              <span className="font-bold text-amber-500 uppercase">INCIDENT BLOCK</span>
              <span>lat: {(selectedEvent.displayLatitude ?? selectedEvent.latitude).toFixed(4)}</span>
              <span>lng: {(selectedEvent.displayLongitude ?? selectedEvent.longitude).toFixed(4)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Auto-saving visual feedback states
  const [saveStatus, setSaveStatus] = React.useState<"saved" | "saving">("saved");
  const saveTimeoutRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (selectedEvent) {
      setLocalNote(bookmarkNote || "");
      setCurrentImgIndex(0);
      setShowLightbox(false);
      setShowShareOptions(false);
      setCopiedText(false);
      setExportedCsv(false);
    }
  }, [selectedEvent?.id]);

  // Clean up any pending timeout on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalNote(val);
    setSaveStatus("saving");

    // Pass up to mother memory states
    onUpdateBookmarkNote(selectedEvent.id, val);

    // Swap save state status smoothly
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus("saved");
    }, 450);
  };

  // Formatting date nicely
  const formatDateTime = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-50 border-red-200 text-red-700";
      case "high":
        return "bg-orange-50 border-orange-200 text-orange-700";
      case "medium":
        return "bg-yellow-50 border-yellow-200 text-yellow-800";
      case "low":
        return "bg-slate-55 border-slate-200 text-slate-600";
      default:
        return "bg-slate-50 border-slate-200 text-slate-700";
    }
  };

  const ThreatScoreGauge = ({ score }: { score?: number }) => {
    if (score === undefined) return null;
    let colorClass = "text-indigo-600";
    let bgClass = "bg-indigo-50 border-indigo-150";
    if (score >= 75) {
      colorClass = "text-red-650 font-black";
      bgClass = "bg-red-50 border-red-200 animate-pulse";
    } else if (score >= 45) {
      colorClass = "text-orange-550 font-extrabold";
      bgClass = "bg-orange-50 border-orange-205";
    } else if (score >= 20) {
      colorClass = "text-yellow-650 font-bold";
      bgClass = "bg-yellow-50 border-yellow-250";
    } else {
      colorClass = "text-slate-500 font-medium";
      bgClass = "bg-slate-55 border-slate-205";
    }
    
    return (
      <div className={`flex items-center gap-1.5 px-2 py-0.5 border rounded-full ${bgClass} leading-none select-none`}>
        <Activity size={10} className={colorClass} />
        <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-slate-400">Threat</span>
        <span className={`text-[10px] font-mono leading-none font-bold ${colorClass}`}>
          {score}%
        </span>
      </div>
    );
  };

  const SeverityGauge = ({ severity }: { severity: string }) => {
    const getSeverityDetails = (sev: string) => {
      switch (sev) {
        case "critical": return { color: "text-red-500", track: "text-red-100",  level: 4, label: "CRIT", pct: 100 };
        case "high":     return { color: "text-orange-500", track: "text-orange-100", level: 3, label: "HIGH", pct: 75 };
        case "medium":   return { color: "text-yellow-500", track: "text-yellow-100", level: 2, label: "MED", pct: 50 };
        case "low":      return { color: "text-slate-500", track: "text-slate-100",  level: 1, label: "LOW", pct: 25 };
        default:         return { color: "text-slate-400", track: "text-slate-100", level: 0, label: "UNK", pct: 0 };
      }
    };
  
    const details = getSeverityDetails(severity);
    const size = 36;
    const strokeWidth = 3.5;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (details.pct / 100) * circumference;
  
    return (
      <div className="flex items-center gap-2 pl-2 border-l border-slate-200 ml-1">
        <div className="relative flex items-center justify-center">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className={details.track}
              strokeWidth={strokeWidth}
              fill="none"
              stroke="currentColor"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className={details.color}
              strokeWidth={strokeWidth}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.5s ease-in-out" }}
            />
          </svg>
          <span className={`absolute text-[9px] font-mono font-bold ${details.color}`}>{details.level}</span>
        </div>
        <div className="flex flex-col border border-transparent">
           <span className="text-[8px] uppercase tracking-widest text-slate-400 font-bold leading-none">Risk Lvl</span>
           <span className={`text-[10px] font-mono font-extrabold uppercase leading-tight ${details.color}`}>{details.label}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full border-l border-slate-200 bg-white text-slate-800 select-none flex flex-col transform transition-transform overflow-hidden font-sans">
      {/* Drawer Title section */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 select-none">
        <h3 className="font-semibold text-xs uppercase tracking-widest font-mono text-slate-400">
          Incident Details Sheet
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {toggleSizing && (
            <div className="flex items-center gap-1 mr-1 border-r border-slate-200 pr-1.5">
              <button
                type="button"
                onClick={() => toggleSizing("drawer", "minimize")}
                className="p-1 hover:bg-slate-150 text-slate-400 hover:text-slate-800 rounded cursor-pointer transition-colors"
                title="Collapse Drawer view"
              >
                <Minus size={13} />
              </button>
              <button
                type="button"
                onClick={() => toggleSizing("drawer", sizes?.drawer?.isEnlarged ? "normal" : "enlarge")}
                className={`p-1 rounded cursor-pointer transition-all ${
                  sizes?.drawer?.isEnlarged
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-250 animate-pulse"
                    : "hover:bg-slate-150 text-slate-400 hover:text-slate-800"
                }`}
                title={sizes?.drawer?.isEnlarged ? "Standard size ↙" : "Maximize Drawer width ↗"}
              >
                <Maximize2 size={13} />
              </button>
            </div>
          )}
          <button
            onClick={() => onToggleBookmark(selectedEvent.id)}
            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-amber-500 rounded-md transition-colors cursor-pointer"
            title={isBookmarked ? "Remove Bookmark" : "Save / Bookmark Pin"}
          >
            <Bookmark size={15} className={isBookmarked ? "fill-amber-500 text-amber-500" : ""} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-red-500 rounded-md transition-colors cursor-pointer"
            title="Close Drawer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Main Drawer Body scroll space */}
      <div 
        ref={scrollContainerRef}
        style={{ 
          fontSize: `${13 * textScale}px`,
          padding: `${20 * paddingScale}px`
        }}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 transition-all duration-150"
      >
        <motion.div
          key={selectedEvent.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-6"
        >
          {/* RIGHT SIDE DRAWER ADAPTIVE SLIDERS DECK */}
        <div className="bg-slate-50 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl p-3.5 space-y-3 shadow-sm select-none transition-colors">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-slate-700 font-mono text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-ping"></span>
              <span className="font-extrabold uppercase tracking-wider text-slate-600">Drawer Sizing Console</span>
            </div>
            <button 
              type="button"
              onClick={() => {
                setTextScale(1.0);
                setPaddingScale(1.0);
              }}
              className="text-[9px] hover:text-indigo-600 font-bold uppercase transition-colors"
            >
              Reset
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] font-mono text-slate-550">
            {/* 1. Text FontSize Scale Slider */}
            <div className="space-y-1">
              <div className="flex justify-between font-semibold text-slate-500">
                <span>Text Scale</span>
                <span className="text-indigo-600 font-black">{(textScale * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.75"
                max="1.3"
                step="0.05"
                value={textScale}
                onChange={(e) => setTextScale(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1 bg-slate-200 rounded cursor-pointer appearance-none"
                title="Slide to scale font size in the details sheet"
              />
            </div>

            {/* 2. Padding Scale Slider */}
            <div className="space-y-1">
              <div className="flex justify-between font-semibold text-slate-500">
                <span>Padding Density</span>
                <span className="text-indigo-600 font-black">{(paddingScale * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.4"
                step="0.1"
                value={paddingScale}
                onChange={(e) => setPaddingScale(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1 bg-slate-200 rounded cursor-pointer appearance-none"
                title="Slide to change spacing and padding inside details card"
              />
            </div>
          </div>
        </div>

        {/* News Publisher indicators & Severity */}
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge
            sourceKey={selectedEvent.sourceKey}
            sourceType={selectedEvent.sourceType}
            sourceName={selectedEvent.sourceName}
          />
          <SeverityGauge severity={selectedEvent.severity} />
          <ThreatScoreGauge score={selectedEvent.threatScore} />
        </div>

        {/* Head description title */}
        <div className="space-y-2">
          <h1 className="text-lg font-bold font-sans tracking-tight text-slate-900 leading-snug">
            {selectedEvent.title}
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <Calendar size={12} />
            <span>Published: {formatDateTime(selectedEvent.publishedAt)}</span>
          </div>
        </div>

        {/* Dynamic Image Carousel Section */}
        {(() => {
          const images = selectedEvent.imageUrls || [];
          const hasImages = images.length > 0;
          if (!hasImages) return null;

          return (
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Camera size={11} className="text-indigo-500" />
                  <span>Incident Scene Reference Photos</span>
                </span>
                <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold leading-none">
                  {currentImgIndex + 1} / {images.length}
                </span>
              </div>
              
              <div className="relative group overflow-hidden rounded-xl bg-slate-950 border border-slate-150 h-44 shadow-sm transition-all duration-350">
                {/* Image element */}
                <img
                  src={images[currentImgIndex]}
                  alt={`${selectedEvent.title} incident reference ${currentImgIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover select-none transition-transform duration-500 group-hover:scale-103 cursor-zoom-in"
                  onClick={() => setShowLightbox(true)}
                />

                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/35 pointer-events-none" />

                {/* Lightbox Trigger Overlay Indicator */}
                <button
                  onClick={() => setShowLightbox(true)}
                  className="absolute top-2 right-2 bg-slate-905/85 backdrop-blur-sm border border-slate-700/50 text-white hover:bg-slate-800 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg cursor-pointer"
                  title="Expand image view"
                >
                  <Maximize2 size={12} />
                </button>

                {/* Hover indicator details */}
                <div className="absolute bottom-2 left-3 text-white pointer-events-none text-[10px] font-medium tracking-tight drop-shadow-md">
                  Ref photo • geocoded area vicinity
                </div>

                {/* Navigational Arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImgIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-slate-900/70 border border-white/10 hover:bg-slate-900/90 text-white p-1.5 rounded-full transition-colors opacity-80 hover:opacity-100 cursor-pointer shadow-md"
                      title="Previous photo"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImgIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900/70 border border-white/10 hover:bg-slate-900/90 text-white p-1.5 rounded-full transition-colors opacity-80 hover:opacity-100 cursor-pointer shadow-md"
                      title="Next photo"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </>
                )}

                {/* Bottom dot indicators */}
                {images.length > 1 && (
                  <div className="absolute bottom-2 right-3 flex gap-1 items-center bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full border border-white/5">
                    {images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImgIndex(idx);
                        }}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          currentImgIndex === idx ? "w-3 bg-indigo-500" : "w-1.5 bg-white/50 hover:bg-white"
                        }`}
                        title={`View photo ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Lightbox / High-Def Image Theater Viewport */}
              {showLightbox && (
                <div role="dialog" className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md transition-all duration-300">
                  {/* Top Bar controls */}
                  <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between z-10 text-white select-none">
                    <div className="flex flex-col gap-0.5 font-sans text-left">
                      <span className="font-bold text-[9px] uppercase tracking-widest font-mono text-indigo-400">
                        incident visual reference
                      </span>
                      <span className="text-[11px] text-slate-300 font-medium leading-none">
                        {selectedEvent.title}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-slate-300 bg-slate-800/80 px-2.5 py-1 border border-slate-700/50 rounded-lg font-bold">
                        {currentImgIndex + 1} of {images.length}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowLightbox(false);
                        }}
                        className="bg-red-600 hover:bg-red-500 border border-red-700 text-white p-2 rounded-lg transition-transform duration-200 cursor-pointer"
                        title="Close theater view"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Theater View Container */}
                  <div className="relative max-w-5xl max-h-[80vh] w-full px-4 flex items-center justify-center">
                    <img
                      src={images[currentImgIndex]}
                      alt={`${selectedEvent.title} enlarged theater view ${currentImgIndex + 1}`}
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-[75vh] object-contain rounded-xl border border-slate-800 shadow-2xl"
                    />

                    {/* Previous slide control */}
                    {images.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImgIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
                        }}
                        className="absolute left-6 md:left-8 bg-slate-900/80 border border-slate-700 hover:bg-slate-800 text-white p-3 rounded-full transition-all shrink-0 cursor-pointer shadow-lg hover:scale-110"
                        title="Scroll previous photo"
                      >
                        <ChevronLeft size={20} />
                      </button>
                    )}

                    {/* Next slide control */}
                    {images.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImgIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
                        }}
                        className="absolute right-6 md:right-8 bg-slate-900/80 border border-slate-700 hover:bg-slate-800 text-white p-3 rounded-full transition-all shrink-0 cursor-pointer shadow-lg hover:scale-110"
                        title="Scroll next photo"
                      >
                        <ChevronRight size={20} />
                      </button>
                    )}
                  </div>

                  {/* Bottom context bar */}
                  <div className="absolute bottom-4 inset-x-0 text-center text-slate-400 font-medium text-xs tracking-wide select-none">
                    {selectedEvent.locationText} • {formatDateTime(selectedEvent.publishedAt)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Geocode & coordinates breakdown */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400 flex items-center gap-1.5">
            <MapPin size={12} className="text-blue-600" />
            <span>estimated geocode location</span>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-800 font-semibold leading-relaxed">
              {selectedEvent.locationText}
            </p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase font-bold text-[9px]">
                Level: {selectedEvent.locationPrecision}
              </span>
              <span>•</span>
              <span>lat: {(selectedEvent.displayLatitude ?? selectedEvent.latitude).toFixed(4)}</span>
              <span>•</span>
              <span>lng: {(selectedEvent.displayLongitude ?? selectedEvent.longitude).toFixed(4)}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Coordinate confidence</span>
            <span className="font-mono font-bold text-blue-600">
              {(selectedEvent.locationConfidence * 100).toFixed(0)}% Certainty
            </span>
          </div>
        </div>

        {/* Advanced Intelligence Score Breakdown */}
        <div className="bg-indigo-50/15 border border-indigo-100/70 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-indigo-550 flex items-center gap-1.5">
            <Activity size={12} className="text-indigo-650" />
            <span>weighted threat score breakdown</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-0.5">
            <div className="bg-white border border-slate-100 p-2.5 rounded-lg space-y-1 shadow-2xs">
              <span className="text-[9.5px] uppercase font-bold font-mono text-slate-400 block">Incident Score</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-extrabold text-slate-800">{selectedEvent.incidentScore || selectedEvent.threatScore || 0}</span>
                <span className="text-[9px] text-slate-400 font-mono">pts</span>
              </div>
              <p className="text-[9.5px] leading-snug text-slate-450 font-medium font-sans">Individual severity weight, completely isolated from surrounding density.</p>
            </div>

            <div className="bg-white border border-slate-100 p-2.5 rounded-lg space-y-1 shadow-2xs">
              <span className="text-[9.5px] uppercase font-bold font-mono text-slate-400 block">Cluster Score</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-extrabold text-slate-800">
                  {selectedEvent.id.startsWith("clust-") || selectedEvent.isDerived ? selectedEvent.clusterScore || 0 : "N/A"}
                </span>
                {(selectedEvent.id.startsWith("clust-") || selectedEvent.isDerived) && <span className="text-[9px] text-slate-400 font-mono">pts</span>}
              </div>
              <p className="text-[9.5px] leading-snug text-slate-450 font-medium font-sans">Blended spatial average of active pattern & corroboration weight.</p>
            </div>
          </div>

          <div className="pt-2 border-t border-indigo-100/40 flex items-center justify-between text-[11px] leading-tight select-none">
            <span className="text-slate-500 font-bold">Integrated Corridor Threat Rating</span>
            <span className="font-mono font-extrabold text-indigo-650 bg-indigo-50 border border-indigo-150 rounded px-2 py-0.5 text-xs">
              {selectedEvent.threatScore || 0}% Risk
            </span>
          </div>
        </div>

        {/* 7-day category sparkline trend chart */}
        <div id="category-trend-sparkline-card" className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 space-y-3 shadow-2xs">
          <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <TrendingUp size={11} className="text-indigo-600" />
              <span>7-Day Category Trend Tracker</span>
            </span>
            <span className="text-[9px] bg-slate-100 border border-slate-205 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold leading-none capitalize">
              {selectedEvent.eventType?.replace(/_/g, " ")}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-2xl font-black text-slate-805 tracking-tight leading-none block">
                {totalInCategoryLastWeek}
              </span>
              <span className="text-[10.5px] font-semibold text-slate-500 leading-tight block">
                Total weekly incidents logged
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200/60 rounded-lg px-2.5 py-1.5 shadow-2xs select-none">
              {trendDirection === "up" ? (
                <>
                  <TrendingUp size={13} className="text-red-500 stroke-[2.5]" />
                  <span className="text-[9.5px] font-mono font-black text-red-650 uppercase">Increasing</span>
                </>
              ) : trendDirection === "down" ? (
                <>
                  <TrendingDown size={13} className="text-emerald-500 stroke-[2.5]" />
                  <span className="text-[9.5px] font-mono font-black text-emerald-650 uppercase">Decreasing</span>
                </>
              ) : (
                <>
                  <Activity size={13} className="text-slate-400 animate-pulse" />
                  <span className="text-[9.5px] font-mono font-black text-slate-500 uppercase">Stable</span>
                </>
              )}
            </div>
          </div>

          {/* Recharts Area Sparkline */}
          <div className="h-16 w-full -mx-1" id="sparkline-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="weekday" 
                  hide={false} 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fontSize: 8, fill: '#64748B', fontWeight: 600, fontFamily: 'monospace' }}
                  height={15}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-750 text-white p-1.5 rounded shadow-lg text-[9px] font-mono flex flex-col pointer-events-none leading-normal">
                          <span className="font-bold text-slate-300">{data.label} ({data.weekday})</span>
                          <span className="text-indigo-300 font-extrabold">{data.count} {data.count === 1 ? 'incident' : 'incidents'}</span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#4F46E5" 
                  strokeWidth={1.8}
                  fillOpacity={1} 
                  fill="url(#sparklineGradient)"
                  dot={{ r: 2, strokeWidth: 1, fill: "#FFFFFF", stroke: "#4F46E5" }}
                  activeDot={{ r: 4, strokeWidth: 1, fill: "#4F46E5", stroke: "#FFFFFF" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <p className="text-[9px] text-slate-400 font-medium leading-normal block">
            Aggregated metric from the past week across all registered safety networks.
          </p>
        </div>

        <div id="neighborhood-severity-sparkline-card" className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 space-y-3 shadow-2xs">
          <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <TrendingUp size={11} className="text-emerald-600" />
              <span>7-Day Neighborhood Severity Trend</span>
            </span>
          </div>

          <div className="h-20 w-full -mx-1" id="sparkline-neighborhood-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={neighborhoodTrendData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="neighborhoodGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="avgSeverity" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#neighborhoodGradient)" activeDot={{ r: 4, stroke: '#10b981', strokeWidth: 1 }} />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-750 text-white p-1.5 rounded shadow-lg text-[9px] font-mono flex flex-col pointer-events-none leading-normal">
                          <span className="font-bold">{data.label}</span>
                          <span>Severity: {data.avgSeverity}</span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[9px] text-slate-400 font-medium leading-normal block">
            Average severity (1-4) of incidents within a 2km radius over the past week.
          </p>
        </div>

        {/* Dynamic incident content summaries */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400 flex items-center gap-1.5">
            <Sparkles size={11} className="text-blue-500" />
            <span>AI safety summary</span>
          </div>
          <div className="bg-slate-50/85 border border-slate-150 rounded-xl p-4">
            <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium whitespace-pre-wrap">
              {selectedEvent.summary || "No description overview compiled."}
            </p>
          </div>
        </div>

        {/* Linked Intelligence Sources (Fusion Cluster details) */}
        {selectedEvent.sourcesList && selectedEvent.sourcesList.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400 flex items-center gap-1.5">
              <Activity size={11} className="text-emerald-500 animate-pulse" />
              <span>Linked Intelligence Sources ({selectedEvent.sourcesList.length})</span>
            </div>
            <div className="bg-emerald-50/10 border border-emerald-200/50 rounded-xl p-3 space-y-2 select-none">
              <div className="text-[9.5px] text-slate-500 font-medium leading-relaxed">
                This safety alert is a <b>fused intelligence cluster</b> combining multiple reports of the same incident within space & time constraints:
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {selectedEvent.sourcesList.map((src, sIdx) => (
                  <a
                    key={sIdx}
                    href={src.url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between text-[11px] bg-white border border-slate-150 hover:border-emerald-300 hover:shadow-xs px-2.5 py-1.5 rounded-lg text-slate-700 font-semibold transition-all group"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{src.name}</span>
                    </span>
                    <span className="text-[9.5px] text-slate-400 group-hover:text-emerald-600 flex items-center gap-0.5 font-medium">
                      View Original
                      <ExternalLink size={9} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chronological Incident Timeline Status updates */}
        <div id="incident-timeline-section" className="space-y-3 pt-1">
          <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock size={11} className="text-indigo-500 animate-pulse" />
              <span>Incident Response Timeline</span>
            </span>
            <span className="text-[8.5px] bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
              Chronological
            </span>
          </div>

          <div className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 relative overflow-hidden">
            {/* Thread runner line track */}
            <div className="absolute left-[19.5px] top-6 bottom-6 w-0.5 border-l border-dashed border-slate-200 pointer-events-none" />

            <div className="space-y-4 relative select-none">
              {(() => {
                let baseTime: Date;
                try {
                  baseTime = new Date(selectedEvent.publishedAt);
                  if (isNaN(baseTime.getTime())) throw new Error();
                } catch {
                  baseTime = new Date();
                }

                const formatOffset = (dateObj: Date, minutesOffset: number): string => {
                  const newD = new Date(dateObj.getTime() + minutesOffset * 60000);
                  try {
                    return newD.toLocaleTimeString("en-CA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }) + " • " + newD.toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                    });
                  } catch {
                    return newD.toISOString();
                  }
                };

                const type = (selectedEvent.eventType || "").toLowerCase();
                let steps: TimelineUpdate[] = [];

                if (["shooting", "stabbing", "weapons", "assault", "robbery"].includes(type)) {
                  steps = [
                    {
                      status: "Reported",
                      timestamp: formatOffset(baseTime, -90),
                      description: "Initial emergency 911 reports log violence or high-alert weapon threats in the block corridor.",
                      iconType: "danger"
                    },
                    {
                      status: "Under Investigation",
                      timestamp: formatOffset(baseTime, -45),
                      description: "Emergency responders secure coordinates. Multi-sector perimeter and tactical support deployed.",
                      iconType: "warning"
                    },
                    {
                      status: "Media Despatched",
                      timestamp: formatOffset(baseTime, 0),
                      description: `Official safety alert logged on the digital platform from ${selectedEvent.sourceName}. Incident priority: ${selectedEvent.severity.toUpperCase()}.`,
                      iconType: "neutral"
                    },
                    {
                      status: "Status: Active Monitor",
                      timestamp: formatOffset(baseTime, 30),
                      description: "Sector secured. Standard patrol units maintain continuous presence. Investigations pending follow-up files.",
                      iconType: "success"
                    }
                  ];
                } else if (["fire"].includes(type)) {
                  steps = [
                    {
                      status: "Reported",
                      timestamp: formatOffset(baseTime, -40),
                      description: "Structural smoke or elevated flame signatures registered by Fire Dispatch systems.",
                      iconType: "danger"
                    },
                    {
                      status: "Active Suppression",
                      timestamp: formatOffset(baseTime, -20),
                      description: "Saskatoon suppression tankers and rescue crews on coordinates. Fire lanes fully active.",
                      iconType: "warning"
                    },
                    {
                      status: "Advisory Active",
                      timestamp: formatOffset(baseTime, 0),
                      description: `Public sector bulletin published via ${selectedEvent.sourceName}. Commuters requested to divert around current blocks.`,
                      iconType: "neutral"
                    },
                    {
                      status: "Under Control",
                      timestamp: formatOffset(baseTime, 25),
                      description: "Primary fire controlled. Active cool-down operation completed. Scene passed to local fire safety inspector.",
                      iconType: "success"
                    }
                  ];
                } else if (["traffic_collision"].includes(type)) {
                  steps = [
                    {
                      status: "Reported",
                      timestamp: formatOffset(baseTime, -30),
                      description: "Emergency calls note collision incidents with substantial vehicle debris and traffic blockages.",
                      iconType: "warning"
                    },
                    {
                      status: "Emergency Response",
                      timestamp: formatOffset(baseTime, -10),
                      description: "Saskatoon roadway service squads, collision towing, and paramedics arrive at scene coordinates.",
                      iconType: "info"
                    },
                    {
                      status: "Advisory Published",
                      timestamp: formatOffset(baseTime, 0),
                      description: "Live road warning and lane closure advisory posted to public transit feeds.",
                      iconType: "neutral"
                    },
                    {
                      status: "Cleared",
                      timestamp: formatOffset(baseTime, 35),
                      description: "Damaged vehicles safely towed. Roadway lanes swept clean and normal traffic flow restored.",
                      iconType: "success"
                    }
                  ];
                } else if (["break_and_enter", "vehicle_theft", "drugs", "public_disorder"].includes(type)) {
                  steps = [
                    {
                      status: "Reported",
                      timestamp: formatOffset(baseTime, -120),
                      description: "Saskatoon patrol lines log dispatcher alert detailing property breach, intruder or break-in activity.",
                      iconType: "info"
                    },
                    {
                      status: "CCTV Analysis",
                      timestamp: formatOffset(baseTime, -65),
                      description: "Local area security feeds and doorbell footage audited for forensic identification characteristics.",
                      iconType: "warning"
                    },
                    {
                      status: "Registry Synced",
                      timestamp: formatOffset(baseTime, 0),
                      description: `Case folder updated and indexed on ${selectedEvent.sourceName} digital dataset.`,
                      iconType: "neutral"
                    },
                    {
                      status: "Active Inquiry",
                      timestamp: formatOffset(baseTime, 60),
                      description: "Investigative files open and assigned to Divisional Property Detectives. Tip portals remain open.",
                      iconType: "neutral"
                    }
                  ];
                } else {
                  // Standard Incident Timeline
                  steps = [
                    {
                      status: "Reported",
                      timestamp: formatOffset(baseTime, -60),
                      description: "Initial dispatcher ticket submitted and triaged under standard agency guidelines.",
                      iconType: "info"
                    },
                    {
                      status: "Under Investigation",
                      timestamp: formatOffset(baseTime, -30),
                      description: "Patrol team dispatched to block coordinates to verify parameters and consult available eyes-on-street.",
                      iconType: "warning"
                    },
                    {
                      status: "Alert Online",
                      timestamp: formatOffset(baseTime, 0),
                      description: `Bulletin synchronization completed with Saskatoon safety feeds sourced from ${selectedEvent.sourceName}.`,
                      iconType: "neutral"
                    },
                    {
                      status: "Case Logged",
                      timestamp: formatOffset(baseTime, 45),
                      description: "File successfully indexed in Saskatoon safety trends databank for long-term pattern metrics.",
                      iconType: "success"
                    }
                  ];
                }

                return steps.map((step, idx) => {
                  const getIndicatorColor = (type: string) => {
                    switch (type) {
                      case "danger":
                        return "bg-red-50 text-red-500 border-red-200";
                      case "warning":
                        return "bg-amber-50 text-amber-600 border-amber-250";
                      case "success":
                        return "bg-emerald-50 text-emerald-600 border-emerald-250";
                      case "info":
                        return "bg-sky-50 text-sky-600 border-sky-200";
                      default:
                        return "bg-slate-100 text-slate-500 border-slate-200";
                    }
                  };

                  return (
                    <div key={idx} className="flex gap-3 items-start text-xs group">
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 z-10 transition-transform group-hover:scale-110 mt-1 shadow-sm ${getIndicatorColor(step.iconType)}`}>
                        <span className="text-[7.5px] font-bold font-mono leading-none">
                          {idx + 1}
                        </span>
                      </div>

                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-tight">
                            {step.status}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 font-bold leading-none shrink-0 uppercase">
                            {step.timestamp}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal font-sans font-medium">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Personal Bookmarked Notes */}
        {isBookmarked && (
          <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-4 space-y-2.5 shadow-sm">
            <div className="text-[10px] uppercase font-bold tracking-wider font-mono text-amber-750 flex items-center gap-1.5">
              <Bookmark size={12} className="text-amber-500 fill-amber-500" />
              <span>Personal Bookmark Note</span>
            </div>
            <textarea
              value={localNote}
              onChange={handleNoteChange}
              rows={3}
              placeholder="Add personal route notes, safely reminders or contact context here..."
              className="w-full bg-white border border-amber-200 rounded-lg p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 font-sans font-medium"
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[9.5px] font-medium pt-1">
              <span className="text-amber-700/85">
                Notes are persisted instantly to local storage.
              </span>
              <span className={`inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.5 rounded-md border ${
                saveStatus === "saving"
                  ? "text-indigo-600 bg-indigo-50 border-indigo-100 animate-pulse font-semibold"
                  : "text-emerald-700 bg-emerald-50 border-emerald-150 font-semibold"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${saveStatus === "saving" ? "bg-indigo-500 animate-ping" : "bg-emerald-500"}`} />
                {saveStatus === "saving" ? "SAVING..." : "● AUTO-SAVED"}
              </span>
            </div>
          </div>
        )}

        {/* Precautions Guidelines alerts */}
        <div className="bg-blue-50/80 border border-blue-100/70 text-blue-800 px-4 py-3.5 rounded-lg flex gap-3 text-xs leading-normal">
          <ShieldCheck size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">Resident Safety Practice</span>
            <p className="text-blue-900/80 text-[11px] leading-relaxed">
              Ensure proper security habits around Saskatoon. The shown coordinate represents a block approximation, not an exact crime dwelling point.
            </p>
          </div>
        </div>
        </motion.div>
      </div>

      {/* Target native source CTA */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60 shrink-0 select-none flex flex-col gap-2">
        {/* Share to Socials Expansion Area */}
        {showShareOptions && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-inner space-y-3 animate-in slide-in-from-bottom duration-250">
            {/* Context label */}
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-mono tracking-wider text-slate-400 uppercase font-bold">
                Generated Alert Feed Message
              </span>
              <button 
                onClick={() => setShowShareOptions(false)}
                className="text-slate-450 hover:text-slate-700 font-bold font-mono text-[10px] cursor-pointer"
                title="Hide options deck"
              >
                [HIDE]
              </button>
            </div>

            {/* Message Preview text */}
            <div className="relative bg-slate-50 border border-slate-200 rounded p-2.5 font-sans text-[11px] text-slate-650 leading-relaxed select-text whitespace-pre-wrap max-h-[140px] overflow-y-auto">
              <span className="font-bold text-red-700">🚨 Saskatoon Safety Incident Alert:</span>{"\n"}
              <span className="font-bold text-slate-800">{selectedEvent.title}</span>{"\n"}
              📍 Location: {selectedEvent.locationText}{"\n"}
              🔗 Deep Link to Map: <span className="text-blue-600 underline font-mono text-[9px] break-all select-all">{window.location.origin + window.location.pathname}?event={selectedEvent.id}</span>
            </div>

            {/* Action grid (Copy, Twitter, Facebook) */}
            <div className="grid grid-cols-3 gap-2">
              {/* Copy Message button */}
              <button
                type="button"
                onClick={() => {
                  const preFormattedText = `🚨 Saskatoon Safety Incident Alert:
📌 ${selectedEvent.title}
📍 Location: ${selectedEvent.locationText}
🔗 Deep Link to Live map: ${window.location.origin + window.location.pathname}?event=${selectedEvent.id}`;
                  navigator.clipboard.writeText(preFormattedText);
                  setCopiedText(true);
                  setTimeout(() => setCopiedText(false), 2000);
                }}
                className={`py-2 px-1 text-[11px] font-semibold rounded border transition-all duration-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                  copiedText
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700 hover:text-slate-900"
                }`}
                title="Copy alert template"
              >
                {copiedText ? <Check size={13} className="text-emerald-500 animate-pulse" /> : <Copy size={13} />}
                <span>{copiedText ? "Copied!" : "Copy Msg"}</span>
              </button>

              {/* Twitter Button */}
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `🚨 Saskatoon Safety Incident Alert: ${selectedEvent.title} at ${selectedEvent.locationText}\n\n🔗 Live map pin view: ${window.location.origin + window.location.pathname}?event=${selectedEvent.id}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-1 text-[11px] font-semibold rounded border bg-sky-50 border-sky-150 hover:bg-sky-100 text-sky-800 hover:text-sky-900 transition-all duration-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                title="Post on X (Twitter)"
              >
                <Twitter size={13} className="text-sky-500" />
                <span>Post on X</span>
              </a>

              {/* Facebook Button */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                  window.location.origin + window.location.pathname + "?event=" + selectedEvent.id
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-1 text-[11px] font-semibold rounded border bg-blue-55 border-blue-150 hover:bg-blue-100 text-blue-800 hover:text-blue-900 transition-all duration-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                title="Share link on Facebook"
              >
                <Facebook size={13} className="text-blue-600" />
                <span>Share Link</span>
              </a>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowShareOptions(!showShareOptions)}
          className={`w-full cursor-pointer font-bold text-xs py-2.5 px-4 rounded flex items-center justify-center gap-1.5 transition-colors shadow-sm border ${
            showShareOptions
              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold"
              : "bg-indigo-600 border-indigo-700 hover:bg-indigo-500 text-white"
          }`}
          title="Share this incident message or deep link"
        >
          <Share2 size={12} />
          <span>{showShareOptions ? "Close Sharing Deck" : "Share to Socials"}</span>
        </button>

        <button
          onClick={() => setShowStreetViewModal(true)}
          className="w-full cursor-pointer bg-blue-600 hover:bg-blue-500 border border-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded flex items-center justify-center gap-1.5 transition-colors shadow-sm animate-fadeIn"
          title="Analyze 3D tactical vicinity model"
        >
          <Camera size={12} />
          <span>Virtual Street View</span>
        </button>

        <button
          type="button"
          onClick={handleExportCSV}
          className="w-full cursor-pointer bg-white border border-slate-200 text-slate-700 font-bold text-xs py-2.5 px-4 rounded flex items-center justify-center gap-1.5 transition-all hover:bg-emerald-50 hover:border-emerald-250 hover:text-emerald-700 shadow-sm animate-fadeIn"
          title="Export this specific incident data as a formatted CSV file"
        >
          {exportedCsv ? (
            <Check size={12} className="text-emerald-500 animate-pulse shrink-0" />
          ) : (
            <FileSpreadsheet size={12} className="text-emerald-600 shrink-0" />
          )}
          <span>{exportedCsv ? "CSV Compiled & Downloaded!" : "Export Event Data (CSV)"}</span>
        </button>

        <button
          type="button"
          onClick={handlePrintReport}
          className="w-full cursor-pointer bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 hover:text-slate-950 font-bold text-xs py-2.5 px-4 rounded flex items-center justify-center gap-1.5 transition-all shadow-sm animate-fadeIn"
          title="Print official public safety incident archive sheet"
        >
          <Printer size={12} className="text-slate-600" />
          <span>Print Physical Dossier Report</span>
        </button>

        <a
          href={(() => {
            const destLat = selectedEvent.displayLatitude ?? selectedEvent.latitude;
            const destLng = selectedEvent.displayLongitude ?? selectedEvent.longitude;
            let url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
            if (userLat !== undefined && userLat !== null && userLng !== undefined && userLng !== null) {
              url += `&origin=${userLat},${userLng}`;
            }
            return url;
          })()}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full cursor-pointer bg-emerald-600 hover:bg-emerald-500 border border-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded flex items-center justify-center gap-1.5 transition-colors shadow-sm animate-fadeIn"
          title="Open Google Maps directions for this incident pre-filled with coordinates"
        >
          <Navigation size={12} className="rotate-45 fill-white/10" />
          <span>Get Directions</span>
          {userLat !== null && userLat !== undefined && userLng !== null && userLng !== undefined && (
            <span className="text-[10px] text-emerald-100 font-mono font-medium pl-1 bg-emerald-700/40 px-1 rounded">
              GPS Active
            </span>
          )}
        </a>

        <a
          href={selectedEvent.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full cursor-pointer bg-slate-900 hover:bg-slate-800 border border-slate-950 text-white font-bold text-xs py-2.5 px-4 rounded flex items-center justify-center gap-1.5 transition-colors shadow-sm animate-fadeIn"
        >
          <span>View Original Source Release</span>
          <ExternalLink size={12} />
        </a>
      </div>

      {/* High-Contrast Situational Vicinity Modal */}
      {showStreetViewModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm print-hidden">
          {/* Custom style for sweep animation */}
          <style>{`
            @keyframes scanSweep {
              0% { top: 0%; opacity: 0.1; }
              10% { opacity: 0.8; }
              90% { opacity: 0.8; }
              100% { top: 100%; opacity: 0.1; }
            }
          `}</style>
          
          <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[550px] select-none text-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="text-blue-500 animate-pulse" size={16} />
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                  Virtual Vicinity Street View Intelligence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-bold text-green-400 bg-green-950/40 border border-green-900/50 px-2 py-0.5 rounded leading-none">
                  ONLINE // SCANNING
                </span>
                <button
                  onClick={() => setShowStreetViewModal(false)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Main Content - Split Screen */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-950">
              
              {/* Left Viewport Display Shield */}
              <div className="flex-1 relative flex flex-col items-center justify-center bg-slate-900/45 p-4 border-b md:border-b-0 md:border-r border-slate-850 overflow-hidden">
                {/* HUD Top Coordinates label */}
                <div className="absolute top-3 left-4 pointer-events-none text-[8px] font-mono text-slate-500 tracking-wider">
                  SASKATOON FEED // LATT: {(selectedEvent.displayLatitude ?? selectedEvent.latitude).toFixed(5)} // LONG: {(selectedEvent.displayLongitude ?? selectedEvent.longitude).toFixed(5)}
                </div>
                <div className="absolute top-3 right-4 pointer-events-none flex items-center gap-1.5">
                  {isScanning && (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[8px] font-mono text-red-400 uppercase font-extrabold">REC</span>
                    </>
                  )}
                </div>

                {/* Viewfinder brackets */}
                <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-slate-700/50 pointer-events-none" />
                <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-slate-700/50 pointer-events-none" />
                <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-slate-700/50 pointer-events-none" />
                <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-slate-700/50 pointer-events-none" />

                {/* Scanline element */}
                {isScanning && (
                  <div 
                    className="absolute left-0 right-0 h-0.5 bg-cyan-500/15 shadow-[0_0_12px_rgba(6,182,212,0.4)] pointer-events-none z-10" 
                    style={{ animation: `scanSweep ${scanDuration}s linear infinite` }}
                  />
                )}

                {/* Blueprint grid rendering */}
                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                  {renderGroundPlane()}
                </div>

                {/* Overlay stats box */}
                <div className="absolute bottom-4 left-4 pointer-events-none flex flex-col gap-0.5 font-mono text-[9px] text-slate-400 bg-slate-950/90 p-2 border border-slate-800 rounded shadow-md min-w-[130px]">
                  <span className="text-blue-400 font-extrabold uppercase text-[8px] border-b border-slate-800 pb-0.5 mb-1">Grid Telemetry</span>
                  <span>ORIENTATION: {((viewAngle + 360) % 360).toFixed(0)}° N</span>
                  <span>SENSING SCOPE: {(200 / zoomLevel).toFixed(0)}m</span>
                  <span>INCIDENT ZONE: PULSING</span>
                </div>
              </div>

              {/* Right Side Settings Control Shield */}
              <div className="w-full md:w-72 shrink-0 bg-slate-900 flex flex-col h-full overflow-y-auto font-sans text-xs">
                {/* Visualizer Mode Selection */}
                <div className="p-3 border-b border-slate-800 space-y-2">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Radio size={11} className="text-blue-500 animate-pulse" />
                    <span>Active Sensors</span>
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-slate-950 p-0.5 border border-slate-800 rounded-md font-sans">
                    <button
                      onClick={() => setViewMode("tactical")}
                      className={`py-1.5 text-[9px] font-mono font-extrabold rounded cursor-pointer transition-colors ${
                        viewMode === "tactical" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`}
                    >
                      TACTICAL
                    </button>
                    <button
                      onClick={() => setViewMode("thermal")}
                      className={`py-1.5 text-[9px] font-mono font-extrabold rounded cursor-pointer transition-colors ${
                        viewMode === "thermal" ? "bg-fuchsia-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`}
                    >
                      THERMAL
                    </button>
                    <button
                      onClick={() => setViewMode("sonar")}
                      className={`py-1.5 text-[9px] font-mono font-extrabold rounded cursor-pointer transition-colors ${
                        viewMode === "sonar" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`}
                    >
                      SONAR
                    </button>
                  </div>
                </div>

                {/* Viewport Calibrators */}
                <div className="p-4 border-b border-slate-800 space-y-4">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Compass size={11} className="text-blue-500" />
                    <span>Blueprint Calibrator</span>
                  </span>

                  {/* Camera Angle */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-300">
                      <span>Camera Yaw Tilt</span>
                      <span className="text-blue-400">{viewAngle}°</span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      value={viewAngle}
                      onChange={(e) => setViewAngle(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {/* Scaling multiplier */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-300">
                      <span>Sensing Scope Area</span>
                      <span className="text-blue-400">{(zoomLevel * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.6"
                      max="1.8"
                      step="0.1"
                      value={zoomLevel}
                      onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {/* Toggle Sweep Scan */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] font-mono text-slate-300">Active Sweep Filter</span>
                    <button
                      onClick={() => setIsScanning(!isScanning)}
                      className={`w-7 h-4 rounded-full relative flex items-center p-0.5 cursor-pointer transition-colors duration-200 ${
                        isScanning ? "bg-blue-600 justify-end" : "bg-slate-700 justify-start"
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full bg-white shadow-md transform" />
                    </button>
                  </div>

                  {isScanning && (
                    <div className="space-y-1 pt-2 border-t border-slate-850 animate-fadeIn">
                      <div className="flex justify-between text-[9px] font-mono text-slate-300">
                        <span>Sweep Scan Speed</span>
                        <span className="text-blue-400">{scanDuration}s / lap</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="0.5"
                        value={scanDuration}
                        onChange={(e) => setScanDuration(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        title="Slide to adjust blueprint radar sweep lap duration"
                      />
                    </div>
                  )}
                </div>

                {/* Intelligence Analysis Block */}
                <div className="p-4 space-y-3.5 flex-1 select-none">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Activity size={11} className="text-blue-500" />
                    <span>Area Analysis Intelligence</span>
                  </span>

                  <div className="space-y-2.5 font-mono text-[10px]">
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg space-y-1">
                      <span className="text-slate-400 text-[8px] tracking-wider uppercase block leading-none">Sector Zone</span>
                      <span className="font-extrabold text-blue-400 leading-tight">
                        {getVicinityClassification(selectedEvent.locationText).zone}
                      </span>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg space-y-1">
                      <span className="text-slate-400 text-[8px] tracking-wider uppercase block leading-none">Infrastructure density</span>
                      <span className="text-slate-200 leading-tight">
                        {getVicinityClassification(selectedEvent.locationText).infrastructure}
                      </span>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg space-y-1">
                      <span className="text-slate-400 text-[8px] tracking-wider uppercase block leading-none">Safety Environment illumination</span>
                      <span className="text-slate-200 leading-tight">
                        {getVicinityClassification(selectedEvent.locationText).lighting}
                      </span>
                    </div>
                  </div>

                  {/* Fine Print disclaimer */}
                  <div className="bg-slate-950/45 border border-slate-800 p-2.5 rounded-lg text-[9px] font-sans font-medium text-slate-400 leading-relaxed flex gap-2 items-start mt-2">
                    <Shield size={16} className="text-blue-500 shrink-0 mt-0.5" />
                    <span>
                      Saskatoon Sector Grid coordinates provide situational block estimation. This represents digital computer-generated wireframes of the vicinity.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
