import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { EventItem, SeverityType, CustomRouteItem } from "../types";
import { MapPin, Navigation, Eye, EyeOff, Layers, ZoomIn, Info, Ruler, X, Printer, RotateCcw, RotateCw, Camera, Download, Share2, Copy, Loader2, Check, Route, Waypoints } from "lucide-react";
import html2canvas from "html2canvas";
import WebGLHeatmapOverlay from "./WebGLHeatmapOverlay";

interface IncidentMapProps {
  events: EventItem[];
  selectedEvent: EventItem | null;
  onSelectEvent: (event: EventItem) => void;
  showHeatmap: boolean;
  setShowHeatmap: (val: boolean) => void;
  heatmapOpacity: number;
  onToggleOpacity: () => void;
  mapCenter?: [number, number];
  mapStyle: "dark" | "streets" | "satellite";
  setMapStyle: (style: "dark" | "streets" | "satellite") => void;
  showPins: boolean;
  setShowPins: (val: boolean) => void;
  useWebGLHeatmap: boolean;
  setUseWebGLHeatmap: (val: boolean) => void;
  onMapUpdate?: (zoom: number, lat: number, lng: number) => void;
  customPins: Array<{
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
  }>;
  setCustomPins: React.Dispatch<React.SetStateAction<Array<{
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
  }>>>;
  heatmapRadiusMultiplier: number;
  setHeatmapRadiusMultiplier: (val: number) => void;
  // Custom travel route extensions
  customRoutes?: CustomRouteItem[];
  setCustomRoutes?: React.Dispatch<React.SetStateAction<CustomRouteItem[]>>;
  isDrawingRoute?: boolean;
  setIsDrawingRoute?: (val: boolean) => void;
  currentDrawnPath?: Array<[number, number]>;
  setCurrentDrawnPath?: React.Dispatch<React.SetStateAction<Array<[number, number]>>>;
  selectedRouteId?: string | null;
  setSelectedRouteId?: (val: string | null) => void;
}

interface ClusterItem {
  id: string;
  isCluster: boolean;
  events: EventItem[];
  latitude: number;
  longitude: number;
}

// Distance-based clustering algorithm projecting coordinates in pixel-space at the current zoom level
function getClusters(
  events: EventItem[],
  map: L.Map,
  zoom: number,
  enableClustering: boolean = true,
  distanceThresholdValue: number = 55,
  maxClusterZoomValue: number = 14
): ClusterItem[] {
  if (!enableClustering || zoom >= maxClusterZoomValue) {
    return events.map((evt) => ({
      id: `item-${evt.id}`,
      isCluster: false,
      events: [evt],
      latitude: (evt.displayLatitude ?? evt.latitude),
      longitude: (evt.displayLongitude ?? evt.longitude),
    }));
  }

  const clusters: ClusterItem[] = [];
  const distanceThreshold = distanceThresholdValue; // Pixels at current zoom level to group markers

  events.forEach((evt) => {
    const latLng = L.latLng((evt.displayLatitude ?? evt.latitude), (evt.displayLongitude ?? evt.longitude));
    const projPoint = map.project(latLng, zoom);

    let joined = false;
    for (const cluster of clusters) {
      const clusterLatLng = L.latLng(cluster.latitude, cluster.longitude);
      const clusterProjPoint = map.project(clusterLatLng, zoom);

      if (projPoint.distanceTo(clusterProjPoint) < distanceThreshold) {
        cluster.events.push(evt);
        // Recalculate cluster center as the average of its coordinates
        const count = cluster.events.length;
        cluster.latitude = cluster.events.reduce((sum, e) => sum + (e.displayLatitude ?? e.latitude), 0) / count;
        cluster.longitude = cluster.events.reduce((sum, e) => sum + (e.displayLongitude ?? e.longitude), 0) / count;
        joined = true;
        break;
      }
    }

    if (!joined) {
      clusters.push({
        id: `item-${evt.id}`,
        isCluster: false,
        events: [evt],
        latitude: (evt.displayLatitude ?? evt.latitude),
        longitude: (evt.displayLongitude ?? evt.longitude),
      });
    }
  });

  clusters.forEach((cluster) => {
    if (cluster.events.length > 1) {
      cluster.isCluster = true;
      cluster.id = `cluster-${cluster.events.map((e) => e.id).sort().join("-")}`;
    }
  });

  return clusters;
}

// Custom TileLayer with Cache API support to enable offline map caching
const CacheTileLayer = L.TileLayer.extend({
  createTile: function (this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement("img") as HTMLImageElement;
    tile.crossOrigin = "anonymous";

    L.DomEvent.on(tile, "load", L.Util.bind(function () {
      done(undefined, tile);
    }, this));

    L.DomEvent.on(tile, "error", L.Util.bind(function (err: any) {
      done(err, tile);
    }, this));

    const tileUrl = this.getTileUrl(coords);

    if (typeof caches !== 'undefined') {
      caches.open('offline-map-tiles').then(cache => {
        cache.match(tileUrl).then(response => {
          if (response) {
            response.blob().then(blob => {
              const localUrl = URL.createObjectURL(blob);
              tile.src = localUrl;
            }).catch(() => {
              tile.src = tileUrl;
            });
          } else {
            tile.src = tileUrl;
          }
        }).catch(() => {
          tile.src = tileUrl;
        });
      }).catch(() => {
        tile.crossOrigin = "anonymous";
        tile.src = tileUrl;
      });
    } else {
      tile.crossOrigin = "anonymous";
      tile.src = tileUrl;
    }

    return tile;
  }
});

const OFFLINE_CITIES = [
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
];

// Slippy Map coordinates to tile coordinate calculator for offline download bounding boxes
function latLngToTile(lat: number, lng: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const xtile = Math.floor(((lng + 180) / 360) * n);
  const ytile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x: xtile, y: ytile };
}

export default function IncidentMap({ 
  events, 
  selectedEvent, 
  onSelectEvent,
  showHeatmap,
  setShowHeatmap,
  heatmapOpacity,
  onToggleOpacity,
  mapCenter,
  mapStyle,
  setMapStyle,
  showPins,
  setShowPins,
  useWebGLHeatmap,
  setUseWebGLHeatmap,
  onMapUpdate,
  customPins,
  setCustomPins,
  heatmapRadiusMultiplier,
  setHeatmapRadiusMultiplier,
  customRoutes,
  setCustomRoutes,
  isDrawingRoute,
  setIsDrawingRoute,
  currentDrawnPath,
  setCurrentDrawnPath,
  selectedRouteId,
  setSelectedRouteId
}: IncidentMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapCaptureRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const onMapUpdateRef = useRef(onMapUpdate);

  useEffect(() => {
    onMapUpdateRef.current = onMapUpdate;
  }, [onMapUpdate]);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const heatCirclesRef = useRef<L.Circle[]>([]);

  // Local map settings
  const [floatingPanelWidth, setFloatingPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatoon_floating_panel_width");
      return saved ? parseInt(saved, 10) : 300;
    } catch {
      return 300;
    }
  });
  const [isDraggingFloatingPanel, setIsDraggingFloatingPanel] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem("saskatoon_floating_panel_width", String(floatingPanelWidth));
    } catch {}
  }, [floatingPanelWidth]);

  const handleFloatingPanelDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingFloatingPanel(true);
    const startX = e.clientX;
    const startWidth = floatingPanelWidth;

    const handleMouseMove = (mvEvent: MouseEvent) => {
      const deltaX = startX - mvEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + deltaX, 220), 480);
      setFloatingPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingFloatingPanel(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const [clusterPins, setClusterPins] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("saskatoon_cluster_pins");
      return saved !== "false";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    localStorage.setItem("saskatoon_cluster_pins", String(clusterPins));
  }, [clusterPins]);

  const [clusterDistance, setClusterDistance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatoon_cluster_distance");
      return saved ? parseInt(saved, 10) : 55;
    } catch {
      return 55;
    }
  });

  const [maxClusterZoom, setMaxClusterZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("saskatoon_max_cluster_zoom");
      return saved ? parseInt(saved, 10) : 14;
    } catch {
      return 14;
    }
  });

  useEffect(() => {
    localStorage.setItem("saskatoon_cluster_distance", String(clusterDistance));
  }, [clusterDistance]);

  useEffect(() => {
    localStorage.setItem("saskatoon_max_cluster_zoom", String(maxClusterZoom));
  }, [maxClusterZoom]);

  const [currentZoom, setCurrentZoom] = useState<number>(12);
  const [liveCenter, setLiveCenter] = useState<{ lat: number; lng: number }>({ lat: 52.1332, lng: -106.6700 });
  const [mapRotation, setMapRotation] = useState<number>(0);

  const [isDropPinMode, setIsDropPinMode] = useState<boolean>(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [newPinTitle, setNewPinTitle] = useState<string>("");
  const [newPinNote, setNewPinNote] = useState<string>("");
  const [newPinSeverity, setNewPinSeverity] = useState<SeverityType>("medium");
  const [newPinIsAlertZone, setNewPinIsAlertZone] = useState<boolean>(true);
  const [newPinZoneType, setNewPinZoneType] = useState<'home' | 'apartment' | 'hospital' | 'travel_route' | 'custom'>("custom");
  const [newPinAlertRadius, setNewPinAlertRadius] = useState<number>(1000); // default 1km

  // Offline Caching & Map Region Tile Management States
  const [offlineSelectedCity, setOfflineSelectedCity] = useState<string>("Saskatoon");
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusMsg, setDownloadStatusMsg] = useState<string>("");
  const [isOfflineViewActive, setIsOfflineViewActive] = useState<boolean>(false);
  const [cachedRegions, setCachedRegions] = useState<Array<{
    cityName: string;
    timestamp: string;
    tileCount: number;
    style: string;
  }>>(() => {
    try {
      const saved = localStorage.getItem("saskatchewan_cached_regions");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("saskatchewan_cached_regions", JSON.stringify(cachedRegions));
  }, [cachedRegions]);

  useEffect(() => {
    if (typeof caches !== "undefined") {
      caches.has("offline-map-tiles").then((hasCache) => {
        setIsOfflineViewActive(hasCache && cachedRegions.length > 0);
      });
    }
  }, [cachedRegions]);

  const handleDownloadTiles = async () => {
    const cityObj = OFFLINE_CITIES.find((c) => c.name === offlineSelectedCity);
    if (!cityObj) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatusMsg(`Preparing coordinates mapping for ${cityObj.name}...`);

    const [lat, lng] = cityObj.coords;
    const subdomains = ["a", "b", "c"];
    const urlsToCache: string[] = [];

    // Zoom levels 10, 11, 12, 13 (pristine range for high performance Offline capability)
    for (let z = 10; z <= 13; z++) {
      const { x, y } = latLngToTile(lat, lng, z);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const tx = x + dx;
          const ty = y + dy;

          let activeUrlTemplate = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
          if (mapStyle === "streets") {
            activeUrlTemplate = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
          } else if (mapStyle === "satellite") {
            activeUrlTemplate = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
          }

          if (activeUrlTemplate.includes("{s}")) {
            subdomains.forEach((s) => {
              const u = activeUrlTemplate
                .replace("{s}", s)
                .replace("{z}", String(z))
                .replace("{x}", String(tx))
                .replace("{y}", String(ty))
                .replace("{r}", "");
              urlsToCache.push(u);
            });
          } else {
            const u = activeUrlTemplate
              .replace("{z}", String(z))
              .replace("{x}", String(tx))
              .replace("{y}", String(ty));
            urlsToCache.push(u);
          }
        }
      }
    }

    try {
      if (typeof caches === "undefined") {
        throw new Error("Local cache storage API not supported by this browser.");
      }

      const cache = await caches.open("offline-map-tiles");
      let successCount = 0;

      for (let i = 0; i < urlsToCache.length; i++) {
        const url = urlsToCache[i];
        setDownloadStatusMsg(`Retrieving region tile ${i + 1} of ${urlsToCache.length}...`);

        try {
          const match = await cache.match(url);
          if (match) {
            successCount++;
            setDownloadProgress(Math.round(((i + 1) / urlsToCache.length) * 100));
            continue;
          }

          const response = await fetch(url, { referrerPolicy: "no-referrer" });
          if (response.ok) {
            await cache.put(url, response);
            successCount++;
          }
        } catch (err) {
          console.warn("Ignoring individual tile download failure:", url, err);
        }

        setDownloadProgress(Math.round(((i + 1) / urlsToCache.length) * 100));
      }

      setCachedRegions((prev) => {
        const filtered = prev.filter((r) => !(r.cityName === cityObj.name && r.style === mapStyle));
        return [
          {
            cityName: cityObj.name,
            timestamp: new Date().toISOString(),
            tileCount: successCount,
            style: mapStyle,
          },
          ...filtered,
        ];
      });

      setIsOfflineViewActive(true);
      setDownloadStatusMsg(`Successfully cached ${successCount} map tiles for offline use!`);
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadStatusMsg("");
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setDownloadStatusMsg(`Offline pre-caching failed: ${err.message || "Unknown error occurred"}`);
      setTimeout(() => {
        setIsDownloading(false);
      }, 4000);
    }
  };

  const handleRemoveCache = async (cityName: string, style: string) => {
    try {
      if (typeof caches === "undefined") return;
      const cache = await caches.open("offline-map-tiles");

      const cityObj = OFFLINE_CITIES.find((c) => c.name === cityName);
      if (!cityObj) return;

      const [lat, lng] = cityObj.coords;
      const subdomains = ["a", "b", "c"];
      const urlsToDelete: string[] = [];

      for (let z = 10; z <= 13; z++) {
        const { x, y } = latLngToTile(lat, lng, z);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const tx = x + dx;
            const ty = y + dy;

            let activeUrlTemplate = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
            if (style === "streets") {
              activeUrlTemplate = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
            } else if (style === "satellite") {
              activeUrlTemplate = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
            }

            if (activeUrlTemplate.includes("{s}")) {
              subdomains.forEach((s) => {
                const u = activeUrlTemplate
                  .replace("{s}", s)
                  .replace("{z}", String(z))
                  .replace("{x}", String(tx))
                  .replace("{y}", String(ty))
                  .replace("{r}", "");
                urlsToDelete.push(u);
              });
            } else {
              const u = activeUrlTemplate
                .replace("{z}", String(z))
                .replace("{x}", String(tx))
                .replace("{y}", String(ty));
              urlsToDelete.push(u);
            }
          }
        }
      }

      for (const url of urlsToDelete) {
        await cache.delete(url);
      }

      setCachedRegions((prev) => prev.filter((r) => !(r.cityName === cityName && r.style === style)));
    } catch (err) {
      console.error("Purging cache failed for region:", cityName, err);
    }
  };

  // Snapshot/Take Screen Capture Features
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [shareSuccess, setShareSuccess] = useState<boolean>(false);

  const handleTakeSnapshot = async () => {
    if (!mapCaptureRef.current) return;
    setIsCapturing(true);

    try {
      // Find the map container holding all active layers (Leaflet map tiles, pins, paths, and WebGL Heatmap layer)
      const targetElement = mapCaptureRef.current;

      // Allow map assets to settle/render
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Temporarily clear map CSS rotation / transform to prevent html2canvas skewing and clipping
      const originalTransform = targetElement.style.transform;
      const originalTransition = targetElement.style.transition;
      
      targetElement.style.transition = "none";
      targetElement.style.transform = "none";

      // Allow styles to register
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Capture map container using html2canvas
      const canvas = await html2canvas(targetElement, {
        useCORS: true,
        allowTaint: false,
        logging: false,
        scale: 2, // 2x multiplier for pristine High-Resolution sharpness
        ignoreElements: (element) => {
          // Exclude any controls containing print-hidden or control classes
          return (
            element.classList.contains("print-hidden") ||
            element.classList.contains("leaflet-control-zoom") ||
            element.classList.contains("leaflet-control-scale")
          );
        },
      });

      // Restore original rotation styling and transition animation right after capture
      targetElement.style.transform = originalTransform;
      targetElement.style.transition = originalTransition;

      const dataUrl = canvas.toDataURL("image/png");
      setSnapshotUrl(dataUrl);
      setIsSnapshotModalOpen(true);
    } catch (error) {
      console.error("Error capturing viewport snapshot: ", error);
      alert("Failed to generate map viewport snapshot. Please check browser permissions.");
    } finally {
      setIsCapturing(false);
    }
  };

  const downloadSnapshot = () => {
    if (!snapshotUrl) return;
    const dateFormatted = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = snapshotUrl;
    link.download = `saskatoon_safety_snapshot_${dateFormatted}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copySnapshotToClipboard = async () => {
    if (!snapshotUrl) return;
    try {
      const response = await fetch(snapshotUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
    } catch (e) {
      console.warn("ClipboardItem or write rejected. Falling back to downloading option.", e);
      alert("Direct image copying is restricted by your browser. Please use the Save Image option to download.");
    }
  };

  const shareSnapshot = async () => {
    if (!snapshotUrl) return;
    try {
      const response = await fetch(snapshotUrl);
      const blob = await response.blob();
      const file = new File([blob], "saskatoon_safety_snapshot.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Saskatoon Safety Map Snapshot",
          text: "Here is a tactical snapshot of Saskatoon Safety Map showcasing current public safety reports.",
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 3000);
      } else if (navigator.share) {
        await navigator.share({
          title: "Saskatoon Safety Map Snapshot",
          text: "Active Saskatoon public safety awareness reports.",
          url: window.location.href,
        });
      } else {
        throw new Error("Navigator share not supported");
      }
    } catch (error: any) {
      console.log("Sharing not completed in this security environment:", error);
      alert("Integrated sharing is unavailable in this sandbox frame. Please save the image to share it manually.");
    }
  };

  const getCardinalHeading = (degrees: number) => {
    const normalized = ((degrees % 360) + 360) % 360;
    const index = Math.round(normalized / 22.5) % 16;
    const cardinals = [
      "N", "NNE", "NE", "ENE",
      "E", "ESE", "SE", "SSE",
      "S", "SSW", "SW", "WSW",
      "W", "WNW", "NW", "NNW"
    ];
    return `${normalized}° ${cardinals[index]}`;
  };

  // Distance Measurement tool states & refs
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measureStartLatLng, setMeasureStartLatLng] = useState<L.LatLng | null>(null);
  const [measureEndLatLng, setMeasureEndLatLng] = useState<L.LatLng | null>(null);
  const [measureDistanceText, setMeasureDistanceText] = useState<string | null>(null);

  const measureStartMarkerRef = useRef<L.Marker | null>(null);
  const measureEndMarkerRef = useRef<L.Marker | null>(null);
  const measureLineRef = useRef<L.Polyline | null>(null);
  const measureCircleRef = useRef<L.Circle | null>(null);
  const measurePopupRef = useRef<L.Popup | null>(null);

  const clearMeasurement = () => {
    const map = mapInstanceRef.current;
    if (measureStartMarkerRef.current && map) {
      map.removeLayer(measureStartMarkerRef.current);
    }
    if (measureEndMarkerRef.current && map) {
      map.removeLayer(measureEndMarkerRef.current);
    }
    if (measureLineRef.current && map) {
      map.removeLayer(measureLineRef.current);
    }
    if (measureCircleRef.current && map) {
      map.removeLayer(measureCircleRef.current);
    }
    if (measurePopupRef.current && map) {
      map.removeLayer(measurePopupRef.current);
    }
    measureStartMarkerRef.current = null;
    measureEndMarkerRef.current = null;
    measureLineRef.current = null;
    measureCircleRef.current = null;
    measurePopupRef.current = null;

    setMeasureStartLatLng(null);
    setMeasureEndLatLng(null);
    setMeasureDistanceText(null);
  };

  // Measuring tool map listeners
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!isMeasuring) {
      clearMeasurement();
      return;
    }

    // Set map cursor to crosshair for tactical styling
    const mapContainer = mapContainerRef.current;
    if (mapContainer) {
      mapContainer.style.cursor = "crosshair";
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!measureStartMarkerRef.current) {
        const startLatLng = e.latlng;
        setMeasureStartLatLng(startLatLng);

        const startIcon = L.divIcon({
          className: "measure-endpoint-start",
          html: `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-4 w-4 bg-sky-400 rounded-full opacity-70 animate-ping"></span>
              <span class="relative h-3 w-3 rounded-full bg-sky-500 border border-white shadow"></span>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marker = L.marker(startLatLng, { icon: startIcon, zIndexOffset: 2000 }).addTo(map);
        measureStartMarkerRef.current = marker;

        const polyline = L.polyline([startLatLng, startLatLng], {
          color: "#38bdf8", // Sky blue line
          weight: 2.5,
          dashArray: "5, 5",
          opacity: 0.8,
        }).addTo(map);
        measureLineRef.current = polyline;

        const circle = L.circle(startLatLng, {
          color: "#0284c7",
          weight: 1.5,
          fillColor: "#0284c7",
          fillOpacity: 0.12,
          radius: 0,
        }).addTo(map);
        measureCircleRef.current = circle;

      } else if (!measureEndMarkerRef.current) {
        const endLatLng = e.latlng;
        setMeasureEndLatLng(endLatLng);

        const endIcon = L.divIcon({
          className: "measure-endpoint-end",
          html: `
            <div class="relative flex items-center justify-center">
              <span class="h-3 w-3 rounded-full bg-rose-600 border border-white shadow"></span>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marker = L.marker(endLatLng, { icon: endIcon, zIndexOffset: 2000 }).addTo(map);
        measureEndMarkerRef.current = marker;

        const startLatLng = measureStartMarkerRef.current.getLatLng();
        const distance = startLatLng.distanceTo(endLatLng);

        if (measureLineRef.current) {
          measureLineRef.current.setLatLngs([startLatLng, endLatLng]);
          measureLineRef.current.setStyle({ dashArray: undefined, color: "#38bdf8", weight: 3 });
        }
        if (measureCircleRef.current) {
          measureCircleRef.current.setRadius(distance);
        }

        let textResult = "";
        if (distance < 1000) {
          textResult = `${Math.round(distance)} m`;
        } else {
          textResult = `${(distance / 1000).toFixed(2)} km`;
        }
        setMeasureDistanceText(textResult);

        // Define beautiful overlay label at the midpoint
        const centerLatLng = L.latLng(
          (startLatLng.lat + endLatLng.lat) / 2,
          (startLatLng.lng + endLatLng.lng) / 2
        );

        const popup = L.popup({
          closeButton: false,
          closeOnClick: false,
          autoClose: false,
          className: "custom-measure-tooltip",
        })
          .setLatLng(centerLatLng)
          .setContent(`
            <div style="background-color: #0f172a; color: #ffffff; font-family: monospace; font-size: 11px; padding: 4px 8px; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #1e293b; text-align: center; white-space: nowrap; font-weight: bold;">
              Radius: ${textResult}
            </div>
          `)
          .openOn(map);

        measurePopupRef.current = popup;

      } else {
        clearMeasurement();

        const startLatLng = e.latlng;
        setMeasureStartLatLng(startLatLng);

        const startIcon = L.divIcon({
          className: "measure-endpoint-start",
          html: `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-4 bg-sky-400 w-4 rounded-full opacity-70 animate-ping"></span>
              <span class="relative h-3 w-3 rounded-full bg-sky-500 border border-white shadow"></span>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marker = L.marker(startLatLng, { icon: startIcon, zIndexOffset: 2000 }).addTo(map);
        measureStartMarkerRef.current = marker;

        const polyline = L.polyline([startLatLng, startLatLng], {
          color: "#38bdf8",
          weight: 2.5,
          dashArray: "5, 5",
          opacity: 0.8,
        }).addTo(map);
        measureLineRef.current = polyline;

        const circle = L.circle(startLatLng, {
          color: "#0284c7",
          weight: 1.5,
          fillColor: "#0284c7",
          fillOpacity: 0.12,
          radius: 0,
        }).addTo(map);
        measureCircleRef.current = circle;
      }
    };

    const handleMapMouseMove = (e: L.LeafletMouseEvent) => {
      if (measureStartMarkerRef.current && !measureEndMarkerRef.current) {
        const startLatLng = measureStartMarkerRef.current.getLatLng();
        const currentLatLng = e.latlng;

        if (measureLineRef.current) {
          measureLineRef.current.setLatLngs([startLatLng, currentLatLng]);
        }

        const distance = startLatLng.distanceTo(currentLatLng);
        if (measureCircleRef.current) {
          measureCircleRef.current.setRadius(distance);
        }

        let textResult = "";
        if (distance < 1000) {
          textResult = `${Math.round(distance)} m`;
        } else {
          textResult = `${(distance / 1000).toFixed(2)} km`;
        }
        setMeasureDistanceText(textResult);
      }
    };

    map.on("click", handleMapClick);
    map.on("mousemove", handleMapMouseMove);

    return () => {
      map.off("click", handleMapClick);
      map.off("mousemove", handleMapMouseMove);
      if (mapContainer) {
        mapContainer.style.cursor = "";
      }
    };
  }, [isMeasuring]);

  // 1. Initialize Map instance once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center of Saskatoon, SK coordinates
    const saskatoonCenter: [number, number] = [52.1332, -106.6700];

    const leafletMap = L.map(mapContainerRef.current, {
      center: saskatoonCenter,
      zoom: 12,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: false, // Custom position
      attributionControl: false, // Sleek look
    });

    // Dark matter tile layer for high-contrast dark visual layout
    const darkTileLayer = new (CacheTileLayer as any)(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 20,
      }
    ).addTo(leafletMap);

    mapInstanceRef.current = leafletMap;

    // Add scale indicator at bottom-left corner
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(leafletMap);

    // Track map zoom and move in real-time for marker clustering and info panel reporting
    const handleMapUpdate = () => {
      const zoom = leafletMap.getZoom();
      const center = leafletMap.getCenter();
      setCurrentZoom(zoom);
      setLiveCenter({ lat: center.lat, lng: center.lng });
      if (onMapUpdateRef.current) {
        onMapUpdateRef.current(zoom, center.lat, center.lng);
      }
    };

    leafletMap.on("zoom", handleMapUpdate);
    leafletMap.on("zoomend", handleMapUpdate);
    leafletMap.on("move", handleMapUpdate);
    leafletMap.on("moveend", handleMapUpdate);
    leafletMap.on("viewreset", handleMapUpdate);

    // Run once initially to broadcast map center and zoom values
    handleMapUpdate();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off("zoom", handleMapUpdate);
        mapInstanceRef.current.off("zoomend", handleMapUpdate);
        mapInstanceRef.current.off("move", handleMapUpdate);
        mapInstanceRef.current.off("moveend", handleMapUpdate);
        mapInstanceRef.current.off("viewreset", handleMapUpdate);
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Map click listener for custom pins
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (isDropPinMode) {
        setPendingPinCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        setNewPinTitle("");
        setNewPinNote("");
        setNewPinSeverity("medium");
        setIsPinModalOpen(true);
        setIsDropPinMode(false);
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [isDropPinMode]);

  // Map click listener for custom routes drawing/sketching waypoints
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleRouteMapClick = (e: L.LeafletMouseEvent) => {
      if (isDrawingRoute) {
        L.DomEvent.stopPropagation(e as any);
        if (setCurrentDrawnPath) {
          setCurrentDrawnPath(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
        }
      }
    };

    if (isDrawingRoute) {
      map.on("click", handleRouteMapClick);
    }
    
    return () => {
      map.off("click", handleRouteMapClick);
    };
  }, [isDrawingRoute, setCurrentDrawnPath]);

  // 2. Map style tile switching
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean old layers inside the map
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    let tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    let maxZoom = 20;

    if (mapStyle === "satellite") {
      tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      maxZoom = 18;
    } else if (mapStyle === "streets") {
      tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      maxZoom = 19;
    }

    new (CacheTileLayer as any)(tileUrl, {
      maxZoom,
      attribution: mapStyle === "streets" ? "© OpenStreetMap contributors" : "© CartoDB"
    }).addTo(map);
  }, [mapStyle]);

  // 3. Render / Update Markers dynamically with clustered preventing of overlapping pins
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean up ALL previous markers from the map & markers ref
    Object.keys(markersRef.current).forEach((key) => {
      markersRef.current[key].remove();
    });
    markersRef.current = {};

    // Remove old density circles
    heatCirclesRef.current.forEach((circle) => circle.remove());
    heatCirclesRef.current = [];

    // To identify newly loaded pins, find the maximum retrievedAt timestamp in the dataset.
    // If the maximum retrievedAt target matches, any event within 10 minutes of maxRetrievedAt is considered part of the "fresh batch".
    const maxRetrievedTime = events.reduce((max, e) => {
      const val = e.retrievedAt || e.createdAt || e.publishedAt;
      if (!val) return max;
      const t = new Date(val).getTime();
      return t > max ? t : max;
    }, 0);

    // Helper functions for Tailwind-styled Marker divIcons
    const createCustomDivIcon = (severity: SeverityType, isSelected: boolean, isFresh: boolean) => {
      let colorClass = "bg-blue-500";
      let pingClass = "bg-blue-400";
      let ringClass = "ring-blue-500";

      if (severity === "critical") {
        colorClass = "bg-red-600";
        pingClass = "bg-red-500";
        ringClass = "ring-red-600";
      } else if (severity === "high") {
        colorClass = "bg-orange-500";
        pingClass = "bg-orange-400";
        ringClass = "ring-orange-500";
      } else if (severity === "medium") {
        colorClass = "bg-yellow-400";
        pingClass = "bg-yellow-300";
        ringClass = "ring-yellow-400";
      } else if (severity === "low") {
        colorClass = "bg-slate-300 border border-slate-400";
        pingClass = "bg-slate-200";
        ringClass = "ring-slate-300";
      }

      // If selected add a gorgeous prominent pulsing layout
      const scaleStyle = isSelected ? "scale-140 z-[9990] ring-4 ring-blue-600" : "scale-100 z-[100] ring-1 ring-black/10";
      const freshClass = isFresh ? `new-pin-entry new-pin-glow-${severity}` : "";

      return L.divIcon({
        className: "custom-safety-pin",
        html: `
          <div class="relative flex items-center justify-center p-0.5 rounded-full transition-transform duration-300 ${scaleStyle} ${freshClass}">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${pingClass} opacity-70"></span>
            <span class="relative inline-flex rounded-full h-3.5 w-3.5 ${colorClass}"></span>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
    };

    const createClusterDivIcon = (count: number, highestSeverity: SeverityType, isFresh: boolean) => {
      let colorClass = "bg-blue-500 text-white ring-blue-400/40";
      if (highestSeverity === "critical") {
        colorClass = "bg-red-600 text-white ring-red-500/40";
      } else if (highestSeverity === "high") {
        colorClass = "bg-orange-500 text-white ring-orange-400/40";
      } else if (highestSeverity === "medium") {
        colorClass = "bg-yellow-400 text-slate-900 ring-yellow-300/40";
      } else if (highestSeverity === "low") {
        colorClass = "bg-slate-500 text-white ring-slate-300/40";
      }

      const freshClass = isFresh ? `new-pin-entry new-pin-glow-${highestSeverity}` : "";

      return L.divIcon({
        className: "custom-cluster-marker",
        html: `
          <div class="relative flex items-center justify-center rounded-full font-sans font-extrabold text-[11px] shadow-sm shadow-black/10 border border-white transition-all duration-200 hover:scale-105 cursor-pointer ${colorClass} ring-4 w-8 h-8 ${freshClass}">
            <span>${count}</span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    };

    const createCustomPinIcon = (severity: SeverityType) => {
      let colorClass = "bg-yellow-400 border border-white text-slate-800 shadow-md shadow-yellow-800/50";
      let pingClass = "bg-yellow-300";
      if (severity === "critical") {
        colorClass = "bg-red-600 border border-white text-white shadow-md shadow-red-800/50";
        pingClass = "bg-red-500";
      } else if (severity === "high") {
        colorClass = "bg-orange-500 border border-white text-white shadow-md shadow-orange-800/50";
        pingClass = "bg-orange-400";
      } else if (severity === "low") {
        colorClass = "bg-slate-400 border border-white text-white shadow-md shadow-slate-700/50";
        pingClass = "bg-slate-300";
      }

      return L.divIcon({
        className: "custom-personal-pin animate-[bounce_0.5s_ease-out]",
        html: `
          <div class="relative flex items-center justify-center p-0.5 rounded-full scale-125 z-[5000] ring-2 ring-violet-500/30">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${pingClass} opacity-75 animate-duration-2000"></span>
            <div class="relative inline-flex rounded-full h-4.5 w-4.5 ${colorClass} items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="text-white">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
    };

    // Draw active incident pins or clusters if turned on
    if (showPins) {
      const activeClusters = getClusters(events, map, currentZoom, clusterPins, clusterDistance, maxClusterZoom);

      activeClusters.forEach((cluster) => {
        const coords: [number, number] = [cluster.latitude, cluster.longitude];

        if (cluster.isCluster) {
          // Find if there is any fresh event in the cluster
          const hasFresh = cluster.events.some((e) => {
            const val = e.retrievedAt || e.createdAt || e.publishedAt;
            const evtTime = val ? new Date(val).getTime() : 0;
            return maxRetrievedTime > 0 && evtTime > 0 && (maxRetrievedTime - evtTime) < 10 * 60 * 1000;
          });

          // Find the highest severity level inside this cluster
          let clusterSeverity: SeverityType = "low";
          const severities = cluster.events.map((e) => e.severity);
          if (severities.includes("critical")) {
            clusterSeverity = "critical";
          } else if (severities.includes("high")) {
            clusterSeverity = "high";
          } else if (severities.includes("medium")) {
            clusterSeverity = "medium";
          }

          const clusterMarker = L.marker(coords, {
            icon: createClusterDivIcon(cluster.events.length, clusterSeverity, hasFresh),
          })
            .addTo(map)
            .on("click", () => {
              // Zoom in smoothly on the clicked cluster region
              const currentMapZoom = map.getZoom();
              const nextZoom = Math.min(currentMapZoom + 2, 17);
              map.setView(coords, nextZoom, {
                animate: true,
                duration: 0.8,
              });
            });

          markersRef.current[cluster.id] = clusterMarker;
        } else {
          // Individual standalone pin marker
          const evt = cluster.events[0];
          const isSelected = selectedEvent ? selectedEvent.id === evt.id : false;

          const val = evt.retrievedAt || evt.createdAt || evt.publishedAt;
          const evtTime = val ? new Date(val).getTime() : 0;
          const isFresh = maxRetrievedTime > 0 && evtTime > 0 && (maxRetrievedTime - evtTime) < 10 * 60 * 1000;

          const pinMarker = L.marker(coords, {
            icon: createCustomDivIcon(evt.severity, isSelected, isFresh),
          })
            .addTo(map)
            .on("click", () => {
              onSelectEvent(evt);
            });

          if (isSelected) {
            pinMarker.setZIndexOffset(1000);
          } else {
            pinMarker.setZIndexOffset(0);
          }

          markersRef.current[cluster.id] = pinMarker;
        }
      });
    }


    // Draw Custom Pins
    customPins.forEach((pin) => {
      // 1. Resolve proper custom icon representation or styling for home/apartment/hospital/route/custom
      let zoneTitlePrefix = "";
      let zoneTypeLabel = "Concern Note";
      let zoneColor = "#8b5cf6"; // Violet / default

      if (pin.zoneType === "home") {
        zoneTitlePrefix = "🏠 [Home Zone] ";
        zoneTypeLabel = "Home Safety Zone";
        zoneColor = "#10b981"; // Emerald
      } else if (pin.zoneType === "apartment") {
        zoneTitlePrefix = "🏢 [Apartment Zone] ";
        zoneTypeLabel = "Apartment Zone";
        zoneColor = "#06b6d4"; // Cyan
      } else if (pin.zoneType === "hospital") {
        zoneTitlePrefix = "🏥 [Hospital/Medical] ";
        zoneTypeLabel = "Medical Zone";
        zoneColor = "#f43f5e"; // Rose
      } else if (pin.zoneType === "travel_route") {
        zoneTitlePrefix = "🛣️ [Travel Route Stop] ";
        zoneTypeLabel = "Travel Route Stop";
        zoneColor = "#a855f7"; // Purple
      }

      const pinObj = L.marker([pin.latitude, pin.longitude], {
        icon: createCustomPinIcon(pin.severity),
      }).addTo(map);

      // Draw hollow alert circle around custom pin
      if (pin.isAlertZone) {
        const radMeters = pin.alertRadiusMeters || 1000;
        const circle = L.circle([pin.latitude, pin.longitude], {
          radius: radMeters,
          color: zoneColor,
          weight: 1.5,
          dashArray: "4, 4",
          fillColor: zoneColor,
          fillOpacity: 0.08,
        }).addTo(map);

        // Store circle in heatCirclesRef (which gets cleared automatic on next render)
        heatCirclesRef.current.push(circle);
      }

      // Check intersecting active alerts
      let alertCountFraction = "";
      if (pin.isAlertZone) {
        let count = 0;
        const radMeters = pin.alertRadiusMeters || 1000;
        const pinLatLng = L.latLng(pin.latitude, pin.longitude);
        events.forEach((evt) => {
          const evtLatLng = L.latLng((evt.displayLatitude ?? evt.latitude), (evt.displayLongitude ?? evt.longitude));
          if (pinLatLng.distanceTo(evtLatLng) <= radMeters) {
            count++;
          }
        });

        let iconColor = "text-emerald-500 bg-emerald-50 border-emerald-200/50";
        if (count > 0) {
          iconColor = "text-rose-500 bg-rose-50 border-rose-200/50 animate-pulse";
        }

        alertCountFraction = `
          <div class="mt-2.5 p-2 rounded-lg flex flex-col gap-1 text-[10px] border ${iconColor}">
            <div class="flex items-center justify-between font-bold">
              <span class="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2500/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                <span>${zoneTypeLabel}</span>
              </span>
              <span class="font-mono bg-white/65 px-1.5 py-0.5 rounded leading-none shrink-0">${radMeters >= 1000 ? (radMeters / 1000).toFixed(1) + "km" : radMeters + "m"} Radius</span>
            </div>
            <div class="text-[9.5px] font-black leading-tight pt-0.5 border-t border-black/5">
              ${count === 0 
                ? `<span class="text-emerald-700">✓ 0 active incidents nearby</span>` 
                : `<span class="text-rose-700">🚨 ${count} incident${count > 1 ? 's' : ''} detected inside zone!</span>`
              }
            </div>
          </div>
        `;
      }

      const popupHtml = `
        <div class="p-2 min-w-[220px] font-sans">
          <div class="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-slate-100">
            <span class="inline-block w-2.5 h-2.5 rounded-full ${
              pin.severity === "critical"
                ? "bg-fuchsia-600 shadow-sm"
                : pin.severity === "high"
                ? "bg-purple-500 shadow-sm"
                : "bg-indigo-500 shadow-sm"
            }"></span>
            <h4 class="font-semibold text-slate-800 text-xs m-0 leading-tight">${zoneTitlePrefix}${pin.title}</h4>
          </div>
          <p class="text-[11px] text-slate-600 italic bg-slate-50 border border-slate-100 rounded-md p-2 mb-1.5 leading-relaxed max-h-[100px] overflow-y-auto">
            "${pin.note || "No custom reminder note added to this marker."}"
          </p>
          ${alertCountFraction}
          <div class="flex items-center justify-between text-[9px] text-slate-400 font-mono mt-2 pt-1 border-t border-slate-100 leading-none">
            <span>Posted ${new Date(pin.createdAt).toLocaleDateString()}</span>
            <button
              class="delete-pin-btn px-1.5 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded border border-red-150 font-extrabold hover:text-red-700 transition-colors cursor-pointer select-none text-[8.5px]"
              data-id="${pin.id}"
            >
              Remove
            </button>
          </div>
        </div>
      `;

      pinObj.bindPopup(popupHtml, {
        closeButton: true,
        className: "custom-safety-popup",
      });

      markersRef.current[`custom-pin-${pin.id}`] = pinObj;
    });

    // Draw Density heat overlay layers (using classic SVG/Canvas if WebGL is disabled or fallback)
    if (showHeatmap && !useWebGLHeatmap) {
      events.forEach((evt) => {
        let heatColor = "#3b82f6"; // Low
        let radius = 180;

        if (evt.severity === "critical") {
          heatColor = "#ef4444";
          radius = 350;
        } else if (evt.severity === "high") {
          heatColor = "#f59e0b";
          radius = 280;
        } else if (evt.severity === "medium") {
          heatColor = "#eab308";
          radius = 220;
        }

        const circle = L.circle([(evt.displayLatitude ?? evt.latitude), (evt.displayLongitude ?? evt.longitude)], {
          color: "transparent",
          fillColor: heatColor,
          fillOpacity: heatmapOpacity,
          radius: radius * heatmapRadiusMultiplier,
        }).addTo(map);

        heatCirclesRef.current.push(circle);
      });
    }
  }, [events, selectedEvent, showPins, clusterPins, showHeatmap, currentZoom, heatmapRadiusMultiplier, customPins, heatmapOpacity, clusterDistance, maxClusterZoom, useWebGLHeatmap]);

  // 4. Smooth auto-centering on active select event changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedEvent) return;

    const coords: [number, number] = [selectedEvent.latitude, selectedEvent.longitude];
    const currentMapZoom = map.getZoom();
    const targetZoom = Math.max(currentMapZoom, 14); // Keep or zoom in to at least lvl 14 to unfold clusters
    map.setView(coords, targetZoom, {
      animate: true,
      duration: 1.2,
    });
  }, [selectedEvent]);

  // 4.1 Smooth auto-centering on dynamic selected city change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapCenter) return;

    // Default to zoom 12 for Saskatoon, or zoom 11 for other municipal centers
    const isSaskatoon = Math.abs(mapCenter[0] - 52.1332) < 0.01 && Math.abs(mapCenter[1] - -106.6700) < 0.01;
    const isStateSaskatchewan = Math.abs(mapCenter[0] - 52.9399) < 0.01 && Math.abs(mapCenter[1] - -106.4509) < 0.01;

    const targetZoom = isStateSaskatchewan ? 6 : (isSaskatoon ? 12 : 11);
    map.setView(mapCenter, targetZoom, {
      animate: true,
      duration: 1.2
    });
  }, [mapCenter]);

  // Keep track of route layers for efficient addition and removal
  const routeLayersRef = useRef<L.Layer[]>([]);

  // 4.2 Render Custom Routes / Live sketching paths
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Flush previous route layers
    routeLayersRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    routeLayersRef.current = [];

    // A. Render Live Sketching Path
    if (currentDrawnPath && currentDrawnPath.length > 0) {
      if (currentDrawnPath.length >= 2) {
        const polyline = L.polyline(currentDrawnPath, {
          color: "#ea580c", // Amber line
          weight: 4,
          opacity: 0.85,
          dashArray: "6, 6"
        }).addTo(map);
        routeLayersRef.current.push(polyline);
      }

      currentDrawnPath.forEach((pt, idx) => {
        const vertexIcon = L.divIcon({
          className: "route-vertex-node",
          html: `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-4.5 w-4.5 bg-amber-450 rounded-full opacity-65 animate-ping"></span>
              <span class="relative flex h-4.5 w-4.5 rounded-full bg-amber-600 border border-white text-[9.5px] font-black font-mono text-white items-center justify-center shadow-md pb-[0.5px]">${idx + 1}</span>
            </div>
          `,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        });

        const marker = L.marker(pt, { icon: vertexIcon, zIndexOffset: 3000 }).addTo(map);
        routeLayersRef.current.push(marker);
      });
    }

    // B. Render Saved Custom Routes
    if (customRoutes) {
      customRoutes.forEach((route) => {
        const isSelected = selectedRouteId === route.id;
        const isActive = route.isActive !== false;

        if (route.path.length >= 2) {
          // 1. Draw perimeter corridor ribbon (safety perimeter warning buffer)
          const ribbonColor = isSelected ? "#818cf8" : "#94a3b8";
          const ribbon = L.polyline(route.path, {
            color: ribbonColor,
            weight: 35, // Represents the 1km wide total corridor
            opacity: isSelected ? 0.22 : 0.08,
            lineCap: "round",
            lineJoin: "round"
          }).addTo(map);
          routeLayersRef.current.push(ribbon);

          // 2. Draw actual flow trajectory line
          const color = isSelected ? "#4f46e5" : !isActive ? "#94a3b8" : "#8b5cf6";
          const flowLine = L.polyline(route.path, {
            color,
            weight: isSelected ? 5.5 : 3.5,
            opacity: isSelected ? 0.95 : 0.7,
            lineCap: "round",
            lineJoin: "round"
          }).addTo(map);

          flowLine.bindTooltip(`
            <div class="p-1 px-1.5 font-sans leading-tight">
              <div class="font-extrabold text-[11px] text-slate-800 leading-none">${route.title}</div>
              <div class="text-[9.5px] text-slate-500 font-mono mt-0.5">${route.note || "Guarded Safety Corridor"}</div>
            </div>
          `, { permanent: false, direction: "top", opacity: 0.9 });

          flowLine.addTo(map);
          routeLayersRef.current.push(flowLine);

          // Add simple marker flags for start and finish on the map
          const startIcon = L.divIcon({
            html: `<div class="w-3.5 h-3.5 rounded-full bg-emerald-600 border border-white shadow-sm flex items-center justify-center font-mono text-[7px] font-black text-white">S</div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });
          const endIcon = L.divIcon({
            html: `<div class="w-3.5 h-3.5 rounded-full bg-rose-600 border border-white shadow-sm flex items-center justify-center font-mono text-[7px] font-black text-white">E</div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });

          const startMarker = L.marker(route.path[0], { icon: startIcon }).addTo(map);
          const endMarker = L.marker(route.path[route.path.length - 1], { icon: endIcon }).addTo(map);
          
          routeLayersRef.current.push(startMarker);
          routeLayersRef.current.push(endMarker);
        }
      });
    }

  }, [currentDrawnPath, customRoutes, selectedRouteId, isDrawingRoute]);

  // 4.3 Fit bounds when selectedRouteId is triggered
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedRouteId || !customRoutes) return;

    const route = customRoutes.find(r => r.id === selectedRouteId);
    if (route && route.path.length >= 2) {
      const poly = L.polyline(route.path);
      map.fitBounds(poly.getBounds(), {
        padding: [60, 60],
        maxZoom: 15,
        animate: true,
        duration: 1.5
      });
    }
  }, [selectedRouteId, customRoutes]);

  // Register popup deletion event listener for custom pins delete button
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handlePopupOpen = (e: any) => {
      const container = e.popup.getElement();
      if (!container) return;

      const deleteBtn = container.querySelector(".delete-pin-btn");
      if (deleteBtn) {
        const pinId = deleteBtn.getAttribute("data-id");
        
        const handleDeleteClick = () => {
          if (pinId) {
            setCustomPins((prev) => prev.filter((p) => p.id !== pinId));
            map.closePopup();
          }
        };

        deleteBtn.addEventListener("click", handleDeleteClick);
      }
    };

    map.on("popupopen", handlePopupOpen);
    return () => {
      map.off("popupopen", handlePopupOpen);
    };
  }, []);

  // Map controls
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleResetCenter = () => {
    mapInstanceRef.current?.setView([52.1332, -106.67], 12, { animate: true });
  };

  const rad = (mapRotation * Math.PI) / 180;
  const dynamicScale = Math.abs(Math.sin(rad)) + Math.abs(Math.cos(rad));

  return (
    <div className="relative flex-1 h-full select-none overflow-hidden bg-[#0A0F1D]">
      {/* Container with dynamic rotation applied to map container */}
      <div 
        ref={mapCaptureRef}
        className="h-full w-full outline-none relative transition-transform duration-500 ease-out origin-center"
        style={{ 
          transform: `rotate(${mapRotation}deg) scale(${mapRotation === 0 ? 1 : dynamicScale})` 
        }}
      >
        {/* Target canvas element */}
        <div id="map-container" ref={mapContainerRef} className={`h-full w-full outline-none z-0 ${isDropPinMode ? "!cursor-crosshair" : ""}`} />

        {showHeatmap && useWebGLHeatmap && (
          <WebGLHeatmapOverlay
            map={mapInstanceRef.current}
            events={events}
            opacity={heatmapOpacity}
            radiusMultiplier={heatmapRadiusMultiplier}
          />
        )}
      </div>

      {/* Live Routing Sketching Tactical Banner Overlay */}
      {isDrawingRoute && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border border-indigo-500/30 flex items-center gap-3.5 backdrop-blur-[5px] max-w-sm sm:max-w-md animate-fadeIn antialiased shrink-0 w-[92%] sm:w-auto">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg p-2 text-white shadow shadow-indigo-500/20">
            <Route size={16} className="animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-[10px] uppercase tracking-widest text-indigo-400 font-mono leading-none flex items-center gap-1.5 select-none">
              <span>Tactical Corridor Tracer</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </h4>
            <div className="text-[10.5px] text-slate-200 leading-normal mt-1 font-medium select-none text-left">
              Click sequential waypoints on Saskatoon map to trace lines. Click <b>Save & Analyze</b> in sidebar.
            </div>
          </div>
          <button
            onClick={() => {
              if (setIsDrawingRoute) setIsDrawingRoute(false);
              if (setCurrentDrawnPath) setCurrentDrawnPath([]);
            }}
            className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
            title="Exit Tracing Mode"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Tactical Compass Orientation Widget */}
      <div className="absolute top-4 left-4 z-[500] flex flex-col items-center gap-1.5 print-hidden">
        <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col items-center shadow-md w-[72px]">
          <div className="text-[8px] text-slate-400 font-mono uppercase tracking-wider font-extrabold mb-1 w-full text-center select-none">
            Compass
          </div>
          
          {/* Compass Dial Outer Ring */}
          <button
            onClick={() => setMapRotation(0)}
            className="w-11 h-11 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-full flex items-center justify-center relative cursor-pointer group shadow-inner transition-colors duration-200"
            title="Reset to True North (0°)"
          >
            {/* Cardinal points inside dial */}
            <span className="absolute top-0.5 text-[8px] font-mono font-black text-slate-450 group-hover:text-red-500 select-none">N</span>
            <span className="absolute right-0.5 text-[8px] font-mono font-black text-slate-400 select-none">E</span>
            <span className="absolute bottom-0.5 text-[8px] font-mono font-black text-slate-400 select-none">S</span>
            <span className="absolute left-0.5 text-[8px] font-mono font-black text-slate-400 select-none">W</span>
            
            {/* Rotating compass needle dial */}
            <div 
              className="absolute transition-transform duration-500 ease-out"
              style={{ transform: `rotate(${mapRotation}deg)` }}
            >
              <svg width="10" height="26" viewBox="0 0 10 26" className="drop-shadow-sm pointer-events-none">
                {/* North Red Needle */}
                <polygon points="5,0 10,13 5,11" fill="#ef4444" />
                <polygon points="5,0 0,13 5,11" fill="#f87171" />
                {/* South Slate Needle */}
                <polygon points="5,26 10,13 5,11" fill="#64748b" />
                <polygon points="5,26 0,13 5,11" fill="#94a3b8" />
                {/* Center Core */}
                <circle cx="5" cy="13" r="1.5" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
              </svg>
            </div>
          </button>

          {/* Precision stats display */}
          <div className="mt-1.5 font-mono text-[9px] font-black text-slate-600 bg-slate-50 border border-slate-100 rounded px-1 w-full text-center py-0.5 select-none leading-none tab-num">
            {getCardinalHeading(mapRotation)}
          </div>

          {/* Quick Adjustment Rotating controls */}
          <div className="flex items-center justify-between gap-1 w-full border-t border-slate-100 pt-1.5 mt-1.5 h-5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMapRotation((prev) => (prev - 15 + 360) % 360);
              }}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center"
              title="Rotate Map Left (15°)"
            >
              <RotateCcw size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMapRotation((prev) => (prev + 15) % 360);
              }}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center"
              title="Rotate Map Right (15°)"
            >
              <RotateCw size={10} />
            </button>
          </div>
        </div>
      </div>

      {isDraggingFloatingPanel && (
        <div 
          className="fixed inset-0 z-[9999] select-none text-[0px]" 
          style={{ 
            cursor: "col-resize",
            pointerEvents: "auto",
            background: "transparent"
          }}
        >
          Drag Active
        </div>
      )}

      {/* Floating Canvas controls */}
      <div 
        style={{ width: `${floatingPanelWidth}px` }}
        className={`absolute top-4 right-4 z-[500] flex flex-col gap-2 print-hidden ${
          isDraggingFloatingPanel ? "select-none" : "transition-all duration-200"
        }`}
      >
        {/* Left Resize Handle Gutter */}
        <div
          onMouseDown={handleFloatingPanelDragStart}
          className={`absolute top-0 -left-3 w-3 h-full cursor-col-resize z-[501] group flex items-center justify-center select-none ${
            isDraggingFloatingPanel ? "bg-indigo-600/10" : "hover:bg-indigo-600/5"
          }`}
          title="Drag left or right with your cursor to resize these display panels"
        >
          <div className={`w-1 h-32 bg-slate-305 hover:bg-blue-600 rounded-full transition-all duration-150 ${
            isDraggingFloatingPanel ? "bg-blue-600 h-48 opacity-100 scale-x-125" : "opacity-45 group-hover:opacity-100"
          }`} />
          {/* Subtle cursor direction indicators */}
          <div className="hidden group-hover:flex flex-col gap-1 absolute text-[8px] text-blue-500 font-extrabold select-none pointer-events-none text-center leading-none">
            <span>◀</span>
            <span>▶</span>
          </div>
        </div>
        {/* Style selection */}
        <div className="bg-white border border-slate-200 rounded-lg p-1 shadow-sm flex gap-1">
          <button
            id="map-style-dark"
            onClick={() => setMapStyle("dark")}
            className={`cursor-pointer px-2 py-1 text-[10px] font-mono tracking-wider uppercase rounded-md font-semibold transition-colors ${
              mapStyle === "dark"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            TACTICAL
          </button>
          <button
            id="map-style-streets"
            onClick={() => setMapStyle("streets")}
            className={`cursor-pointer px-2 py-1 text-[10px] font-mono tracking-wider uppercase rounded-md font-semibold transition-colors ${
              mapStyle === "streets"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            STREETS
          </button>
          <button
            id="map-style-satellite"
            onClick={() => setMapStyle("satellite")}
            className={`cursor-pointer px-2 py-1 text-[10px] font-mono tracking-wider uppercase rounded-md font-semibold transition-colors ${
              mapStyle === "satellite"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            SATELLITE
          </button>
        </div>

        {/* Visibility Layer selectors */}
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm space-y-2 flex flex-col text-slate-800">
          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-bold mb-1 border-b border-slate-150 pb-1">
            Display Layers
          </div>
          <button
            onClick={() => {
              const newPins = !showPins;
              setShowPins(newPins);
              if (newPins && showHeatmap) {
                setShowHeatmap(false);
              }
            }}
            className={`cursor-pointer flex items-center justify-between gap-3 text-xs text-left px-2 py-1.5 rounded-md transition-colors border ${
              showPins
                ? "bg-blue-50 border-blue-200/60 text-blue-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <MapPin size={13} />
              <span>Incident Pins</span>
            </div>
            {showPins ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          {showPins && (
            <>
              <button
                onClick={() => setClusterPins(!clusterPins)}
                className={`cursor-pointer flex items-center justify-between gap-3 text-xs text-left px-2 py-1.5 rounded-md transition-all border ${
                  clusterPins
                    ? "bg-blue-50/50 border-blue-200/40 text-blue-700 font-medium"
                    : "border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50/50"
                }`}
                title="Group incident events within close proximity to each other into interactive clusters"
              >
                <div className="flex items-center gap-2 pl-3 border-l-2 border-dashed border-slate-200">
                  <Layers size={11} className={clusterPins ? "text-blue-500" : "text-slate-400"} />
                  <span className="text-[11px]">Incident Clustering</span>
                </div>
                {clusterPins ? <Eye size={11} className="text-blue-500" /> : <EyeOff size={11} className="text-slate-400" />}
              </button>

              {clusterPins && (
                <div className="ml-3 pl-3 border-l border-slate-150 space-y-2.5 my-1.5 animate-fadeIn">
                  {/* Slider 1: Clustering Proximity Distance */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                      <span>Proximity Radius</span>
                      <span className="font-bold text-blue-600 bg-blue-50 px-1 rounded">
                        {clusterDistance}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="120"
                      step="5"
                      value={clusterDistance}
                      onChange={(e) => setClusterDistance(parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      title="Adjust proximity distance in pixels for rendering groups"
                    />
                  </div>

                  {/* Slider 2: Unfold Zoom Limit */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                      <span>Reveal Zoom Limit</span>
                      <span className="font-bold text-blue-600 bg-blue-50 px-1 rounded">
                        Lv. {maxClusterZoom}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="18"
                      step="1"
                      value={maxClusterZoom}
                      onChange={(e) => setMaxClusterZoom(parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      title="Set zoom level beyond which individual event pins are fully unfolded"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400 font-mono leading-none pt-0.5">
                      <span>Map Zoom: {currentZoom}</span>
                      <span className={currentZoom >= maxClusterZoom ? "text-emerald-600 font-bold" : "text-amber-600 font-semibold"}>
                        {currentZoom >= maxClusterZoom ? "Pins Unfolded" : "Clustered"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => {
              const newHeat = !showHeatmap;
              setShowHeatmap(newHeat);
              if (newHeat) {
                setShowPins(false);
                setUseWebGLHeatmap(true);
              } else {
                setShowPins(true);
              }
            }}
            className={`cursor-pointer flex items-center justify-between gap-3 text-xs text-left px-2 py-1.5 rounded-md transition-colors border ${
              showHeatmap
                ? "bg-blue-50 border-blue-200/60 text-blue-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers size={13} />
              <span>Safety Heatmap</span>
            </div>
            {showHeatmap ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          {showHeatmap && (
            <div className="mt-1 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Sensitivity Radius</span>
                <span className="font-bold text-blue-600 bg-blue-50 px-1 rounded">
                  {Math.round(heatmapRadiusMultiplier * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.5"
                step="0.1"
                value={heatmapRadiusMultiplier}
                onChange={(e) => setHeatmapRadiusMultiplier(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[8px] text-slate-400 font-mono border-b border-slate-200 pb-1.5">
                <span>0.2x (Granular)</span>
                <span>2.5x (Broad)</span>
              </div>

              {/* Opacity Cycle Trigger button */}
              <div className="flex flex-col space-y-1 pt-0.5">
                <span className="text-[9px] text-slate-400 font-mono uppercase font-black tracking-wider">
                  Heatmap Density
                </span>
                <button
                  type="button"
                  id="map-heatmap-opacity-toggle-btn"
                  onClick={onToggleOpacity}
                  className="cursor-pointer w-full text-center py-1 text-[9.5px] font-mono font-extrabold uppercase rounded border bg-slate-900 border-slate-800 text-white hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  title="Toggle density levels for clearer incident pins"
                >
                  <span>Density:</span>
                  <span className="text-blue-400 font-black">{
                    heatmapOpacity < 0.10 ? "LOW (6%)" :
                    heatmapOpacity < 0.30 ? "MID (18%)" : "HIGH (35%)"
                  }</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Map Snapshot Exporter Card */}
        <div id="save-map-snapshot-card" className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm space-y-2 flex flex-col text-slate-800 animate-fadeIn">
          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-bold mb-0.5 border-b border-slate-150 pb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Camera size={11} className="text-blue-500 font-bold animate-pulse" />
              MAP SNAPSHOT EXPORTER
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
            Generate and save a high-resolution PNG image of your currently customized map layers, including any active incident pins with their corresponding categories.
          </p>
          <button
            type="button"
            id="map-save-snapshot-export-btn"
            onClick={handleTakeSnapshot}
            className="cursor-pointer w-full text-center py-2 text-xs font-semibold rounded-md bg-blue-600 border border-blue-700 text-white hover:bg-blue-500 hover:text-white shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
            title="Saves high-res snapshot of current view with active layers, pins, and heatmap"
          >
            <Camera size={13} className="text-white shrink-0" />
            <span>Export View as PNG</span>
          </button>
        </div>

        {/* Distance Measurement Control Box */}
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm space-y-2 flex flex-col text-slate-800">
          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-bold mb-1 border-b border-slate-150 pb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Ruler size={11} className="text-blue-500 font-bold" />
              INCIDENT RADIUS RULER
            </span>
            {isMeasuring && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
          </div>

          <button
            onClick={() => setIsMeasuring(!isMeasuring)}
            className={`cursor-pointer flex items-center justify-between gap-3 text-xs text-left px-2 py-1.5 rounded-md transition-colors border ${
              isMeasuring
                ? "bg-rose-50 border-rose-200/60 text-rose-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-slate-100"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Ruler size={13} className={isMeasuring ? "text-rose-600 animate-pulse" : "text-slate-400"} />
              <span>{isMeasuring ? "Measuring Active" : "Measure Zone"}</span>
            </div>
          </button>

          {isMeasuring && (
            <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[10px] space-y-1">
              <div className="text-slate-500 font-medium leading-relaxed">
                {!measureStartLatLng ? (
                  "1. Click space to place the center."
                ) : !measureEndLatLng ? (
                  "2. Move & click to lock radius zone."
                ) : (
                  "Radius locked. Click map to clear and reset."
                )}
              </div>

              {measureDistanceText && (
                <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-slate-400 font-mono font-bold">RADIUS:</span>
                  <span className="font-mono text-xs font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    {measureDistanceText}
                  </span>
                </div>
              )}

              {(measureStartLatLng || measureDistanceText) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearMeasurement();
                  }}
                  className="cursor-pointer w-full text-center mt-1.5 py-0.5 text-[9px] hover:text-rose-600 font-bold border border-slate-200 bg-white rounded text-slate-500 hover:bg-rose-50 transition-colors"
                >
                  Clear Drawing
                </button>
              )}
            </div>
          )}
        </div>

        {/* Offline Map Region Download & Cache API management */}
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm space-y-2.5 flex flex-col text-slate-800">
          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-bold mb-0.5 border-b border-slate-150 pb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Download size={11} className="text-emerald-500 font-bold" />
              OFFLINE REGION TILES
            </span>
            <span className={`h-1.5 w-1.5 rounded-full ${isOfflineViewActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} title={isOfflineViewActive ? "Cache Store Available" : "No Offline Tiles"} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="offline-city-select" className="text-[9.5px] font-mono tracking-wider text-slate-450 uppercase select-none">
              SELECT AREA HUB:
            </label>
            <select
              id="offline-city-select"
              value={offlineSelectedCity}
              onChange={(e) => setOfflineSelectedCity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-sans text-xs font-semibold focus:outline-none p-1.5 rounded cursor-pointer"
              disabled={isDownloading}
            >
              {OFFLINE_CITIES.map((city) => (
                <option key={city.name} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleDownloadTiles}
            disabled={isDownloading}
            className={`cursor-pointer w-full text-center py-2 text-xs font-semibold rounded-md border transition-all flex items-center justify-center gap-2 ${
              isDownloading
                ? "bg-emerald-50 border-emerald-250 text-emerald-700 animate-pulse"
                : "bg-emerald-600 border-emerald-650 hover:bg-emerald-500 text-white shadow-sm hover:shadow"
            }`}
          >
            {isDownloading ? (
              <>
                <Loader2 size={13} className="animate-spin text-emerald-600" />
                <span>Downloading... {downloadProgress}%</span>
              </>
            ) : (
              <>
                <Download size={13} className="text-white" />
                <span>Download {offlineSelectedCity} Map</span>
              </>
            )}
          </button>

          {isDownloading && downloadStatusMsg && (
            <div className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-[9px] text-slate-500 leading-normal animate-pulse text-center">
              {downloadStatusMsg}
            </div>
          )}

          {/* Cached active regions list for full feedback mapping */}
          {cachedRegions.length > 0 && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2 shrink-0">
              <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-bold">
                Offline Ready Tiles ({cachedRegions.length})
              </span>
              <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                {cachedRegions.map((region) => (
                  <div key={`${region.cityName}-${region.style}`} className="flex items-center justify-between text-[10px] bg-slate-50 border border-slate-150 rounded-md px-2 py-1.5 font-mono text-slate-600">
                    <div className="flex flex-col gap-0.5 min-w-0 pr-1.5">
                      <span className="font-bold text-slate-800 line-clamp-1 truncate">{region.cityName}</span>
                      <span className="text-[8.5px] text-slate-400 leading-none capitalize">
                        {region.style} • {region.tileCount} tiles
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCache(region.cityName, region.style)}
                      className="text-red-500 hover:text-red-700 cursor-pointer p-1 rounded hover:bg-red-50 transition-colors shrink-0"
                      title="Delete cached tiles for this region"
                    >
                      <X size={12} className="font-extrabold" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Map Position Resets */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col">
          <button
            onClick={handleZoomIn}
            className="p-2.5 hover:bg-slate-50 text-slate-600 hover:text-blue-600 border-b border-slate-150 cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2.5 hover:bg-slate-50 text-slate-600 hover:text-blue-600 border-b border-slate-150 cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <span className="font-semibold text-xs font-mono">-</span>
          </button>
          <button
            onClick={handleResetCenter}
            className="p-2.5 hover:bg-slate-50 text-slate-600 hover:text-blue-600 border-b border-slate-150 cursor-pointer transition-colors flex justify-center items-center"
            title="Recenter Map"
          >
            <Navigation size={13} className="rotate-45" />
          </button>
          <button
            onClick={() => setIsDropPinMode(!isDropPinMode)}
            className={`p-2.5 border-b border-slate-150 cursor-pointer transition-colors flex justify-center items-center ${
              isDropPinMode ? "text-violet-600 bg-violet-50 hover:bg-violet-100" : "text-slate-600 hover:bg-slate-50 hover:text-violet-600"
            }`}
            title={isDropPinMode ? "Exit Drop Pin Mode" : "Drop Custom Pin / Concern Note"}
          >
            <MapPin size={13} className={isDropPinMode ? "animate-pulse" : ""} />
          </button>
          <button
            onClick={handleTakeSnapshot}
            className="p-2.5 hover:bg-slate-50 text-slate-600 hover:text-blue-600 border-b border-slate-150 cursor-pointer transition-colors flex justify-center items-center"
            title="Export View as High-Res PNG"
          >
            <Camera size={13} />
          </button>
          <button
            onClick={() => window.print()}
            className="p-2.5 hover:bg-slate-50 text-slate-600 hover:text-blue-600 cursor-pointer transition-colors flex justify-center items-center"
            title="Print Map Report"
          >
            <Printer size={13} />
          </button>
        </div>
      </div>

      {/* Mini warning tag positioned perfectly above the bottom-right coordinate info panel */}
      <div className="absolute bottom-[52px] right-4 z-[400] bg-white/95 border border-slate-200 rounded px-2.5 py-1.5 text-[9px] font-mono text-slate-500 shadow-sm flex items-center gap-1.5 print-hidden">
        <Info size={10} className="text-blue-500" />
        <span>Approximate incident locations display (jittered block coordinates)</span>
      </div>

      {/* Snapshot Loading Overlay */}
      {isCapturing && (
        <div id="snapshot-loading-overlay" className="absolute inset-0 bg-slate-900/85 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center text-center space-y-4 print-hidden transition-all duration-300">
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-16 w-16 bg-blue-500 rounded-full opacity-20 animate-ping"></span>
            <div className="bg-blue-600 p-4 rounded-full text-white shadow-lg animate-pulse flex items-center justify-center">
              <Camera size={32} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-white font-bold text-base tracking-wide font-sans">Capturing Viewport</h3>
            <p className="text-blue-200 text-xs font-mono max-w-[280px]">
              Tracing vector overlays, map layers, and markers in high-resolution...
            </p>
          </div>
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
            <Loader2 size={12} className="animate-spin text-blue-400" />
            <span>Establishing canvas mapping</span>
          </div>
        </div>
      )}

      {/* Snapshot Preview Modal */}
      {isSnapshotModalOpen && snapshotUrl && (
        <div id="snapshot-preview-modal" className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-[9990] flex items-center justify-center p-4 print-hidden">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-blue-400" />
                <h3 className="text-sm font-bold tracking-wide font-sans">Map Viewport Snapshot Captured</h3>
              </div>
              <button
                onClick={() => setIsSnapshotModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Image Preview */}
            <div className="p-4 flex-1 overflow-y-auto bg-slate-50 flex flex-col items-center justify-center space-y-3 min-h-0">
              <div className="border border-slate-250 bg-white p-1.5 rounded-lg shadow-inner max-w-full overflow-hidden flex items-center justify-center max-h-[50vh]">
                <img
                  src={snapshotUrl}
                  alt="Saskatoon Safety Map Snapshot"
                  className="rounded border border-slate-100 max-w-full max-h-[45vh] object-contain shadow"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="text-[10px] text-slate-500 font-mono text-center">
                High-resolution export generated on {new Date().toLocaleDateString()}
              </span>
            </div>

            {/* Modal Footer: Actions */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 gap-2 flex flex-wrap justify-between items-center shrink-0">
              <button
                onClick={() => setIsSnapshotModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 border border-slate-200 hover:text-slate-700 rounded-md font-bold transition-colors cursor-pointer"
              >
                Dismiss
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={copySnapshotToClipboard}
                  className={`px-3 py-1.5 text-xs rounded-md font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                    copiedNotification
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                  }`}
                  title="Copy the image directly to your clipboard for pasting"
                >
                  {copiedNotification ? <Check size={14} /> : <Copy size={13} />}
                  <span>{copiedNotification ? "Copied Image!" : "Copy Clipboard"}</span>
                </button>

                {navigator.share && (
                  <button
                    onClick={shareSnapshot}
                    className="px-3 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Send snapshot image to native apps or devices"
                  >
                    <Share2 size={13} />
                    <span>Share</span>
                  </button>
                )}

                <button
                  onClick={downloadSnapshot}
                  className="px-3.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 hover:border-blue-700 rounded-md font-bold shadow-sm hover:shadow transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Download and save high-resolution PNG locally"
                >
                  <Download size={13} />
                  <span>Save Image</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Pin Insertion HUD Instructions */}
      {isDropPinMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/95 text-white border border-violet-500/30 rounded-full px-5 py-2.5 flex items-center gap-3 shadow-xl backdrop-blur-md animate-bounce print-hidden">
          <div className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500"></span>
          </div>
          <p className="text-xs font-bold font-sans tracking-wide">
            Drop Custom Pin Mode: Click anywhere on the map to mark a location of concern.
          </p>
          <button
            onClick={() => setIsDropPinMode(false)}
            className="px-2.5 py-0.5 text-[10px] font-mono text-violet-300 hover:text-white hover:bg-violet-800/50 border border-violet-500/20 rounded-full transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Custom Pin Information Modal */}
      {isPinModalOpen && pendingPinCoords && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-[9995] flex items-center justify-center p-4 print-hidden">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-violet-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-violet-200" />
                <h3 className="text-sm font-extrabold tracking-wide font-sans">Mark Custom Location of Concern</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPinModalOpen(false);
                  setPendingPinCoords(null);
                }}
                className="text-violet-200 hover:text-white p-1 hover:bg-violet-850/45 rounded transition-colors cursor-pointer"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPinTitle.trim()) return;

                const newPin = {
                  id: "custom-pin-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
                  latitude: pendingPinCoords.lat,
                  longitude: pendingPinCoords.lng,
                  title: newPinTitle.trim(),
                  note: newPinNote.trim(),
                  severity: newPinSeverity,
                  createdAt: new Date().toISOString(),
                  isAlertZone: newPinIsAlertZone,
                  zoneType: newPinZoneType,
                  alertRadiusMeters: newPinAlertRadius,
                };

                setCustomPins((prev) => [...prev, newPin]);
                setIsPinModalOpen(false);
                setPendingPinCoords(null);
              }}
              className="p-5 space-y-4 max-h-[75vh] overflow-y-auto"
            >
              {/* Coordinates display */}
              <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>Selected Coordinates:</span>
                <span className="font-bold text-violet-700">
                  {pendingPinCoords.lat.toFixed(5)}, {pendingPinCoords.lng.toFixed(5)}
                </span>
              </div>

              {/* Title Input */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-extrabold tracking-wider font-mono text-slate-400 block">
                  Title / Label *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Home, St. Paul's Hospital, West Travel Checkpoint"
                  value={newPinTitle}
                  onChange={(e) => setNewPinTitle(e.target.value)}
                  maxLength={60}
                  className="w-full px-3 py-2 text-xs border border-slate-305 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-800 shadow-sm"
                />
              </div>

              {/* Zone Type Selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-extrabold tracking-wider font-mono text-slate-400 block">
                  Safety Zone Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "custom", label: "Concern Pin 📍" },
                    { value: "home", label: "My Home 🏠" },
                    { value: "apartment", label: "Apartment 🏢" },
                    { value: "hospital", label: "Hospital 🏥" },
                    { value: "travel_route", label: "Travel Stop 🛣️" },
                  ].map((x) => {
                    const isSelected = newPinZoneType === x.value;
                    return (
                      <button
                        key={x.value}
                        type="button"
                        onClick={() => {
                          setNewPinZoneType(x.value as any);
                          // Default appropriate titles
                          if (newPinTitle === "" || newPinTitle.startsWith("My ") || newPinTitle.includes("Zone") || newPinTitle.includes("Stop") || newPinTitle.includes("Hospital")) {
                            if (x.value === "home") setNewPinTitle("My Home Location");
                            else if (x.value === "apartment") setNewPinTitle("My Apartment");
                            else if (x.value === "hospital") setNewPinTitle("Saskatoon City Hospital Zone");
                            else if (x.value === "travel_route") setNewPinTitle("Daily Commute Route Corridor");
                            else setNewPinTitle("Custom Point of Concern");
                          }
                        }}
                        className={`py-1.5 px-2 rounded-md text-[10.5px] font-bold text-left transition-all border cursor-pointer ${
                          isSelected 
                            ? "bg-violet-600 border-violet-650 text-white shadow-sm font-extrabold" 
                            : "border-slate-200 text-slate-600 hover:bg-slate-100 bg-slate-50"
                        }`}
                      >
                        {x.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Alert Radius Settings Option Row */}
              <div className="p-3 bg-violet-50/50 rounded-lg border border-violet-100 space-y-3">
                <div className="flex items-center justify-between select-none">
                  <span className="text-[10.5px] font-bold text-slate-700">
                    Enable Safety Alert Circle
                  </span>
                  <input
                    type="checkbox"
                    checked={newPinIsAlertZone}
                    onChange={(e) => setNewPinIsAlertZone(e.target.checked)}
                    className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </div>

                {newPinIsAlertZone && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <div className="flex justify-between text-[9px] font-mono font-bold text-slate-500">
                      <span>ALERT SCAN RADIUS:</span>
                      <span className="text-violet-700 bg-violet-50/80 border border-violet-200/50 px-1.5 rounded leading-none pt-0.5 font-bold">
                        {newPinAlertRadius >= 1000 ? (newPinAlertRadius / 1000).toFixed(1) + " km" : newPinAlertRadius + " m"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="4000"
                      step="100"
                      value={newPinAlertRadius}
                      onChange={(e) => setNewPinAlertRadius(parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                    />
                    <p className="text-[8.5px] text-slate-450 leading-tight">
                      This draws a visual alert boundary centered here. The map popup will automatically monitor active Saskatoon police safety incidents inside this perimeter.
                    </p>
                  </div>
                )}
              </div>

              {/* Note / Description */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-extrabold tracking-wider font-mono text-slate-400 block">
                  Reminder Note / Details
                </label>
                <textarea
                  placeholder="Describe your safety observation, personal warning tips or details..."
                  value={newPinNote}
                  onChange={(e) => setNewPinNote(e.target.value)}
                  maxLength={300}
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-305 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-800 shadow-sm resize-none"
                />
              </div>

              {/* Severity / Alert level */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-extrabold tracking-wider font-mono text-slate-400 block">
                  Alert Level / Severity
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "low", label: "Low Alert", classNormal: "border-indigo-200 text-indigo-700 bg-indigo-50/30 hover:bg-indigo-50 select-none", classActive: "bg-indigo-600 border-indigo-600 text-white font-black" },
                    { value: "medium", label: "Warning", classNormal: "border-amber-250 text-amber-700 bg-amber-50/30 hover:bg-amber-100 select-none", classActive: "bg-amber-500 border-amber-500 text-white font-black" },
                    { value: "critical", label: "Critical", classNormal: "border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50/30 hover:bg-fuchsia-50 select-none", classActive: "bg-fuchsia-700 border-fuchsia-700 text-white font-black" },
                  ].map((lvl) => {
                    const isSelected = newPinSeverity === lvl.value;
                    return (
                      <button
                        key={lvl.value}
                        type="button"
                        onClick={() => setNewPinSeverity(lvl.value as SeverityType)}
                        className={`py-1.5 rounded-md text-[10px] font-bold text-center transition-all border cursor-pointer ${
                          isSelected ? lvl.classActive : lvl.classNormal
                        }`}
                      >
                        {lvl.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsPinModalOpen(false);
                    setPendingPinCoords(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 border border-slate-200 hover:text-slate-700 rounded-md font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-violet-700 hover:bg-violet-800 text-white border border-violet-700 hover:border-violet-800 rounded-md font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Place Concern Pin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
