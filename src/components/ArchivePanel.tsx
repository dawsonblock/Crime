import React, { useState, useMemo } from "react";
import { EventItem } from "../types";
import { Search, Calendar, Ghost } from "lucide-react";

interface ArchivePanelProps {
  events: EventItem[];
  onSelectEvent: (event: EventItem) => void;
  bookmarks: string[];
  onToggleBookmark: (eventId: string) => void;
}

export default function ArchivePanel({
  events,
  onSelectEvent,
  bookmarks,
  onToggleBookmark,
}: ArchivePanelProps) {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Only show incidents completely older than 30 days
  const archiveEvents = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysTime = thirtyDaysAgo.getTime();

    return events.filter((e) => {
      const pDate = new Date(e.publishedAt);
      if (pDate.getTime() > thirtyDaysTime) return false;

      if (selectedDate) {
        const pDateStr = pDate.toISOString().split("T")[0];
        if (pDateStr !== selectedDate) return false;
      }

      if (searchQuery) {
        const term = searchQuery.toLowerCase();
        return (
          e.title.toLowerCase().includes(term) ||
          e.summary.toLowerCase().includes(term) ||
          e.locationText.toLowerCase().includes(term) ||
          e.eventType.toLowerCase().includes(term)
        );
      }

      return true;
    });
  }, [events, selectedDate, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      <div className="p-4 border-b border-slate-200 bg-white space-y-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 mb-0.5">
            Historical Incident Archive
          </h2>
          <p className="text-[10px] text-slate-500 font-medium">
            Search and query past safety alerts older than 30 days.
          </p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]}
              className="w-full text-xs py-2 pl-8 pr-3 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 bg-white"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search historical records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs py-2 pl-8 pr-3 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 bg-white"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-none">
        {archiveEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <div className="bg-slate-100 p-3 rounded-full mb-3">
              <Ghost size={24} className="text-slate-400" />
            </div>
            <p className="text-xs font-bold text-slate-600 mb-1">
              No Historical Records Found
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              Try adjusting your date selection or search query to explore deeper into the archive. Note that records are restricted to incidents older than 30 days.
            </p>
          </div>
        ) : (
          archiveEvents.map((evt) => (
            <div
              key={evt.id}
              onClick={() => onSelectEvent(evt)}
              className="p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer space-y-2 group"
            >
              <div className="flex justify-between items-start gap-2">
                <h4 className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
                  {evt.title}
                </h4>
                <span className="text-[9px] font-mono whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-extrabold uppercase shrink-0">
                  {new Date(evt.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 line-clamp-2 leading-relaxed">
                {evt.summary}
              </p>
              <div className="flex items-center gap-3 pt-1">
                <span
                  className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                    evt.severity === "critical"
                      ? "bg-red-50 text-red-700"
                      : evt.severity === "high"
                      ? "bg-orange-50 text-orange-700"
                      : evt.severity === "medium"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {evt.severity.toUpperCase()}
                </span>
                <span className="text-[9.5px] text-slate-500 font-medium truncate max-w-[150px]">
                  📍 {evt.locationText}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
