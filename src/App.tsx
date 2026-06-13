import React, { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, ShieldAlert, Sparkles, X, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, HelpCircle, Navigation, Info, ExternalLink, Bookmark, TrendingUp, Upload, Download, BarChart3, Wifi, WifiOff, MessageSquare, MapPin, ArrowLeftRight, Flame, Plus, Minus, Settings, Filter, Layers, Clock, Minimize2, Maximize2, Bell, LogIn, LogOut, Database, Cloud, ShieldCheck } from "lucide-react";
import { EventItem, EventSource, SeverityType, CustomRouteItem } from "./types";
import { auth, googleProvider, signInWithPopup, signOut } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
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
import HotspotProjectionPanel from "./components/HotspotProjectionPanel";
import AlertZonesPanel from "./components/AlertZonesPanel";

export default function App() {
  // Application Data States
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sources, setSources] = useState<EventSource[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>({});

  // Firebase Auth & Cloud Sync States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [bookmarksReady, setBookmarksReady] = useState<boolean>(false);
  const [guestUid] = useState<string>(() => {
    try {
      let storedId = localStorage.getItem("saskatchewan_guest_uid");
      if (!storedId) {
        storedId = `guest-${Math.random().toString(36).substring(2, 11)}`;
        localStorage.setItem("saskatchewan_guest_uid", storedId);
      }
      return storedId;
    } catch {
      return `guest-fb-${Math.random().toString(36).substring(2, 11)}`;
    }
  });

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
  const [sidebarTab, setSidebarTab] = useState<"list" | "summary" | "trends" | "risk" | "upload_news" | "bookmarks" | "chat" | "projection" | "zones">("list");
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState<boolean>(false);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [showPins, setShowPins] = useState<boolean>(true);
  const [useWebGLHeatmap, setUseWebGLHeatmap] = useState<boolean>(true);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.18);
  const [heatmapRadiusMultiplier, setHeatmapRadiusMultiplier] = useState<number>(1.0);

  // Lifted Custom Safety Zones & Pins State
  const [customPins, setCustomPins] = useState<Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    note: string;
    severity: SeverityType;
    createdAt: string;
    isAlertZone?: boolean;
    zoneType?: 'home' | 'apartment' | 'hospital' | 'travel_route' | 'custom';
    alertRadiusMeters?: number;
    userId?: string;
  }>>(() => {
    try {
      const saved = localStorage.getItem("saskatoon_custom_pins");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Load custom alert zones from the Firestore API on mount
  useEffect(() => {
    fetch("/api/alert-zones")
      .then(r => {
        if (!r.ok) throw new Error("API loading issue");
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map(item => ({
            id: item.id,
            latitude: item.coordinates ? item.coordinates[0] : (item.latitude || 52.13),
            longitude: item.coordinates ? item.coordinates[1] : (item.longitude || -106.67),
            title: item.name || item.title || "Custom Zone",
            note: item.name || item.title || "Custom Zone Description",
            severity: item.severity || "medium",
            createdAt: item.createdAt || new Date().toISOString(),
            isAlertZone: true,
            alertRadiusMeters: item.radius || 150
          }));
          setCustomPins(mapped);
        }
      })
      .catch(err => console.warn("Note: Using local offline alert zones fallback.", err.message));
  }, []);

  useEffect(() => {
    localStorage.setItem("saskatoon_custom_pins", JSON.stringify(customPins));
    
    // Sync with Firestore backend API with debounce to optimize bandwidth
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const pinsToSync = customPins.map(pin => ({
        ...pin,
        userId: pin.userId || (currentUser ? currentUser.uid : guestUid)
      }));

      fetch("/api/alert-zones/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pinsToSync),
        signal: controller.signal
      })
        .then(r => r.json())
        .then(res => console.log("[Sync] Alert zones sync verified by database:", res))
        .catch(err => {
          if (err.name !== "AbortError") {
            console.error("[Sync Error] Failed to synch alert zones with Firestore:", err);
          }
        });
    }, 600);
    
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [customPins, currentUser, guestUid]);


  // Lifted Custom Travel Routes State
  const [customRoutes, setCustomRoutes] = useState<CustomRouteItem[]>(() => {
    try {
      const saved = localStorage.getItem("saskatoon_custom_routes");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("saskatoon_custom_routes", JSON.stringify(customRoutes));
  }, [customRoutes]);

  // Route Sketching/Drawing state values
  const [isDrawingRoute, setIsDrawingRoute] = useState<boolean>(false);
  const [currentDrawnPath, setCurrentDrawnPath] = useState<Array<[number, number]>>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

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

  // Map Base Style Selection ("dark" | "streets" | "satellite"), backed by localStorage
  const [mapStyle, setMapStyle] = useState<"dark" | "streets" | "satellite">(() => {
    try {
      const saved = localStorage.getItem("saskatoon_map_style");
      return (saved === "streets" || saved === "satellite" || saved === "dark") ? saved as any : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("saskatoon_map_style", mapStyle);
    } catch {}
  }, [mapStyle]);

  // Real-time map status overlays inside #map-container
  const [mapZoom, setMapZoom] = useState<number>(12);
  const [mapCenterCoords, setMapCenterCoords] = useState<{ lat: number; lng: number }>({ lat: 52.1332, lng: -106.67 });

  // Layout Dynamic Adjustable Size States
  const [isAdjustmentPanelOpen, setIsAdjustmentPanelOpen] = useState<boolean>(false);
  const [sizes, setSizes] = useState<Record<string, { isMinimized: boolean; isEnlarged: boolean }>>({
    header: { isMinimized: false, isEnlarged: false },
    disclaimer: { isMinimized: false, isEnlarged: false },
    sidebar: { isMinimized: false, isEnlarged: false },
    filters: { isMinimized: false, isEnlarged: false },
    sidebarTabs: { isMinimized: false, isEnlarged: false },
    map: { isMinimized: false, isEnlarged: false },
    timeline: { isMinimized: false, isEnlarged: false },
    legend: { isMinimized: false, isEnlarged: false },
    drawer: { isMinimized: false, isEnlarged: false },
  });

  const toggleSizing = (componentKey: string, action: "minimize" | "normal" | "enlarge") => {
    setSizes(prev => {
      const current = prev[componentKey] || { isMinimized: false, isEnlarged: false };
      let updated = { ...current };
      if (action === "minimize") {
        updated = { isMinimized: !current.isMinimized, isEnlarged: false };
      } else if (action === "enlarge") {
        updated = { isMinimized: false, isEnlarged: !current.isEnlarged };
      } else {
        updated = { isMinimized: false, isEnlarged: false };
      }
      const next = { ...prev, [componentKey]: updated };
      try {
        localStorage.setItem("saskatchewan_ui_sizes_v2", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_ui_sizes_v2");
      if (saved) {
        setSizes(JSON.parse(saved));
      }
    } catch {}
  }, []);

  // Refs for tracking width calculations
  const sidebarContainerRef = useRef<HTMLDivElement>(null);

  // Dragging interaction states
  const [isDraggingSidebar, setIsDraggingSidebar] = useState<boolean>(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [isDraggingDrawer, setIsDraggingDrawer] = useState<boolean>(false);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState<boolean>(false);

  // Refs for drag vs click separation and relative movement
  const dragStartMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(0);

  // Resizable dimension states (with local storage caching)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_sidebar_width");
      return saved ? parseInt(saved, 10) : 350;
    } catch {
      return 350;
    }
  });

  const [filtersHeightPercent, setFiltersHeightPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_filters_height_percent");
      return saved ? parseInt(saved, 10) : 50;
    } catch {
      return 50;
    }
  });

  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_drawer_width");
      return saved ? parseInt(saved, 10) : 380;
    } catch {
      return 380;
    }
  });

  // Additional range-adjustable layout states
  const [headerScale, setHeaderScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_header_scale");
      return saved ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const [disclaimerScale, setDisclaimerScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_disclaimer_scale");
      return saved ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_timeline_height");
      return saved ? parseInt(saved, 10) : 140;
    } catch {
      return 140;
    }
  });

  const [mapOpacity, setMapOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_map_opacity");
      return saved ? parseInt(saved, 10) : 100;
    } catch {
      return 100;
    }
  });

  const [legendScale, setLegendScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_legend_scale");
      return saved ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const isSidebarCollapsed = !!sizes.sidebar?.isMinimized || sidebarWidth < 40;
  const isDrawerCollapsed = !!sizes.drawer?.isMinimized || drawerWidth < 40;
  const isTimelineCollapsed = timelineHeight < 40;

  // Event handlers to activate resize dragging
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
    dragStartMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleSplitResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  };

  const handleDrawerResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingDrawer(true);
    dragStartMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleTimelineResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingTimeline(true);
    dragStartMousePos.current = { x: e.clientX, y: e.clientY };
    dragStartY.current = e.clientY;
    dragStartHeight.current = timelineHeight;
  };

  // Direct mouse move + release listener on window viewport
  useEffect(() => {
    if (!isDraggingSidebar && !isDraggingSplit && !isDraggingDrawer && !isDraggingTimeline) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar) {
        const newWidth = Math.min(Math.max(e.clientX, 0), window.innerWidth - 300);
        setSidebarWidth(newWidth < 40 ? 0 : newWidth);
      } else if (isDraggingDrawer) {
        const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 0), window.innerWidth - 300);
        setDrawerWidth(newWidth < 40 ? 0 : newWidth);
      } else if (isDraggingTimeline) {
        const deltaY = e.clientY - dragStartY.current;
        const newHeight = Math.min(Math.max(dragStartHeight.current - deltaY, 0), window.innerHeight - 200);
        setTimelineHeight(newHeight < 40 ? 0 : newHeight);
      } else if (isDraggingSplit) {
        if (sidebarContainerRef.current) {
          const rect = sidebarContainerRef.current.getBoundingClientRect();
          const relativeY = e.clientY - rect.top;
          const newPercent = Math.min(Math.max((relativeY / rect.height) * 100, 15), 85);
          setFiltersHeightPercent(newPercent);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - dragStartMousePos.current.x);
      const dy = Math.abs(e.clientY - dragStartMousePos.current.y);
      const isClick = dx < 4 && dy < 4;

      if (isClick) {
        if (isDraggingSidebar) {
          setSidebarWidth(prev => {
            if (prev > 40) {
              localStorage.setItem("saskatchewan_sidebar_last_width", String(prev));
              return 0;
            } else {
              const last = parseInt(localStorage.getItem("saskatchewan_sidebar_last_width") || "350", 10);
              return last;
            }
          });
        } else if (isDraggingDrawer) {
          setDrawerWidth(prev => {
            if (prev > 40) {
              localStorage.setItem("saskatchewan_drawer_last_width", String(prev));
              return 0;
            } else {
              const last = parseInt(localStorage.getItem("saskatchewan_drawer_last_width") || "380", 10);
              return last;
            }
          });
        } else if (isDraggingTimeline) {
          setTimelineHeight(prev => {
            if (prev > 40) {
              localStorage.setItem("saskatchewan_timeline_last_height", String(prev));
              return 0;
            } else {
              const last = parseInt(localStorage.getItem("saskatchewan_timeline_last_height") || "140", 10);
              return last;
            }
          });
        }
      }

      setIsDraggingSidebar(false);
      setIsDraggingSplit(false);
      setIsDraggingDrawer(false);
      setIsDraggingTimeline(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSidebar, isDraggingSplit, isDraggingDrawer, isDraggingTimeline]);

  // Sync state modifications onto disk cache automatically
  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_sidebar_width", String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_filters_height_percent", String(filtersHeightPercent));
    } catch {}
  }, [filtersHeightPercent]);

  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_drawer_width", String(drawerWidth));
    } catch {}
  }, [drawerWidth]);

  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_header_scale", String(headerScale));
    } catch {}
  }, [headerScale]);

  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_disclaimer_scale", String(disclaimerScale));
    } catch {}
  }, [disclaimerScale]);

  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_timeline_height", String(timelineHeight));
    } catch {}
  }, [timelineHeight]);

  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_map_opacity", String(mapOpacity));
    } catch {}
  }, [mapOpacity]);

  useEffect(() => {
    try {
      localStorage.setItem("saskatchewan_legend_scale", String(legendScale));
    } catch {}
  }, [legendScale]);

  // Filters State
  const [filters, setFilters] = useState<FilterState>({
    timeRangeHours: "all",
    severities: ["critical", "high", "medium", "low"],
    eventTypes: [], // empty means all categories are shown
    sourceKey: "all",
    searchQuery: "",
    showBookmarksOnly: false,
    searchRadiusKm: "all",
    userLat: null,
    userLng: null,
    criticalOnly: false,
    sourceTiers: [1, 2, 3, 4],
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

  const retryCount = React.useRef(0);

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

      let eventsData = await eventsRes.json();
      const sourcesData = await sourcesRes.json();

      // Handle offline/fallback JSON response from Service Worker gracefully
      if (eventsData && !Array.isArray(eventsData) && Array.isArray((eventsData as any).events)) {
        eventsData = (eventsData as any).events;
      }

      if (Array.isArray(eventsData)) {
        setEvents(eventsData);
        retryCount.current = 0; // successfully loaded
      } else {
        throw new Error("Received invalid, non-array event data structure.");
      }

      setSources(sourcesData);
    } catch (err: any) {
      retryCount.current += 1;
      // Only log a hard error after 5 failed attempts (~10 seconds) to prevent false-positive console error triggers
      if (retryCount.current >= 5) {
        console.error("Failed to load initial Saskatoon safety data after 5 attempts:", err);
        setErrorMessage("Could not connect to the safety database. Please try refreshing properties.");
      } else {
        console.warn(`Connection retry #${retryCount.current} to safety database...`);
        setErrorMessage("Safety database is loading or starting. Retrying connection...");
        setTimeout(loadData, 2000);
      }
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

    // Load auto refresh configuration and subscribe to Firebase authentication changes
    try {
      const storedRefresh = localStorage.getItem("saskatoon_auto_refresh");
      if (storedRefresh === "true") {
        setAutoRefreshEnabled(true);
      }
    } catch (e) {
      console.error("Local storage auto refresh settings load failed:", e);
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribeAuth();
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

  // 3a. Retrieve user-specific bookmarks and custom notes from Firestore database
  useEffect(() => {
    const uid = currentUser ? currentUser.uid : guestUid;
    if (!uid) return;
    
    setBookmarksReady(false);
    fetch(`/api/bookmarks?userId=${uid}`)
      .then(res => {
        if (!res.ok) throw new Error("Database loading issue");
        return res.json();
      })
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          console.log(`[Firebase DB] Successfully loaded ${data.length} cloud bookmarks.`);
          const ids = data.map(b => b.eventId);
          const notes: Record<string, string> = {};
          data.forEach(b => {
            if (b.note) {
              notes[b.eventId] = b.note;
            }
          });
          setBookmarks(ids);
          setBookmarkNotes(notes);
        }
        setBookmarksReady(true);
      })
      .catch((err: any) => {
        console.warn("[Firebase Fallback] Loading local offline cache bookmarks.", err.message);
        try {
          const stored = localStorage.getItem("saskatoon_bookmarks");
          if (stored) {
            setBookmarks(JSON.parse(stored));
          }
          const storedNotes = localStorage.getItem("saskatoon_bookmark_notes");
          if (storedNotes) {
            setBookmarkNotes(JSON.parse(storedNotes));
          }
        } catch (e) {
          console.error("Local storage bookmarks retrieval rejected:", e);
        }
        setBookmarksReady(true);
      });
  }, [currentUser, guestUid]);

  // 3b. Sync bookmarks and notes back to Firestore with elegant debouncing representation
  useEffect(() => {
    if (!bookmarksReady) return;

    const uid = currentUser ? currentUser.uid : guestUid;
    if (!uid) return;

    // Cache immediately in local storage for instantaneous offline local recovery
    try {
      localStorage.setItem("saskatoon_bookmarks", JSON.stringify(bookmarks));
      localStorage.setItem("saskatoon_bookmark_notes", JSON.stringify(bookmarkNotes));
    } catch (e) {
      console.error("Failed to backup bookmarks to localStorage:", e);
    }

    const payload = bookmarks.map(id => ({
      id: `bmark-${uid}-${id}`,
      userId: uid,
      eventId: id,
      note: bookmarkNotes[id] || "",
      createdAt: new Date().toISOString()
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch("/api/bookmarks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, list: payload }),
        signal: controller.signal
      })
        .then(r => r.json())
        .then(res => console.log("[Sync] Saved bookmarks synced with cloud database:", res))
        .catch(err => {
          if (err.name !== "AbortError") {
            console.error("[Sync Error] Failed to sync bookmarks to Firestore:", err);
          }
        });
    }, 600);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [bookmarks, bookmarkNotes, currentUser, guestUid, bookmarksReady]);

  // 3c. Bookmarking toggling handlers
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
  };

  const handleUpdateBookmarkNote = (eventId: string, noteText: string) => {
    const updatedNotes = { ...bookmarkNotes, [eventId]: noteText };
    setBookmarkNotes(updatedNotes);
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

      // Severity classification match check
      if (filters.severities && !filters.severities.includes(evt.severity)) {
        return false;
      }

      // Incident category type match check
      if (filters.eventTypes && filters.eventTypes.length > 0 && !filters.eventTypes.includes(evt.eventType)) {
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
      
      {/* Dynamic Cursor Drag Backdrop Cover Mask prevents Map / IFrame interaction captures */}
      {(isDraggingSidebar || isDraggingSplit || isDraggingDrawer) && (
        <div 
          className="fixed inset-0 z-[9999] select-none text-[0px]" 
          style={{ 
            cursor: isDraggingSplit ? "row-resize" : "col-resize",
            pointerEvents: "auto",
            background: "transparent"
          }}
        >
          Drag Active
        </div>
      )}
      
      {/* Top Banner Warning Disclaimer & Header */}
      <header 
        style={{
          padding: `${(sizes.header?.isMinimized ? 8 : (sizes.header?.isEnlarged ? 24 : 16)) * headerScale}px`,
          gap: `${(sizes.header?.isMinimized ? 6 : (sizes.header?.isEnlarged ? 16 : 12)) * headerScale}px`
        }}
        className="border-b border-slate-750 bg-slate-900 text-white flex flex-col shrink-0 shadow-sm print-hidden transition-all duration-300"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div 
              style={{
                padding: `${(sizes.header?.isMinimized ? 6 : 8) * headerScale}px`
              }}
              className="bg-blue-600 border border-blue-500 text-white rounded relative shadow-sm animate-pulse transition-all"
            >
              <ShieldAlert size={(sizes.header?.isMinimized ? 16 : 20) * headerScale} />
              <div className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-slate-900"></div>
            </div>
            <div>
              <h1 
                style={{
                  fontSize: `${(sizes.header?.isEnlarged ? 20 : 16) * headerScale}px`,
                  gap: `${8 * headerScale}px`
                }}
                className="font-bold font-sans tracking-tight text-white flex flex-wrap items-center uppercase transition-all"
              >
                <span>Saskatchewan Safety Map</span>
                <span 
                  style={{
                    fontSize: `${10 * headerScale}px`,
                    padding: `${2 * headerScale}px ${6 * headerScale}px`
                  }}
                  className="bg-slate-800 rounded text-blue-400 font-mono tracking-wider font-semibold shrink-0"
                >
                  PROVINCIAL WATCH
                </span>
              </h1>
              {!sizes.header?.isMinimized && (
                <div className="flex flex-wrap items-center gap-2.5 mt-1 transition-all">
                  {/* Connection check pill */}
                  {isOnline ? (
                    <span 
                      style={{
                        fontSize: `${9.5 * headerScale}px`,
                        padding: `${2 * headerScale}px ${8 * headerScale}px`
                      }}
                      className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full font-mono font-bold tracking-wider flex items-center gap-1.5 normal-case shrink-0 shadow-sm"
                    >
                      <Wifi size={11 * headerScale} className="text-emerald-400 animate-pulse" />
                      <span className="flex items-center gap-1">Online <span style={{ fontSize: `${8.5 * headerScale}px` }} className="text-emerald-500">(Cached Live Sys)</span></span>
                    </span>
                  ) : (
                    <span 
                      style={{
                        fontSize: `${9.5 * headerScale}px`,
                        padding: `${2 * headerScale}px ${8 * headerScale}px`
                      }}
                      className="bg-amber-500/15 border border-amber-500/40 text-amber-400 rounded-full font-mono font-bold tracking-wider flex items-center gap-1.5 normal-case shrink-0 shadow-sm animate-bounce"
                    >
                      <WifiOff size={11 * headerScale} className="text-amber-400" />
                      <span>Saskatchewan Cache Active</span>
                    </span>
                  )}
                  <p 
                    style={{
                      fontSize: `${(sizes.header?.isEnlarged ? 12 : 11) * headerScale}px`
                    }}
                    className="text-slate-300 transition-all font-medium"
                  >
                    Private Saskatoon & Saskatchewan community safety watch and geocoded hazard monitor.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
            <div 
              style={{
                gap: `${10 * headerScale}px`
              }}
              className="flex flex-wrap items-center"
            >
              {/* Saskatchewan Regional Hubs Selector */}
              <div 
                style={{
                  padding: `${(sizes.header?.isMinimized ? 4 : 6) * headerScale}px ${(sizes.header?.isMinimized ? 8 : 12) * headerScale}px`
                }}
                className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded focus-within:ring-1 focus-within:ring-blue-500 transition-all"
              >
                <MapPin size={13 * headerScale} className="text-blue-400 shrink-0" />
                <label 
                  style={{ fontSize: `${10 * headerScale}px` }}
                  htmlFor="city-selector-dropdown" 
                  className="uppercase font-bold tracking-wider text-slate-400 font-mono select-none"
                >
                  Regional Hub:
                </label>
                <select
                  id="city-selector-dropdown"
                  value={selectedCity}
                  onChange={(e) => handleCityChange(e.target.value)}
                  style={{ fontSize: `${12 * headerScale}px` }}
                  className="bg-transparent text-white font-sans font-semibold focus:outline-none cursor-pointer pr-1 outline-none border-none ring-0 select-none [&>option]:bg-slate-900"
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
                style={{
                  fontSize: `${12 * headerScale}px`,
                  padding: `${(sizes.header?.isMinimized ? 4 : 8) * headerScale}px ${(sizes.header?.isMinimized ? 10 : 14) * headerScale}px`
                }}
                className="cursor-pointer bg-transparent hover:bg-slate-800 border border-slate-305 text-white font-semibold rounded flex items-center gap-1.5 transition-all shadow-sm font-sans"
              >
                <BarChart3 size={14 * headerScale} className="text-white" />
                <span>Regional Safety Metrics</span>
              </button>

              {/* Quick help button */}
              <button
                onClick={() => setShowHelpGuide(true)}
                style={{
                  fontSize: `${12 * headerScale}px`,
                  padding: `${(sizes.header?.isMinimized ? 4 : 8) * headerScale}px ${(sizes.header?.isMinimized ? 10 : 14) * headerScale}px`
                }}
                className="cursor-pointer bg-transparent hover:bg-slate-800 border border-slate-305 text-white font-semibold rounded flex items-center gap-1.5 transition-all"
              >
                <HelpCircle size={14 * headerScale} className="text-blue-400 border-none" />
                <span>Safety Disclaimer</span>
              </button>

              {/* Layout Adjustments Sizing Dashboard button */}
              <button
                type="button"
                id="layout-adjustments-sizing-btn"
                onClick={() => setIsAdjustmentPanelOpen(!isAdjustmentPanelOpen)}
                style={{
                  fontSize: `${12 * headerScale}px`,
                  padding: `${(sizes.header?.isMinimized ? 4 : 8) * headerScale}px ${(sizes.header?.isMinimized ? 10 : 14) * headerScale}px`
                }}
                className="cursor-pointer bg-transparent hover:bg-slate-800 border border-slate-305 text-white font-semibold rounded flex items-center gap-1.5 transition-all"
              >
                <Settings size={14 * headerScale} className="text-blue-400 shrink-0" />
                <span>Sizing Dashboard</span>
              </button>

              {/* Firestore Cloud Sync & Google Auth */}
              {currentUser ? (
                <div 
                  style={{
                    fontSize: `${12 * headerScale}px`,
                    padding: `${(sizes.header?.isMinimized ? 3 : 5) * headerScale}px ${(sizes.header?.isMinimized ? 6 : 10) * headerScale}px`
                  }}
                  className="bg-emerald-500/10 border border-emerald-500/30 text-white rounded flex items-center gap-2 transition-all shadow-sm"
                >
                  <div className="flex items-center gap-1.5 normal-case font-medium">
                    {currentUser.photoURL ? (
                      <img 
                        src={currentUser.photoURL} 
                        alt="Profile" 
                        className="h-5 w-5 rounded-full border border-emerald-500"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-[10px] text-white">
                        {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : "W"}
                      </div>
                    )}
                    <span className="text-emerald-400 font-bold hidden xl:inline">
                      {currentUser.displayName || "Watch Officer"}
                    </span>
                  </div>
                  
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                    <Database size={11} className="text-emerald-400 animate-pulse" />
                    Cloud Synced
                  </span>

                  <button
                    type="button"
                    title="Log Out of Cloud Sync"
                    onClick={async () => {
                      try {
                        await signOut(auth);
                        setSuccessToast("Logged out of safety registry. Operating in Cache Mode.");
                      } catch (err: any) {
                        console.error("[Logout Error]:", err);
                      }
                    }}
                    className="cursor-pointer hover:text-red-400 text-slate-300 ml-1 border-none focus:outline-none"
                  >
                    <LogOut size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  id="google-signin-btn"
                  onClick={async () => {
                    try {
                      const result = await signInWithPopup(auth, googleProvider);
                      if (result.user) {
                        setSuccessToast(`Welcome, ${result.user.displayName || "Saskatoon Watch Officer"}! Your cloud sync is active.`);
                      }
                    } catch (err: any) {
                      console.error("[Login Error] Google sign-in rejected:", err);
                      setErrorMessage(`Sign-in could not be completed. Details: ${err.message || "Request timed out"}`);
                    }
                  }}
                  style={{
                    fontSize: `${12 * headerScale}px`,
                    padding: `${(sizes.header?.isMinimized ? 4 : 8) * headerScale}px ${(sizes.header?.isMinimized ? 10 : 14) * headerScale}px`
                  }}
                  className="cursor-pointer bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white font-semibold rounded flex items-center gap-1.5 transition-all shadow-sm font-sans"
                >
                  <LogIn size={14 * headerScale} className="text-white animate-pulse" />
                  <span>Google Cloud Sync</span>
                </button>
              )}
            </div>
            
            {/* Display status */}
            {!sizes.header?.isMinimized && (
              <div 
                style={{
                  padding: `${5 * headerScale}px ${12 * headerScale}px`,
                  fontSize: `${10 * headerScale}px`
                }}
                className="flex items-center gap-2 bg-slate-950/20 border border-slate-700/50 rounded font-mono select-none text-slate-405 md:mr-auto"
              >
                <span className="text-slate-500 text-[9px] font-bold">SYSTEM STATE:</span>
                <span className="text-emerald-400 flex items-center gap-1 font-bold">
                  <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full inline-block animate-ping"></span>
                  ACTIVE MONITORING
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Global Alert Disclaimer strip */}
        {!sizes.disclaimer?.isMinimized && (
          <div 
            style={{
              padding: `${(sizes.disclaimer?.isEnlarged ? 18 : 10) * disclaimerScale}px`,
              fontSize: `${(sizes.disclaimer?.isEnlarged ? 12.5 : 11.5) * disclaimerScale}px`,
              gap: `${12 * disclaimerScale}px`
            }}
            className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg flex leading-relaxed shadow-sm font-medium transition-all duration-300"
          >
            <AlertCircle size={16 * disclaimerScale} className="text-amber-600 shrink-0 mt-0.5 animate-bounce" />
            <span className="text-slate-700">
              <strong className="font-bold uppercase tracking-widest font-mono mr-1.5 text-amber-800" style={{ fontSize: `${10 * disclaimerScale}px` }}>Safety Notice:</strong>
              Locations are approximate and delay-adjusted. This personal incident map is designed purely for community awareness only and should not be used for emergency situations, accusation decisions, suspect identifiers, or legal determinations.
            </span>
          </div>
        )}
      </header>

      {/* Main Full Stack Application Division */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
           {/* Left Workspace Panel: Sidebar Filters + Interactive Cards List */}
        <div 
          ref={sidebarContainerRef}
          style={{
            width: isSidebarCollapsed ? "0px" : `${sidebarWidth}px`,
            minWidth: isSidebarCollapsed ? "0px" : `${sidebarWidth}px`,
          }}
          className={`border-r border-slate-200 flex flex-col h-full bg-white shrink-0 print-hidden relative ${
            isDraggingSidebar ? "" : "transition-all duration-300"
          }`}
        >
          {/* Vertical Resizer Handle Edge */}
          <div
            onMouseDown={handleSidebarResizeStart}
            className={`absolute top-0 w-4 h-full cursor-col-resize z-[1001] bg-transparent flex items-center justify-center group select-none ${
              isDraggingSidebar ? "bg-blue-500/5" : ""
            }`}
            style={isSidebarCollapsed ? { left: 0 } : { right: "-8px" }}
            title={isSidebarCollapsed ? "Click or drag right to restore Sidebar" : "Drag left or right with your cursor to resize sidebar width / Click to collapse"}
          >
            {/* Thin vertical line that lights up */}
            <div className={`w-0.5 h-full border-r border-dashed transition-all ${
              isDraggingSidebar 
                ? "border-blue-650 bg-blue-650 scale-x-125 opacity-100" 
                : "border-slate-300 hover:border-blue-400 group-hover:border-blue-500 group-hover:scale-x-110 opacity-75 group-hover:opacity-100"
            }`} />
            
            {/* Grip Handle Indicator Capsule */}
            <div 
              className={`absolute w-5 h-12 rounded-full border shadow-md transition-all flex flex-col gap-1 items-center justify-center cursor-pointer ${
                isDraggingSidebar 
                  ? "bg-slate-900 border-slate-800 text-white scale-110" 
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 hover:scale-105"
              }`}
              style={{ top: "calc(50% - 24px)" }}
            >
              {isSidebarCollapsed ? (
                <ChevronRight size={10} className="font-bold stroke-[3]" />
              ) : (
                <ChevronLeft size={10} className="font-bold stroke-[3]" />
              )}
              <div className="flex flex-col gap-0.5">
                <div className="w-1 h-1 rounded-full bg-slate-300 group-hover:bg-slate-500" />
                <div className="w-1 h-1 rounded-full bg-slate-300 group-hover:bg-slate-500" />
              </div>
            </div>
          </div>
          {/* Main workspace grouping */}
          <div style={isSidebarCollapsed ? { display: "none" } : {}} className="flex-1 flex flex-col overflow-hidden w-full h-full">
            {/* 1. UPPER FEED FILTERS CONTAINER */}
            {sizes.filters?.isMinimized ? (
              <div className="h-[48px] shrink-0 bg-slate-50 border-b border-slate-150 flex items-center justify-between px-3 w-full font-mono text-[10px] select-none text-slate-500 font-bold">
                <span className="flex items-center gap-1.5 uppercase font-black text-slate-500 tracking-wider">
                  <Filter size={11} className="text-slate-400" />
                  Filters (Collapsed)
                </span>
                <button
                  type="button"
                  onClick={() => toggleSizing("filters", "normal")}
                  className="cursor-pointer text-[9.5px] bg-white hover:bg-slate-100 border border-slate-250 hover:border-slate-350 text-blue-600 px-2 py-0.5 rounded font-black font-sans uppercase shadow-sm"
                >
                  Expand Filters ↗
                </button>
              </div>
            ) : (
              <div 
                style={
                  sizes.sidebarTabs?.isMinimized
                    ? { height: "100%" }
                    : sizes.filters?.isMinimized
                      ? { height: "0px", overflow: "hidden" }
                      : { height: `${filtersHeightPercent}%` }
                }
                className={`flex flex-col overflow-hidden relative border-b border-slate-200/60 ${
                  isDraggingSplit ? "" : "transition-all duration-300"
                }`}
              >
                {/* Horizontal Resizer Handle Edge */}
                {!sizes.filters?.isMinimized && !sizes.sidebarTabs?.isMinimized && (
                  <div
                    onMouseDown={handleSplitResizeStart}
                    className={`absolute -bottom-2 left-0 right-0 h-4 cursor-row-resize z-[1001] bg-transparent flex items-center justify-center group select-none ${
                      isDraggingSplit ? "bg-blue-500/5" : ""
                    }`}
                    title="Drag up or down with your cursor to distribute height between filters and feed"
                  >
                    {/* Visual horizontal splitter line */}
                    <div className={`h-0.5 w-full border-b border-dashed transition-all ${
                      isDraggingSplit
                        ? "border-blue-650 bg-blue-650 scale-y-125 opacity-100"
                        : "border-slate-300 hover:border-blue-400 group-hover:border-blue-500 group-hover:scale-y-110 opacity-75 group-hover:opacity-100"
                    }`} />
                    
                    {/* Horizontal capsule pill handle */}
                    <div className={`absolute h-1.5 w-12 rounded-full border shadow-sm transition-all flex gap-1 items-center justify-center ${
                      isDraggingSplit
                        ? "bg-blue-650 border-blue-500 scale-110"
                        : "bg-white border-slate-200 group-hover:bg-blue-50 group-hover:border-blue-300 group-hover:scale-105"
                    }`}>
                      {/* 3 tiny horizontal grip dots */}
                      <div className={`h-1 w-1 rounded-full ${isDraggingSplit ? "bg-blue-100" : "bg-slate-400 group-hover:bg-blue-500"}`} />
                      <div className={`h-1 w-1 rounded-full ${isDraggingSplit ? "bg-blue-100" : "bg-slate-400 group-hover:bg-blue-500"}`} />
                      <div className={`h-1 w-1 rounded-full ${isDraggingSplit ? "bg-blue-100" : "bg-slate-400 group-hover:bg-blue-500"}`} />
                    </div>
                  </div>
                )}
                {/* Embedded controls for Filters */}
                <div className="bg-slate-50/80 border-b border-slate-100 p-2 px-3.5 flex items-center justify-between text-[10.5px] shrink-0 select-none">
                  <span className="font-extrabold uppercase tracking-widest text-[9.5px] text-slate-500 font-mono flex items-center gap-1.5">
                    <Filter size={11} className="text-blue-500" />
                    Feed Filters & Synclist
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="Minimize Filters block"
                      onClick={() => toggleSizing("filters", "minimize")}
                      className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-800 rounded cursor-pointer transition-colors"
                    >
                      <Minus size={11} />
                    </button>
                    <button
                      type="button"
                      title="Enlarge Filters height"
                      onClick={() => toggleSizing("filters", "enlarge")}
                      className={`p-1 rounded cursor-pointer transition-all ${
                        sizes.filters?.isEnlarged 
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200" 
                          : "hover:bg-slate-200 text-slate-400 hover:text-slate-800"
                      }`}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
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
              </div>
            )}

            {/* 2. LOWER FEED LIST & TOOLS TAB PANELS */}
            {sizes.sidebarTabs?.isMinimized ? (
              <div className="h-[40px] shrink-0 bg-slate-50 border-t border-slate-200 flex items-center justify-between px-3 w-full font-mono text-[10px] select-none text-slate-500 font-bold">
                <span className="flex items-center gap-1.5 uppercase font-black text-slate-450 tracking-wider">
                  <BarChart3 size={11} className="text-slate-400" />
                  Live Feed & Tools (Collapsed)
                </span>
                <button
                  type="button"
                  onClick={() => toggleSizing("sidebarTabs", "normal")}
                  className="cursor-pointer text-[9.5px] bg-white hover:bg-slate-100 border border-slate-250 hover:border-slate-350 text-blue-600 px-2 py-0.5 rounded font-black font-sans uppercase shadow-sm"
                >
                  Expand Tools ↗
                </button>
              </div>
            ) : (
              <div 
                style={
                  sizes.filters?.isMinimized
                    ? { height: "100%" }
                    : sizes.sidebarTabs?.isMinimized
                      ? { height: "0px", overflow: "hidden" }
                      : { height: `${100 - filtersHeightPercent}%` }
                }
                className={`flex-1 flex flex-col overflow-hidden bg-[#F8FAFC]/50 ${
                  isDraggingSplit ? "" : "transition-all duration-300"
                }`}
              >
                <div className="bg-slate-50 border-b border-slate-105 flex items-center justify-between shrink-0 p-2 border-slate-150 select-none">
                  <div className="flex gap-1 bg-slate-200/50 p-1 rounded-lg overflow-x-auto whitespace-nowrap scrollbar-none shrink-0 max-w-[75%] scroll-smooth">
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
                      id="projection-tab-trigger"
                      onClick={() => setSidebarTab("projection")}
                      className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                        sidebarTab === "projection"
                          ? "bg-rose-500 text-white shadow-sm"
                          : "text-slate-450 hover:text-rose-600"
                      }`}
                    >
                      <Flame size={11} className={sidebarTab === "projection" ? "animate-pulse" : ""} />
                      Hotspots
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
                    <button
                      type="button"
                      id="zones-tab-trigger"
                      onClick={() => setSidebarTab("zones")}
                      className={`cursor-pointer px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all duration-200 uppercase tracking-wide flex items-center gap-1 leading-none ${
                        sidebarTab === "zones"
                          ? "bg-violet-605 text-violet-800 bg-white shadow-sm border border-violet-200"
                          : "text-slate-450 hover:text-violet-655"
                      }`}
                    >
                      <Bell size={11} className={sidebarTab === "zones" ? "animate-bounce" : ""} />
                      Alert Zones ({customPins.filter(p => p.isAlertZone).length})
                    </button>
                  </div>
                  
                  {/* Inline size buttons for tools */}
                  <div className="flex items-center gap-1 pr-1 border-l border-slate-200 pl-2 shrink-0">
                    <button
                      type="button"
                      title="Minimize tools results"
                      onClick={() => toggleSizing("sidebarTabs", "minimize")}
                      className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-800 rounded cursor-pointer transition-colors"
                    >
                      <Minus size={11} />
                    </button>
                    <button
                      type="button"
                      title="Enlarge tools results"
                      onClick={() => toggleSizing("sidebarTabs", "enlarge")}
                      className={`p-1 rounded cursor-pointer transition-all ${
                        sizes.sidebarTabs?.isEnlarged 
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200" 
                          : "hover:bg-slate-200 text-slate-400 hover:text-slate-800"
                      }`}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
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
                ) : sidebarTab === "projection" ? (
                  <div className="flex-1 overflow-hidden flex flex-col bg-slate-55" id="tab-projection-container">
                    <HotspotProjectionPanel
                      events={events}
                      showHeatmap={showHeatmap}
                      setShowHeatmap={setShowHeatmap}
                      heatmapOpacity={heatmapOpacity}
                      onToggleOpacity={handleToggleHeatmapOpacity}
                      heatmapRadiusMultiplier={heatmapRadiusMultiplier}
                      setHeatmapRadiusMultiplier={setHeatmapRadiusMultiplier}
                      onAlignMap={(coords) => {
                        const dummyEvent = {
                          id: `temp-coords-${coords[0].toFixed(4)}-${coords[1].toFixed(4)}`,
                          title: "Projected Risk Focus Area",
                          summary: "Hotspot zone identified by spatial algorithm.",
                          severity: "high" as SeverityType,
                          latitude: coords[0],
                          longitude: coords[1],
                          locationText: "Projected High-stakes Zone",
                          publishedAt: new Date().toISOString(),
                        } as EventItem;
                        setSelectedEvent(dummyEvent);
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
                ) : sidebarTab === "zones" ? (
                  <div className="flex-1 overflow-hidden flex flex-col bg-slate-55" id="tab-zones-container">
                    <AlertZonesPanel
                      customPins={customPins}
                      setCustomPins={setCustomPins}
                      events={events}
                      customRoutes={customRoutes}
                      setCustomRoutes={setCustomRoutes}
                      isDrawingRoute={isDrawingRoute}
                      setIsDrawingRoute={setIsDrawingRoute}
                      currentDrawnPath={currentDrawnPath}
                      setCurrentDrawnPath={setCurrentDrawnPath}
                      selectedRouteId={selectedRouteId}
                      setSelectedRouteId={setSelectedRouteId}
                      onSelectZone={(pin) => {
                        const dummyEvent = {
                          id: `custom-pin-${pin.id}`,
                          title: pin.title,
                          summary: pin.note || "User Safety Watch Area",
                          severity: pin.severity,
                          latitude: pin.latitude,
                          longitude: pin.longitude,
                          locationText: "User Alert Zone",
                          publishedAt: pin.createdAt,
                          eventType: pin.zoneType || "custom"
                        } as any;
                        setSelectedEvent(dummyEvent);
                      }}
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
                              <div className="flex gap-1.5 items-center select-none shrink-0 text-[8px]">
                                {/* Location Precision Indicator */}
                                <span className={`font-mono text-[8.5px] px-1 py-0.5 rounded border font-extrabold capitalize ${
                                  evt.locationPrecision === "exact" ? "bg-emerald-50 text-emerald-700 border-emerald-150 animate-pulse" : 
                                  evt.locationPrecision === "block" || evt.locationPrecision === "intersection" ? "bg-blue-50 text-blue-750 border-blue-150" : 
                                  "bg-slate-50 text-slate-550 border-slate-200"
                                }`}>
                                  📍 {evt.locationPrecision}
                                </span>

                                {/* Source Tier Indicator */}
                                <span className={`font-mono text-[8.5px] px-1 py-0.5 rounded border font-extrabold ${
                                  evt.sourceTier === 1 ? "bg-rose-50 text-rose-700 border-rose-200" : 
                                  evt.sourceTier === 2 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : 
                                  evt.sourceTier === 3 ? "bg-amber-50 text-amber-700 border-amber-200" : 
                                  "bg-purple-50 text-purple-700 border-purple-200"
                                }`}>
                                  {evt.sourceTier === 1 && "🛡️ T1: Official"}
                                  {evt.sourceTier === 2 && "📰 T2: News"}
                                  {evt.sourceTier === 3 && "⚠️ T3: Advisory"}
                                  {evt.sourceTier === 4 && "🤖 T4: Derived"}
                                  {!evt.sourceTier && "⚠️ T3: Advisory"}
                                </span>

                                {bookmarks.includes(evt.id) && (
                                  <span className="text-amber-605 font-bold font-mono text-[9px] shrink-0">★ SAVED</span>
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
            )}
          </div>
        </div>

        {/* Center Sandbox: Leaflet Canvas Map + Legend Guides */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#F8FAFC] map-print-wrapper">
          
          {/* FLOATING SIZING CONTROL PANEL (TACTICAL DYNAMIC COCKPIT WITH ADJUSTABLE RANGE SLIDERS) */}
          {isAdjustmentPanelOpen && (
            <div className="absolute top-4 right-4 z-[1100] w-80 bg-slate-900/95 backdrop-blur-md border border-slate-705 rounded-xl shadow-2xl p-4 text-white font-sans max-h-[80vh] overflow-y-auto select-none">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 select-none">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="h-2 w-2 bg-emerald-400 rounded-full inline-block animate-pulse"></span>
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-200">
                    Sizing Sliders Console
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setHeaderScale(1.0);
                      setDisclaimerScale(1.0);
                      setTimelineHeight(140);
                      setMapOpacity(100);
                      setLegendScale(1.0);
                      setSidebarWidth(350);
                      setFiltersHeightPercent(50);
                      setDrawerWidth(380);
                    }}
                    title="Reset all dimension parameters to default dimensions"
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer text-[9px] font-mono flex items-center gap-1 uppercase font-bold"
                  >
                    Reset
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAdjustmentPanelOpen(false)}
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                {/* 1. Header Scale Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Header Scale</span>
                    <span className="text-emerald-400 font-extrabold">{(headerScale * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0.7"
                    max="1.4"
                    step="0.05"
                    value={headerScale}
                    onChange={(e) => setHeaderScale(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>Compact (70%)</span>
                    <span>100%</span>
                    <span>Large (140%)</span>
                  </div>
                </div>

                {/* 2. Notice Banner Scale Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Disclaimer Scale</span>
                    <span className="text-emerald-400 font-extrabold">{(disclaimerScale * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0.6"
                    max="1.4"
                    step="0.05"
                    value={disclaimerScale}
                    onChange={(e) => setDisclaimerScale(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>Small (60%)</span>
                    <span>100%</span>
                    <span>Large (140%)</span>
                  </div>
                </div>

                {/* 3. Sidebar Width Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Sidebar Width</span>
                    <span className="text-emerald-400 font-extrabold">{sidebarWidth}px</span>
                  </div>
                  <input 
                    type="range"
                    min="180"
                    max="600"
                    step="5"
                    value={sidebarWidth}
                    onChange={(e) => setSidebarWidth(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>Compact (180px)</span>
                    <span>Wide (600px)</span>
                  </div>
                </div>

                {/* 4. Split Proportion Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Feed vertical split</span>
                    <span className="text-emerald-400 font-extrabold">{filtersHeightPercent.toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="15"
                    max="85"
                    step="1"
                    value={filtersHeightPercent}
                    onChange={(e) => setFiltersHeightPercent(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>15% (Short filter)</span>
                    <span>85% (Tall filter)</span>
                  </div>
                </div>

                {/* 5. Detail Drawer Width Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Detail Sheet Width</span>
                    <span className="text-emerald-400 font-extrabold">{drawerWidth}px</span>
                  </div>
                  <input 
                    type="range"
                    min="260"
                    max="800"
                    step="10"
                    value={drawerWidth}
                    onChange={(e) => setDrawerWidth(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>260px</span>
                    <span>800px</span>
                  </div>
                </div>

                {/* 6. Timeline Height Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Timeline Height</span>
                    <span className="text-emerald-400 font-extrabold">{timelineHeight}px</span>
                  </div>
                  <input 
                    type="range"
                    min="70"
                    max="280"
                    step="5"
                    value={timelineHeight}
                    onChange={(e) => setTimelineHeight(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>70px</span>
                    <span>280px</span>
                  </div>
                </div>

                {/* 7. Map Opacity Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Map Base Opacity</span>
                    <span className="text-emerald-400 font-extrabold">{mapOpacity}%</span>
                  </div>
                  <input 
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={mapOpacity}
                    onChange={(e) => setMapOpacity(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>Translucent (20%)</span>
                    <span>Opaque (100%)</span>
                  </div>
                </div>

                {/* 8. Map Legend Scale Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Map Legend Scale</span>
                    <span className="text-emerald-400 font-extrabold">{(legendScale * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={legendScale}
                    onChange={(e) => setLegendScale(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>Compact (70%)</span>
                    <span>Standard</span>
                    <span>Wide (130%)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Map view overlaying incident pins */}
          <div 
            id="map-container"
            style={{ opacity: mapOpacity / 100 }}
            className="flex-1 h-full w-full relative z-0 transition-opacity duration-150"
          >
            <IncidentMap
              events={filteredEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              showHeatmap={showHeatmap}
              setShowHeatmap={setShowHeatmap}
              heatmapOpacity={heatmapOpacity}
              onToggleOpacity={handleToggleHeatmapOpacity}
              mapCenter={activeCityCoords}
              mapStyle={mapStyle}
              setMapStyle={setMapStyle}
              showPins={showPins}
              setShowPins={setShowPins}
              useWebGLHeatmap={useWebGLHeatmap}
              setUseWebGLHeatmap={setUseWebGLHeatmap}
              customPins={customPins}
              setCustomPins={setCustomPins}
              heatmapRadiusMultiplier={heatmapRadiusMultiplier}
              setHeatmapRadiusMultiplier={setHeatmapRadiusMultiplier}
              customRoutes={customRoutes}
              setCustomRoutes={setCustomRoutes}
              isDrawingRoute={isDrawingRoute}
              setIsDrawingRoute={setIsDrawingRoute}
              currentDrawnPath={currentDrawnPath}
              setCurrentDrawnPath={setCurrentDrawnPath}
              selectedRouteId={selectedRouteId}
              setSelectedRouteId={setSelectedRouteId}
              onMapUpdate={(zoom, lat, lng) => {
                setMapZoom(zoom);
                setMapCenterCoords({ lat, lng });
              }}
            />

            {/* Absolute-positioned semi-transparent real-time info panel inside #map-container */}
            <div 
              className={`absolute bottom-4 right-4 z-[400] backdrop-blur-[4px] border rounded-lg px-3 py-1.5 text-xs font-mono shadow-lg select-none flex items-center gap-3 print-hidden transition-all duration-200 ${
                mapStyle === "streets"
                  ? "bg-white/60 border-slate-200 text-slate-800 shadow-slate-100"
                  : "bg-slate-900/60 border-slate-700 text-slate-200 shadow-black/40"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold opacity-60 uppercase text-[9px]">ZOOM:</span>
                <span className={`font-black px-1.5 py-0.5 rounded leading-none text-[11px] ${
                  mapStyle === "streets" ? "bg-slate-100 text-slate-900 border border-slate-200" : "bg-slate-800 text-slate-100 border border-slate-700"
                }`}>{mapZoom}</span>
              </div>
              <span className="opacity-30">|</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold opacity-60 uppercase text-[9px]">COORDINATES:</span>
                <span className="font-semibold">{mapCenterCoords.lat.toFixed(4)}°, {mapCenterCoords.lng.toFixed(4)}°</span>
              </div>
            </div>
          </div>

          <div 
            style={{ height: `${isTimelineCollapsed ? 0 : timelineHeight}px` }}
            className={`border-t border-slate-200 shrink-0 z-10 print-hidden bg-[#F8FAFC] select-none relative ${
              isDraggingTimeline ? "" : "transition-all duration-300"
            }`}
          >
            {/* Horizontal Resizer Handle Edge for Timeline */}
            <div
              onMouseDown={handleTimelineResizeStart}
              className={`absolute top-0 left-0 right-0 h-4 -mt-2 cursor-row-resize z-[1001] bg-transparent flex items-center justify-center group select-none ${
                isDraggingTimeline ? "bg-blue-500/5" : ""
              }`}
              title={isTimelineCollapsed ? "Click or drag up to restore Timeline" : "Drag up or down to resize timeline height / Click to collapse"}
            >
              {/* Thin horizontal line that lights up */}
              <div className={`h-0.5 w-full border-b border-dashed transition-all ${
                isDraggingTimeline 
                  ? "border-blue-650 bg-blue-650 scale-y-125 opacity-100" 
                  : "border-slate-300 hover:border-blue-400 group-hover:border-blue-500 group-hover:scale-y-110 opacity-75 group-hover:opacity-100"
              }`} />
              
              {/* Grip Handle Indicator Capsule */}
              <div 
                className={`absolute h-4 w-12 rounded-full border shadow-sm transition-all flex gap-1 items-center justify-center cursor-pointer ${
                  isDraggingTimeline 
                    ? "bg-slate-900 border-slate-800 text-white scale-110" 
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 hover:scale-105"
                }`}
              >
                {isTimelineCollapsed ? (
                  <ChevronUp size={10} className="font-bold stroke-[3]" />
                ) : (
                  <ChevronDown size={10} className="font-bold stroke-[3]" />
                )}
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 rounded-full bg-slate-300 group-hover:bg-slate-500" />
                  <div className="w-1 h-1 rounded-full bg-slate-300 group-hover:bg-slate-500" />
                </div>
              </div>
            </div>

            <div style={isTimelineCollapsed ? { display: "none" } : {}} className="w-full h-full p-2.5 overflow-y-auto">
              <IncidentTimeline events={filteredEvents} />
            </div>
          </div>

          {/* Informative Legend footer panel wrapper */}
          <div 
            style={{ 
              transform: `scale(${legendScale})`, 
              transformOrigin: "bottom left",
              width: `${100 / legendScale}%`
            }}
            className="p-3 bg-[#F8FAFC] border-t border-slate-200 shrink-0 z-10 print-hidden transition-transform duration-150"
          >
            <MapLegend 
              onShowHelp={() => setShowHelpGuide(true)} 
              showHeatmap={showHeatmap}
              onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
              heatmapOpacity={heatmapOpacity}
              onToggleOpacity={handleToggleHeatmapOpacity}
              setHeatmapOpacity={setHeatmapOpacity}
              mapStyle={mapStyle}
              setMapStyle={setMapStyle}
              showPins={showPins}
              setShowPins={setShowPins}
              useWebGLHeatmap={useWebGLHeatmap}
              setUseWebGLHeatmap={setUseWebGLHeatmap}
            />
          </div>
        </div>

        {/* Right Sandbox Slider Panel: Details Sheet Drawer */}
        <AnimatePresence>
          {selectedEvent && (
            <motion.div 
              initial={{ x: "100%", opacity: 0.9 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.9 }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              style={{
                width: isDrawerCollapsed ? "0px" : `${drawerWidth}px`,
                minWidth: isDrawerCollapsed ? "0px" : `${drawerWidth}px`,
              }}
              className={`absolute md:relative inset-y-0 right-0 z-[1000] h-full shadow-2xl print-hidden relative ${
                isDraggingDrawer ? "" : "transition-all duration-300"
              }`}
            >
              {/* Drawer left resize handle */}
              <div
                onMouseDown={handleDrawerResizeStart}
                className={`absolute top-0 w-4 h-full cursor-col-resize z-[1001] bg-transparent flex items-center justify-center group select-none ${
                  isDraggingDrawer ? "bg-blue-500/5" : ""
                }`}
                style={isDrawerCollapsed ? { right: 0 } : { left: "-8px" }}
                title={isDrawerCollapsed ? "Click or drag left to restore details sheet" : "Drag left or right with your cursor to resize details sheet / Click to collapse"}
              >
                {/* Thin vertical line that lights up */}
                <div className={`w-0.5 h-full border-l border-dashed transition-all ${
                  isDraggingDrawer
                    ? "border-blue-650 bg-blue-650 scale-x-125 opacity-100"
                    : "border-slate-300 hover:border-blue-400 group-hover:border-blue-500 group-hover:scale-x-110 opacity-75 group-hover:opacity-100"
                }`} />
                
                {/* Grip Handle Indicator Capsule */}
                <div 
                  className={`absolute w-5 h-12 rounded-full border shadow-md transition-all flex flex-col gap-1 items-center justify-center cursor-pointer ${
                    isDraggingDrawer
                      ? "bg-slate-900 border-slate-800 text-white scale-110"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 hover:scale-105"
                  }`}
                  style={{ top: "calc(50% - 24px)" }}
                >
                  {isDrawerCollapsed ? (
                    <ChevronLeft size={10} className="font-bold stroke-[3]" />
                  ) : (
                    <ChevronRight size={10} className="font-bold stroke-[3]" />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <div className="w-1 h-1 rounded-full bg-slate-300 group-hover:bg-slate-500" />
                    <div className="w-1 h-1 rounded-full bg-slate-300 group-hover:bg-slate-500" />
                  </div>
                </div>
              </div>
              <div style={isDrawerCollapsed ? { display: "none" } : {}} className="flex-1 flex flex-col h-full overflow-hidden">
                <EventDrawer
                  selectedEvent={selectedEvent}
                  onClose={() => setSelectedEvent(null)}
                  isBookmarked={bookmarks.includes(selectedEvent.id)}
                  onToggleBookmark={handleToggleBookmark}
                  bookmarkNote={bookmarkNotes[selectedEvent.id] || ""}
                  onUpdateBookmarkNote={handleUpdateBookmarkNote}
                  sizes={sizes}
                  toggleSizing={toggleSizing}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
