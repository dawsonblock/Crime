import React from "react";
import { X, Calendar, MapPin, AlertTriangle, ShieldCheck, Clock, Layers, HelpCircle, Tag, ArrowLeftRight } from "lucide-react";
import { EventItem } from "../types";

interface CompareIncidentsPanelProps {
  eventA: EventItem;
  eventB: EventItem;
  onClose: () => void;
}

// Distance helper between two nodes
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const deg2rad = (deg: number) => deg * (Math.PI / 180);
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export default function CompareIncidentsPanel({
  eventA,
  eventB,
  onClose,
}: CompareIncidentsPanelProps) {
  
  // Format difference in timing
  const getTimeDifferenceText = (dateStrA: string, dateStrB: string) => {
    const tA = new Date(dateStrA).getTime();
    const tB = new Date(dateStrB).getTime();
    const diffMs = Math.abs(tA - tB);
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const leftHours = diffHours % 24;

    if (diffDays > 0) {
      return `${diffDays}d ${leftHours}h gap`;
    }
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin >= 60) {
      return `${diffHours}h ${Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))}m gap`;
    }
    return `${diffMin} minutes gap`;
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-250";
      case "high":
        return "bg-orange-100 text-orange-850 border-orange-250";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-250";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const distanceBetween = getDistanceKm(
    eventA.latitude,
    eventA.longitude,
    eventB.latitude,
    eventB.longitude
  );

  const isSeverityDifferent = eventA.severity !== eventB.severity;
  const isTypeDifferent = eventA.eventType !== eventB.eventType;
  
  const timeA = new Date(eventA.publishedAt).getTime();
  const timeB = new Date(eventB.publishedAt).getTime();
  // We consider them different if their timestamps are not identical
  const isTimeDifferent = timeA !== timeB;

  return (
    <div 
      id="compare-incidents-modal-backdrop" 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[99999] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        id="compare-incidents-modal-content"
        className="bg-white border border-slate-200 shadow-2xl rounded-xl w-full max-w-4xl flex flex-col overflow-hidden animate-fadeIn select-text max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Block */}
        <div className="p-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-105 border border-blue-200 text-blue-600 rounded">
              <ArrowLeftRight size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-tight">
                Side-by-Side Incident Comparison
              </h3>
              <p className="text-[10px] text-slate-550 font-medium">
                Reviewing critical hazard vectors, timing gaps, and localization differences
              </p>
            </div>
          </div>
          <button
            type="button"
            id="compare-modal-close-btn"
            onClick={onClose}
            className="cursor-pointer p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-800 transition-colors"
            title="Close comparison panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content scrolling grid */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* Top side-by-side titles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 border border-l-4 border-slate-200 border-l-blue-500 rounded bg-slate-50/50 space-y-1">
              <span className="text-[8.5px] font-mono text-slate-400 font-extrabold uppercase">
                Incident Alpha (Left)
              </span>
              <h4 className="text-xs font-bold text-slate-800 leading-snug">
                {eventA.title}
              </h4>
              <p className="text-[10px] text-slate-400 font-mono">
                Source: {eventA.sourceName}
              </p>
            </div>

            <div className="p-3.5 border border-l-4 border-slate-200 border-l-emerald-500 rounded bg-slate-50/50 space-y-1">
              <span className="text-[8.5px] font-mono text-slate-400 font-extrabold uppercase">
                Incident Beta (Right)
              </span>
              <h4 className="text-xs font-bold text-slate-800 leading-snug">
                {eventB.title}
              </h4>
              <p className="text-[10px] text-slate-400 font-mono">
                Source: {eventB.sourceName}
              </p>
            </div>
          </div>

          {/* Quick Metrics Summary Banner */}
          <div className="bg-blue-50/45 border border-blue-150/75 rounded-lg p-3 text-xs flex flex-col sm:flex-row items-center justify-around gap-3 text-slate-800 font-medium">
            <div className="flex items-center gap-2">
              <MapPin size={13} className="text-blue-500 shrink-0" />
              <span>Distance Gap: <strong className="text-blue-700">{distanceBetween.toFixed(2)} km apart</strong></span>
            </div>
            <div className="hidden sm:block text-slate-300">|</div>
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-blue-500 shrink-0" />
              <span>Time Interval: <strong className="text-blue-700">{getTimeDifferenceText(eventA.publishedAt, eventB.publishedAt)}</strong></span>
            </div>
            <div className="hidden sm:block text-slate-300">|</div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Layers size={13} className="shrink-0" />
              <span>
                {isSeverityDifferent || isTypeDifferent ? "Contrast detected" : "Identical properties"}
              </span>
            </div>
          </div>

          {/* Main Comparison Parametrization Matrix */}
          <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-150">
            
            {/* 1. SEVERITY LEVEL ROW */}
            <div className={`p-4 transition-all ${isSeverityDifferent ? 'bg-amber-50/20' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={11} className={isSeverityDifferent ? "text-amber-500" : "text-slate-400"} />
                  Severity Classification
                </span>
                {isSeverityDifferent ? (
                  <span className="px-2 py-0.5 text-[8.5px] font-mono font-bold text-amber-700 bg-amber-100 rounded-full uppercase tracking-wider">
                    Severity Mismatch
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[8.5px] font-mono font-bold text-slate-500 bg-slate-100 rounded-full uppercase tracking-wider">
                    Identical Severity
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2.5">
                  <span className={`px-2.5 py-1 text-[10.5px] font-extrabold font-mono rounded border uppercase tracking-wider ${getSeverityBadgeClass(eventA.severity)}`}>
                    {eventA.severity}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {eventA.severity === 'critical' ? 'High-priority immediate action alert.' : 
                     eventA.severity === 'high' ? 'Significant threat vector requiring attention.' : 
                     eventA.severity === 'medium' ? 'Moderated local disruption risk.' : 'Low priority information bulletin.'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2.5 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <span className={`px-2.5 py-1 text-[10.5px] font-extrabold font-mono rounded border uppercase tracking-wider ${getSeverityBadgeClass(eventB.severity)}`}>
                    {eventB.severity}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {eventB.severity === 'critical' ? 'High-priority immediate action alert.' : 
                     eventB.severity === 'high' ? 'Significant threat vector requiring attention.' : 
                     eventB.severity === 'medium' ? 'Moderated local disruption risk.' : 'Low priority information bulletin.'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. EVENT TYPE ROW */}
            <div className={`p-4 transition-all ${isTypeDifferent ? 'bg-amber-50/20' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag size={11} className={isTypeDifferent ? "text-amber-500" : "text-slate-400"} />
                  Incident Category / Subtype
                </span>
                {isTypeDifferent ? (
                  <span className="px-2 py-0.5 text-[8.5px] font-mono font-bold text-amber-700 bg-amber-100 rounded-full uppercase tracking-wider">
                    Category Mismatch
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[8.5px] font-mono font-bold text-slate-500 bg-slate-100 rounded-full uppercase tracking-wider">
                    Identical Category
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-800">
                <div className="capitalize flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  {eventA.eventType?.replace(/_/g, " ")}
                </div>
                <div className="capitalize flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  {eventB.eventType?.replace(/_/g, " ")}
                </div>
              </div>
            </div>

            {/* 3. TIMESTAMP & AGE ROW */}
            <div className={`p-4 transition-all ${isTimeDifferent ? 'bg-amber-50/20' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={11} className={isTimeDifferent ? "text-amber-500" : "text-slate-400"} />
                  Published Timestamp
                </span>
                {isTimeDifferent ? (
                  <span className="px-2 py-0.5 text-[8.5px] font-mono font-bold text-amber-700 bg-amber-100 rounded-full uppercase tracking-wider">
                    Time Offset Detected
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[8.5px] font-mono font-bold text-slate-500 bg-slate-100 rounded-full uppercase tracking-wider">
                    Simultaneous
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-700">
                <div className="space-y-1">
                  <p className="font-mono text-slate-900 font-bold">
                    {new Date(eventA.publishedAt).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Confidence index score: {(eventA.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                
                <div className="space-y-1 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <p className="font-mono text-slate-900 font-bold">
                    {new Date(eventB.publishedAt).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Confidence index score: {(eventB.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>

            {/* 4. GEOGRAPHIC localization SECTION */}
            <div className="p-4 bg-slate-50/25">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin size={11} className="text-slate-400" />
                  Geographic Location Anchor
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <p className="font-bold text-slate-800 leading-normal">
                    {eventA.locationText}
                  </p>
                  <div className="font-mono text-[10.5px] text-slate-500 space-y-0.5">
                    <div>Latitude: {eventA.latitude.toFixed(5)}° N</div>
                    <div>Longitude: {eventA.longitude.toFixed(5)}° W</div>
                    <div className="capitalize text-[10px]">Precision: {eventA.locationPrecision}</div>
                  </div>
                </div>

                <div className="space-y-1.5 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <p className="font-bold text-slate-800 leading-normal">
                    {eventB.locationText}
                  </p>
                  <div className="font-mono text-[10.5px] text-slate-500 space-y-0.5">
                    <div>Latitude: {eventB.latitude.toFixed(5)}° N</div>
                    <div>Longitude: {eventB.longitude.toFixed(5)}° W</div>
                    <div className="capitalize text-[10px]">Precision: {eventB.locationPrecision}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. SUMMARY ROW */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={11} className="text-slate-400" />
                  Summary Narratives
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-justify">
                <div className="text-slate-650 leading-relaxed font-serif whitespace-pre-line bg-slate-50 p-3 rounded border border-slate-150">
                  {eventA.summary}
                </div>
                <div className="text-slate-650 leading-relaxed font-serif whitespace-pre-line bg-slate-50 p-3 rounded border border-slate-150 border-t md:border-t-0 mt-3 md:mt-0">
                  {eventB.summary}
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Footer controls */}
        <div className="p-4 border-t border-slate-150 bg-slate-50 flex items-center justify-between">
          <span className="text-[10px] text-slate-450 font-mono font-semibold">
            SASKATCHEWAN COMMUNITY INCIDENT VERIFICATION SYSTEM
          </span>
          <button
            type="button"
            id="compare-modal-footer-close-btn"
            onClick={onClose}
            className="cursor-pointer px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow transition-colors"
          >
            Acknowledge Analysis
          </button>
        </div>

      </div>
    </div>
  );
}
