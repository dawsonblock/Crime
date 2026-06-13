import React, { useState } from "react";
import { EventItem, SeverityType } from "../types";
import { Bell, MapPin, Trash2, Crosshair, ChevronDown, ChevronUp, Shield, AlertTriangle, ShieldCheck, Home, Building2, Hospital, Compass } from "lucide-react";

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
}: AlertZonesPanelProps) {
  // Expand state for each zone card
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);

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

  const activeAlertZones = customPins.filter((p) => p.isAlertZone);

  return (
    <div className="flex flex-col h-full bg-slate-55" id="zones-panel-container">
      {/* Panel Header */}
      <div className="p-3 bg-white border-b border-slate-200/80 shadow-sm shrink-0 flex items-center justify-between select-none">
        <div>
          <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest leading-none">
            Safety Monitoring
          </h3>
          <h2 className="text-sm font-extrabold text-slate-800 leading-tight mt-1">
            My Alert Zones
          </h2>
        </div>
        <div className="flex items-center gap-1.5 bg-violet-50 text-violet-700 px-2 py-0.5 border border-violet-150 rounded-full text-[10px] font-bold font-mono">
          <Bell size={10} className="animate-pulse" />
          <span>{activeAlertZones.length} Active</span>
        </div>
      </div>

      {/* Description Context Banner */}
      <div className="p-2.5 bg-gradient-to-r from-violet-500/8 to-indigo-500/8 border-b border-indigo-100 shrink-0 text-[10px] leading-relaxed text-slate-600 flex items-start gap-2 select-none">
        <Shield size={13} className="text-violet-600 shrink-0 mt-0.5" />
        <div>
          Specify custom circles around critical Saskatoon locations. The system automatically scans for real-time police incident occurrences and hazards inside your perimeters.
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
        {customPins.length === 0 ? (
          /* Empty state */
          <div className="py-12 px-4 text-center space-y-4 select-none">
            <div className="h-14 w-14 bg-violet-50 text-violet-600 rounded-full flex items-center justify-center mx-auto border border-dashed border-violet-250">
              <Compass size={24} className="animate-spin-slow text-violet-500" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                No Alert Zones Defined
              </h4>
              <p className="text-[11px] text-slate-450 max-w-[260px] mx-auto leading-normal">
                Drop custom pins on the map to configure personalized alert perimeters around your home, office, hospital, or route corridors.
              </p>
            </div>
            {/* Guide Steps */}
            <div className="text-left bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 max-w-[310px] mx-auto shadow-sm">
              <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-1 leading-none select-none">
                How to set up:
              </p>
              <div className="flex items-start gap-2 text-[10.5px] text-slate-600">
                <span className="flex h-4 w-4 shrink-0 bg-violet-100 text-violet-700 text-[9px] font-black rounded-full items-center justify-center select-none font-mono">1</span>
                <span>Click the <b>Map Pin 📍</b> action on the map's sidebar tray (located on the tactical map screen).</span>
              </div>
              <div className="flex items-start gap-2 text-[10.5px] text-slate-600">
                <span className="flex h-4 w-4 shrink-0 bg-violet-100 text-violet-700 text-[9px] font-black rounded-full items-center justify-center select-none font-mono">2</span>
                <span><b>Click anywhere on Saskatoon</b> map (like your home, office, or regular route) to open the setup form.</span>
              </div>
              <div className="flex items-start gap-2 text-[10.5px] text-slate-600">
                <span className="flex h-4 w-4 shrink-0 bg-violet-100 text-violet-700 text-[9px] font-black rounded-full items-center justify-center select-none font-mono">3</span>
                <span>Set the desired <b>Radius (e.g. 1.0 km)</b>, select the Zone Type (e.g. Home), and save.</span>
              </div>
            </div>
          </div>
        ) : (
          customPins.map((pin) => {
            // Compute incidents inside this zone's alert radius
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
            let zoneIcon = <Compass size={13} className="text-slate-500" />;
            let zoneBadgeColor = "bg-slate-100 border-slate-200 text-slate-700";

            if (pin.zoneType === "home") {
              zoneIcon = <Home size={13} className="text-emerald-500" />;
              zoneBadgeColor = "bg-emerald-50 border-emerald-250 text-emerald-850";
            } else if (pin.zoneType === "apartment") {
              zoneIcon = <Building2 size={13} className="text-cyan-500" />;
              zoneBadgeColor = "bg-cyan-50 border-cyan-250 text-cyan-850";
            } else if (pin.zoneType === "hospital") {
              zoneIcon = <Hospital size={13} className="text-rose-500" />;
              zoneBadgeColor = "bg-rose-50 border-rose-250 text-rose-850";
            } else if (pin.zoneType === "travel_route") {
              zoneIcon = <Compass size={13} className="text-purple-500" />;
              zoneBadgeColor = "bg-purple-50 border-purple-250 text-purple-855";
            }

            return (
              <div
                key={pin.id}
                onClick={() => onSelectZone(pin)}
                className={`group bg-white border rounded-xl hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden ${
                  isExpanded ? "border-violet-300 shadow-sm" : "border-slate-200/95"
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
                        <span className="bg-red-100 border border-red-150 text-red-700 font-extrabold text-[8px] uppercase tracking-wide leading-none p-1 rounded">
                          CRITICAL WATCH
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 leading-snug group-hover:text-violet-700 transition-colors">
                      {pin.title}
                    </h4>
                    {pin.note && (
                      <p className="text-[10px] text-slate-500 line-clamp-1 italic">
                        "{pin.note}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Intersecting Incidents Badge */}
                    {isAlert ? (
                      <div
                        className={`px-1.5 py-1 rounded text-center shrink-0 min-w-[50px] border ${
                          intersectingEvents.length > 0
                            ? "bg-rose-50/90 text-rose-600 border-rose-200 animate-pulse font-extrabold"
                            : "bg-emerald-50 text-emerald-600 border-emerald-200 font-bold"
                        } text-[10px] leading-tight select-none`}
                        title="Incidents inside scan radius"
                      >
                        <span className="block font-mono text-[11px] leading-none mb-0.5">
                          {intersectingEvents.length}
                        </span>
                        <span className="text-[7.5px] uppercase tracking-wider font-bold">
                          ALERTS
                        </span>
                      </div>
                    ) : (
                      <div className="px-1.5 py-1 bg-slate-100 border border-slate-200 text-slate-400 rounded text-center shrink-0 min-w-[50px] text-[8.5px] uppercase tracking-wider font-bold select-none">
                        MUTED
                      </div>
                    )}

                    {/* Quick Recenter */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectZone(pin);
                      }}
                      className="p-1.5 hover:bg-slate-100 border border-transparent hover:border-slate-200 text-slate-400 hover:text-blue-500 rounded-lg cursor-pointer transition-colors shrink-0"
                      title="Center Map here"
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
                      className="p-1 hover:bg-red-50 text-slate-405 hover:text-red-600 rounded transition-colors cursor-pointer"
                      title="Delete alert zone"
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
                        className="py-0.5 px-1.5 bg-white border border-slate-200 hover:bg-violet-50 hover:border-violet-200 text-slate-650 hover:text-violet-650 rounded flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <span>List</span>
                        {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Intersecting Incidents Detail List */}
                {isExpanded && isAlert && intersectingEvents.length > 0 && (
                  <div className="border-t border-slate-150 divide-y divide-slate-150 max-h-[220px] overflow-y-auto bg-slate-100/50">
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
                                ? "bg-red-600"
                                : evt.severity === "high"
                                ? "bg-amber-500"
                                : "bg-blue-500"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <h5 className="font-bold text-slate-800 truncate">
                              {evt.title}
                            </h5>
                            <p className="text-[9px] text-slate-450 leading-tight">
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
      </div>
    </div>
  );
}
