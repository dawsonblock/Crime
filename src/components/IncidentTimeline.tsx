import React, { useMemo } from 'react';
import { EventItem } from '../types';
import { Clock } from 'lucide-react';

interface IncidentTimelineProps {
  events: EventItem[];
}

export default function IncidentTimeline({ events }: IncidentTimelineProps) {
  const eventsByHour = useMemo(() => {
    // Map events onto a 24 hour axis
    const eventPoints: Array<{ event: EventItem; hour: number; minute: number; fractionalHour: number }> = [];

    events.forEach((evt) => {
      if (!evt.publishedAt) return;
      const date = new Date(evt.publishedAt);
      if (isNaN(date.getTime())) return;

      const hour = date.getHours();
      const minute = date.getMinutes();
      const fractionalHour = hour + minute / 60;
      eventPoints.push({ event: evt, hour, minute, fractionalHour });
    });

    eventPoints.sort((a, b) => a.fractionalHour - b.fractionalHour);
    return eventPoints;
  }, [events]);

  const getSeverityStyle = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "bg-red-500 border-red-200 outline-red-500 hover:bg-red-600";
      case "high":
        return "bg-orange-400 border-orange-200 outline-orange-400 hover:bg-orange-500";
      case "medium":
        return "bg-yellow-400 border-yellow-200 outline-yellow-400 hover:bg-yellow-500";
      default:
        return "bg-slate-400 border-slate-200 outline-slate-400 hover:bg-slate-500";
    }
  };

  const getSeverityGlow = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "shadow-[0_0_8px_rgba(239,68,68,0.6)]";
      case "high":
        return "shadow-[0_0_8px_rgba(249,115,22,0.6)]";
      case "medium":
        return "shadow-[0_0_8px_rgba(250,204,21,0.6)]";
      default:
        return "";
    }
  };

  const hourMarkers = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0 overflow-visible">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-4 h-4 text-slate-500" />
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">Incident Timeline (24h Distribution)</h3>
        <span className="ml-auto text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          {eventsByHour.length} events
        </span>
      </div>

      <div className="relative h-20 w-full mt-2">
        {/* Horizontal Axis line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 rounded-full"></div>

        {/* Hour markers */}
        {hourMarkers.map((h, i) => (
          h % 6 === 0 ? (
            <div 
              key={`h-${h}`} 
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              <div className="w-0.5 h-3 bg-slate-300 mb-1 z-0"></div>
              <div className="text-[9px] font-mono text-slate-400 absolute top-4 whitespace-nowrap -translate-x-1/2">
                {h.toString().padStart(2, '0')}:00
              </div>
            </div>
          ) : (
            <div 
              key={`h-${h}`} 
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-200"
              style={{ left: `${(h / 24) * 100}%` }}
            ></div>
          )
        ))}

        {/* Event nodes */}
        {eventsByHour.map((pt, idx) => {
          const leftPercent = (pt.fractionalHour / 24) * 100;
          const isTop = idx % 2 === 0;

          return (
            <div 
              key={pt.event.id || idx} 
              className="absolute group z-10 cursor-pointer"
              style={{ 
                left: `${leftPercent}%`, 
                top: isTop ? '30%' : '70%',
                transform: 'translate(-50%, -50%)'
              }}
            >
              <div className={`w-2.5 h-2.5 rounded-full border border-white outline outline-1 outline-offset-1 transition-all group-hover:scale-150 group-hover:z-50 ${getSeverityStyle(pt.event.severity)} ${getSeverityGlow(pt.event.severity)}`}></div>
              
              {/* Tooltip */}
              <div className={`absolute ${isTop ? 'bottom-full mb-3' : 'top-full mt-3'} left-1/2 -translate-x-1/2 w-48 bg-slate-800 text-white p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 text-xs`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-mono text-slate-300">
                    {pt.hour.toString().padStart(2, '0')}:{pt.minute.toString().padStart(2, '0')}
                  </span>
                  <span className={`text-[9px] px-1 py-[1px] uppercase tracking-wider font-bold rounded ${pt.event.severity === 'critical' ? 'bg-red-500/20 text-red-300' : pt.event.severity === 'high' ? 'bg-orange-500/20 text-orange-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {pt.event.severity}
                  </span>
                </div>
                <div className="font-semibold line-clamp-2 leading-tight">
                  {pt.event.title}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                  {pt.event.eventType.replace(/_/g, ' ')}
                </div>
                {/* Carrot */}
                <div className={`absolute ${isTop ? 'top-full border-t-slate-800' : 'bottom-full border-b-slate-800 border-x-transparent border-t-transparent'} left-1/2 -translate-x-1/2 border-4`}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
