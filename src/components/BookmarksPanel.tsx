import React, { useMemo, useState } from "react";
import { 
  Bookmark, Trash2, Search, Calendar, MapPin, 
  Sparkles, AlertCircle, FileText, ChevronRight, Edit3, 
  Map, BookmarkMinus, CheckCircle2, FileEdit, Camera, Loader2
} from "lucide-react";
import { EventItem } from "../types";
import SourceBadge from "./SourceBadge";

interface BookmarksPanelProps {
  events: EventItem[];
  bookmarks: string[];
  bookmarkNotes: Record<string, string>;
  bookmarkSnapshots?: Record<string, string>;
  onUpdateBookmarkSnapshot?: (eventId: string, snapshotDataUrl: string) => void;
  onRemoveBookmarkSnapshot?: (eventId: string) => void;
  takeSnapshotRef?: React.MutableRefObject<(() => Promise<string | null>) | null>;
  onSelectEvent: (event: EventItem) => void;
  onToggleBookmark: (eventId: string) => void;
  onUpdateBookmarkNote: (eventId: string, noteText: string) => void;
}

export default function BookmarksPanel({
  events,
  bookmarks,
  bookmarkNotes,
  bookmarkSnapshots = {},
  onUpdateBookmarkSnapshot,
  onRemoveBookmarkSnapshot,
  takeSnapshotRef,
  onSelectEvent,
  onToggleBookmark,
  onUpdateBookmarkNote,
}: BookmarksPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState("");

  // Get all bookmarked events
  const bookmarkedEvents = useMemo(() => {
    return events.filter(evt => bookmarks.includes(evt.id));
  }, [events, bookmarks]);

  // Filter bookmarks by search lookup query
  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarkedEvents;
    const q = searchQuery.toLowerCase();
    
    return bookmarkedEvents.filter(evt => {
      const titleMatch = evt.title.toLowerCase().includes(q);
      const summaryMatch = (evt.summary || "").toLowerCase().includes(q);
      const locationMatch = evt.locationText.toLowerCase().includes(q);
      const noteMatch = (bookmarkNotes[evt.id] || "").toLowerCase().includes(q);
      const typeMatch = (evt.eventType || "").toLowerCase().includes(q);
      
      return titleMatch || summaryMatch || locationMatch || noteMatch || typeMatch;
    });
  }, [bookmarkedEvents, searchQuery, bookmarkNotes]);

  const handleStartEditing = (eventId: string, currentNote: string) => {
    setEditingNoteId(eventId);
    setTempNoteText(currentNote);
  };

  const handleSaveNote = (eventId: string) => {
    onUpdateBookmarkNote(eventId, tempNoteText);
    setEditingNoteId(null);
  };

  const formatDateTime = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 scrollbar-thin scrollbar-thumb-slate-200 font-sans select-none">
      
      {/* Bookmarks Header/Advisory */}
      <div className="p-3 bg-amber-50 border border-amber-200 text-amber-850 rounded-lg text-[11px] leading-relaxed flex gap-2.5 font-medium shadow-sm">
        <Bookmark size={15} className="shrink-0 text-amber-500 fill-amber-500 mt-0.5" />
        <div>
          <span className="font-bold text-amber-900">Personal Safety Watchlist:</span> Create custom personal safety reminders, routes, or contact logs for pinned Saskatoon incidents. Bookmarks and notes persist solely in your local browser storage.
        </div>
      </div>

      {/* Bookmarks Search Bar */}
      {bookmarkedEvents.length > 0 && (
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved incidents & personal notes..."
            className="w-full bg-white border border-slate-200 rounded px-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 font-medium"
          />
        </div>
      )}

      {/* Main List Area */}
      <div className="space-y-3">
        {bookmarkedEvents.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200/80 p-5 mt-4 space-y-3 shadow-sm">
            <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Bookmark size={18} />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-800">No Bookmarks Saved Yet</h4>
              <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto leading-relaxed font-semibold">
                Explore Saskatoon's incident map or feed, click on any incident to open details, and tap the bookmark icon at the top of the sheet to add it here.
              </p>
            </div>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-slate-200 p-4 text-xs text-slate-400 font-semibold shadow-sm">
            No saved incidents matched "{searchQuery}"
          </div>
        ) : (
          filteredBookmarks.map((evt) => {
            const hasNote = !!bookmarkNotes[evt.id]?.trim();
            const noteText = bookmarkNotes[evt.id] || "";
            const isEditing = editingNoteId === evt.id;

            return (
              <div 
                key={evt.id} 
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Event header meta and title */}
                <div className="p-3.5 border-b border-slate-100 space-y-2">
                  <div className="flex items-center justify-between gap-2 overflow-hidden">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <SourceBadge 
                        sourceKey={evt.sourceKey} 
                        sourceType={evt.sourceType} 
                        sourceName={evt.sourceName} 
                      />
                      <span className="text-[9px] px-1 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded font-mono font-bold capitalize truncate">
                        {evt.eventType.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectEvent(evt)}
                        title="Locate incident on map"
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer transition-colors"
                      >
                        <Map size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(evt.id)}
                        title="Delete bookmark"
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded cursor-pointer transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Incident Title & Date */}
                  <div 
                    onClick={() => onSelectEvent(evt)}
                    className="cursor-pointer group"
                  >
                    <h4 className="font-extrabold text-[11.5px] leading-snug text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {evt.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[9.5px] font-mono text-slate-400 mt-1">
                      <span className="flex items-center gap-0.5"><Calendar size={10} /> {formatDateTime(evt.publishedAt)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 truncate max-w-[150px]"><MapPin size={10} /> {evt.locationText}</span>
                    </div>
                  </div>
                </div>

                {/* Notebook personal Notes text block */}
                <div className="bg-amber-50/20 p-3 flex-1 flex flex-col justify-between">
                  {isEditing ? (
                    <div className="space-y-2">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                        <FileEdit size={10} /> Editing Personal Note
                      </span>
                      <textarea
                        value={tempNoteText}
                        onChange={(e) => setTempNoteText(e.target.value)}
                        placeholder="Type personal safety route notes, phone records, or comments..."
                        rows={3}
                        className="w-full bg-white border border-amber-250 rounded-lg p-2 text-xs focus:outline-none focus:border-amber-550 focus:ring-1 focus:ring-amber-200 text-slate-800 font-sans font-medium"
                      />
                      <div className="flex gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className="px-2 py-1 text-[10px] font-extrabold uppercase bg-slate-100 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNote(evt.id)}
                          className="px-2.5 py-1 text-[10px] font-extrabold uppercase bg-amber-500 hover:bg-amber-600 rounded text-white flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <CheckCircle2 size={11} /> Save Note
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1 select-none">
                          <Bookmark size={10} className="fill-amber-500/30" /> Personal Notes
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartEditing(evt.id, noteText)}
                          className="text-[9.5px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-0.5 cursor-pointer hover:bg-amber-100/35 px-1.5 py-0.5 rounded transition-all"
                        >
                          <Edit3 size={9} /> {hasNote ? "Edit" : "Add Note"}
                        </button>
                      </div>

                      {hasNote ? (
                        <p className="text-xs text-slate-700 font-medium leading-relaxed italic bg-amber-50/40 p-2.5 rounded-lg border border-amber-100/50">
                          "{noteText}"
                        </p>
                      ) : (
                        <p className="text-[10.5px] text-slate-400 font-semibold italic select-none">
                          No safety notes entered yet. Keep route comments or reminders here...
                        </p>
                      )}

                      {/* Personal Snapshot Display in Bookmarks Tab */}
                      {bookmarkSnapshots[evt.id] && (
                        <div className="pt-2.5 animate-in fade-in duration-250">
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1 select-none mb-1">
                            <Camera size={10} /> Saved Map View
                          </span>
                          <div className="relative group rounded-md overflow-hidden border border-amber-200/50 bg-white p-0.5 shadow-xs max-w-full">
                            <img
                              src={bookmarkSnapshots[evt.id]}
                              alt="Map layout capture"
                              className="rounded w-full max-h-[100px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => onSelectEvent(evt)}
                              title="Click to locate on map"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
