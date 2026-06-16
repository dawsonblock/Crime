import React from "react";
import { Filter, Calendar, AlertTriangle, ListFilter, Bookmark, Search, RefreshCw, Layers, Settings, FileSpreadsheet, FileText, Download, MapPin, Compass, Bell, BellOff, Radio, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { SeverityType, SourceType, EventItem } from "../types";
import { jsPDF } from "jspdf";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// Haversine formula calculation helper for faceted radar filtering
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth's radius in km
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

export interface FilterState {
  timeRangeHours: string; // "24", "168" (7d), "720" (30d), "all"
  severities: SeverityType[];
  eventTypes: string[]; // multi-select categories
  sourceKey: string; // "all" or specific
  searchQuery: string;
  showBookmarksOnly: boolean;
  searchRadiusKm: number | "all"; // e.g., 1, 5, 10 or "all"
  userLat: number | null;
  userLng: number | null;
  criticalOnly: boolean;
  sourceTiers: number[];
  autoGroupEvents: boolean;
  showIncidentDensity: boolean;
}

interface EventFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableTypes: string[];
  availableSources: { key: string; name: string }[];
  onIngest: () => void;
  isIngesting: boolean;
  onOpenReportModal: () => void;
  totalCount: number;
  filteredCount: number;
  autoRefreshEnabled: boolean;
  onToggleAutoRefresh: (enabled: boolean) => void;
  nextRefreshMinutesLeft: number | null;
  filteredEvents: EventItem[];
  isAlertScannerActive: boolean;
  onToggleAlertScanner: (active: boolean) => void;
  lastAlertScanTime: string | null;
  onTriggerManualScan: () => void;
  onClearAlertHistory: () => void;
  alertedCount: number;
  allEvents: EventItem[];
  bookmarks: string[];
}

export default function EventFilters({
  filters,
  onChange,
  availableTypes,
  availableSources,
  onIngest,
  isIngesting,
  onOpenReportModal,
  totalCount,
  filteredCount,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  nextRefreshMinutesLeft,
  filteredEvents,
  isAlertScannerActive,
  onToggleAlertScanner,
  lastAlertScanTime,
  onTriggerManualScan,
  onClearAlertHistory,
  alertedCount,
  allEvents = [],
  bookmarks = [],
}: EventFiltersProps) {
  const [isSeverityDropdownOpen, setIsSeverityDropdownOpen] = React.useState<boolean>(false);
  const severityDropdownRef = React.useRef<HTMLDivElement>(null);
  const [searchHistory, setSearchHistory] = React.useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('event-search-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const query = filters.searchQuery.trim();
      if (query.length > 0) {
        setSearchHistory(prev => {
          const newHistory = [query, ...prev.filter(h => h !== query)].slice(0, 3);
          localStorage.setItem('event-search-history', JSON.stringify(newHistory));
          return newHistory;
        });
      }
    }
  };

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (severityDropdownRef.current && !severityDropdownRef.current.contains(event.target as Node)) {
        setIsSeverityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const isTrustedOnly = React.useMemo(() => {
    return filters.sourceTiers && filters.sourceTiers.length === 2 && filters.sourceTiers.includes(1) && filters.sourceTiers.includes(2);
  }, [filters.sourceTiers]);

  // Compute category distribution based on allEvents
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    allEvents.forEach((evt) => {
      const type = evt.eventType || "unknown";
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [allEvents]);

  // Compute severity distribution based on current filters, excluding the severity filter itself (faceted search)
  const severityDistribution = React.useMemo(() => {
    // Filter allEvents by all filters EXCEPT severity
    const matchingEvents = allEvents.filter((evt) => {
      // Bookmark filter
      if (filters.showBookmarksOnly && !bookmarks.includes(evt.id)) {
        return false;
      }

      // Critical Only mode check
      if (filters.criticalOnly && evt.severity !== "critical") {
        return false;
      }

      // Source Tiers check
      if (filters.sourceTiers && filters.sourceTiers.length > 0) {
        const tier = evt.sourceTier || 3;
        if (!filters.sourceTiers.includes(tier)) {
          return false;
        }
      }

      // Incident type
      if (filters.eventTypes && filters.eventTypes.length > 0 && !filters.eventTypes.includes(evt.eventType)) {
        return false;
      }

      // Source
      if (filters.sourceKey !== "all" && evt.sourceKey !== filters.sourceKey) {
        return false;
      }

      // Keyword
      if (filters.searchQuery.trim().length > 0) {
        const query = filters.searchQuery.toLowerCase();
        const MatchHeadline = evt.title.toLowerCase().includes(query);
        const MatchLocationText = evt.locationText?.toLowerCase().includes(query) ?? false;
        const MatchSummary = evt.summary?.toLowerCase().includes(query) ?? false;
        const MatchSource = evt.sourceName?.toLowerCase().includes(query) ?? false;
        const MatchType = evt.eventType?.replace(/_/g, " ").toLowerCase().includes(query) ?? false;

        if (!MatchHeadline && !MatchLocationText && !MatchSummary && !MatchSource && !MatchType) {
          return false;
        }
      }

      // Timeframe
      if (filters.timeRangeHours !== "all") {
        const scopeHours = parseInt(filters.timeRangeHours, 10);
        if (!isNaN(scopeHours)) {
          const cutOffMs = Date.now() - (scopeHours * 3600 * 1000);
          const publishedMs = new Date(evt.publishedAt).getTime();
          if (publishedMs < cutOffMs) {
            return false;
          }
        }
      }

      // Proximity Radar
      if (filters.userLat !== null && filters.userLng !== null && filters.searchRadiusKm !== "all") {
        const dist = getDistanceKm(
          filters.userLat,
          filters.userLng,
          evt.latitude,
          evt.longitude
        );
        if (dist > filters.searchRadiusKm) {
          return false;
        }
      }

      return true;
    });

    // Count severities
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    matchingEvents.forEach((evt) => {
      const sev = (evt.severity || "").toLowerCase() as SeverityType;
      if (counts.hasOwnProperty(sev)) {
        counts[sev]++;
      }
    });

    return [
      { name: "critical" as SeverityType, value: counts.critical, color: "#EF4444" },
      { name: "high" as SeverityType, value: counts.high, color: "#F97316" },
      { name: "medium" as SeverityType, value: counts.medium, color: "#FACC15" },
      { name: "low" as SeverityType, value: counts.low, color: "#CBD5E1" },
    ];
  }, [allEvents, filters, bookmarks]);

  const totalMatchingIncidents = React.useMemo(() => {
    return severityDistribution.reduce((sum, item) => sum + item.value, 0);
  }, [severityDistribution]);

  const handleSegmentClick = (data: any, idx: number) => {
    if (!data) return;
    const sev = data.name as SeverityType;
    handleSeverityToggle(sev);
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-950 border border-slate-800 p-2 rounded shadow-md text-white font-sans text-[10px] select-none z-[1002]">
          <p className="font-bold flex items-center gap-1 capitalize text-slate-200">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: data.color }}></span>
            {data.name}
          </p>
          <p className="font-mono mt-0.5">
            Count: <strong className="font-extrabold text-white">{data.value}</strong>
          </p>
          <p className="text-[8px] text-slate-400 mt-0.5">Click segment to toggle filter</p>
        </div>
      );
    }
    return null;
  };

  const handleTimeChange = (hours: string) => {
    onChange({ ...filters, timeRangeHours: hours });
  };

  const handleSeverityToggle = (sev: SeverityType) => {
    const isSelected = filters.severities.includes(sev);
    let updatedSeverities: SeverityType[];
    if (isSelected) {
      updatedSeverities = filters.severities.filter((s) => s !== sev);
    } else {
      updatedSeverities = [...filters.severities, sev];
    }
    onChange({ ...filters, severities: updatedSeverities });
  };

  const handleSelectAllSeverities = () => {
    onChange({ ...filters, severities: ["critical", "high", "medium", "low"] });
  };

  const handleClearAllSeverities = () => {
    onChange({ ...filters, severities: [] });
  };

  const handleTypeToggle = (type: string) => {
    const isSelected = filters.eventTypes.includes(type);
    let updated: string[];
    if (isSelected) {
      updated = filters.eventTypes.filter((t) => t !== type);
    } else {
      updated = [...filters.eventTypes, type];
    }
    onChange({ ...filters, eventTypes: updated });
  };

  const handleSourceChange = (sourceKey: string) => {
    onChange({ ...filters, sourceKey: sourceKey });
  };

  const toggleBookmarks = () => {
    onChange({ ...filters, showBookmarksOnly: !filters.showBookmarksOnly });
  };

  const [geoErrorMsg, setGeoErrorMsg] = React.useState<string | null>(null);
  const [geoLoading, setGeoLoading] = React.useState<boolean>(false);

  const detectLocation = () => {
    setGeoLoading(true);
    setGeoErrorMsg(null);
    if (!navigator.geolocation) {
      setGeoErrorMsg("Geolocation is not supported by your browser. Using Saskatoon fallback center.");
      onChange({
        ...filters,
        userLat: 52.1332,
        userLng: -106.6700,
        searchRadiusKm: filters.searchRadiusKm === "all" ? 5 : filters.searchRadiusKm
      });
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...filters,
          userLat: position.coords.latitude,
          userLng: position.coords.longitude,
          searchRadiusKm: filters.searchRadiusKm === "all" ? 5 : filters.searchRadiusKm
        });
        setGeoLoading(false);
      },
      (error) => {
        console.warn("Geolocation sensor error:", error);
        let errorMsg = "Could not retrieve GPS location. Using Saskatoon fallback center.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = "Location access denied. Using Saskatoon fallback center.";
        }
        setGeoErrorMsg(errorMsg);
        onChange({
          ...filters,
          userLat: 52.1332,
          userLng: -106.6700,
          searchRadiusKm: filters.searchRadiusKm === "all" ? 5 : filters.searchRadiusKm
        });
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const clearProximity = () => {
    setGeoErrorMsg(null);
    onChange({
      ...filters,
      userLat: null,
      userLng: null,
      searchRadiusKm: "all"
    });
  };

  const formatTypeLabel = (type: string) => {
    return type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const exportToCSV = (eventsToExport: EventItem[]) => {
    if (!eventsToExport || eventsToExport.length === 0) return;

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

    const rows = eventsToExport.map((evt) => [
      evt.id,
      evt.title,
      evt.severity,
      evt.eventType || "unknown",
      evt.publishedAt,
      evt.locationText || "Saskatoon, SK",
      evt.latitude,
      evt.longitude,
      evt.summary || "",
      evt.sourceName,
      evt.originalUrl || ""
    ]);

    const csvContent = [
      headers.map(escapeCSVField).join(","),
      ...rows.map((row) => row.map(escapeCSVField).join(","))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    const dateFormatted = new Date().toISOString().split("T")[0];
    link.download = `saskatoon_safety_feed_${dateFormatted}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToPDF = (eventsToExport: EventItem[]) => {
    if (!eventsToExport || eventsToExport.length === 0) return;

    // Document size: A4 has width of 210mm and height of 297mm
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    let currentPage = 1;
    let y = 16;

    const getSeverityRGB = (severity: string): [number, number, number] => {
      switch (severity?.toLowerCase()) {
        case "critical": return [220, 38, 38]; // Red
        case "high": return [234, 88, 12];     // Orange
        case "medium": return [202, 138, 4];   // Yellow-gold
        case "low": return [71, 85, 105];       // Gray-slate
        default: return [37, 99, 235];         // Blue
      }
    };

    const drawFooter = (pageNum: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // Slate-500
      
      // Horizontal separator line at the bottom
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.2);
      doc.line(15, 282, 195, 282);

      const footerLeft = "Saskatoon Public Safety - Tactical Brief Report";
      const footerRight = `Page ${pageNum}`;
      doc.text(footerLeft, 15, 287);
      doc.text(footerRight, 195, 287, { align: "right" });
    };

    const drawHeaderAndStats = () => {
      // 1. Core Top Header Banner
      doc.setFillColor(15, 23, 42); // slate-900 dark theme
      doc.rect(15, 15, 180, 24, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("SASKATOON COMMUNITY SAFETY MONITOR", 20, 22.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184); // slate-400
      const generatedAtLocal = new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      doc.text(`OFFLINE CRISIS INCIDENT FEED BRIEF | COMPREHENSIVE ALERTS`, 20, 27);
      doc.setTextColor(59, 130, 246); // Blue text
      doc.setFont("helvetica", "bold");
      doc.text(`MAP GRID DATA EXTRACTED: ${generatedAtLocal.toUpperCase()}`, 20, 34);

      // Quant summary block below the header
      // Draw rectangular border card
      doc.setFillColor(248, 250, 252); // slate-50 background
      doc.setDrawColor(226, 232, 240); // slate-200 border
      doc.setLineWidth(0.3);
      doc.rect(15, 43, 180, 20, "FD");

      // Column 1: Record Total
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(String(eventsToExport.length), 25, 52);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("FILTERED INCIDENTS", 25, 56.5);

      // Column 2: Threat mix
      const criticalCount = eventsToExport.filter((e) => e.severity === "critical" || e.severity === "high").length;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(220, 38, 38); // red-605
      doc.text(String(criticalCount), 85, 52);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("HIGH/CRITICAL THREATS", 85, 56.5);

      // Column 3: Source count
      const sourceCount = new Set(eventsToExport.map(e => e.sourceKey)).size;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(37, 99, 235); // blue-600
      doc.text(`${sourceCount} Source${sourceCount > 1 ? "s" : ""}`, 145, 52);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("INTELLIGENCE CHANNELS", 145, 56.5);

      // Label below stats card
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("CHRONOLOGICAL INCIDENT ALERT FEED", 15, 71);
      
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.4);
      doc.line(15, 73, 195, 73);

      y = 80;
    };

    // Draw the cover/header frame on page 1
    drawHeaderAndStats();

    eventsToExport.forEach((evt, idx) => {
      const descriptionLines = doc.splitTextToSize(evt.summary || "No secondary statement detailed for this report series.", 168);
      const descriptionHeight = descriptionLines.length * 4.2;

      // Calculate total physical height of the card on paper (title + meta + details + margin)
      const contentHeight = 5 + 4 + 4 + descriptionHeight + 7;

      // If Y coordinate exceeds boundaries, paint running footer and start page 2
      if (y + contentHeight > 270) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage += 1;
        
        // Simpler header wrapper on later pages
        doc.setFillColor(30, 41, 59); // slate-800
        doc.rect(15, 12, 180, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(`SASKATOON PUBLIC SAFETY FEED BRIEF | CONTINUED ALERTS`, 20, 17.5);
        
        y = 26; // reset cursor offset
      }

      // Draw item
      // Title card box outline accents
      const severityColor = getSeverityRGB(evt.severity);
      doc.setDrawColor(226, 232, 240); // Slate-200 border
      doc.setLineWidth(0.15);
      doc.setFillColor(252, 253, 254);
      
      // Draw background panel box for this incident
      doc.rect(15, y, 180, contentHeight - 3, "FD");

      // Left thick severity colored bar indicator
      doc.setFillColor(severityColor[0], severityColor[1], severityColor[2]);
      doc.rect(15, y, 2.5, contentHeight - 3, "F");

      // Draw Event Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59); // deep slate-800
      doc.text(evt.title, 20, y + 4.5, { maxWidth: 170 });

      // Draw META row
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(severityColor[0], severityColor[1], severityColor[2]);
      doc.text(evt.severity.toUpperCase(), 20, y + 9);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139); // slate-500
      const formattedTime = new Date(evt.publishedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
      doc.text(` | SOURCE: ${evt.sourceName.toUpperCase()} | TIME: ${formattedTime.toUpperCase()}`, 33, y + 9);

      // Draw Location line
      doc.setFont("helvetica", "italic");
      doc.setTextColor(115, 115, 115); // gray-500
      const locText = `Location: ${evt.locationText || "Unspecified Area"} (${evt.locationPrecision} precision)`;
      doc.text(locText, 20, y + 13, { maxWidth: 170 });

      // Draw wrapped incident details
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor(51, 65, 85); // Slate-700
      
      // Draw actual multi-line text dynamically
      doc.text(descriptionLines, 20, y + 17.5);

      y += contentHeight;
    });

    // Make sure the final page has a beautiful running footer
    drawFooter(currentPage);

    // Save and download PDF triggered stream
    const isoDate = new Date().toISOString().split("T")[0];
    doc.save(`saskatoon_safety_brief_${isoDate}.pdf`);
  };

  return (
    <div className="flex flex-col h-full bg-white text-slate-800 w-full select-none overflow-hidden">
      {/* Dynamic Sync Trigger Header */}
      <div className="p-4 border-b border-slate-100 shrink-0 space-y-3 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
            </span>
            <div className="text-[10px] uppercase font-bold tracking-widest font-mono text-blue-600">
              Saskatchewan Core Feed
            </div>
          </div>
          <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full font-mono font-semibold">
            {filteredCount} view / {totalCount} total
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onIngest}
            disabled={isIngesting}
            className="flex-1 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-2 rounded flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={13} className={isIngesting ? "animate-spin" : ""} />
            <span>{isIngesting ? "Crawling Feeds..." : "Sync Crime Feeds"}</span>
          </button>
          <button
            onClick={onOpenReportModal}
            className="cursor-pointer bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs px-3 py-2 rounded border border-slate-200 shadow-sm transition-colors"
          >
            + Feed Report
          </button>
        </div>
      </div>

      {/* Primary Scrollable Workspace Filters */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-200">
        {/* Keyword Lookup */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
            <Search size={11} /> Keywords Search
          </label>
          <div className="relative">
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="Search suspect, street, category..."
              className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 pl-8 pr-3 text-xs placeholder-slate-400 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
          </div>
          {searchHistory.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {searchHistory.map((q) => (
                <button
                  key={q}
                  onClick={() => onChange({ ...filters, searchQuery: q })}
                  className="px-2 py-0.5 text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors font-mono"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Saved Pin Toggle */}
        <button
          onClick={toggleBookmarks}
          className={`w-full flex items-center justify-between p-2.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
            filters.showBookmarksOnly
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Bookmark size={13} className={filters.showBookmarksOnly ? "fill-amber-500 text-amber-500" : ""} />
            <span>Show Bookmarked Only</span>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white border border-slate-205 text-slate-500">
            Saved
          </span>
        </button>

        {/* Critical Only Toggle */}
        <button
          id="critical-only-toggle"
          onClick={() => onChange({ ...filters, criticalOnly: !filters.criticalOnly })}
          className={`w-full flex items-center justify-between p-2.5 rounded border text-xs font-semibold cursor-pointer transition-all duration-150 ${
            filters.criticalOnly
              ? "bg-red-50 border-red-300 text-red-800 shadow-sm ring-1 ring-red-500/10"
              : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className={filters.criticalOnly ? "text-red-650 fill-red-150 animate-pulse" : "text-slate-400"} />
            <span>Critical Incident Alerts Only</span>
          </div>
          <span className={`font-mono text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded border leading-none transition-colors ${
            filters.criticalOnly
              ? "bg-red-600 border-red-755 text-white"
              : "bg-white border-slate-205 text-slate-500"
          }`}>
            {filters.criticalOnly ? "ACTIVE" : "OFF"}
          </span>
        </button>

        {/* Trusted Sources Quick-Access Toggle */}
        <button
          id="trusted-sources-only-toggle"
          type="button"
          onClick={() => {
            const nextTiers = isTrustedOnly ? [1, 2, 3, 4] : [1, 2];
            onChange({ ...filters, sourceTiers: nextTiers });
          }}
          className={`w-full flex items-center justify-between p-2.5 rounded border text-xs font-semibold cursor-pointer transition-all duration-150 ${
            isTrustedOnly
              ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm ring-1 ring-emerald-500/10"
              : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-700"
          }`}
          title="Toggle display to show only Tier 1 (Official) and Tier 2 (Media) verified incident sources"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={13} className={isTrustedOnly ? "text-emerald-650" : "text-slate-400"} />
            <span>Trusted Sources Only (Tiers 1 & 2)</span>
          </div>
          <span className={`font-mono text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded border leading-none transition-colors ${
            isTrustedOnly
              ? "bg-emerald-600 border-emerald-755 text-white"
              : "bg-white border-slate-205 text-slate-500"
          }`}>
            {isTrustedOnly ? "VERIFIED" : "OFF"}
          </span>
        </button>

        {/* Auto-Group Incidents Toggle */}
        <button
          id="auto-group-incidents-toggle"
          type="button"
          onClick={() => onChange({ ...filters, autoGroupEvents: !filters.autoGroupEvents })}
          className={`w-full flex items-center justify-between p-2.5 rounded border text-xs font-semibold cursor-pointer transition-all duration-150 ${
            filters.autoGroupEvents
              ? "bg-indigo-50 border-indigo-300 text-indigo-800 shadow-sm ring-1 ring-indigo-500/10"
              : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-700"
          }`}
          title="Group nearby incidents into single cluster summary cards in the list instead of individual items"
        >
          <div className="flex items-center gap-2">
            <Layers size={13} className={filters.autoGroupEvents ? "text-indigo-650" : "text-slate-400"} />
            <span>Auto-Group Incidents</span>
          </div>
          <span className={`font-mono text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded border leading-none transition-colors ${
            filters.autoGroupEvents
              ? "bg-indigo-600 border-indigo-755 text-white"
              : "bg-white border-slate-205 text-slate-500"
          }`}>
            {filters.autoGroupEvents ? "CLUSTERS" : "OFF"}
          </span>
        </button>

        {/* Toggle Global Incident Density Layer */}
        <button
          id="global-incident-density-toggle"
          type="button"
          onClick={() => onChange({ ...filters, showIncidentDensity: !filters.showIncidentDensity })}
          className={`w-full flex items-center justify-between p-2.5 rounded border text-xs font-semibold cursor-pointer transition-all duration-150 ${
            filters.showIncidentDensity
              ? "bg-purple-50 border-purple-300 text-purple-800 shadow-sm ring-1 ring-purple-500/10"
              : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-700"
          }`}
          title="Toggle global incident density visualization on the map to identify areas with high concentrations of activity"
        >
          <div className="flex items-center gap-2">
            <Radio size={13} className={filters.showIncidentDensity ? "text-purple-650 animate-pulse" : "text-slate-400"} />
            <span>Global Incident Density View</span>
          </div>
          <span className={`font-mono text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded border leading-none transition-colors ${
            filters.showIncidentDensity
              ? "bg-purple-600 border-purple-755 text-white"
              : "bg-white border-slate-205 text-slate-500"
          }`}>
            {filters.showIncidentDensity ? "ACTIVE" : "OFF"}
          </span>
        </button>

        {/* Geographic Distance-Based Proximity Radar */}
        <div id="proximity-radar-filter" className="space-y-1.5 pb-2">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
            <Compass size={11} className="text-blue-500" /> Geographic Proximity Radar
          </label>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 shadow-sm">
            {/* GPS Core Setup status */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold text-slate-700">Radar Center Point</span>
                {filters.userLat !== null && filters.userLng !== null ? (
                  <span className="text-[9.5px] font-mono text-blue-600 truncate font-semibold">
                    {filters.userLat === 52.1332 && filters.userLng === -106.67 ? (
                      "Saskatoon Fallback (52.1332, -106.6700)"
                    ) : (
                      `GPS (${filters.userLat.toFixed(4)}, ${filters.userLng.toFixed(4)})`
                    )}
                  </span>
                ) : (
                  <span className="text-[9.5px] text-slate-450 italic">No geolocation active.</span>
                )}
              </div>

              {filters.userLat !== null && filters.userLng !== null ? (
                <button
                  type="button"
                  id="btn-clear-proximity"
                  onClick={clearProximity}
                  className="px-2 py-1 text-[9.5px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors cursor-pointer shrink-0"
                >
                  Clear GPS
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-detect-proximity"
                  onClick={detectLocation}
                  disabled={geoLoading}
                  className="px-2.5 py-1 text-[9.5px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 disabled:opacity-50 rounded border border-blue-200 transition-colors cursor-pointer shrink-0"
                >
                  {geoLoading ? "Interrogating..." : "Detect Location"}
                </button>
              )}
            </div>

            {/* Warning Fallback notices */}
            {geoErrorMsg && (
              <p className="text-[9px] text-amber-600 leading-normal font-medium bg-amber-50 border border-amber-200 p-1.5 rounded font-mono">
                {geoErrorMsg}
              </p>
            )}

            {/* Slider & Presets Selector */}
            {filters.userLat !== null && filters.userLng !== null ? (
              <div className="space-y-2 pt-1 border-t border-slate-150/70">
                <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-650">
                  <span>Proximity Radius</span>
                  <span className="font-mono text-[10px] font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shadow-sm shrink-0">
                    {filters.searchRadiusKm === "all" ? "SHOW ALL" : `${filters.searchRadiusKm} km`}
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="40"
                  step="1"
                  value={filters.searchRadiusKm === "all" ? 40 : filters.searchRadiusKm}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onChange({ ...filters, searchRadiusKm: val === 40 ? "all" : val });
                  }}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />

                {/* Pre-set Radius quick tap buttons */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {([1, 5, 10, "all"] as const).map((preset) => {
                    const isSelected =
                      preset === "all" ? filters.searchRadiusKm === "all" : filters.searchRadiusKm === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onChange({ ...filters, searchRadiusKm: preset })}
                        className={`py-1 rounded text-[10px] font-extrabold font-mono text-center transition-colors border cursor-pointer ${
                          isSelected
                            ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                            : "bg-white border-slate-250 hover:bg-slate-50 text-slate-600"
                        }`}
                      >
                        {preset === "all" ? "All" : `${preset}km`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-450 leading-normal text-center bg-slate-100/50 p-2.5 rounded border border-slate-200 border-dashed">
                Activate geolocation to filter incidents surrounding your current location (e.g., 1km, 5km, 10km).
              </p>
            )}
          </div>
        </div>

        {/* Real-time Geofence Alarms / Desktop Alert checks */}
        <div id="realtime-geofence-alerts" className="space-y-1.5 pb-2">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Bell size={11} className="text-violet-600" /> Geofence Safety Alarms
            </span>
            <span className={`inline-flex items-center gap-1 text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded border ${
              isAlertScannerActive
                ? "text-emerald-700 bg-emerald-50 border-emerald-250"
                : "text-slate-500 bg-slate-50 border-slate-200"
            }`}>
              {isAlertScannerActive ? (
                <>
                  <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full inline-block animate-ping" />
                  RADAR ON
                </>
              ) : (
                "STANDBY"
              )}
            </span>
          </label>
          
          <div className="bg-[#FAF9FF] border border-violet-105 rounded-lg p-3 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] font-extrabold text-slate-800 leading-tight">Proximity Alert Scanner</p>
                <p className="text-[9.5px] text-slate-550 leading-normal">
                  Scans background GPS and alerts you if a critical/high severity safety event occurs within a 2km radius.
                </p>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => onToggleAlertScanner(!isAlertScannerActive)}
                className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isAlertScannerActive ? "bg-violet-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isAlertScannerActive ? "translate-x-4.5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* GPS Requirements */}
            {isAlertScannerActive && (
              <div className="space-y-2 pt-2 border-t border-violet-100/75 text-[10px] text-slate-650">
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                  <span className="flex items-center gap-1">
                    <Radio size={9} className="text-violet-500 animate-pulse" />
                    Scan Rate: 60s
                  </span>
                  <span>
                    {lastAlertScanTime ? (
                      `Last checked: ${new Date(lastAlertScanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                    ) : (
                      "Waiting for scan..."
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1.5 font-bold pt-1">
                  <span className="text-slate-500">Alerted History Log:</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] border ${
                    alertedCount > 0 
                      ? "bg-red-50 text-red-700 border-red-150 font-extrabold" 
                      : "bg-slate-100 text-slate-550 border-slate-200 font-mono"
                  }`}>
                    {alertedCount === 1 ? "1 Incident Triggered" : alertedCount > 1 ? `${alertedCount} Incidents Triggered` : "0 Warnings Triggered"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={onTriggerManualScan}
                    className="py-1 px-1.5 text-[9px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded border border-violet-200 transition-colors cursor-pointer text-center flex items-center justify-center gap-1 uppercase tracking-wider"
                  >
                    <RefreshCw size={9} /> Scan GPS Now
                  </button>
                  <button
                    type="button"
                    onClick={onClearAlertHistory}
                    disabled={alertedCount === 0}
                    className="py-1 px-1.5 text-[9px] font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 rounded border border-slate-250 transition-colors cursor-pointer text-center uppercase tracking-wider"
                  >
                    Reset Count
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Date Time frame Interval */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
            <Calendar size={11} /> Incident History Interval
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "Last 24 Hours", value: "24" },
              { label: "Last 7 Days", value: "168" },
              { label: "Last 30 Days", value: "720" },
              { label: "All Incidents", value: "all" },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => handleTimeChange(t.value)}
                className={`py-1.5 px-2 rounded text-[11px] text-center cursor-pointer font-semibold border transition-colors ${
                  filters.timeRangeHours === t.value
                    ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm"
                    : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Severity Classification - Multi-select Dropdown */}
        <div className="space-y-2 relative" ref={severityDropdownRef}>
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-amber-500" /> Threat Severity Level
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAllSeverities}
                className="text-[9px] font-bold font-mono text-blue-600 hover:text-blue-800 cursor-pointer uppercase transition-colors"
                title="Select all severity categories"
              >
                [All]
              </button>
              <button
                type="button"
                onClick={handleClearAllSeverities}
                className="text-[9px] font-bold font-mono text-slate-400 hover:text-slate-600 cursor-pointer uppercase transition-colors"
                title="Clear all severity categories"
              >
                [None]
              </button>
            </div>
          </div>

          {/* Selector Button with capsule badges */}
          <button
            type="button"
            onClick={() => setIsSeverityDropdownOpen(!isSeverityDropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-lg text-xs cursor-pointer select-none transition-all duration-150 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-1.5 overflow-hidden max-w-[85%]">
              {filters.severities.length === 0 ? (
                <span className="text-slate-400 italic">Select threat severities...</span>
              ) : filters.severities.length === 4 ? (
                <span className="font-semibold text-slate-700 bg-slate-200/70 border border-slate-300 px-2 py-0.5 rounded text-[10.5px]">
                  All Severities Selected
                </span>
              ) : (
                (["critical", "high", "medium", "low"] as SeverityType[]).map((sev) => {
                  if (!filters.severities.includes(sev)) return null;
                  let bgBadge = "";
                  let textBadge = "";
                  if (sev === "critical") {
                    bgBadge = "bg-red-50 border-red-200 text-red-700";
                    textBadge = "💡 Critical";
                  } else if (sev === "high") {
                    bgBadge = "bg-orange-50 border-orange-200 text-orange-750";
                    textBadge = "⚠️ High";
                  } else if (sev === "medium") {
                    bgBadge = "bg-yellow-50 border-yellow-250 text-yellow-850";
                    textBadge = "🔔 Medium";
                  } else {
                    bgBadge = "bg-slate-100 border-slate-300 text-slate-700";
                    textBadge = "ℹ️ Low";
                  }
                  return (
                    <span key={sev} className={`font-semibold border text-[9.5px] px-1.5 py-0.5 rounded flex items-center gap-0.5 leading-none select-none ${bgBadge}`}>
                      {textBadge}
                    </span>
                  );
                })
              )}
            </div>
            {isSeverityDropdownOpen ? <ChevronUp size={14} className="text-slate-500 shrink-0" /> : <ChevronDown size={14} className="text-slate-500 shrink-0" />}
          </button>

          {/* Dropdown Options List Box */}
          {isSeverityDropdownOpen && (
            <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white border border-slate-205 rounded-lg shadow-xl p-2 z-[600] space-y-1 animate-fadeIn">
              {(["critical", "high", "medium", "low"] as SeverityType[]).map((sev) => {
                const isChecked = filters.severities.includes(sev);
                
                let textClasses = "";
                let checkboxBorderClass = "";
                let checkboxBgClass = "";
                let glowColor = "";

                if (sev === "critical") {
                  textClasses = "text-red-750 font-bold";
                  checkboxBorderClass = "border-red-450 checked:bg-red-650 focus:ring-red-300";
                  checkboxBgClass = isChecked ? "bg-red-50/60 border-red-200" : "border-transparent hover:bg-slate-50";
                  glowColor = "accent-red-600";
                } else if (sev === "high") {
                  textClasses = "text-orange-755 font-bold";
                  checkboxBorderClass = "border-orange-450 checked:bg-orange-550 focus:ring-orange-300";
                  checkboxBgClass = isChecked ? "bg-orange-50/60 border-orange-200" : "border-transparent hover:bg-slate-50";
                  glowColor = "accent-orange-500";
                } else if (sev === "medium") {
                  textClasses = "text-yellow-850 font-bold";
                  checkboxBorderClass = "border-yellow-500 checked:bg-yellow-500 focus:ring-yellow-400";
                  checkboxBgClass = isChecked ? "bg-yellow-50/60 border-yellow-200" : "border-transparent hover:bg-slate-50";
                  glowColor = "accent-yellow-500";
                } else {
                  textClasses = "text-slate-705 font-bold";
                  checkboxBorderClass = "border-slate-400 checked:bg-slate-500 focus:ring-slate-300";
                  checkboxBgClass = isChecked ? "bg-slate-100/60 border-slate-200" : "border-transparent hover:bg-slate-50";
                  glowColor = "accent-slate-500";
                }

                return (
                  <label
                    key={sev}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer select-none transition-all duration-150 ${checkboxBgClass}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleSeverityToggle(sev)}
                      className={`h-3.5 w-3.5 rounded text-indigo-600 border focus:ring-1 focus:ring-offset-0 ${glowColor} ${checkboxBorderClass} cursor-pointer`}
                    />
                    <div className="flex-1 flex items-center justify-between">
                      <span className={`capitalize font-semibold ${textClasses}`}>{sev}</span>
                      <span className="text-[10px] font-mono text-slate-400 font-semibold bg-white px-1.5 py-0.2 rounded border border-slate-100 uppercase select-none">
                        {sev === "critical" && "💡 Critical"}
                        {sev === "high" && "⚠️ High"}
                        {sev === "medium" && "🔔 Medium"}
                        {sev === "low" && "ℹ️ Low"}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Severity Distribution Donut Chart Section */}
        <div id="severity-distribution-section" className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Layers size={11} className="text-blue-500" /> Severity Distribution
            </span>
            <span className="text-[8px] bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
              Interactive
            </span>
          </label>

          <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 space-y-2 select-none shadow-sm">
            {totalMatchingIncidents === 0 ? (
              <div className="text-center py-5 text-[10.5px] text-slate-400 font-semibold bg-white rounded border border-slate-200">
                No active events match current filters.
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-2 items-center">
                {/* Donut Portion */}
                <div className="col-span-5 h-[110px] flex items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={44}
                        paddingAngle={3}
                        dataKey="value"
                        onClick={(data, idx) => handleSegmentClick(data, idx)}
                      >
                        {severityDistribution.map((entry, idx) => {
                          const isChecked = filters.severities.includes(entry.name);
                          const isAnyOtherChecked = filters.severities.length > 0 && !isChecked;
                          return (
                            <Cell
                              key={`cell-${idx}`}
                              fill={entry.color}
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              stroke={isChecked ? "#1E293B" : "#F8FAFC"}
                              strokeWidth={isChecked ? 2.5 : 1}
                              opacity={isAnyOtherChecked ? 0.35 : 1.0}
                            />
                          );
                        })}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Mid-donut info summary text */}
                  <div className="absolute flex flex-col items-center justify-center text-center select-none pointer-events-none">
                    <span className="text-[7.5px] uppercase font-bold text-slate-400 tracking-wider leading-none">Total</span>
                    <span className="text-[14px] font-black text-slate-800 font-mono leading-none mt-0.5">{totalMatchingIncidents}</span>
                  </div>
                </div>

                {/* Legend checklist list */}
                <div className="col-span-7 space-y-1 pl-1">
                  {severityDistribution.map((item) => {
                    const pct = totalMatchingIncidents > 0
                      ? Math.round((item.value / totalMatchingIncidents) * 100)
                      : 0;
                    const isSelected = filters.severities.includes(item.name);
                    const isAnyOtherChecked = filters.severities.length > 0 && !isSelected;

                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => handleSeverityToggle(item.name as SeverityType)}
                        className={`w-full text-left flex items-center justify-between p-1 rounded hover:bg-white border border-transparent transition-all cursor-pointer text-[10.5px] select-none ${
                          isSelected
                            ? "bg-white border-slate-200 shadow-sm font-bold scale-102 ring-1 ring-blue-500/5 text-blue-755 animate-in fade-in duration-100"
                            : "text-slate-600 hover:text-slate-850"
                        } ${isAnyOtherChecked ? "opacity-45 hover:opacity-100" : "opacity-100"}`}
                      >
                        <div className="flex items-center gap-1.5 truncate font-semibold">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                          <span className="capitalize font-semibold truncate text-[10.5px]">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-1 font-mono text-[9px] shrink-0 text-right leading-none">
                          <span className={`${isSelected ? "text-blue-750 font-black" : "text-slate-650 font-extrabold"}`}>{item.value}</span>
                          <span className="text-slate-400">({pct}%)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-[8.5px] text-slate-400 font-sans italic text-center leading-normal font-medium mt-1">
              * Click segments of the donut chart above or the list elements to toggle filters.
            </p>
          </div>
        </div>

        {/* Category specific filters - Dynamic Multi-Select Checkbox Group */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
              <ListFilter size={11} /> Incident Category Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...filters, eventTypes: [...availableTypes] })}
                className="text-[9px] font-bold font-mono text-blue-600 hover:text-blue-800 cursor-pointer uppercase transition-colors"
                title="Select all incident categories"
              >
                [All]
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...filters, eventTypes: [] })}
                className="text-[9px] font-bold font-mono text-slate-400 hover:text-slate-600 cursor-pointer uppercase transition-colors"
                title="Clear all incident categories"
              >
                [Clear]
              </button>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-250 space-y-1.5">
            {availableTypes.length === 0 ? (
              <div className="text-center py-4 text-[10px] text-slate-400 font-semibold bg-white rounded border border-slate-200">
                No categories available
              </div>
            ) : (
              availableTypes.map((type) => {
                const isChecked = filters.eventTypes.includes(type);
                const count = categoryCounts[type] || 0;
                
                return (
                  <label
                    key={type}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer select-none transition-all duration-150 ${
                      isChecked
                        ? "bg-blue-50/50 text-blue-900 border-blue-200 font-semibold"
                        : "bg-white border-slate-200 hover:bg-slate-50 text-slate-650"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTypeToggle(type)}
                      className="h-3.5 w-3.5 rounded text-blue-600 border border-slate-350 focus:ring-1 focus:ring-blue-500 cursor-pointer accent-blue-650"
                    />
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <span className="truncate pr-1">{formatTypeLabel(type)}</span>
                      <span className="text-[9px] font-mono text-slate-455 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                        {count} {count === 1 ? "alert" : "alerts"}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <p className="text-[8.5px] text-slate-400 font-sans italic leading-normal font-medium px-0.5">
            * Check one or more boxes to isolate specific incident categories. If no boxes are checked, events from all categories are displayed.
          </p>
        </div>

        {/* Intelligence Source Tiers Checkboxes */}
        <div id="source-tiers-filter" className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
              <Layers size={11} className="text-indigo-500" /> Intelligence Source Tiers
            </label>
            <div className="flex gap-2 text-[9px] font-bold font-mono">
              <button
                type="button"
                onClick={() => onChange({ ...filters, sourceTiers: [1, 2, 3, 4] })}
                className="text-blue-600 hover:text-blue-800 uppercase cursor-pointer"
              >
                [All]
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...filters, sourceTiers: [] })}
                className="text-slate-400 hover:text-slate-650 uppercase cursor-pointer"
              >
                [None]
              </button>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
            {[
              { tier: 1, label: "Tier 1: Official Incidents", desc: "Police, RCMP, SIRT, Live Dispatched Alerts", badge: "🛡️ Official" },
              { tier: 2, label: "Tier 2: Verified Reporting", desc: "CBC, CTV, Global, Commercial News", badge: "📰 Media" },
              { tier: 3, label: "Tier 3: Advisories / Map Layers", desc: "Municipal Council, Weather, Crime Map Approx", badge: "⚠️ Advisory" },
              { tier: 4, label: "Tier 4: Derived Intel / Templates", desc: "AI Summaries, Fused Clusters, Predictions", badge: "🤖 Derived" }
            ].map(({ tier, label, desc, badge }) => {
              const isChecked = filters.sourceTiers?.includes(tier) ?? true;
              const handleTierToggle = () => {
                const currentTiers = filters.sourceTiers || [1, 2, 3, 4];
                const updated = currentTiers.includes(tier)
                  ? currentTiers.filter(t => t !== tier)
                  : [...currentTiers, tier];
                onChange({ ...filters, sourceTiers: updated });
              };

              return (
                <label
                  key={tier}
                  className={`flex flex-col p-2 rounded border text-xs cursor-pointer select-none transition-all duration-150 ${
                    isChecked
                      ? "bg-white border-slate-350 shadow-soft"
                      : "bg-white/40 border-slate-205 text-slate-400 opacity-65 hover:opacity-100"
                  }`}
                  id={`tier-card-${tier}`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      value={tier}
                      id={`tier-input-checkbox-${tier}`}
                      onChange={handleTierToggle}
                      className="h-3.5 w-3.5 rounded text-blue-600 border border-slate-300 focus:ring-1 focus:ring-blue-500 cursor-pointer accent-blue-600"
                    />
                    <div className="flex-grow flex items-center justify-between font-bold text-slate-700">
                      <span>{label}</span>
                      <span className="text-[8.5px] font-mono bg-slate-100 border px-1.5 py-0.2 rounded shrink-0">{badge}</span>
                    </div>
                  </div>
                  <span className="pl-5.5 text-[9.5px] text-slate-450 mt-0.5 leading-snug font-medium">{desc}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Publisher Sources list */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
            <Layers size={11} /> Official Publisher Sources
          </label>
          <div className="space-y-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs">
            <button
              onClick={() => handleSourceChange("all")}
              className={`w-full text-left py-1.5 px-1.5 rounded font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                filters.sourceKey === "all" ? "bg-white text-blue-600 font-bold shadow-sm border border-slate-150" : "text-slate-600 hover:bg-white/50"
              }`}
            >
              <span>All Sources</span>
              {filters.sourceKey === "all" && <span className="h-1.5 w-1.5 bg-blue-600 rounded-full"></span>}
            </button>
            {availableSources.map((src) => (
              <button
                key={src.key}
                onClick={() => handleSourceChange(src.key)}
                className={`w-full text-left py-1.5 px-1.5 rounded font-slate-600 font-semibold flex items-center justify-between text-ellipsis overflow-hidden whitespace-nowrap transition-colors cursor-pointer ${
                  filters.sourceKey === src.key ? "bg-white text-blue-600 font-bold shadow-sm border border-slate-150" : "text-slate-600 hover:bg-white/50"
                }`}
                title={src.name}
              >
                <span className="text-ellipsis overflow-hidden whitespace-nowrap">{src.name}</span>
                {filters.sourceKey === src.key && <span className="h-1.5 w-1.5 bg-blue-600 rounded-full"></span>}
              </button>
            ))}
          </div>
        </div>

        {/* Offline Records Export */}
        <div className="space-y-2 pt-2 border-t border-slate-100 flex flex-col">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
            <Download size={11} className="text-slate-500" /> Offline Records Export
          </label>
          <div id="export-controls-container" className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <p className="text-[10px] text-slate-500 leading-normal font-medium">
              Maintain durable safety logs of the currently filtered <strong className="font-bold text-slate-700">{filteredEvents.length} incidents</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                id="export-csv-btn"
                onClick={() => exportToCSV(filteredEvents)}
                disabled={filteredEvents.length === 0}
                className="cursor-pointer bg-white border border-slate-200 text-slate-700 font-bold text-[10.5px] px-2.5 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors hover:bg-emerald-50 hover:border-emerald-250 hover:text-emerald-700 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-700 disabled:hover:border-slate-200 shadow-sm"
                title="Export list as Comma-Separated Values for Excel/Numbers"
              >
                <FileSpreadsheet size={13} className="text-emerald-600 shrink-0" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                id="export-pdf-btn"
                onClick={() => exportToPDF(filteredEvents)}
                disabled={filteredEvents.length === 0}
                className="cursor-pointer bg-white border border-slate-200 text-slate-700 font-bold text-[10.5px] px-2.5 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors hover:bg-rose-50 hover:border-rose-250 hover:text-rose-700 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-700 disabled:hover:border-slate-200 shadow-sm"
                title="Generate a high-fidelity printable incident summary PDF"
              >
                <FileText size={13} className="text-rose-600 shrink-0" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Settings */}
        <div className="space-y-2 pt-2 border-t border-slate-100 flex flex-col">
          <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 flex items-center gap-1.5">
            <Settings size={11} /> Dashboard Settings
          </label>
          <div id="dashboard-settings-container" className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Auto-Refresh Feeds</span>
              <button
                id="auto-refresh-toggle"
                type="button"
                onClick={() => onToggleAutoRefresh(!autoRefreshEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoRefreshEnabled ? "bg-blue-600" : "bg-slate-200"
                }`}
              >
                <span
                  id="auto-refresh-toggle-knob"
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoRefreshEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-normal font-medium">
              Automatically trigger feed crawler and data ingestion every 60 minutes.
            </p>
            {autoRefreshEnabled && nextRefreshMinutesLeft !== null && (
              <div id="countdown-status-indicator" className="flex items-center gap-1.5 pt-1 text-[9px] font-mono text-blue-600 font-semibold animate-pulse">
                <span className="h-1.5 w-1.5 bg-blue-600 rounded-full"></span>
                <span>Next update in {nextRefreshMinutesLeft} min</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mini App footer info */}
      <div className="p-3 border-t border-slate-100 text-[10px] font-mono text-slate-400 shrink-0 bg-slate-50 text-center">
        Saskatoon safety map dashboard v2.0
      </div>
    </div>
  );
}
