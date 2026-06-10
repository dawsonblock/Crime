import React, { useEffect, useState, useMemo } from "react";
import { AlertCircle, ShieldAlert, Sparkles, X, ChevronRight, HelpCircle, Navigation, Info, ExternalLink, Bookmark, TrendingUp, Upload, Download, BarChart3, Wifi, WifiOff, MessageSquare, MapPin, ArrowLeftRight } from "lucide-react";
import { EventItem, EventSource } from "./types";
import EventFilters, { FilterState } from "./components/EventFilters";
import IncidentMap from "./components/IncidentMap";
import EventDrawer from "./components/EventDrawer";
import MapLegend from "./components/MapLegend";
import IncidentTimeline from "./components/IncidentTimeline";
import ReportModal from "./components/ReportModal";
import SourceBadge from "./components/SourceBadge";
import DailySummary from "./components/DailySummary";
import TrendsPanel from "./components/TrendsPanel";
import UploadNewsPanel from "./components/UploadNewsPanel";
import RiskAssessment from "./components/RiskAssessment";
import BookmarksPanel from "./components/BookmarksPanel";
import RegionalMetricsModal from "./components/RegionalMetricsModal";
import SafetyChatbot from "./components/SafetyChatbot";
import PrintableIncidentReport from "./components/PrintableIncidentReport";
import CompareIncidentsPanel from "./components/CompareIncidentsPanel";

export default function App() {
  // Application Data States
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sources, setSources] = useState<EventSource[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>({});

  // Compare Incidents States
  const [compareEventIds, setCompareEventIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState<boolean>(false);

  const handleToggleCompare = (eventId: string) => {
    setCompareEventIds((prev) => {
      if (prev.includes(eventId)) {
        return prev.filter((id) => id !== eventId);
      }
      if (prev.length >= 2) {
        setSuccessToast("Maximum of 2 incidents can be selected. Swapping comparison target.");
        return [prev[1], eventId];
      }
      return [...prev, eventId];
    });
  };

  // Auto-Refresh States
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(false);
  const [nextRefreshMinutesLeft, setNextRefreshMinutesLeft] = useState<number | null>(null);

  // Online / Offline tracking states
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Toggle States & App Controls
  const [sidebarTab, setSidebarTab] = useState<"list" | "summary" | "trends" | "risk" | "upload_news" | "bookmarks" | "chat">("list");
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState<boolean>(false);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.18);

  const handleToggleHeatmapOpacity = () => {
    // Opacity cycles through 0.06 (Low), 0.18 (Medium), 0.35 (High)
    setHeatmapOpacity(prev => {
      if (prev === 0.18) return 0.35;
      if (prev === 0.35) return 0.06;
      return 0.18;
    });
  };
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters State
  const [filters, setFilters] = useState<FilterState>({
    timeRangeHours: "all",
    severities: ["critical", "high", "medium", "low"],
    eventType: "all",
    sourceKey: "all",
    searchQuery: "",
    showBookmarksOnly: false,
    searchRadiusKm: "all",
    userLat: null,
    userLng: null,
  });

  // Saskatchewan Regional Cities & Major Hubs configuration
  const SASKATCHEWAN_CITIES = useMemo(() => [
    { name: "Saskatchewan (All)", coords: [52.9399, -106.4509] as [number, number] },
    { name: "Saskatoon", coords: [52.1332, -106.6700] as [number, number] },
    { name: "Regina", coords: [50.4452, -104.6189] as [number, number] },
    { name: "Prince Albert", coords: [53.2033, -105.7531] as [number, number] },
    { name: "Moose Jaw", coords: [50.3933, -105.5519] as [number, number] },
    { name: "Swift Current", coords: [50.2853, -107.7977] as [number, number] },
    { name: "Yorkton", coords: [51.2139, -102.4628] as [number, number] },
    { name: "North Battleford", coords: [52.7576, -108.2861] as [number, number] },
    { name: "Estevan", coords: [49.1394, -102.9856] as [number, number] },
    { name: "Weyburn", coords: [49.6608, -103.8525] as [number, number] },
    { name: "Lloydminster", coords: [53.2785, -110.0051] as [number, number] }
  ], []);

  const [selectedCity, setSelectedCity] = useState<string>(() => {
    try {
      return localStorage.getItem("SASKATCHEWAN_LIVEMAP_CITY") || "Saskatchewan (All)";
    } catch {
      return "Saskatchewan (All)";
    }
  });

  const handleCityChange = (cityName: string) => {
    setSelectedCity(cityName);
    try {
      localStorage.setItem("SASKATCHEWAN_LIVEMAP_CITY", cityName);
    } catch (e) {
      console.error(e);
    }
  };

  const activeCityCoords = useMemo(() => {
    const match = SASKATCHEWAN_CITIES.find(c => c.name === selectedCity);
    return match ? match.coords : [52.9399, -106.4509] as [number, number];
  }, [selectedCity, SASKATCHEWAN_CITIES]);

  // 1. Fetch initial seeds & active sources on load
  const loadData = async () => {
    try {
      setErrorMessage(null);
      const [eventsRes, sourcesRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/sources"),
      ]);

      if (!eventsRes.ok || !sourcesRes.ok) {
        throw new Error("Failed to receive structured updates from local Express api.");
      }

      const eventsData = await eventsRes.json();
      const sourcesData = await sourcesRes.json();

      setEvents(eventsData);
      setSources(sourcesData);
    } catch (err: any) {
      console.error("Failed to load initial Saskatoon safety data:", err);
      setErrorMessage("Safety database is loading or starting. Retrying connection...");
      // Graceful local fetch retry after 3 seconds to handle server spin-up latency
      setTimeout(loadData, 3000);
    }
  };

  useEffect(() => {
    loadData();

    // Register active PWA Service Worker for caching map tiles and incident feeds
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then((reg) => {
          console.log("[PWA Service Worker] Registration successful with scope:", reg.scope);
        })
        .catch((err) => {
          console.error("[PWA Service Worker] Registration failed:", err);
        });
    }

    // Connect online/offline event handlers
    const handleOnline = () => {
      setIsOnline(true);
      setSuccessToast("Internet connection restored! Synced latest Saskatoon safety feeds.");
      loadData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setErrorMessage("Network signal lost. Operating in Cache Mode with saved Saskatchewan maps and incident feeds.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Load initial bookmarks from standard safe LocalStorage keys
    try {
      const stored = localStorage.getItem("saskatoon_bookmarks");
      if (stored) {
        setBookmarks(JSON.parse(stored));
      }
      const storedNotes = localStorage.getItem("saskatoon_bookmark_notes");
      if (storedNotes) {
        setBookmarkNotes(JSON.parse(storedNotes));
      }
      const storedRefresh = localStorage.getItem("saskatoon_auto_refresh");
      if (storedRefresh === "true") {
        setAutoRefreshEnabled(true);
      }
    } catch (e) {
      console.error("Local storage bookmarks retrieval rejected:", e);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 2. Clear success toast messages after 4 seconds
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // 2b. URL Deep Link selection parser (?event=eventId)
  useEffect(() => {
    if (events.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const eventId = params.get("event");
      if (eventId) {
        const found = events.find((e) => e.id === eventId);
        if (found) {
          setSelectedEvent(found);
        }
      }
    }
  }, [events]);

  // 3. Dual Bookmarking persistence handling
  const handleToggleBookmark = (eventId: string) => {
    let updated: string[];
    const updatedNotes = { ...bookmarkNotes };
    if (bookmarks.includes(eventId)) {
      updated = bookmarks.filter((id) => id !== eventId);
      delete updatedNotes[eventId];
      setSuccessToast("Removed from bookmarked safety watchlist.");
    } else {
      updated = [...bookmarks, eventId];
      setSuccessToast("Added incident pin to bookmarked safety watchlist.");
    }

    setBookmarks(updated);
    setBookmarkNotes(updatedNotes);
    try {
      localStorage.setItem("saskatoon_bookmarks", JSON.stringify(updated));
      localStorage.setItem("saskatoon_bookmark_notes", JSON.stringify(updatedNotes));
    } catch (e) {
      console.error("Writing bookmarks to local storage failed:", e);
    }
  };

  const handleUpdateBookmarkNote = (eventId: string, noteText: string) => {
    const updatedNotes = { ...bookmarkNotes, [eventId]: noteText };
    setBookmarkNotes(updatedNotes);
    try {
      localStorage.setItem("saskatoon_bookmark_notes", JSON.stringify(updatedNotes));
    } catch (e) {
      console.error("Writing bookmark notes to local storage failed:", e);
    }
  };

  // --- REAL-TIME PROXIMITY ALERT SCANNER ENGINE STATES ---
  const [isAlertScannerActive, setIsAlertScannerActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem("saskatoon_proximity_alerts_active") === "true";
    } catch {
      return false;
    }
  });

  const [alertedEventIds, setAlertedEventIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("saskatoon_alerted_events");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [lastAlertScanTime, setLastAlertScanTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem("saskatoon_last_alert_scan_time") || null;
    } catch {
      return null;
    }
  });

  const [notificationPermission, setNotificationPermission] = useState<string>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "unsupported";
  });

  const alertedEventIdsRef = React.useRef<string[]>([]);
  
  useEffect(() => {
    alertedEventIdsRef.current = alertedEventIds;
  }, [alertedEventIds]);

  const runProximityAlertScan = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.warn("Desktop notifications not supported in this environment.");
      return;
    }

    if (Notification.permission !== "granted") {
      setNotificationPermission(Notification.permission);
      return;
    }

    if (!navigator.geolocation) {
      console.warn("Geolocation not supported for real-time safety geofence checks.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const nowStr = new Date().toISOString();
        setLastAlertScanTime(nowStr);
        try {
          localStorage.setItem("saskatoon_last_alert_scan_time", nowStr);
        } catch {}

        // Find matches: high or critical event within 2km
        const alertsToTrigger: EventItem[] = [];
        const currentAlertedIds = [...alertedEventIdsRef.current];
        let hasNewAlert = false;

        events.forEach((evt) => {
          if (evt.severity === "critical" || evt.severity === "high") {
            if (evt.latitude && evt.longitude) {
              const distance = getDistanceKm(latitude, longitude, evt.latitude, evt.longitude);
              if (distance <= 2.0) {
                if (!currentAlertedIds.includes(evt.id)) {
                  alertsToTrigger.push(evt);
                  currentAlertedIds.push(evt.id);
                  hasNewAlert = true;
                }
              }
            }
          }
        });

        if (hasNewAlert) {
          setAlertedEventIds(currentAlertedIds);
          try {
            localStorage.setItem("saskatoon_alerted_events", JSON.stringify(currentAlertedIds));
          } catch {}

          alertsToTrigger.forEach((evt) => {
            const notificationTitle = `🚨 Near ${evt.severity.toUpperCase()} Priority Safety alert!`;
            const notificationBody = `Saskatoon Safety Warning: "${evt.title}" was reported within 2.0 km of your position.`;
            try {
              new Notification(notificationTitle, {
                body: notificationBody,
                tag: evt.id,
              });
            } catch (err) {
              console.error("OS trigger browser Notification rejected:", err);
            }
          });

          const count = alertsToTrigger.length;
          setSuccessToast(`🚨 Geofence check: triggered ${count} alerts for high-priority incidents within 2km!`);
        } else {
          console.log("No new high/critical priority safety threats detected within 2.0 km.");
        }
      },
      (err) => {
        console.warn("Safety alert geofence crawler could not fetch current position:", err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Continuous background alert scanner intervals: scans every 60 seconds
  useEffect(() => {
    if (!isAlertScannerActive || notificationPermission !== "granted") return;

    // Run first scanning cycle immediately upon boot or active toggle
    runProximityAlertScan();

    const scanInterval = setInterval(() => {
      runProximityAlertScan();
    }, 60000);

    return () => clearInterval(scanInterval);
  }, [isAlertScannerActive, notificationPermission, events]);

  const handleToggleAlertScanner = async (enabled: boolean) => {
    if (!enabled) {
      setIsAlertScannerActive(false);
      try {
        localStorage.setItem("saskatoon_proximity_alerts_active", "false");
      } catch {}
      setSuccessToast("Real-time Geofence Proximity alerts disabled.");
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("System Warning: Desktop browser notifications are not supported by this browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setIsAlertScannerActive(true);
        try {
          localStorage.setItem("saskatoon_proximity_alerts_active", "true");
        } catch {}
        setSuccessToast("Real-time GPS proximity notifications active!");

        // Auto-detect GPS coordinates if not already loaded to boot the maps radar
        if (filters.userLat === null) {
          navigator.geolocation.getCurrentPosition((pos) => {
            setFilters(prev => ({
              ...prev,
              userLat: pos.coords.latitude,
              userLng: pos.coords.longitude,
              searchRadiusKm: prev.searchRadiusKm === "all" ? 5 : prev.searchRadiusKm
            }));
          }, () => {});
        }
      } else {
        alert("Notification Permission Denied: Please enable browser notifications for this site to receive safety danger alerts.");
      }
    } catch (err) {
      console.error("Browser system notification authorization failed:", err);
    }
  };

  const handleClearAlertHistory = () => {
    setAlertedEventIds([]);
    try {
      localStorage.setItem("saskatoon_alerted_events", JSON.stringify([]));
    } catch {}
    setSuccessToast("History of geofenced warnings cleared. Fresh alerts can trigger cleanly.");
  };

  // 4. Ingestion Feed Crawler triggers server side via Gemini
  const handleIngestFeeds = async () => {
    setIsIngesting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/ingest/run", { method: "POST" });
      if (!res.ok) {
        throw new Error("Feeds crawl triggered a network rejection response.");
      }
      const data = await res.json();
      if (data.success) {
        // Reload all current active events with fresh list
        await loadData();
        setSuccessToast(data.message || "Feeds ingest cycle finalized successfully!");
        if (data.addedEvents && data.addedEvents.length > 0) {
          // Set selection onto the very first newly parsed event to center and wow the user!
          setSelectedEvent(data.addedEvents[0]);
        }
      }
    } catch (err: any) {
      console.error("Feeds sync cycle failed:", err);
      setErrorMessage("Safety feeds synchronization issue: " + err.message);
    } finally {
      setIsIngesting(false);
    }
  };

  // 4a. Auto-Refresh 60-minutes scheduling effect
  useEffect(() => {
    if (!autoRefreshEnabled) {
      setNextRefreshMinutesLeft(null);
      return;
    }

    setNextRefreshMinutesLeft(60);
    let minutesElapsed = 0;

    const intervalId = setInterval(async () => {
      minutesElapsed += 1;
      const left = 60 - minutesElapsed;
      if (left <= 0) {
        minutesElapsed = 0;
        setNextRefreshMinutesLeft(60);
        console.log("[Auto-Refresh] 60 minutes elapsed, running ingestion pipeline automatically...");
        await handleIngestFeeds();
      } else {
        setNextRefreshMinutesLeft(left);
      }
    }, 60 * 1000); // 1 minute ticks

    return () => clearInterval(intervalId);
  }, [autoRefreshEnabled]);

  const handleToggleAutoRefresh = (enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
    try {
      localStorage.setItem("saskatoon_auto_refresh", String(enabled));
    } catch (e) {
      console.error("Writing auto-refresh settings failed:", e);
    }
    if (enabled) {
      setSuccessToast("Auto-Refresh enabled. Crawler will run every 60 minutes.");
    } else {
      setSuccessToast("Auto-Refresh disabled.");
      setNextRefreshMinutesLeft(null);
    }
  };

  const exportListToCSV = (eventsToExport: EventItem[]) => {
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
    setSuccessToast("CSV export compiled and downloaded successfully!");
  };

  // 5. Interactive manual reporting dynamic geocoder submit logic
  const handleReportSubmit = async (rawText: string, originalUrl: string, mode: "rule-based" | "ai" = "rule-based"): Promise<boolean> => {
    try {
      const res = await fetch("/api/events/report-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, originalUrl, mode }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Report submission rejected.");
      }

      const data = await res.json();
      if (data.success) {
        await loadData();
        setSuccessToast(data.message || "Manual incident geolocated and pinned successfully!");
        if (data.addedEvents && data.addedEvents.length > 0) {
          // Highlight the manual geocoded event immediately on map
          setSelectedEvent(data.addedEvents[0]);
        }
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("Manual geocoding submission rejected:", err);
      throw err;
    }
  };

  // Haversine formula calculation helper
  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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
  };

  // 6. Dynamic client-side Event filtering engine logic
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      // City selection filter match
      if (selectedCity && selectedCity !== "Saskatchewan (All)") {
        const cityLower = selectedCity.toLowerCase();
        const eventLocLower = (evt.locationText || "").toLowerCase();
        
        const isMatch = eventLocLower.includes(cityLower) || 
                        (cityLower === "saskatoon" && evt.sourceKey.includes("saskatoon")) ||
                        (cityLower === "regina" && evt.sourceKey.includes("regina")) ||
                        (cityLower === "prince albert" && (evt.sourceKey.includes("prince_albert") || eventLocLower.includes("albert"))) ||
                        (cityLower === "moose jaw" && evt.sourceKey.includes("moose_jaw"));
                        
        if (!isMatch) {
          return false;
        }
      }

      // Bookmark filter override check
      if (filters.showBookmarksOnly && !bookmarks.includes(evt.id)) {
        return false;
      }

      // Severity classification match check
      if (filters.severities && !filters.severities.includes(evt.severity)) {
        return false;
      }

      // Incident category type match check
      if (filters.eventType !== "all" && evt.eventType !== filters.eventType) {
        return false;
      }

      // Source Config Match check
      if (filters.sourceKey !== "all" && evt.sourceKey !== filters.sourceKey) {
        return false;
      }

      // Search Query lookup logic (headline, location description, details summaries)
      if (filters.searchQuery.trim().length > 0) {
        const query = filters.searchQuery.toLowerCase();
        const MatchHeadline = evt.title.toLowerCase().includes(query);
        const MatchLocationText = evt.locationText.toLowerCase().includes(query);
        const MatchSummary = evt.summary.toLowerCase().includes(query);
        const MatchSource = evt.sourceName.toLowerCase().includes(query);
        const MatchType = evt.eventType.replace(/_/g, " ").toLowerCase().includes(query);

        if (!MatchHeadline && !MatchLocationText && !MatchSummary && !MatchSource && !MatchType) {
          return false;
        }
      }

      // Timeframe Hours bounds check
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

      // Physical Proximity Search Radius check
      if (
        filters.userLat !== null &&
        filters.userLng !== null &&
        filters.searchRadiusKm !== "all"
      ) {
        if (
          evt.latitude === undefined ||
          evt.longitude === undefined ||
          isNaN(evt.latitude) ||
          isNaN(evt.longitude)
        ) {
          return false;
        }

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
  }, [events, filters, bookmarks]);

  // 7. Extract existing incident category types dynamically for dropdown lists
  const availableTypes = useMemo(() => {
    const list = new Set<string>();
    events.forEach((e) => {
      if (e.eventType) list.add(e.eventType);
    });
    return Array.from(list);
  }, [events]);

  const availableSources = useMemo(() => {
    return configSourcesList;
  }, []);

  const formatDistanceTime = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffHours = Math.floor(diffMs / 3600000);
      if (diffHours <= 0) {
        const mins = Math.floor(diffMs / 60000);
        return mins <= 1 ? "Just now" : `${mins} mins ago`;
      }
      if (diffHours < 24) return `${diffHours}h ago`;
      const days = Math.floor(diffHours / 24);
      return days === 1 ? "1 day ago" : `${days} days ago`;
    } catch {
      return dateStr;
    }
  };

  const getCardSeverityBorder = (sev: string) => {
    switch (sev) {
      case "critical":
        return "border-l-4 border-l-red-650";
      case "high":
        return "border-l-4 border-l-orange-550";
      case "medium":
        return "border-l-4 border-l-yellow-400";
      case "low":
        return "border-l-4 border-l-slate-300";
      default:
        return "border-l-4 border-l-slate-400";
    }
  };

  return (
    <div className="h-screen w-full select-none flex flex-col bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      
      {/* Top Banner Warning Disclaimer & Header */}
      <header className="p-4 border-b border-slate-750 bg-slate-900 text-white flex flex-col gap-3 shrink-0 shadow-sm print-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 border border-blue-500 text-white rounded relative shadow-sm animate-pulse">
              <ShieldAlert size={20} />
              <div className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-slate-900"></div>
            </div>
            <div>
              <h1 className="text-base font-bold font-sans tracking-tight text-white flex flex-wrap items-center gap-2 uppercase">
                <span>Saskatchewan Safety Map</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-blue-400 font-mono tracking-wider font-semibold shrink-0">
                  PROVINCIAL WATCH
                </span>
                
                {/* Connection check pill */}
                {isOnline ? (
                  <span className="text-[9.5px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-mono font-bold tracking-wider flex items-center gap-1.5 normal-case shrink-0 shadow-sm">
                    <Wifi size={10} className="text-emerald-400 animate-pulse" />
                    <span className="flex items-center gap-1">Online <span className="text-[8.5px] text-emerald-500">(Cached Live Sys)</span></span>
                  </span>
                ) : (
                  <span className="text-[9.5px] bg-amber-500/15 border border-amber-500/40 text-amber-400 px-2 py-0.5 rounded-full font-mono font-bold tracking-wider flex items-center gap-1.5 normal-case shrink-0 shadow-sm animate-bounce">
                    <WifiOff size={10} className="text-amber-400" />
                    <span>Saskatchewan Cache Active</span>
                  </span>
                )}
              </h1>
              <p className="text-[11px] text-slate-300">
                Private Saskatoon & Saskatchewan community safety watch and geocoded hazard monitor.
              </p>
            </div>
          </div>

          <div className="flex gap-2.5 flex-wrap items-center">
            {/* Saskatchewan Regional Hubs Selector */}
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 focus-within:ring-1 focus-within:ring-blue-500 transition-shadow">
              <MapPin size={13} className="text-blue-400 shrink-0" />
              <label htmlFor="city-selector-dropdown" className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono select-none">
                Regional Hub:
              </label>
              <select
                id="city-selector-dropdown"
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value)}
                className="bg-transparent text-white font-sans text-xs font-semibold focus:outline-none cursor-pointer pr-1 outline-none border-none ring-0 select-none [&>option]:bg-slate-900"
              >
                {SASKATCHEWAN_CITIES.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Regional Safety Metrics button */}
            <button
              type="button"
              id="regional-metrics-btn"
              onClick={() => setIsMetricsModalOpen(true)}
              className="cursor-pointer bg-blue-650 hover:bg-blue-600 border border-blue-550 text-white font-semibold text-xs px-3.5 py-2 rounded flex items-center gap-1.5 transition-colors shadow-sm font-sans"
            >
              <BarChart3 size={14} className="text-white" />
              <span>Regional Safety Metrics</span>
            </button>

            {/* Quick help button */}
            <button
              onClick={() => setShowHelpGuide(true)}
              className="cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-semibold text-xs px-3.5 py-2 rounded flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle size={14} className="text-blue-400" />
              <span>Safety Disclaimer</span>
            </button>
            
            {/* Display status */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-950/20 border border-slate-705 py-1.5 px-3 rounded text-[10px] font-mono select-none text-slate-400">
              <span className="text-slate-500 text-[9px]">SYSTEM STATE:</span>
              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full inline-block animate-ping"></span>
                ACTIVE MONITORING
              </span>
            </div>
          </div>
        </div>

        {/* Global Alert Disclaimer strip */}
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3.5 py-2.5 rounded-lg text-xs flex gap-3 leading-relaxed shadow-sm font-medium">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5 animate-bounce" />
          <span className="text-[11.5px] text-slate-700">
            <strong className="font-bold uppercase tracking-widest text-[10px] font-mono mr-1.5 text-amber-800">Safety Notice:</strong>
            Locations are approximate and delay-adjusted. This personal incident map is designed purely for community awareness only and should not be used for emergency situations, accusation decisions, suspect identifiers, or legal determinations.
          </span>
        </div>
      </header>

      {/* Main Full Stack Application Division */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Workspace Panel: Sidebar Filters + Interactive Cards List */}
        <div className="w-full md:w-85 md:min-w-85 border-r border-slate-200 flex flex-col h-full bg-white shrink-0 print-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Renders Filter selections */}
            <EventFilters
              filters={filters}
              onChange={setFilters}
              availableTypes={availableTypes}
              availableSources={availableSources}
              onIngest={handleIngestFeeds}
              isIngesting={isIngesting}
              onOpenReportModal={() => setIsReportModalOpen(true)}
              totalCount={events.length}
              filteredCount={filteredEvents.length}
              autoRefreshEnabled={autoRefreshEnabled}
              onToggleAutoRefresh={handleToggleAutoRefresh}
              nextRefreshMinutesLeft={nextRefreshMinutesLeft}
              filteredEvents={filteredEvents}
              isAlertScannerActive={isAlertScannerActive}
              onToggleAlertScanner={handleToggleAlertScanner}
              lastAlertScanTime={lastAlertScanTime}
              onTriggerManualScan={runProximityAlertScan}
              onClearAlertHistory={handleClearAlertHistory}
              alertedCount={alertedEventIds.length}
              allEvents={events}
              bookmarks={bookmarks}
            />
          </div>

          {/* Staggered Vertical safety incident Cards list or Daily Summary Briefing */}
          <div className="h-1/2 border-t border-slate-200 flex flex-col overflow-hidden bg-[#F8FAFC]">
            <div className="bg-slate-50 border-b border-slate-105 flex items-center justify-between shrink-0 p-2 border-slate-150">
              <div className="flex gap-1 bg-slate-200/50 p-1 rounded-lg overflow-x-auto whitespace-nowrap scrollbar-none shrink-0 max-w-[85%] scroll-smooth">
                <button
                  type="button"
                  id="incident-list-tab"
                  onClick={() => setSidebarTab("list")}
                  className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide leading-none ${
                    sidebarTab === "list"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-450 hover:text-slate-705"
                  }`}
                >
                  List ({filteredEvents.length})
                </button>
                <button
                  type="button"
                  id="chat-tab-trigger"
                  onClick={() => setSidebarTab("chat")}
                  className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                    sidebarTab === "chat"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-450 hover:text-indigo-650"
                  }`}
                >
                  <MessageSquare size={11} className={sidebarTab === "chat" ? "animate-pulse" : ""} />
                  AI Chat
                </button>
                <button
                  type="button"
                  id="daily-summary-tab-trigger"
                  onClick={() => setSidebarTab("summary")}
                  className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                    sidebarTab === "summary"
                      ? "bg-blue-605 text-slate-800 bg-white shadow-sm"
                      : "text-slate-450 hover:text-blue-650"
                  }`}
                >
                  <Sparkles size={11} className={sidebarTab === "summary" ? "animate-pulse" : ""} />
                  24H Summary
                </button>
                <button
                  type="button"
                  id="trends-tab-trigger"
                  onClick={() => setSidebarTab("trends")}
                  className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                    sidebarTab === "trends"
                      ? "bg-[#0F172A] text-white shadow-sm"
                      : "text-slate-450 hover:text-[#0F172A]"
                  }`}
                >
                  <TrendingUp size={11} />
                  Trends
                </button>
                <button
                  type="button"
                  id="risk-tab-trigger"
                  onClick={() => setSidebarTab("risk")}
                  className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                    sidebarTab === "risk"
                      ? "bg-red-650 text-white shadow-sm"
                      : "text-slate-450 hover:text-red-700"
                  }`}
                >
                  <ShieldAlert size={11} />
                  Risk
                </button>
                <button
                  type="button"
                  id="bookmarks-tab-trigger"
                  onClick={() => setSidebarTab("bookmarks")}
                  className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                    sidebarTab === "bookmarks"
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-slate-450 hover:text-amber-600"
                  }`}
                >
                  <Bookmark size={11} className={sidebarTab === "bookmarks" ? "fill-white" : ""} />
                  Saved ({bookmarks.length})
                </button>
                <button
                  type="button"
                  id="upload-news-tab-trigger"
                  onClick={() => setSidebarTab("upload_news")}
                  className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                    sidebarTab === "upload_news"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-450 hover:text-blue-650"
                  }`}
                >
                  <Upload size={11} />
                  Upload
                </button>
              </div>
              <span className="text-[9.5px] text-slate-400 font-mono font-bold pr-2 uppercase select-none shrink-0">
                {sidebarTab === "list" ? "Live Feed" : sidebarTab === "chat" ? "AI Guidance" : sidebarTab === "summary" ? "Briefing" : sidebarTab === "trends" ? "Stats" : sidebarTab === "risk" ? "Risk Index" : sidebarTab === "bookmarks" ? "Watchlist" : "Uploads"}
              </span>
            </div>

            {sidebarTab === "trends" ? (
              <div className="flex-1 overflow-hidden" id="tab-trends-container">
                <TrendsPanel events={events} />
              </div>
            ) : sidebarTab === "chat" ? (
              <div className="flex-1 overflow-hidden flex flex-col bg-slate-55" id="tab-chat-container">
                <SafetyChatbot
                  events={events}
                  onSelectEvent={(evt) => setSelectedEvent(evt)}
                />
              </div>
            ) : sidebarTab === "summary" ? (
              <div className="flex-1 overflow-hidden">
                <DailySummary events={events} />
              </div>
            ) : sidebarTab === "risk" ? (
              <div className="flex-1 overflow-hidden flex flex-col bg-slate-55" id="tab-risk-container">
                <RiskAssessment
                  events={events}
                  onSelectNeighbourhood={(neighbourhood, firstEvt) => {
                    if (firstEvt) {
                      setSelectedEvent(firstEvt);
                    }
                    setFilters(prev => ({
                      ...prev,
                      searchQuery: neighbourhood
                    }));
                  }}
                />
              </div>
            ) : sidebarTab === "upload_news" ? (
              <div className="flex-1 overflow-hidden flex flex-col bg-slate-55">
                <UploadNewsPanel
                  configSources={configSourcesList}
                  onSuccess={(addedCount, addedEvents) => {
                    loadData();
                    if (addedCount > 0 && addedEvents.length > 0) {
                      setSuccessToast(`Parsed ${addedCount} news safety events! Centering map...`);
                      setSelectedEvent(addedEvents[0]);
                    }
                  }}
                />
              </div>
            ) : sidebarTab === "bookmarks" ? (
              <div className="flex-1 overflow-hidden flex flex-col bg-slate-55" id="tab-bookmarks-container">
                <BookmarksPanel
                  events={events}
                  bookmarks={bookmarks}
                  bookmarkNotes={bookmarkNotes}
                  onSelectEvent={(evt) => setSelectedEvent(evt)}
                  onToggleBookmark={handleToggleBookmark}
                  onUpdateBookmarkNote={handleUpdateBookmarkNote}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
                {compareEventIds.length > 0 && (
                  <div id="compare-selection-banner" className="bg-blue-50/90 border border-blue-200 rounded-lg p-2.5 shadow-sm space-y-2 flex flex-col text-slate-800 animate-fadeIn mb-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                        <ArrowLeftRight size={11} className="text-blue-600 shrink-0" />
                        Comparison Pool ({compareEventIds.length}/2 Selected)
                      </span>
                      <button
                        type="button"
                        id="compare-clear-btn"
                        onClick={() => setCompareEventIds([])}
                        className="text-[10px] font-mono font-bold text-slate-450 hover:text-slate-700 hover:underline cursor-pointer bg-transparent border-none"
                      >
                        Clear Pool
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-550 leading-relaxed font-sans">
                      {compareEventIds.length === 1 ? (
                        <span>Select another card's compare checkbox to analyze difference indicators.</span>
                      ) : (
                        <span className="text-blue-700 font-bold">Contrast analysis loaded! Open side-by-side view.</span>
                      )}
                    </div>
                    {compareEventIds.length === 2 && (
                      <button
                        type="button"
                        id="open-incident-comparison-trigger-btn"
                        onClick={() => setIsCompareOpen(true)}
                        className="cursor-pointer w-full text-center py-1.5 text-xs font-bold rounded bg-blue-600 hover:bg-blue-500 border border-blue-700 hover:border-blue-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ArrowLeftRight size={12} className="text-white shrink-0" />
                        <span>Compare Selected Side-by-Side</span>
                      </button>
                    )}
                  </div>
                )}

                {filteredEvents.length > 0 && (
                  <div id="list-export-container" className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-lg p-2 shadow-sm select-none mb-1">
                    <div className="pl-1">
                      <p className="text-[9px] font-black font-mono text-slate-400 uppercase tracking-widest leading-tight">Live Scope</p>
                      <p className="text-[11px] font-bold text-slate-700 font-mono leading-none mt-0.5">
                        {filteredEvents.length} {filteredEvents.length === 1 ? "Incident" : "Incidents"}
                      </p>
                    </div>
                    <button
                      type="button"
                      id="download-csv-list-btn"
                      onClick={() => exportListToCSV(filteredEvents)}
                      className="inline-flex items-center gap-1.5 py-1.5 px-3 bg-white hover:bg-blue-50 text-slate-700 font-mono text-[9.5px] font-extrabold rounded border border-slate-200 hover:border-blue-200 shadow-sm cursor-pointer transition-all uppercase tracking-wide h-fit"
                    >
                      <Download size={11} className="shrink-0 text-blue-500" />
                      Download CSV
                    </button>
                  </div>
                )}
                {filteredEvents.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <AlertCircle size={22} className="mx-auto text-slate-400 animate-pulse" />
                    <p className="text-xs text-slate-500 font-medium">No safety incidents found matching current filter scope.</p>
                  </div>
                ) : (
                  filteredEvents.map((evt) => {
                    const isSelected = selectedEvent ? selectedEvent.id === evt.id : false;
                    const isCompared = compareEventIds.includes(evt.id);
                    return (
                      <div
                        key={evt.id}
                        id={`event-item-card-${evt.id}`}
                        onClick={() => setSelectedEvent(evt)}
                        className={`p-3.5 rounded border text-left cursor-pointer transition-all relative ${getCardSeverityBorder(
                          evt.severity
                        )} ${
                          isSelected
                            ? "bg-blue-50/45 border-blue-500 shadow-sm ring-1 ring-blue-500/10"
                            : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-350"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 overflow-hidden mb-1.5">
                          <div className="flex items-center gap-1.5 truncate">
                            <label
                              id={`compare-label-input-${evt.id}`}
                              className="inline-flex items-center gap-1 cursor-pointer select-none pb-0.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                value={evt.id}
                                id={`compare-checkbox-input-${evt.id}`}
                                checked={isCompared}
                                onChange={() => handleToggleCompare(evt.id)}
                                className="rounded border-slate-305 text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                              />
                              <span className="text-[9px] font-black font-mono tracking-tight text-slate-400 hover:text-slate-600 uppercase">
                                Compare
                              </span>
                            </label>
                            <span className="text-[9px] text-slate-250 font-semibold select-none leading-none">|</span>
                            <span className="text-[9px] font-mono text-blue-600 font-bold tracking-wider truncate">
                              {evt.sourceName}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 font-semibold shrink-0">
                            {formatDistanceTime(evt.publishedAt)}
                          </span>
                        </div>
                        
                        <h4 className="text-[11.5px] font-bold text-slate-800 line-clamp-1 truncate mb-1">
                          {evt.title}
                        </h4>

                        <p className="text-[10.5px] text-slate-500 leading-normal line-clamp-2 max-h-8 overflow-hidden mb-2 font-medium">
                          {evt.summary}
                        </p>

                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono mt-1 pt-1.5 border-t border-slate-100">
                          <div className="flex flex-col gap-0.5">
                            <span className="capitalize font-semibold text-slate-600">{evt.eventType?.replace(/_/g, " ")}</span>
                            {filters.userLat !== null && filters.userLng !== null && evt.latitude && evt.longitude && (
                              <span className="font-bold text-blue-605 text-[9.5px]">
                                ⎔ {getDistanceKm(filters.userLat, filters.userLng, evt.latitude, evt.longitude).toFixed(1)} km away
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 items-center">
                            <span className="font-bold text-slate-450 text-[10px] capitalize">
                              {evt.locationPrecision}
                            </span>
                            {bookmarks.includes(evt.id) && (
                              <span className="text-amber-600 font-bold">★ SAVED</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Sandbox: Leaflet Canvas Map + Legend Guides */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#F8FAFC] map-print-wrapper">
          
          {/* Dynamic Map view overlaying incident pins */}
          <div className="flex-1 h-full w-full relative z-0">
            <IncidentMap
              events={filteredEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              showHeatmap={showHeatmap}
              setShowHeatmap={setShowHeatmap}
              heatmapOpacity={heatmapOpacity}
              onToggleOpacity={handleToggleHeatmapOpacity}
              mapCenter={activeCityCoords}
            />
          </div>

          <div className="border-t border-slate-200 shrink-0 z-10 print-hidden p-3 bg-[#F8FAFC]">
            <IncidentTimeline events={filteredEvents} />
          </div>

          {/* Informative Legend footer panel wrapper */}
          <div className="p-3 bg-[#F8FAFC] border-t border-slate-200 shrink-0 z-10 print-hidden">
            <MapLegend 
              onShowHelp={() => setShowHelpGuide(true)} 
              showHeatmap={showHeatmap}
              onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
              heatmapOpacity={heatmapOpacity}
              onToggleOpacity={handleToggleHeatmapOpacity}
            />
          </div>
        </div>

        {/* Right Sandbox Slider Panel: Details Sheet Drawer */}
        {selectedEvent && (
          <div className="absolute md:relative inset-y-0 right-0 z-[1000] h-full shadow-2xl transition-all duration-300 print-hidden">
            <EventDrawer
              selectedEvent={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              isBookmarked={bookmarks.includes(selectedEvent.id)}
              onToggleBookmark={handleToggleBookmark}
              bookmarkNote={bookmarkNotes[selectedEvent.id] || ""}
              onUpdateBookmarkNote={handleUpdateBookmarkNote}
            />
          </div>
        )}
      </main>

      {/* Manual Safety filing report modals */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmit={handleReportSubmit}
      />

      {/* Regional Safety Metrics Breakdown Modal */}
      <RegionalMetricsModal
        isOpen={isMetricsModalOpen}
        onClose={() => setIsMetricsModalOpen(false)}
        events={events}
        onSelectNeighbourhood={(neighbourhood) => {
          setSidebarTab("list");
          // Find first event matching the sector for centering the map
          const matched = events.find(e => {
            const textToSearch = `${e.locationText} ${e.summary} ${e.title}`.toLowerCase();
            return textToSearch.includes(neighbourhood.toLowerCase());
          });
          if (matched) {
            setSelectedEvent(matched);
          }
          setFilters(prev => ({
            ...prev,
            searchQuery: neighbourhood
          }));
          setSuccessToast(`Focused map view on Sector: ${neighbourhood}`);
        }}
      />

      {/* Pop-up Guide & Extended Disclaimer Panel */}
      {showHelpGuide && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-205 max-w-lg w-full rounded-xl p-6 shadow-2xl space-y-4 text-slate-600 select-none font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                <ShieldAlert className="text-blue-600" size={17} />
                <span>Saskatoon Safety Map Watch Guidelines</span>
              </h3>
              <button
                onClick={() => setShowHelpGuide(false)}
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="text-xs space-y-3 leading-relaxed">
              <p className="font-medium text-slate-600">
                This Saskatoon Safety Watch application coordinates, geocodes, and outlines incidents extracted from official provincial services and community alerting feeds including:
              </p>
              <ul className="list-disc pl-5 text-slate-550 space-y-2 font-medium">
                <li>
                  <strong className="text-slate-700">Saskatoon Police News releases:</strong> Official police alerts regarding tactical operations, weapons sweeps, and neighborhood patrols.
                </li>
                <li>
                  <strong className="text-slate-700">Saskatchewan RCMP publications:</strong> Alerts covering accidents, collisions, and dangerous conditions inside wider municipalities.
                </li>
                <li>
                  <strong className="text-slate-700">Serious Incident Response Team (SIRT) briefs:</strong> Independent investigations looking into detention affairs and corrections.
                </li>
              </ul>
              
              <div className="bg-slate-50 p-3.5 rounded border border-slate-150 space-y-1 mt-2 shadow-sm">
                <span className="font-bold text-slate-800 text-xs">Rounding & Resident Privacy</span>
                <p className="text-slate-500 text-[11px] leading-relaxed font-medium">
                  To respect individual safety, coordinates geocoded inside this watch interface are automatically jittered or rounded onto the closest block or intersection marker. The map NEVER shows absolute private house address markers.
                </p>
              </div>

              <div className="bg-blue-50/70 p-3.5 rounded border border-blue-150 space-y-1 mt-2 shadow-sm">
                <span className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                  <Wifi size={13} className="text-blue-600" /> Offline Saskatchewan Operations
                </span>
                <p className="text-slate-600 text-[11px] leading-relaxed font-medium">
                  Going off-grid? We've got you covered. A Service Worker operates in the background to cache viewed map tiles and incident data points. This allows map coordinates, lists, severity distribution charts, and filters to remain accessible even when you completely lose signal in remote northern or rural regions of Saskatchewan.
                </p>
              </div>

              <div className="bg-amber-50 p-3.5 rounded border border-amber-205 space-y-1 text-amber-800 font-semibold shadow-sm">
                <span className="font-bold text-amber-900">Urgent Warning Disclaimer</span>
                <p className="text-[11px] text-slate-605 leading-relaxed font-medium">
                  Data rendered on this dashboard may be delayed, updated retroactively, or incomplete. Under no circumstances should this personal awareness portal be utilized for real-time safety measures, accusation claims, emergency dispatch services, or legal records.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowHelpGuide(false)}
                className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded transition-colors shadow-sm"
              >
                Acknowledge guidelines
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating alert/success message Toast */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-[100000] bg-white border border-emerald-200 text-emerald-800 flex items-center justify-between gap-4 py-3.5 px-4 rounded-xl shadow-2xl max-w-sm border-l-4 border-l-emerald-500 text-xs font-semibold leading-normal select-none animate-bounce">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-emerald-600" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-400 hover:text-emerald-700 cursor-pointer select-none">
            ✕
          </button>
        </div>
      )}

      {/* Floating error warning strip */}
      {errorMessage && (
        <div className="fixed bottom-6 left-6 z-[100000] bg-white border border-red-200 text-red-800 flex items-center justify-between gap-4 py-3.5 px-4 rounded-xl shadow-2xl max-w-sm border-l-4 border-l-red-500 text-xs font-semibold select-none animate-pulse">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-700 cursor-pointer select-none">
            ✕
          </button>
        </div>
      )}

      {selectedEvent && (
        <PrintableIncidentReport
          event={selectedEvent}
          bookmarkNote={bookmarkNotes[selectedEvent.id] || ""}
          isBookmarked={bookmarks.includes(selectedEvent.id)}
        />
      )}

      {isCompareOpen && compareEventIds.length === 2 && (
        (() => {
          const evtA = events.find(e => e.id === compareEventIds[0]);
          const evtB = events.find(e => e.id === compareEventIds[1]);
          if (evtA && evtB) {
            return (
              <CompareIncidentsPanel
                eventA={evtA}
                eventB={evtB}
                onClose={() => setIsCompareOpen(false)}
              />
            );
          }
          return null;
        })()
      )}
    </div>
  );
}

// Fixed array of public config streams displayed inside sidebar
const configSourcesList = [
  { key: "saskatoon_police_news", name: "Saskatoon Police News Releases" },
  { key: "rcmp_saskatchewan_news", name: "Saskatchewan RCMP Alerts" },
  { key: "saskatchewan_gov_news", name: "Saskatchewan SIRT & Gov News" },
  { key: "saskatoon_crime_map", name: "Saskatoon Live Crime Map" },
  { key: "cbc_saskatoon_news", name: "CBC Saskatoon News" },
  { key: "global_news_saskatoon", name: "Global News Saskatoon" },
];
