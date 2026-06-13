import React, { useState } from "react";
import { EventItem, SeverityType, CustomRouteItem } from "../types";
import { Bell, MapPin, Trash2, Crosshair, ChevronDown, ChevronUp, Shield, AlertTriangle, ShieldCheck, Home, Building2, Hospital, Compass, Route, AlertCircle, Waypoints } from "lucide-react";
import { calculateRouteRiskScore } from "../utils/routeSafety";

interface CustomPinItem {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  note: string;
  severity: SeverityType;
  createdAt: string;
  isAlertZone?: boolean;
  zoneType?: "home" | "apartment" | "hospital" | "travel_route" | "custom";
  alertRadiusMeters?: number;
}

interface AlertZonesPanelProps {
  customPins: CustomPinItem[];
  setCustomPins: React.Dispatch<React.SetStateAction<CustomPinItem[]>>;
  events: EventItem[];
  onSelectZone: (pin: CustomPinItem) => void;
  // Route Sketching & Risk Scoring Extensions
  customRoutes: CustomRouteItem[];
  setCustomRoutes: React.Dispatch<React.SetStateAction<CustomRouteItem[]>>;
  isDrawingRoute: boolean;
  setIsDrawingRoute: (val: boolean) => void;
  currentDrawnPath: Array<[number, number]>;
  setCurrentDrawnPath: React.Dispatch<React.SetStateAction<Array<[number, number]>>>;
  selectedRouteId: string | null;
  setSelectedRouteId: (val: string | null) => void;
  onSelectRoute?: (route: CustomRouteItem) => void;
}

// Haversine distance calculator in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
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

export default function AlertZonesPanel({
  customPins,
  setCustomPins,
  events,
  onSelectZone,
  customRoutes,
  setCustomRoutes,
  isDrawingRoute,
  setIsDrawingRoute,
  currentDrawnPath,
  setCurrentDrawnPath,
  selectedRouteId,
  setSelectedRouteId,
  onSelectRoute,
}: AlertZonesPanelProps) {
  // Expand states
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  // Tab control states: "zones" | "routes"
  const [activeSubTab, setActiveSubTab] = useState<"zones" | "routes">("zones");

  const handleDeleteZone = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomPins((prev) => prev.filter((p) => p.id !== id));
  };

  const handleToggleActive = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomPins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isAlertZone: !p.isAlertZone } : p))
    );
  };

  const handleDeleteRoute = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomRoutes((prev) => prev.filter((r) => r.id !== id));
    if (selectedRouteId === id) {
      setSelectedRouteId(null);
    }
  };

  const handleToggleRouteActive = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  const activeAlertZones = customPins.filter((p) => p.isAlertZone);
  const activeAlertRoutes = customRoutes.filter((r) => r.isActive);

  // Helper to calculate total polyline length
  const getRouteLengthStr = (path: Array<[number, number]>) => {
    if (path.length < 2) return "0 m";
    let len = 0;
    for (let k = 0; k < path.length - 1; k++) {
      len += getDistanceMeters(path[k][0], path[k][1], path[k+1][0], path[k+1][1]);
    }
    return len >= 1000 ? (len / 1000).toFixed(2) + " km" : Math.round(len) + " m";
  };

  return (
    <div className="flex flex-col h-full bg-slate-55" id="zones-panel-container">
      {/* Panel Header */}
      <div className="p-3 bg-white border-b border-slate-200/80 shadow-sm shrink-0 flex items-center justify-between select-none">
        <div>
          <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest leading-none">
            Safety Monitoring
          </h3>
          <h2 className="text-sm font-extrabold text-slate-800 leading-tight mt-1">
            {activeSubTab === "zones" ? "My Alert Zones" : "My Guarded Corridors"}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 bg-violet-50 text-violet-700 px-2 py-0.5 border border-violet-150 rounded-full text-[10px] font-bold font-mono">
          <Bell size={10} className="animate-pulse" />
          <span>{activeSubTab === "zones" ? activeAlertZones.length : activeAlertRoutes.length} Active</span>
        </div>
      </div>

      {/* Description Context Banner */}
      <div className="p-2.5 bg-gradient-to-r from-violet-500/8 to-indigo-500/8 border-b border-indigo-100 shrink-0 text-[10px] leading-relaxed text-slate-600 flex items-start gap-2 select-none">
        <Shield size={13} className="text-violet-600 shrink-0 mt-0.5" />
        <div className="font-medium text-[10.5px]">
          {activeSubTab === "zones" ? (
            <span>Specify custom circles around critical Saskatoon locations. The system automatically scans for real-time police incident occurrences and hazards inside your perimeters.</span>
          ) : (
            <span>Draw travel corridors across Saskatoon grids. The intelligence engine performs real-time geodesic proximity checks to generate automatic Route Risk Profiles.</span>
          )}
        </div>
      </div>

      {/* Sub Tab Navigation Selection Tool */}
      <div className="px-3 py-2 bg-white border-b border-slate-200/60 flex items-center gap-2 shrink-0 select-none">
        <button
          type="button"
          onClick={() => {
            setActiveSubTab("zones");
            setIsDrawingRoute(false);
          }}
          className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === "zones"
              ? "bg-violet-600 text-white shadow-sm"
              : "bg-slate-50 text-slate-600 border border-slate-200/50 hover:bg-slate-100/80"
          }`}
        >
          <MapPin size={11} />
          <span>Circles ({customPins.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveSubTab("routes");
          }}
          className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === "routes"
              ? "bg-violet-600 text-white shadow-sm"
              : "bg-slate-50 text-slate-600 border border-slate-200/50 hover:bg-slate-100/80"
          }`}
        >
          <Route size={11} />
          <span>Corridors ({customRoutes.length})</span>
        </button>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
        
        {/* TAB 1: CIRCLE ALERT ZONES */}
        {activeSubTab === "zones" && (
          <>
            {customPins.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-4 select-none">
                <div className="h-14 w-14 bg-violet-50 text-violet-600 rounded-full flex items-center justify-center mx-auto border border-dashed border-violet-250">
                  <Compass size={24} className="animate-spin-slow text-violet-500" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    No Alert Zones Defined
                  </h4>
                  <p className="text-[11px] text-slate-450 max-w-[260px] mx-auto leading-normal font-medium">
                    Drop custom pins on the map to configure personalized alert perimeters around your home, office, hospital, or route corridors.
                  </p>
                </div>
                {/* Guide Steps */}
                <div className="text-left bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 max-w-[310px] mx-auto shadow-sm text-slate-600 text-[10.5px]">
                  <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-1 leading-none select-none font-mono">
                    How to set up:
                  </p>
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 bg-violet-100 text-violet-700 text-[9px] font-black rounded-full items-center justify-center select-none font-mono">1</span>
                    <span>Click the <b>Map Pin 📍</b> action on the map's sidebar tray (located on the tactical map screen).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 bg-violet-100 text-violet-700 text-[9px] font-black rounded-full items-center justify-center select-none font-mono">2</span>
                    <span><b>Click anywhere on Saskatoon</b> map (like your home, office, or regular route) to open the setup form.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 bg-violet-100 text-violet-700 text-[9px] font-black rounded-full items-center justify-center select-none font-mono">3</span>
                    <span>Set the desired <b>Radius (e.g. 1.0 km)</b>, select the Zone Type (e.g. Home), and save.</span>
                  </div>
                </div>
              </div>
            ) : (
              customPins.map((pin) => {
                const radiusM = pin.alertRadiusMeters || 1000;
                const isAlert = pin.isAlertZone;

                // Find all events intersecting this circle
                const intersectingEvents = isAlert
                  ? events.filter((evt) => {
                      const d = getDistanceMeters(pin.latitude, pin.longitude, evt.latitude, evt.longitude);
                      return d <= radiusM;
                    })
                  : [];

                const isExpanded = expandedZoneId === pin.id;

                // Icon select
                let zoneIcon = <Compass size={13} className="text-slate-550" />;
                let zoneBadgeColor = "bg-slate-50 border-slate-205 text-slate-700";

                if (pin.zoneType === "home") {
                  zoneIcon = <Home size={13} className="text-emerald-555" />;
                  zoneBadgeColor = "bg-emerald-55 border-emerald-255 text-emerald-855";
                } else if (pin.zoneType === "apartment") {
                  zoneIcon = <Building2 size={13} className="text-cyan-555" />;
                  zoneBadgeColor = "bg-cyan-55 border-cyan-255 text-cyan-855";
                } else if (pin.zoneType === "hospital") {
                  zoneIcon = <Hospital size={13} className="text-rose-555" />;
                  zoneBadgeColor = "bg-rose-55 border-rose-255 text-rose-855";
                } else if (pin.zoneType === "travel_route") {
                  zoneIcon = <Compass size={13} className="text-purple-555" />;
                  zoneBadgeColor = "bg-purple-55 border-purple-255 text-purple-855";
                }

                return (
                  <div
                    key={pin.id}
                    onClick={() => onSelectZone(pin)}
                    className={`group bg-white border rounded-xl hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden text-left ${
                      isExpanded ? "border-violet-300 shadow-sm" : "border-slate-250/90"
                    }`}
                  >
                    {/* Zone Card Header */}
                    <div className="p-3 flex items-start justify-between min-h-[64px]">
                      <div className="space-y-1 max-w-[70%]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`flex items-center gap-1 py-0.5 px-1.5 border rounded-md text-[9px] font-black uppercase tracking-wide ${zoneBadgeColor}`}>
                            {zoneIcon}
                            <span>{pin.zoneType || "custom"}</span>
                          </span>
                          {pin.severity === "critical" && (
                            <span className="bg-red-105 border border-red-150 text-red-750 font-black text-[8px] uppercase tracking-wide leading-none p-1 rounded">
                              CRITICAL WATCH
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-805 leading-snug group-hover:text-violet-750 transition-colors">
                          {pin.title}
                        </h4>
                        {pin.note && (
                          <p className="text-[10px] text-slate-500 line-clamp-1 italic font-medium">
                            "{pin.note}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAlert ? (
                          <div
                            className={`px-1.5 py-1 rounded text-center shrink-0 min-w-[50px] border ${
                              intersectingEvents.length > 0
                                ? "bg-rose-50 text-rose-600 border-rose-250 animate-pulse font-extrabold"
                                : "bg-emerald-50 text-emerald-600 border-emerald-250 font-bold"
                            } text-[10px] leading-tight select-none`}
                            title="Active hazards intersected"
                          >
                            <span className="block font-mono text-[11px] leading-none mb-0.5">
                              {intersectingEvents.length}
                            </span>
                            <span className="text-[7.5px] uppercase tracking-wider font-extrabold">
                              ALERTS
                            </span>
                          </div>
                        ) : (
                          <div className="px-1.5 py-1 bg-slate-100 border border-slate-205 text-slate-400 rounded text-center shrink-0 min-w-[50px] text-[8.5px] uppercase tracking-wider font-bold select-none">
                            MUTED
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectZone(pin);
                          }}
                          className="p-1.5 hover:bg-slate-100 border border-transparent hover:border-slate-250 text-slate-400 hover:text-blue-500 rounded-lg cursor-pointer transition-colors shrink-0"
                          title="Recenter Map Bounds"
                        >
                          <Crosshair size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Sub row with details summary & triggers */}
                    <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-100 flex items-center justify-between text-[9px] font-mono text-slate-500 select-none">
                      <div className="flex items-center gap-1.5">
                        <span>Radius: {radiusM >= 1000 ? (radiusM / 1000).toFixed(1) + "km" : radiusM + "m"}</span>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={(e) => handleToggleActive(pin.id, e)}
                          className={`hover:underline cursor-pointer font-bold ${
                            isAlert ? "text-violet-600" : "text-slate-400"
                          }`}
                        >
                          {isAlert ? "[Active Scan]" : "[Scan Muted]"}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteZone(pin.id, e)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-655 rounded transition-colors cursor-pointer"
                          title="Purge Watch Perimeter"
                        >
                          <Trash2 size={11} />
                        </button>

                        {isAlert && intersectingEvents.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedZoneId(isExpanded ? null : pin.id);
                            }}
                            className="py-0.5 px-1.5 bg-white border border-slate-250 hover:bg-violet-50 hover:border-violet-200 text-slate-655 hover:text-violet-655 rounded flex items-center gap-0.5 font-bold cursor-pointer transition-colors"
                          >
                            <span>List</span>
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Intersecting Incidents Detail List */}
                    {isExpanded && isAlert && intersectingEvents.length > 0 && (
                      <div className="border-t border-slate-150 divide-y divide-slate-150 max-h-[220px] overflow-y-auto bg-slate-50/80">
                        {intersectingEvents.map((evt) => {
                          const dMeters = getDistanceMeters(pin.latitude, pin.longitude, evt.latitude, evt.longitude);

                          return (
                            <div
                              key={evt.id}
                              className="p-2 hover:bg-white flex items-start gap-2 text-[10.5px] transition-colors"
                            >
                              <span
                                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                  evt.severity === "critical"
                                    ? "bg-red-600 animate-pulse"
                                    : evt.severity === "high"
                                    ? "bg-amber-505"
                                    : "bg-blue-505"
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <h5 className="font-extrabold text-slate-805 truncate">
                                  {evt.title}
                                </h5>
                                <p className="text-[9px] text-slate-455 font-medium leading-tight">
                                  {evt.locationText || "Saskatoon"} • {dMeters >= 1000 ? (dMeters / 1000).toFixed(2) + " km" : Math.round(dMeters) + " m"} away
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* TAB 2: ACTIVE CORRIDOR TRAFFIC CHANNELS */}
        {activeSubTab === "routes" && (
          <>
            {isDrawingRoute ? (
              <div className="bg-amber-50/90 border border-amber-200 text-amber-955 rounded-xl p-3.5 space-y-3 shadow-sm animate-fadeIn leading-relaxed select-none">
                <div className="flex items-center gap-2 font-black text-xs text-amber-800">
                  <Waypoints size={13} className="text-amber-600 animate-pulse" />
                  <span className="uppercase tracking-wider font-mono">Drawing Corridor Active</span>
                </div>
                <div className="text-[11px] text-slate-700 space-y-1.5 font-medium leading-normal text-left">
                  <p>
                    📌 <b>Click sequentially on Saskatoon grids</b> directly inside the main tactical map to trace your travel corridors.
                  </p>
                  <p className="text-slate-500 text-[10px] italic">
                    The spatial engine applies threat proximity aggregation within a 1km safety corridor around all drawn segments.
                  </p>
                </div>
                
                {currentDrawnPath.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono bg-white border border-amber-150 rounded-lg p-2 font-bold text-amber-900">
                      <span>Waypoints Placed:</span>
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs animate-pulse">
                        {currentDrawnPath.length}
                      </span>
                    </div>

                    {/* Dynamic High-Severity Hotspots Indicator & Risk Triggers */}
                    {(() => {
                      const liveRiskProfile = calculateRouteRiskScore(currentDrawnPath, events);
                      const highSeverityEvents = liveRiskProfile.intersectingEvents.filter(
                        (item) => item.event.severity === "critical" || item.event.severity === "high"
                      );
                      const allIntersectingEvents = liveRiskProfile.intersectingEvents;
                      const count = highSeverityEvents.length;

                      // Micro UI theme state customization for the hotspot warning banner
                      let wrapperBg = "bg-rose-50 border-rose-220 text-rose-800";
                      let countBg = "bg-rose-600 text-white";
                      let hintText = "Critical safety status. Severe danger hazards detected nearby.";
                      let alertColor = "text-rose-600 animate-pulse";

                      if (count === 0) {
                        wrapperBg = "bg-emerald-50 border-emerald-250 text-emerald-800";
                        countBg = "bg-emerald-600 text-white";
                        hintText = "Clear trajectory. Zero severe threat incidents detected.";
                        alertColor = "text-emerald-600";
                      } else if (count <= 2) {
                        wrapperBg = "bg-amber-50 border-amber-250 text-amber-900";
                        countBg = "bg-amber-600 text-white";
                        hintText = "Caution status. Moderate/high risk proximity advisory.";
                        alertColor = "text-amber-600 animate-pulse";
                      }

                      return (
                        <div className="space-y-3">
                          {/* Alert Summary Box */}
                          <div className={`border rounded-xl p-3 space-y-2 transition-all duration-300 animate-fadeIn ${wrapperBg}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide">
                                <AlertCircle size={13} className={alertColor} />
                                <span>Corridor Safety Watch</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-black shadow-sm shrink-0 ${countBg}`}>
                                {count} Severe
                              </span>
                            </div>

                            <p className="text-[9.5px] leading-snug font-medium italic opacity-95 text-left">
                              {hintText}
                            </p>
                          </div>

                          {/* Dedicated 'Risk Triggers' section */}
                          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-sm text-left animate-fadeIn">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 select-none">
                              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">
                                <AlertTriangle size={12} className="text-amber-500 animate-bounce" />
                                <span>Risk Triggers</span>
                              </div>
                              <span className="bg-slate-100 text-slate-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md font-mono">
                                {allIntersectingEvents.length} detected
                              </span>
                            </div>

                            {allIntersectingEvents.length === 0 ? (
                              <div className="text-center py-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg text-slate-400 text-[10px] font-medium italic select-none">
                                No active hazards within 1 km warning buffer.
                              </div>
                            ) : (
                              <div className="space-y-1.5 max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                                {allIntersectingEvents.map(({ event, distanceM }) => {
                                  const pct = Math.round(distanceM);
                                  const distanceStr = pct >= 1000 
                                    ? (pct / 1000).toFixed(2) + " km" 
                                    : pct + " m";

                                  let severityBadge = "bg-blue-105 text-blue-700";
                                  let bulletColor = "bg-blue-500";
                                  if (event.severity === "critical") {
                                    severityBadge = "bg-red-105 text-red-750 font-bold";
                                    bulletColor = "bg-red-500 animate-pulse";
                                  } else if (event.severity === "high") {
                                    severityBadge = "bg-amber-105 text-amber-750";
                                    bulletColor = "bg-amber-500";
                                  }

                                  return (
                                    <div
                                      key={event.id}
                                      className="group/item flex items-start gap-2 bg-slate-50/70 hover:bg-violet-50/50 p-2 rounded-lg border border-slate-200/50 hover:border-violet-200/80 transition-all text-[10px]"
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${bulletColor}`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-extrabold text-slate-805 line-clamp-2 leading-snug group-hover/item:text-violet-750 transition-colors">
                                          {event.title}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap items-center justify-between text-[8.5px] font-mono text-slate-450 leading-none gap-1">
                                          <span className="capitalize">{event.severity} Severity</span>
                                          <span className="font-bold text-slate-600 bg-white border border-slate-200/60 px-1 py-0.2 rounded">
                                            {distanceStr} away
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-2.5 border border-dashed border-amber-250 bg-amber-50/40 rounded-lg text-[10.5px] text-amber-750 italic font-bold animate-pulse">
                    No nodes selected. Click the map grid.
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentDrawnPath.length < 2) {
                        alert("Please select at least 2 coordinate nodes (waypoints) to calculate safety risk trajectories.");
                        return;
                      }
                      
                      const title = prompt(
                        "Enter route corridor identifier (e.g. Work Commute, Kids Route to West Park):",
                        `Safety Corridor #${customRoutes.length + 1}`
                      );
                      if (!title) return;
                      
                      const note = prompt("Enter custom concern watch note (optional):");
                      
                      const newRoute: CustomRouteItem = {
                        id: `route-${Date.now()}`,
                        title,
                        note: note || "",
                        path: currentDrawnPath,
                        createdAt: new Date().toISOString(),
                        isActive: true
                      };

                      setCustomRoutes(prev => [newRoute, ...prev]);
                      setIsDrawingRoute(false);
                      setCurrentDrawnPath([]);
                      setSelectedRouteId(newRoute.id);
                    }}
                    disabled={currentDrawnPath.length < 2}
                    className="flex-1 py-1.5 font-bold text-[11px] uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center select-none"
                  >
                    Save & Analyze
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawingRoute(false);
                      setCurrentDrawnPath([]);
                    }}
                    className="py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-650 border border-slate-205 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsDrawingRoute(true);
                  setCurrentDrawnPath([]);
                  setSelectedRouteId(null);
                }}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all hover:scale-[1.01] cursor-pointer mb-2 uppercase tracking-wider font-mono shrink-0"
              >
                <Route size={14} className="animate-pulse" />
                <span>Draw Corridors Path</span>
              </button>
            )}

            {/* List the saved Corridors routes */}
            {customRoutes.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-4 select-none animate-fadeIn">
                <div className="h-14 w-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto border border-dashed border-indigo-250">
                  <Route size={24} className="text-indigo-505" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-extrabold text-slate-705 uppercase tracking-wider">
                    No Safe Route Analyzed
                  </h4>
                  <p className="text-[11px] text-slate-450 max-w-[260px] mx-auto leading-normal font-medium">
                    Trace custom travel lines to school, grocery stores, or workplaces and automatically calculate risk ratings near Saskatoon police alerts.
                  </p>
                </div>

                <div className="text-left bg-white border border-slate-210 rounded-xl p-3.5 space-y-2.5 max-w-[310px] mx-auto shadow-sm text-slate-600 text-[10.5px] font-semibold">
                  <p className="text-[9.5px] font-black text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-1 font-mono leading-none">
                    How it works:
                  </p>
                  <div className="flex items-start gap-1.5">
                    <span className="h-4 w-4 bg-indigo-50 text-indigo-750 font-mono text-[9px] font-black rounded-full flex items-center justify-center shrink-0">1</span>
                    <span>Click the <b>Draw Corridors Path</b> button above.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="h-4 w-4 bg-indigo-50 text-indigo-770 font-mono text-[9px] font-black rounded-full flex items-center justify-center shrink-0">2</span>
                    <span>Click sequential locations on Saskatoon maps to trace your path of travel.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="h-4 w-4 bg-indigo-50 text-indigo-750 font-mono text-[9px] font-black rounded-full flex items-center justify-center shrink-0">3</span>
                    <span>Assign an identifier name. The system performs spatial aggregation!</span>
                  </div>
                </div>
              </div>
            ) : (
              customRoutes.map((route) => {
                const isActive = route.isActive !== false;
                
                // Perform live analytical calculation relative to current events in scope in real-time!
                const riskProfile = isActive
                  ? calculateRouteRiskScore(route.path, events)
                  : { score: 0, riskLevel: "low", intersectingEventsCount: 0, intersectingEvents: [] };
                
                const isExpanded = expandedRouteId === route.id;
                const isSelected = selectedRouteId === route.id;

                let scoreColor = "text-emerald-600";
                let bgProgressColor = "bg-emerald-500";
                let badgeStyle = "bg-emerald-50 border-emerald-250 text-emerald-800";
                let riskLabel = "Safe Passage corridor";

                if (riskProfile.score >= 70) {
                  scoreColor = "text-red-700 font-extrabold animate-pulse";
                  bgProgressColor = "bg-red-650";
                  badgeStyle = "bg-red-50 border-red-200 text-red-800";
                  riskLabel = "Critical Threat Area";
                } else if (riskProfile.score >= 40) {
                  scoreColor = "text-orange-550 font-extrabold";
                  bgProgressColor = "bg-orange-500";
                  badgeStyle = "bg-orange-50 border-orange-205 text-orange-850";
                  riskLabel = "High Risk Corridors";
                } else if (riskProfile.score >= 15) {
                  scoreColor = "text-yellow-650 font-bold";
                  bgProgressColor = "bg-amber-450";
                  badgeStyle = "bg-yellow-50 border-yellow-250 text-yellow-850";
                  riskLabel = "Caution Corridor";
                }

                return (
                  <div
                    key={route.id}
                    onClick={() => {
                      setSelectedRouteId(route.id);
                      if (onSelectRoute) onSelectRoute(route);
                    }}
                    className={`group bg-white border rounded-xl hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden text-left ${
                      isSelected ? "border-indigo-400 ring-2 ring-indigo-50" : isExpanded ? "border-indigo-300" : "border-slate-250/90"
                    }`}
                  >
                    {/* Route Item Header block */}
                    <div className="p-3 flex items-start justify-between min-h-[64px]">
                      <div className="space-y-1.5 max-w-[70%] text-left">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 py-0.5 px-1.5 border rounded-md text-[9px] font-black uppercase tracking-wide ${badgeStyle}`}>
                            <Route size={10} />
                            <span>{riskLabel}</span>
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-800 leading-snug group-hover:text-indigo-650 transition-colors zoom-all">
                          {route.title}
                        </h4>
                        {route.note && (
                          <p className="text-[10px] text-slate-500 leading-tight italic font-medium line-clamp-1">
                            "{route.note}"
                          </p>
                        )}
                        <p className="text-[9px] font-mono text-slate-450">
                          Corridor Length: <b>{getRouteLengthStr(route.path)}</b> ({route.path.length} waypoints)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 select-none">
                        {/* Interactive Risk Indicator Score Badge */}
                        {isActive ? (
                          <div
                            className={`px-1.5 py-1 rounded text-center shrink-0 min-w-[50px] border ${
                              riskProfile.score >= 40
                                ? "bg-red-50 text-red-650 border-red-200 animate-pulse font-black"
                                : "bg-slate-50 text-slate-700 border-slate-220 font-bold"
                            } text-[10px] leading-tight`}
                            title="Interactive Risk Score"
                          >
                            <span className="block font-mono text-[12px] leading-none mb-0.5 font-extrabold">
                              {riskProfile.score}%
                            </span>
                            <span className="text-[7.5px] uppercase tracking-wider font-extrabold text-slate-400">
                              RISK
                            </span>
                          </div>
                        ) : (
                          <div className="px-1.5 py-1 bg-slate-100 border border-slate-205 text-slate-400 rounded text-center shrink-0 min-w-[50px] text-[8.5px] uppercase tracking-wider font-bold select-none">
                            MUTED
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRouteId(route.id);
                            if (onSelectRoute) onSelectRoute(route);
                          }}
                          className="p-1.5 hover:bg-slate-100 border border-transparent hover:border-slate-200 text-slate-400 hover:text-blue-500 rounded-lg cursor-pointer transition-colors shrink-0"
                          title="Center Map Corridor Path"
                        >
                          <Crosshair size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Score Bar Visualizer indicator */}
                    {isActive && (
                      <div className="h-1 w-full bg-slate-100 select-none overflow-hidden hover:opacity-90 transition-all">
                        <div
                          className={`h-full ${bgProgressColor} transition-all duration-500`}
                          style={{ width: `${riskProfile.score}%` }}
                        />
                      </div>
                    )}

                    {/* Bottom Utility controls block */}
                    <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-100 flex items-center justify-between text-[9px] font-mono text-slate-500 select-none">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleToggleRouteActive(route.id, e)}
                          className={`hover:underline cursor-pointer font-bold ${
                            isActive ? "text-indigo-650" : "text-slate-400"
                          }`}
                        >
                          {isActive ? "[Guarded Scan]" : "[Scan Inactive]"}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRoute(route.id, e)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-150 rounded transition-colors cursor-pointer"
                          title="Purge Corridor Path"
                        >
                          <Trash2 size={11} />
                        </button>

                        {isActive && riskProfile.intersectingEventsCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedRouteId(isExpanded ? null : route.id);
                            }}
                            className="py-0.5 px-1.5 bg-white border border-slate-250 hover:bg-violet-50 hover:border-violet-200 text-slate-655 hover:text-violet-655 rounded flex items-center gap-0.5 font-bold cursor-pointer"
                          >
                            <span>Threats ({riskProfile.intersectingEventsCount})</span>
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Incident Proximity detailing list */}
                    {isExpanded && isActive && riskProfile.intersectingEventsCount > 0 && (
                      <div className="border-t border-slate-150 divide-y divide-slate-150 max-h-[220px] overflow-y-auto bg-slate-50/80">
                        <div className="p-2 text-[9.5px] text-slate-500 font-semibold bg-indigo-50/20 italic select-none text-left">
                          ⚡ Incidents aggregated in 1km warning buffer around corridors:
                        </div>
                        {riskProfile.intersectingEvents.map(({ event, distanceM }) => (
                          <div
                            key={event.id}
                            className="p-2 hover:bg-white flex items-start gap-2 text-[10.5px] transition-colors text-left"
                          >
                            <span
                              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                event.severity === "critical"
                                  ? "bg-red-600 animate-pulse"
                                  : event.severity === "high"
                                  ? "bg-amber-500"
                                  : "bg-blue-505"
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <h5 className="font-bold text-slate-805 truncate">
                                {event.title}
                              </h5>
                              <p className="text-[9px] text-slate-455 leading-tight font-medium">
                                {event.locationText || "Saskatoon"} • {distanceM >= 1000 ? (distanceM / 1000).toFixed(2) + " km" : Math.round(distanceM) + " m"} away
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
        
      </div>
    </div>
  );
}
