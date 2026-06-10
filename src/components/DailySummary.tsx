import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { 
  TrendingUp, Activity, Clock, Sparkles, ShieldAlert, 
  AlertTriangle, Compass, CheckCircle2, RefreshCw, BookOpen, 
  ChevronRight, CornerDownRight, ShieldCheck, Moon, Sun, Sunrise, Sunset
} from "lucide-react";
import { EventItem, SeverityType } from "../types";

interface DailySummaryProps {
  events: EventItem[];
}

export default function DailySummary({ events }: DailySummaryProps) {
  const [activeTab, setActiveTab] = useState<"standard" | "ai">("standard");
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Filter events within the last 24 hours
  const events24h = useMemo(() => {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    return events.filter(
      (evt) => new Date(evt.publishedAt).getTime() >= twentyFourHoursAgo
    ).sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
  }, [events]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = events24h.length;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    events24h.forEach((e) => {
      if (e.severity === "critical") criticalCount++;
      else if (e.severity === "high") highCount++;
      else if (e.severity === "medium") mediumCount++;
      else if (e.severity === "low") lowCount++;
    });

    const categoryCounts: Record<string, number> = {};
    events24h.forEach((e) => {
      const type = e.eventType || "unknown";
      categoryCounts[type] = (categoryCounts[type] || 0) + 1;
    });

    return {
      total,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      categories: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]),
    };
  }, [events24h]);

  // Group events by time-of-day blocks for standard digest chronology
  const timesOfDay = useMemo(() => {
    const overnight: EventItem[] = []; // 12 AM - 6 AM
    const morning: EventItem[] = [];   // 6 AM - 12 PM
    const afternoon: EventItem[] = []; // 12 PM - 6 PM
    const evening: EventItem[] = [];   // 6 PM - 12 AM

    events24h.forEach((e) => {
      try {
        const date = new Date(e.publishedAt);
        const hours = date.getHours();
        if (hours >= 0 && hours < 6) overnight.push(e);
        else if (hours >= 6 && hours < 12) morning.push(e);
        else if (hours >= 12 && hours < 18) afternoon.push(e);
        else evening.push(e);
      } catch {
        afternoon.push(e);
      }
    });

    return {
      overnight,
      morning,
      afternoon,
      evening,
    };
  }, [events24h]);

  // Request server-side AI summary
  const fetchAiSummary = async (forceRefetch = false) => {
    if (isLoadingAi) return;
    if (aiSummary && !forceRefetch) return;

    setIsLoadingAi(true);
    setAiError(null);
    try {
      const response = await fetch("/api/events/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Unable to acquire AI intelligence brief.");
      }

      const data = await response.json();
      setAiSummary(data.summary);
    } catch (err: any) {
      console.error("AI Summary error details:", err);
      setAiError(err.message || "Failed to download safety intelligence summary.");
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Automatically fetch AI summary when entering the AI tab
  useEffect(() => {
    if (activeTab === "ai") {
      fetchAiSummary();
    }
  }, [activeTab]);

  // Helper parser converting standard bold and lists to tailwind elements
  const formatMarkdownText = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine) return <div key={idx} className="h-2"></div>;

      if (cleanLine.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-slate-800 mt-4 mb-1.5 uppercase tracking-wide flex items-center gap-1.5 font-sans border-b border-slate-100 pb-1">
            <CornerDownRight size={11} className="text-blue-500" />
            {cleanLine.replace("### ", "")}
          </h4>
        );
      }

      if (cleanLine.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-[12px] font-bold text-[#0F172A] mt-5 mb-2 tracking-tight">
            {cleanLine.replace("## ", "")}
          </h3>
        );
      }

      if (cleanLine.startsWith("* ") || cleanLine.startsWith("- ")) {
        const content = cleanLine.substring(2);
        return (
          <li key={idx} className="text-[11px] text-slate-600 leading-relaxed ml-2 list-none pl-3 relative pr-1 py-0.5 font-medium mb-1">
            <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500/80"></span>
            {parseBoldText(content)}
          </li>
        );
      }

      return (
        <p key={idx} className="text-[11px] text-slate-600 leading-relaxed mb-2 font-medium">
          {parseBoldText(cleanLine)}
        </p>
      );
    });
  };

  const parseBoldText = (content: string) => {
    const parts = content.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <strong key={index} className="font-extrabold text-slate-900 bg-slate-100/70 px-1 rounded">
            {part}
          </strong>
        );
      }
      return part;
    });
  };

  const getSeverityBadgeClass = (sev: SeverityType) => {
    switch (sev) {
      case "critical":
        return "bg-red-50 text-red-650 border-red-150";
      case "high":
        return "bg-orange-50 text-orange-550 border-orange-150";
      case "medium":
        return "bg-yellow-50 text-yellow-600 border-yellow-150";
      default:
        return "bg-slate-50 text-slate-550 border-slate-150";
    }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Tab Select Header Spacer */}
      <div className="bg-slate-50 border-b border-slate-200 p-2.5 flex items-center justify-between shrink-0 select-none">
        <div className="flex gap-1 bg-slate-205/60 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab("standard")}
            className={`cursor-pointer px-3 py-1 rounded-md text-[10.5px] font-bold transition-all duration-200 flex items-center gap-1.2 uppercase tracking-wide leading-none ${
              activeTab === "standard"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <BookOpen size={11.5} />
            <span>Standard Brief</span>
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`cursor-pointer px-3 py-1 rounded-md text-[10.5px] font-bold transition-all duration-200 flex items-center gap-1.2 uppercase tracking-wide leading-none ${
              activeTab === "ai"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-blue-600"
            }`}
          >
            <Sparkles size={11.5} className={activeTab === "ai" ? "animate-pulse" : ""} />
            <span>Gemini AI Intel</span>
          </button>
        </div>

        <div className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          LAST 24 HOURS
        </div>
      </div>

      {/* Main summary view content blocks */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-250">
        
        {events24h.length === 0 ? (
          <div className="py-16 text-center space-y-3 px-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 border border-emerald-150 flex items-center justify-center text-emerald-500 shadow-inner">
              <ShieldCheck size={20} className="animate-pulse" />
            </div>
            <p className="text-xs font-bold text-slate-800">Saskatoon Area Watch: Calm Period</p>
            <p className="text-[10.5px] text-slate-450 leading-relaxed max-w-xs mx-auto font-medium">
              No public safety incidents inside Saskatoon districts have been registered or crawled onto our feed indexes over the last 24 hours.
            </p>
          </div>
        ) : (
          <>
            {/* Quick dashboard metrics strip */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-50 border border-slate-150 rounded-lg p-2.5 text-center shadow-inner relative overflow-hidden">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">Total Alerts</span>
                <span className="block text-base font-extrabold text-slate-850 mt-0.5 font-mono">{stats.total}</span>
              </div>

              <div className="bg-red-50/40 border border-red-150 rounded-lg p-2.5 text-center shadow-inner">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-red-500">Critical</span>
                <span className="block text-base font-extrabold text-red-650 mt-0.5 font-mono">{stats.critical}</span>
              </div>

              <div className="bg-orange-50/40 border border-orange-150 rounded-lg p-2.5 text-center shadow-inner">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-orange-500">High Risk</span>
                <span className="block text-base font-extrabold text-orange-600 mt-0.5 font-mono">{stats.high}</span>
              </div>

              <div className="bg-yellow-50/40 border border-yellow-150 rounded-lg p-2.5 text-center shadow-inner">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-yellow-600">Minor/Mod</span>
                <span className="block text-base font-extrabold text-amber-600 mt-0.5 font-mono">
                  {stats.medium + stats.low}
                </span>
              </div>
            </div>

            {/* Segment 1: Standard rule-based generator layout */}
            {activeTab === "standard" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Dynamically formulated situation briefing overview paragraph */}
                <div className="p-3.5 bg-gradient-to-r from-blue-50/20 to-slate-50 border border-slate-200 rounded-xl space-y-1.5 shadow-sm text-[11px] text-slate-650 font-medium leading-relaxed">
                  <span className="font-extrabold text-slate-850 uppercase tracking-widest text-[9px] font-mono flex items-center gap-1">
                    <Activity size={10} className="text-blue-500 animate-pulse" /> Safety Situation Briefing
                  </span>
                  <p>
                    Over the past 24-hour cycle, Saskatoon incident watchers tracked a total of <strong className="text-slate-850 font-bold">{stats.total} activity alerts</strong>. 
                    {stats.critical > 0 || stats.high > 0 ? (
                      <span>
                        {" "}Our systems marked <strong className="text-red-650 font-bold">{stats.critical} critical</strong> and <strong className="text-orange-600 font-bold">{stats.high} high-level</strong> events requiring elevated area watch checks.
                      </span>
                    ) : (
                      " No critical or tactical level warnings were flagged, indicating standard provincial background watch levels."
                    )}
                    {" "}The primary incident classification type recorded during this frame was <strong className="text-blue-600 font-bold">{(stats.categories[0]?.[0] || "").replace(/_/g, " ")}</strong>.
                  </p>
                </div>

                {/* Categories composition chart visual tags */}
                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-mono font-extrabold text-slate-400 tracking-wider flex items-center gap-1">
                    <TrendingUp size={11} /> Incident Distribution Composition
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.categories.map(([category, count]) => {
                      const percentage = Math.round((count / stats.total) * 100);
                      return (
                        <div 
                          key={category} 
                          className="bg-slate-50 border border-slate-200 px-2 py-1 rounded text-[10px] font-mono font-semibold flex items-center gap-1.5 text-slate-600 shadow-sm"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                          <span className="capitalize">{category.replace(/_/g, " ")}</span>
                          <span className="text-slate-400">({count}) {percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Day chronology timeline of alerts */}
                <div className="space-y-3">
                  <span className="text-[9px] uppercase font-mono font-extrabold text-slate-400 tracking-wider flex items-center gap-1">
                    <Clock size={11} /> 24-Hour Chronological Timeline
                  </span>

                  <div className="space-y-3.5 border-l border-slate-100 ml-1.5 pl-3">
                    {/* Period 1: Overnight */}
                    {timesOfDay.overnight.length > 0 && (
                      <div className="relative">
                        <div className="absolute -left-[19px] top-0.5 p-0.5 bg-slate-900 border border-white text-slate-300 rounded-full">
                          <Moon size={9} />
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest font-mono block">
                          Overnight <span className="text-slate-450 font-normal lowercase">(12:00 AM - 6:00 AM)</span>
                        </span>
                        <div className="mt-1.5 space-y-1.5">
                          {timesOfDay.overnight.map((evt) => (
                            <div key={evt.id} className="text-[10.5px] flex items-start gap-1 font-medium leading-relaxed text-slate-600">
                              <span className="text-slate-400 shrink-0 font-bold">•</span>
                              <div>
                                <span className="text-slate-800 font-bold">{evt.title}</span>{" "}
                                <span className="text-slate-400">at {evt.locationText}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Period 2: Morning */}
                    {timesOfDay.morning.length > 0 && (
                      <div className="relative">
                        <div className="absolute -left-[19px] top-0.5 p-0.5 bg-amber-500 border border-white text-white rounded-full">
                          <Sunrise size={9} />
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest font-mono block">
                          Morning <span className="text-slate-450 font-normal lowercase">(6:00 AM - 12:00 PM)</span>
                        </span>
                        <div className="mt-1.5 space-y-1.5">
                          {timesOfDay.morning.map((evt) => (
                            <div key={evt.id} className="text-[10.5px] flex items-start gap-1 font-medium leading-relaxed text-slate-600">
                              <span className="text-slate-400 shrink-0 font-bold">•</span>
                              <div>
                                <span className="text-slate-800 font-bold">{evt.title}</span>{" "}
                                <span className="text-slate-400">at {evt.locationText}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Period 3: Afternoon */}
                    {timesOfDay.afternoon.length > 0 && (
                      <div className="relative">
                        <div className="absolute -left-[19px] top-0.5 p-0.5 bg-blue-500 border border-white text-white rounded-full">
                          <Sun size={9} />
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest font-mono block">
                          Afternoon <span className="text-slate-450 font-normal lowercase">(12:00 PM - 6:00 PM)</span>
                        </span>
                        <div className="mt-1.5 space-y-1.5">
                          {timesOfDay.afternoon.map((evt) => (
                            <div key={evt.id} className="text-[10.5px] flex items-start gap-1 font-medium leading-relaxed text-slate-600">
                              <span className="text-slate-400 shrink-0 font-bold">•</span>
                              <div>
                                <span className="text-slate-800 font-bold">{evt.title}</span>{" "}
                                <span className="text-slate-400">at {evt.locationText}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Period 4: Evening */}
                    {timesOfDay.evening.length > 0 && (
                      <div className="relative">
                        <div className="absolute -left-[19px] top-0.5 p-0.5 bg-indigo-600 border border-white text-white rounded-full">
                          <Sunset size={9} />
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest font-mono block">
                          Evening <span className="text-slate-450 font-normal lowercase">(6:00 PM - 12:00 AM)</span>
                        </span>
                        <div className="mt-1.5 space-y-1.5">
                          {timesOfDay.evening.map((evt) => (
                            <div key={evt.id} className="text-[10.5px] flex items-start gap-1 font-medium leading-relaxed text-slate-600">
                              <span className="text-slate-400 shrink-0 font-bold">•</span>
                              <div>
                                <span className="text-slate-800 font-bold">{evt.title}</span>{" "}
                                <span className="text-slate-400">at {evt.locationText}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Segment 2: Express endpoint proxy-based Gemini AI Summary rendering */}
            {activeTab === "ai" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {isLoadingAi ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="relative flex justify-center">
                      <div className="h-8 w-8 rounded-full border-2 border-slate-100 border-t-blue-600 animate-spin"></div>
                      <Sparkles size={14} className="text-blue-500 absolute top-2 animate-bounce" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Synthesizing Safety Reports...</p>
                    <div className="text-[9.5px] font-mono text-slate-400 flex flex-col gap-1 uppercase tracking-wider">
                      <span>• parsing community watch logs</span>
                      <span className="animate-pulse">• grouping safety clusters</span>
                      <span>• compiling tactical briefs</span>
                    </div>
                  </div>
                ) : aiError ? (
                  <div className="p-3.5 bg-red-50 border border-red-150 rounded-xl space-y-2 text-center shadow-inner">
                    <AlertTriangle size={18} className="mx-auto text-red-500 animate-bounce" />
                    <p className="text-xs font-bold text-slate-800">Safety Brief Failure</p>
                    <p className="text-[10px] leading-relaxed text-slate-550 font-medium">{aiError}</p>
                    <button
                      onClick={() => fetchAiSummary(true)}
                      className="cursor-pointer bg-red-650 hover:bg-red-700 text-white font-bold tracking-wide uppercase text-[9px] font-mono px-3 py-1.5 rounded transition mt-2"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Active dynamic AI summary container */}
                    <div id="ai-safety-intel-container" className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 border-b border-slate-205 pb-2 mb-3 shrink-0">
                        <Sparkles size={11.5} className="text-blue-600 animate-pulse" />
                        <span className="text-[10px] uppercase font-extrabold tracking-widest font-mono text-slate-800">
                          Gemini Intelligence Dispatch
                        </span>
                      </div>

                      <div className="space-y-2 prose prose-slate">
                        {formatMarkdownText(aiSummary)}
                      </div>
                    </div>

                    {/* Manual Refresh Button */}
                    <div className="flex justify-end pr-1">
                      <button
                        onClick={() => fetchAiSummary(true)}
                        className="cursor-pointer border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 font-bold tracking-wide uppercase text-[9px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <RefreshCw size={10} />
                        <span>Update Gemini Dispatch</span>
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
