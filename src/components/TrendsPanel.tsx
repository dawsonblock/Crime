import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import Markdown from "react-markdown";
import {
  TrendingUp, TrendingDown, Calendar, AlertTriangle, AlertCircle,
  Clock, Activity, Info, BarChart3, CornerDownRight, Zap,
  Smile, Frown, ShieldCheck, HeartHandshake
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LineChart, Line,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";

const COLORS = ["#2563EB", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#64748B"];
const TYPE_COLORS = ["#3B82F6", "#EC4899", "#8B5CF6", "#10B981", "#F59E0B", "#64748B"];
import { EventItem, SeverityType } from "../types";

interface TrendsPanelProps {
  events: EventItem[];
}

interface DailyCount {
  dateStr: string;   // MM/DD
  fullDate: string;  // MMM DD, YYYY
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  criticalHigh: number;
  mediumLow: number;
}

export default function TrendsPanel({ events }: TrendsPanelProps) {
  const [metricType, setMetricType] = useState<"all" | "severity">("all");
  const [showForecast, setShowForecast] = useState<boolean>(false);
  const [forecastText, setForecastText] = useState<string>("");
  const [loadingForecast, setLoadingForecast] = useState<boolean>(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const fetchForecast = async () => {
    if (forecastText) return; // Do not fetch again if already loaded
    setLoadingForecast(true);
    setForecastError(null);
    try {
      const res = await fetch("/api/events/forecast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        throw new Error("HTTP error " + res.status);
      }
      const data = await res.json();
      setForecastText(data.forecast || "No forecast received.");
    } catch (err: any) {
      console.error("Error fetching safety forecast:", err);
      setForecastError("Could not retrieve AI safety forecast. Please try again.");
    } finally {
      setLoadingForecast(false);
    }
  };

  const handleToggleForecast = () => {
    const nextVal = !showForecast;
    setShowForecast(nextVal);
    if (nextVal) {
      fetchForecast();
    }
  };

  // Calculate 30-day daily incident trend stats
  const trendData = useMemo(() => {
    const data: DailyCount[] = [];
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    // We base the "now" date on the current time (June 7, 2026) but falling back to system time
    const now = new Date();
    
    // Construct the sequence of the last 30 days
    for (let i = 29; i >= 0; i--) {
      const targetDate = new Date(now.getTime() - i * oneDayMs);
      const year = targetDate.getFullYear();
      const monthStr = String(targetDate.getMonth() + 1).padStart(2, "0");
      const dayStr = String(targetDate.getDate()).padStart(2, "0");
      const dateKey = `${year}-${monthStr}-${dayStr}`;

      // Format displays
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const displayDate = `${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}`;
      const fullDisplayDate = `${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}, ${year}`;

      // Filter events published on this particular calendar day
      const dayEvents = events.filter((evt) => {
        try {
          const pubDate = new Date(evt.publishedAt);
          const pYear = pubDate.getFullYear();
          const pMonthStr = String(pubDate.getMonth() + 1).padStart(2, "0");
          const pDayStr = String(pubDate.getDate()).padStart(2, "0");
          return `${pYear}-${pMonthStr}-${pDayStr}` === dateKey;
        } catch {
          return false;
        }
      });

      const critical = dayEvents.filter((e) => e.severity === "critical").length;
      const high = dayEvents.filter((e) => e.severity === "high").length;
      const medium = dayEvents.filter((e) => e.severity === "medium").length;
      const low = dayEvents.filter((e) => e.severity === "low").length;
      const criticalHigh = critical + high;

      data.push({
        dateStr: displayDate,
        fullDate: fullDisplayDate,
        total: dayEvents.length,
        critical,
        high,
        medium,
        low,
        criticalHigh,
        mediumLow: dayEvents.length - criticalHigh,
      });
    }

    return data;
  }, [events]);

  // Aggregate stats derived from the 30-day series
  const stats = useMemo(() => {
    let grandTotal = 0;
    let maxIncidents = 0;
    let peakDay: DailyCount | null = null;
    let criticalHighTotal = 0;

    // Split series in half to estimate trajectory (First 15 days vs Second 15 days)
    let firstHalfSum = 0;
    let secondHalfSum = 0;

    trendData.forEach((day, idx) => {
      grandTotal += day.total;
      criticalHighTotal += day.criticalHigh;
      
      if (day.total > maxIncidents) {
        maxIncidents = day.total;
        peakDay = day;
      }

      if (idx < 15) {
        firstHalfSum += day.total;
      } else {
        secondHalfSum += day.total;
      }
    });

    const dailyAverage = Number((grandTotal / 30).toFixed(1));
    
    // Percent change computation
    let velocityPercent = 0;
    let direction: "up" | "down" | "flat" = "flat";
    
    if (firstHalfSum > 0) {
      velocityPercent = Math.round(((secondHalfSum - firstHalfSum) / firstHalfSum) * 100);
      direction = velocityPercent > 0 ? "up" : velocityPercent < 0 ? "down" : "flat";
    } else if (secondHalfSum > 0) {
      velocityPercent = 100;
      direction = "up";
    }

    return {
      grandTotal,
      dailyAverage,
      peakDay,
      criticalHighTotal,
      velocityPercent: Math.abs(velocityPercent),
      direction,
      firstHalfSum,
      secondHalfSum,
    };
  }, [trendData]);

  // Month-over-Month calculation using calendar dates with dynamic rolling fallback
  const momStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (e.g. 5 is June)

    // Calendar month-based comparison:
    const thisMonthEvents = events.filter(evt => {
      try {
        const pubDate = new Date(evt.publishedAt);
        return pubDate.getFullYear() === currentYear && pubDate.getMonth() === currentMonth;
      } catch {
        return false;
      }
    });

    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    const prevMonthEvents = events.filter(evt => {
      try {
        const pubDate = new Date(evt.publishedAt);
        return pubDate.getFullYear() === prevYear && pubDate.getMonth() === prevMonth;
      } catch {
        return false;
      }
    });

    // Also support rolling 30-day window comparison in case of concentrated data
    const rolling30Ms = 30 * 24 * 60 * 60 * 1000;
    const rolling60Ms = 60 * 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();

    const rollingThisMonthEvents = events.filter(evt => {
      try {
        const pubMs = new Date(evt.publishedAt).getTime();
        return pubMs >= (nowMs - rolling30Ms) && pubMs <= nowMs;
      } catch {
        return false;
      }
    });

    const rollingPrevMonthEvents = events.filter(evt => {
      try {
        const pubMs = new Date(evt.publishedAt).getTime();
        return pubMs >= (nowMs - rolling60Ms) && pubMs < (nowMs - rolling30Ms);
      } catch {
        return false;
      }
    });

    // Use calendar months if either has some events, otherwise fallback to rolling 30-day chunks
    const useCalendar = prevMonthEvents.length > 0 || thisMonthEvents.length > 0;

    const currentCount = useCalendar ? thisMonthEvents.length : rollingThisMonthEvents.length;
    const previousCount = useCalendar ? prevMonthEvents.length : rollingPrevMonthEvents.length;
    
    const labelCurrent = useCalendar 
      ? now.toLocaleString("default", { month: "short" }) 
      : "Last 30D";
    const labelPrevious = useCalendar 
      ? prevMonthDate.toLocaleString("default", { month: "short" }) 
      : "Prior 30D";

    let pctChange = 0;
    if (previousCount > 0) {
      pctChange = Math.round(((currentCount - previousCount) / previousCount) * 100);
    } else if (currentCount > 0) {
      pctChange = 100;
    }

    const isImproving = pctChange < 0;
    const isDeclining = pctChange > 0;
    const isFlat = pctChange === 0;

    return {
      currentCount,
      previousCount,
      labelCurrent,
      labelPrevious,
      pctChange: Math.abs(pctChange),
      isImproving,
      isDeclining,
      isFlat,
      useCalendar
    };
  }, [events]);

  // Calculate distribution of incident categories for a Donut Chart
  const categoryData = useMemo(() => {
    const rawCounts: Record<string, number> = {};
    
    events.forEach(evt => {
      let cat = evt.eventType || "other";
      // Normalize category labels to more human-readable text
      let label = cat.replace(/_/g, " ");
      // Proper casing
      label = label.charAt(0).toUpperCase() + label.slice(1);
      
      // Group similar ones to standardized, well-defined categories:
      const lower = label.toLowerCase();
      if (lower.includes("traffic") || lower.includes("collision") || lower.includes("accident") || lower.includes("vehicle")) {
        label = "Traffic & Collision";
      } else if (lower.includes("disturbance") || lower.includes("noise") || lower.includes("mischief") || lower.includes("vandalism") || lower.includes("nuisance")) {
        label = "Public Disturbance";
      } else if (lower.includes("medical") || lower.includes("overdose") || lower.includes("health") || lower.includes("ambulance")) {
        label = "Medical Emergency";
      } else if (lower.includes("fire") || lower.includes("arson")) {
        label = "Fire Alert";
      } else if (lower.includes("assault") || lower.includes("weapon") || lower.includes("shooting") || lower.includes("stab") || lower.includes("robbery") || lower.includes("theft") || lower.includes("break") || lower.includes("crime") || lower.includes("wanted")) {
        label = "Criminal Activity";
      } else if (lower.includes("suspicious")) {
        label = "Suspicious Activity";
      } else if (lower.includes("search") || lower.includes("rescue") || lower.includes("missing")) {
        label = "Search & Rescue";
      } else {
        label = "Other Incidents";
      }

      rawCounts[label] = (rawCounts[label] || 0) + 1;
    });

    const list = Object.entries(rawCounts).map(([name, value]) => ({
      name,
      value
    }));

    // Sort descending by count
    list.sort((a, b) => b.value - a.value);

    // Limit to top 5 and group others to prevent crowded labels
    if (list.length > 5) {
      const top = list.slice(0, 4);
      const othersValue = list.slice(4).reduce((sum, item) => sum + item.value, 0);
      if (othersValue > 0) {
        top.push({ name: "Other Categories", value: othersValue });
      }
      return top;
    }

    return list;
  }, [events]);

  const totalCategoryIncidents = useMemo(() => {
    return categoryData.reduce((sum, item) => sum + item.value, 0);
  }, [categoryData]);

  // Calculate detailed distribution of incidents by type for the new Donut Chart
  const eventTypeData = useMemo(() => {
    const rawCounts: Record<string, number> = {};
    
    events.forEach(evt => {
      let type = evt.eventType || "other_public_safety";
      // Normalize type labels: replace underscores/dashes with space & apply capital case
      let label = type.replace(/_/g, " ").replace(/-/g, " ");
      label = label.split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      rawCounts[label] = (rawCounts[label] || 0) + 1;
    });

    const list = Object.entries(rawCounts).map(([name, value]) => ({
      name,
      value
    }));

    // Sort descending by incident count
    list.sort((a, b) => b.value - a.value);

    // Limit to top 5 and group the remaining ones to keep the chart clean and legible
    if (list.length > 5) {
      const top = list.slice(0, 4);
      const othersValue = list.slice(4).reduce((sum, item) => sum + item.value, 0);
      if (othersValue > 0) {
        top.push({ name: "Other Types", value: othersValue });
      }
      return top;
    }

    return list;
  }, [events]);

  const totalEventTypeIncidents = useMemo(() => {
    return eventTypeData.reduce((sum, item) => sum + item.value, 0);
  }, [eventTypeData]);

  // Rule-based sentiment analysis over 30 days based on keyword profiles and severity weights
  const sentimentData = useMemo(() => {
    const data: any[] = [];
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = new Date();

    const positiveWords = [
      "resolve", "arrest", "custody", "recover", "safe", "found", "secure", 
      "clear", "stable", "returned", "cooperat", "control", "assist", "peace", 
      "decrease", "decline", "quiet", "minor"
    ];
    const negativeWords = [
      "weapon", "shoot", "stab", "assault", "robber", "armed", "threat", "fight", 
      "critical", "violence", "death", "kill", "homicide", "fatal", "drugs", 
      "abduct", "fire", "arson", "clash", "flee", "stolen", "danger", "hazard", 
      "emergency", "crash", "collision", "overdose"
    ];

    for (let i = 29; i >= 0; i--) {
      const targetDate = new Date(now.getTime() - i * oneDayMs);
      const year = targetDate.getFullYear();
      const monthStr = String(targetDate.getMonth() + 1).padStart(2, "0");
      const dayStr = String(targetDate.getDate()).padStart(2, "0");
      const dateKey = `${year}-${monthStr}-${dayStr}`;

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const displayDate = `${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}`;
      const fullDisplayDate = `${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}, ${year}`;

      const dayEvents = events.filter((evt) => {
        try {
          const pubDate = new Date(evt.publishedAt);
          const pYear = pubDate.getFullYear();
          const pMonthStr = String(pubDate.getMonth() + 1).padStart(2, "0");
          const pDayStr = String(pubDate.getDate()).padStart(2, "0");
          return `${pYear}-${pMonthStr}-${pDayStr}` === dateKey;
        } catch {
          return false;
        }
      });

      let dayBaseScore = 100;

      dayEvents.forEach(evt => {
        let incidentImpact = -5; // Base deduction per incident
        
        if (evt.severity === "critical") incidentImpact = -22;
        else if (evt.severity === "high") incidentImpact = -14;
        else if (evt.severity === "medium") incidentImpact = -8;
        else if (evt.severity === "low") incidentImpact = -3;

        const textToAnalyze = `${evt.title || ""} ${evt.summary || ""}`.toLowerCase();
        
        let positiveMatchCount = 0;
        let negativeMatchCount = 0;

        positiveWords.forEach(w => {
          if (textToAnalyze.includes(w)) positiveMatchCount++;
        });
        negativeWords.forEach(w => {
          if (textToAnalyze.includes(w)) negativeMatchCount++;
        });

        // Add resolution buffers or deepen concern based on keywords
        incidentImpact += (positiveMatchCount * 3.5);
        incidentImpact -= (negativeMatchCount * 4.5);

        dayBaseScore += incidentImpact;
      });

      // Clamp score bounds elegantly
      const finalScore = Math.max(12, Math.min(100, Math.round(dayBaseScore)));

      let label = "Excellent";
      let color = "#10B981"; // Emerald
      if (finalScore >= 88) {
        label = "Optimum Stability";
        color = "#10B981";
      } else if (finalScore >= 75) {
        label = "Stable State";
        color = "#34D399";
      } else if (finalScore >= 55) {
        label = "Moderate Risk";
        color = "#F59E0B"; // Amber
      } else if (finalScore >= 35) {
        label = "Concerning Trends";
        color = "#F97316"; // Orange
      } else {
        label = "Critical Hazard Level";
        color = "#EF4444"; // Red
      }

      data.push({
        dateStr: displayDate,
        fullDate: fullDisplayDate,
        score: finalScore,
        count: dayEvents.length,
        label,
        color
      });
    }

    return data;
  }, [events]);

  const sentimentStats = useMemo(() => {
    if (sentimentData.length === 0) return { avgScore: 100, trendLabel: "Stable State", isImproving: true, diff: 0 };
    
    const totalScore = sentimentData.reduce((sum, item) => sum + item.score, 0);
    const avgScore = Math.round(totalScore / sentimentData.length);

    const firstHalfAvg = sentimentData.slice(0, 15).reduce((sum, item) => sum + item.score, 0) / 15;
    const secondHalfAvg = sentimentData.slice(15).reduce((sum, item) => sum + item.score, 0) / 15;

    const diff = secondHalfAvg - firstHalfAvg;
    let trendLabel = "Stable State";
    let isImproving = true;

    if (diff > 1.5) {
      trendLabel = "Improving Community Safety Sentiment";
      isImproving = true;
    } else if (diff < -1.5) {
      trendLabel = "Declining Community Safety Sentiment";
      isImproving = false;
    } else {
      trendLabel = "Holding Steady";
      isImproving = secondHalfAvg >= firstHalfAvg;
    }

    return {
      avgScore,
      firstHalfAvg: Math.round(firstHalfAvg),
      secondHalfAvg: Math.round(secondHalfAvg),
      diff: Math.round(diff * 10) / 10,
      trendLabel,
      isImproving
    };
  }, [sentimentData]);

  const timeToResolveData = useMemo(() => {
    const typeDeltas: Record<string, number[]> = {};

    events.forEach(evt => {
      let initialTime = new Date(evt.publishedAt).getTime();
      let resolvedTime: number | null = null;
      const isResolved = (text: string) => /resolv|clos|clear/i.test(text);

      if (evt.linkedEvents && evt.linkedEvents.length > 0) {
        evt.linkedEvents.forEach(link => {
          const t = new Date(link.publishedAt).getTime();
          if (t < initialTime) initialTime = t;
          if (isResolved(link.title) || isResolved(link.summary)) {
            if (!resolvedTime || t > resolvedTime) resolvedTime = t;
          }
        });
      }

      if (resolvedTime !== null && resolvedTime > initialTime) {
        const deltaHours = (resolvedTime - initialTime) / (1000 * 60 * 60);
        const typeStr = evt.eventType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        if (!typeDeltas[typeStr]) typeDeltas[typeStr] = [];
        typeDeltas[typeStr].push(deltaHours);
      }
    });

    return Object.entries(typeDeltas).map(([name, hoursArr]) => {
      const avgHours = hoursArr.reduce((a, b) => a + b, 0) / hoursArr.length;
      return {
        name,
        avgHours: parseFloat(avgHours.toFixed(1))
      };
    }).sort((a, b) => b.avgHours - a.avgHours);
  }, [events]);

  const SentimentTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg shadow-xl text-white font-sans text-xs select-none">
          <p className="font-bold text-slate-300 border-b border-slate-800 pb-1.5 mb-1.5 flex items-center gap-1">
            <Calendar size={11} className="text-pink-400" /> {data.fullDate}
          </p>
          <div className="space-y-1.5 font-medium text-[11px]">
            <div className="flex justify-between gap-6">
              <span className="text-slate-400">Safety Index:</span>
              <strong className="font-mono font-black animate-pulse" style={{ color: data.color }}>
                {data.score} / 100
              </strong>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-slate-400">Status Vector:</span>
              <span className="font-black uppercase px-1.5 py-0.5 rounded border text-[8.5px] leading-tight" style={{ borderColor: `${data.color}40`, backgroundColor: `${data.color}15`, color: data.color }}>
                {data.label}
              </span>
            </div>
            <div className="flex justify-between gap-6 border-t border-slate-800 pt-1.5 mt-1">
              <span className="text-slate-500">Day's Volume:</span>
              <strong className="font-mono text-slate-300">{data.count} event(s)</strong>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg shadow-xl text-white font-sans text-xs select-none">
          <p className="font-bold flex items-center gap-1.5 capitalize text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: payload[0].payload.fill || '#2563EB' }}></span>
            {data.name}
          </p>
          <p className="font-mono mt-1 text-[11px] text-slate-400">
            Incidents: <strong className="font-extrabold text-white">{data.value}</strong>
          </p>
        </div>
      );
    }
    return null;
  };

  // Rendering a custom Recharts tooltip for a highly polished feel
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: DailyCount = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-850 p-2.5 rounded-lg shadow-xl text-white font-sans text-xs select-none">
          <p className="font-bold text-slate-300 border-b border-slate-800 pb-1.5 mb-1.5 flex items-center gap-1">
            <Calendar size={11} className="text-blue-400" /> {data.fullDate}
          </p>
          <div className="space-y-1 font-medium text-[11px]">
            <div className="flex justify-between gap-6">
              <span className="text-slate-300 flex items-center gap-1">
                <span className="h-1.5 w-1.5 bg-blue-500 rounded-full"></span> Total Volume:
              </span>
              <strong className="font-mono text-white">{data.total}</strong>
            </div>
            
            <div className="border-t border-slate-800 my-1 pt-1 space-y-1">
              <div className="flex justify-between gap-6">
                <span className="text-red-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-[#EF4444] rounded-full"></span> Critical:
                </span>
                <strong className="font-mono text-red-400">{data.critical}</strong>
              </div>

              <div className="flex justify-between gap-6">
                <span className="text-orange-405 flex items-center gap-1 font-medium">
                  <span className="h-1.5 w-1.5 bg-[#F97316] rounded-full"></span> High:
                </span>
                <strong className="font-mono text-orange-400">{data.high}</strong>
              </div>

              <div className="flex justify-between gap-6">
                <span className="text-amber-405 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-[#F59E0B] rounded-full"></span> Medium:
                </span>
                <strong className="font-mono text-amber-400">{data.medium}</strong>
              </div>

              <div className="flex justify-between gap-6">
                <span className="text-emerald-405 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-[#10B981] rounded-full"></span> Low:
                </span>
                <strong className="font-mono text-emerald-400">{data.low}</strong>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      
      {/* Header Selector bar */}
      <div className="bg-slate-50 border-b border-slate-200 p-2.5 flex items-center justify-between shrink-0 select-none">
        <div className="flex gap-1 bg-slate-205/60 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setMetricType("all")}
            className={`cursor-pointer px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-200 flex items-center gap-1 uppercase tracking-wide leading-none ${
              metricType === "all"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>Total Volume</span>
          </button>
          <button
            onClick={() => setMetricType("severity")}
            className={`cursor-pointer px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-200 flex items-center gap-1 uppercase tracking-wide leading-none ${
              metricType === "severity"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Activity size={10} className="text-red-400" />
            <span>By Severity</span>
          </button>
        </div>

        <div className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          LAST 30 DAYS
        </div>
      </div>

      {/* Main Trends scroll area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-250">
        
        {/* Gemini AI Predictive Forecast Toggle Banner */}
        <div id="ai-predictive-forecast" className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 select-none">
          <div className="space-y-1">
            <h4 className="text-xs font-black text-violet-950 flex items-center gap-1.5 uppercase tracking-wider">
              <Zap size={13} className="text-violet-600 animate-pulse fill-violet-200" />
              Proactive AI Safety Forecast
            </h4>
            <p className="text-[10.5px] text-slate-655 leading-relaxed max-w-md font-medium">
              Uses the Gemini API to analyze current incident trends and suggest potential high-risk times for the upcoming week based on historical data.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-slate-500">
              {showForecast ? "ACTIVE" : "STANDBY"}
            </span>
            <button
              type="button"
              onClick={handleToggleForecast}
              aria-label="Toggle Safety Forecast"
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showForecast ? "bg-violet-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  showForecast ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {showForecast ? (
          <div id="safety-forecast-response" className="bg-white border border-violet-105 rounded-xl p-5 shadow-sm space-y-4">
            {loadingForecast ? (
              <div className="space-y-4 py-8 text-center select-none animate-pulse">
                <div className="h-10 w-10 bg-violet-100 rounded-full flex items-center justify-center mx-auto text-violet-600 animate-bounce">
                  <Zap size={18} />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                    Consulting Gemini Safety Engine...
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono tracking-normal leading-relaxed">
                    Analyzing day-of-week trends, cluster coordinates, and hazard densities
                  </p>
                </div>
                <div className="max-w-xs mx-auto space-y-2 pt-2">
                  <div className="h-2.5 bg-slate-100 rounded-full w-4/5 mx-auto"></div>
                  <div className="h-2 bg-slate-100 rounded-full w-full mx-auto"></div>
                  <div className="h-2 bg-slate-100 rounded-full w-2/3 mx-auto"></div>
                </div>
              </div>
            ) : forecastError ? (
              <div className="text-center py-6 space-y-3">
                <AlertCircle size={24} className="text-red-500 mx-auto" />
                <p className="text-xs font-bold text-slate-700">{forecastError}</p>
                <button
                  type="button"
                  onClick={fetchForecast}
                  className="py-1.5 px-3 bg-violet-50 hover:bg-violet-100 text-violet-700 font-mono text-[10px] font-bold border border-violet-200 rounded-lg cursor-pointer transition-colors uppercase tracking-wider"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="text-slate-700 text-xs font-medium font-sans leading-relaxed select-text">
                <div className="markdown-body prose max-w-none text-slate-700 leading-relaxed text-xs">
                  <Markdown>{forecastText}</Markdown>
                </div>
                
                {/* Visual warning disclaimer element */}
                <div className="bg-slate-50 border border-slate-200 mt-5 p-3.5 rounded-xl flex items-start gap-2.5 select-none text-[10.5px]">
                  <span className="p-1 rounded-lg bg-amber-100 text-amber-600 shrink-0 h-fit">
                    <Info size={11} />
                  </span>
                  <div>
                    <h5 className="font-extrabold text-slate-800 leading-none">Safety Forecast Disclaimer</h5>
                    <p className="text-[10px] text-slate-500 leading-normal mt-1">
                      This forecast uses localized historical community patterns and alert distributions to synthesize safety advisories in Saskatoon. Precaution is always advised regardless of risk trends.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Metric widgets block */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              
              <div className="bg-slate-50 border border-slate-150 rounded-lg p-2 text-center shadow-inner flex flex-col justify-between">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">30D Incidents</span>
                <span className="block text-sm font-extrabold text-slate-800 mt-0.5 font-mono">{stats.grandTotal}</span>
                <span className="block text-[8px] text-slate-405 font-medium mt-0.5">cumulative count</span>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-lg p-2 text-center shadow-inner flex flex-col justify-between">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">Daily Average</span>
                <span className="block text-sm font-extrabold text-blue-600 mt-0.5 font-mono">{stats.dailyAverage}</span>
                <span className="block text-[8px] text-slate-405 font-medium mt-0.5">incidents / day</span>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-lg p-2 text-center shadow-inner flex flex-col justify-between">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">Trajectory</span>
                <div>
                  {stats.direction === "up" ? (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5 text-red-500 font-mono font-extrabold text-xs">
                      <TrendingUp size={12} className="shrink-0" />
                      <span>+{stats.velocityPercent}%</span>
                    </div>
                  ) : stats.direction === "down" ? (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5 text-emerald-600 font-mono font-extrabold text-xs">
                      <TrendingDown size={12} className="shrink-0" />
                      <span>-{stats.velocityPercent}%</span>
                    </div>
                  ) : (
                    <span className="block text-xs font-extrabold text-slate-500 mt-0.5 font-mono">STABLE</span>
                  )}
                </div>
                <span className="block text-[8px] text-slate-405 font-medium mt-0.5">vs prior 15 days</span>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-lg p-2 text-center shadow-inner flex flex-col justify-between" id="mom-analytics-card">
                <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">Month over Month</span>
                <div className="my-0.5 flex flex-col items-center justify-center">
                  {momStats.isImproving ? (
                    <div className="flex items-center justify-center gap-0.5 text-emerald-600 font-mono font-extrabold text-xs">
                      <TrendingDown size={12} className="shrink-0 text-emerald-600" />
                      <span>-{momStats.pctChange}% MoM</span>
                    </div>
                  ) : momStats.isDeclining ? (
                    <div className="flex items-center justify-center gap-0.5 text-red-500 font-mono font-extrabold text-xs">
                      <TrendingUp size={12} className="shrink-0 text-red-500" />
                      <span>+{momStats.pctChange}% MoM</span>
                    </div>
                  ) : (
                    <div className="text-slate-500 font-mono font-extrabold text-xs uppercase">
                      Unchanged
                    </div>
                  )}
                  <span className="text-[8px] font-extrabold text-slate-500 uppercase font-mono mt-0.5 tracking-wide">
                    {momStats.isImproving ? "✅ Improving" : momStats.isDeclining ? "⚠️ Declining" : "Holding Flat"}
                  </span>
                </div>
                <span className="block text-[8px] text-slate-405 font-medium leading-none">
                  {momStats.labelCurrent} ({momStats.currentCount}) vs {momStats.labelPrevious} ({momStats.previousCount})
                </span>
              </div>

            </div>

            {/* The Recharts Line Chart Visualization */}
            <div id="recharts-trend-container" className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-slate-500 flex items-center gap-1">
                  <BarChart3 size={11} /> Incident Trend Trajectory
                </span>
                <span className="text-[9px] font-mono text-slate-400 font-medium select-none">
                  Double Click to reset zoom
                </span>
              </div>

              <div className="w-full h-[210px] text-[10px] font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  {metricType === "all" ? (
                    <AreaChart
                      data={trendData}
                      margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis 
                        dataKey="dateStr" 
                        tickLine={false} 
                        axisLine={{ stroke: "#CBD5E1" }} 
                        stroke="#64748B" 
                        dy={6}
                        minTickGap={15}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        stroke="#64748B" 
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="total" 
                        stroke="#2563EB" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#colorTotal)" 
                        activeDot={{ r: 5, strokeWidth: 0, fill: "#2563EB" }}
                      />
                    </AreaChart>
                  ) : (
                    <LineChart
                      data={trendData}
                      margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis 
                        dataKey="dateStr" 
                        tickLine={false} 
                        axisLine={{ stroke: "#CBD5E1" }} 
                        stroke="#64748B" 
                        dy={6}
                        minTickGap={15}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        stroke="#64748B" 
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        verticalAlign="top" 
                        height={36} 
                        iconType="circle"
                        iconSize={6}
                        wrapperStyle={{ fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase" }}
                      />
                      <Line 
                        type="monotone" 
                        name="Critical"
                        dataKey="critical" 
                        stroke="#EF4444" 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line 
                        type="monotone" 
                        name="High"
                        dataKey="high" 
                        stroke="#F97316" 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line 
                        type="monotone" 
                        name="Medium"
                        dataKey="medium" 
                        stroke="#F59E0B" 
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line 
                        type="monotone" 
                        name="Low"
                        dataKey="low" 
                        stroke="#10B981" 
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Breakdown Donut Chart */}
            <div id="recharts-pie-container" className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-inner">
              <div className="flex items-center justify-between mb-3 border-b border-slate-200/60 pb-2 select-none">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-500 flex items-center gap-1">
                  <Activity size={12} className="text-blue-500" /> Incident Distribution by Category
                </span>
                <span className="text-[8.5px] font-mono text-slate-400 font-bold uppercase">
                  All Sources
                </span>
              </div>

              {categoryData.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold select-none bg-white rounded-lg border border-slate-150 p-4">
                  <AlertCircle size={20} className="mx-auto text-slate-300 mb-1.5" />
                  No category data available under this filter state
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  
                  {/* Donut Chart Visual Stage */}
                  <div className="sm:col-span-5 h-[160px] flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={68}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {categoryData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    
                    {/* Visual center label inside the donut gap */}
                    <div className="absolute flex flex-col items-center justify-center text-center select-none pointer-events-none">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider leading-none">Total</span>
                      <span className="text-base font-black text-slate-800 font-mono leading-none mt-1">{totalCategoryIncidents}</span>
                    </div>
                  </div>

                  {/* Dynamic Ledger checklist legend list */}
                  <div className="sm:col-span-7 space-y-1.5 select-none">
                    {categoryData.map((item, idx) => {
                      const pct = totalCategoryIncidents > 0 
                        ? Math.round((item.value / totalCategoryIncidents) * 100) 
                        : 0;
                      const color = COLORS[idx % COLORS.length];

                      return (
                        <div 
                          key={item.name} 
                          className="flex items-center justify-between text-[11px] p-2 rounded-lg border border-slate-200/40 bg-white shadow-sm hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span 
                              className="h-2 w-2 rounded-full shrink-0" 
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-extrabold text-slate-700 truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[10px] shrink-0 pl-1">
                            <span className="font-black text-slate-800">{item.value}</span>
                            <span className="text-slate-300">|</span>
                            <span className="font-bold text-blue-600">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}
            </div>

            {/* Incident Type Breakdown Donut Chart */}
            <div id="recharts-type-pie-container" className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-inner">
              <div className="flex items-center justify-between mb-3 border-b border-slate-200/60 pb-2 select-none">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-500 flex items-center gap-1">
                  <Activity size={12} className="text-indigo-505 shrink-0" /> Incident Distribution by Raw Type
                </span>
                <span className="text-[8.5px] font-mono text-slate-400 font-bold uppercase">
                  Granular Classifications
                </span>
              </div>

              {eventTypeData.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold select-none bg-white rounded-lg border border-slate-150 p-4">
                  <AlertCircle size={20} className="mx-auto text-slate-300 mb-1.5" />
                  No specific type data available under current filters
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  
                  {/* Donut Chart Visual Stage */}
                  <div className="sm:col-span-5 h-[160px] flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={eventTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={68}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {eventTypeData.map((entry, idx) => (
                            <Cell key={`type-cell-${idx}`} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    
                    {/* Visual center label inside the donut gap */}
                    <div className="absolute flex flex-col items-center justify-center text-center select-none pointer-events-none">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider leading-none">Types</span>
                      <span className="text-base font-black text-slate-800 font-mono leading-none mt-1">{totalEventTypeIncidents}</span>
                    </div>
                  </div>

                  {/* Dynamic Ledger checklist legend list */}
                  <div className="sm:col-span-7 space-y-1.5 select-none">
                    {eventTypeData.map((item, idx) => {
                      const pct = totalEventTypeIncidents > 0 
                        ? Math.round((item.value / totalEventTypeIncidents) * 100) 
                        : 0;
                      const color = TYPE_COLORS[idx % TYPE_COLORS.length];

                      return (
                        <div 
                          key={item.name} 
                          id={`type-legend-row-${item.name.toLowerCase().replace(/ /g, "-")}`}
                          className="flex items-center justify-between text-[11px] p-2 rounded-lg border border-slate-200/40 bg-white shadow-sm hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span 
                              className="h-2 w-2 rounded-full shrink-0" 
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-extrabold text-slate-700 truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[10px] shrink-0 pl-1">
                            <span className="font-black text-slate-800">{item.value}</span>
                            <span className="text-slate-350">|</span>
                            <span className="font-bold text-indigo-600">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}
            </div>

            {/* Daily Community Safety Sentiment Trajectory */}
            <div id="recharts-sentiment-container" className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-inner">
              <div className="flex items-center justify-between mb-3 border-b border-slate-200/60 pb-2 select-none">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-500 flex items-center gap-1">
                  <HeartHandshake size={12} className="text-pink-500 shrink-0" /> Community Safety Sentiment Trajectory
                </span>
                <span className="text-[8.5px] font-mono text-slate-400 font-bold uppercase">
                  Lexical Intent Score
                </span>
              </div>

              {sentimentData.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold select-none bg-white rounded-lg border border-slate-150 p-4">
                  <AlertCircle size={20} className="mx-auto text-slate-300 mb-1.5" />
                  No text sentiment parameters available for current filter set
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* Aggregated Sentiment Overview Widgets */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 select-none">
                    
                    <div className="bg-white border border-slate-200/60 rounded-lg p-2.5 shadow-sm text-center flex flex-col justify-center">
                      <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">Average Safety Index</span>
                      <div className="flex items-center justify-center gap-1.5 mt-1">
                        {sentimentStats.avgScore >= 75 ? (
                          <Smile size={14} className="text-emerald-505 shrink-0" />
                        ) : (
                          <Frown size={14} className="text-amber-505 shrink-0" />
                        )}
                        <span className="text-sm font-black text-slate-800 font-mono leading-none border-b border-dashed border-slate-245/80">
                          {sentimentStats.avgScore} <span className="text-[9px] text-slate-400 font-normal">/100</span>
                        </span>
                      </div>
                      <span className="block text-[8px] text-slate-400 font-bold mt-1 uppercase">
                        {sentimentStats.avgScore >= 80 ? "Optimal Order" : sentimentStats.avgScore >= 60 ? "Moderate State" : "Active Risks"}
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200/60 rounded-lg p-2.5 shadow-sm text-center flex flex-col justify-center">
                      <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">Sentiment Dynamic</span>
                      <div className="flex items-center justify-center gap-1 mt-1 font-mono font-black text-xs">
                        {sentimentStats.diff > 0 ? (
                          <div className="text-emerald-600 flex items-center gap-0.5">
                            <TrendingUp size={12} className="shrink-0" />
                            <span>+{sentimentStats.diff} pts</span>
                          </div>
                        ) : sentimentStats.diff < 0 ? (
                          <div className="text-red-500 flex items-center gap-0.5">
                            <TrendingDown size={12} className="shrink-0" />
                            <span>{sentimentStats.diff} pts</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">STABLE (0)</span>
                        )}
                      </div>
                      <span className="block text-[8px] text-slate-400 font-bold mt-1 uppercase">
                        Velocity Delta
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200/60 rounded-lg p-2.5 shadow-sm text-center flex flex-col justify-center sm:col-span-1">
                      <span className="block text-[8px] font-mono font-extrabold uppercase text-slate-400">Current Vector</span>
                      <span className="block mt-1 text-[10px] font-black text-pink-650 tracking-tight truncate px-1">
                        {sentimentStats.trendLabel.toUpperCase()}
                      </span>
                      <span className="block text-[8px] text-slate-400 font-bold mt-1 uppercase">
                        Trajectory Profile
                      </span>
                    </div>

                  </div>

                  {/* Sentiment Area Line Chart */}
                  <div className="w-full h-[160px] text-[10px] font-mono bg-white border border-slate-200/60 p-2 rounded-lg shadow-sm">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={sentimentData}
                        margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorSentiment" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#EC4899" stopOpacity={0.18}/>
                            <stop offset="95%" stopColor="#EC4899" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis 
                          dataKey="dateStr" 
                          tickLine={false} 
                          axisLine={{ stroke: "#E2E8F0" }} 
                          stroke="#64748B" 
                          dy={6}
                          minTickGap={15}
                        />
                        <YAxis 
                          tickLine={false} 
                          axisLine={false} 
                          stroke="#64748B" 
                          domain={[10, 100]}
                          allowDecimals={false}
                        />
                        <Tooltip content={<SentimentTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="score" 
                          stroke="#EC4899" 
                          strokeWidth={2} 
                          fillOpacity={1} 
                          fill="url(#colorSentiment)" 
                          activeDot={{ r: 4, strokeWidth: 0, fill: "#EC4899" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Context explanatory line */}
                  <div className="bg-pink-50/50 border border-pink-100 p-2.5 rounded-lg text-[10px] text-pink-950 font-medium select-none space-y-1">
                    <div className="flex items-center gap-1.5 font-bold uppercase text-pink-900 tracking-wider">
                      <ShieldCheck size={12} className="shrink-0 text-pink-600" />
                      How safety sentiment is parameterized:
                    </div>
                    <p className="text-slate-600 leading-relaxed font-sans mt-0.5 font-medium">
                      Daily baseline indices start at 100 representing perfect baseline safety. Reports reduce indices based on severity weightings and intensive content search tags (e.g. violent words yield greater decreases; resolution and secure tags cushion impact). Days with steady, quiet profiles preserve max stability.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Time-To-Resolve Chart */}
            <div id="recharts-resolve-container" className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-inner">
              <div className="flex items-center justify-between mb-3 border-b border-slate-200/60 pb-2 select-none">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-500 flex items-center gap-1">
                  <Clock size={12} className="text-amber-500 shrink-0" /> Time-To-Resolve by Incident Type
                </span>
                <span className="text-[8.5px] font-mono text-slate-400 font-bold uppercase">
                  Avg Hours
                </span>
              </div>

              {timeToResolveData.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 font-semibold select-none bg-white rounded-lg border border-slate-150 p-4">
                   <AlertCircle size={20} className="mx-auto text-slate-300 mb-1.5" />
                   No resolution or completion data available within scope.
                </div>
              ) : (
                <div className="w-full h-[180px] text-[10px] font-mono bg-white border border-slate-200/60 p-2 rounded-lg shadow-sm">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart
                        data={timeToResolveData}
                        margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                      >
                       <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                       <XAxis 
                          dataKey="name" 
                          tickLine={false} 
                          axisLine={{ stroke: "#E2E8F0" }} 
                          stroke="#64748B" 
                          dy={6}
                          tick={{ fontSize: 9 }}
                        />
                       <YAxis 
                          tickLine={false} 
                          axisLine={false} 
                          stroke="#64748B" 
                          dx={-4}
                          tick={{ fontSize: 9 }}
                        />
                       <Tooltip
                          contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "10px", padding: "8px", backgroundColor: "#fff" }}
                          itemStyle={{ color: "#334155", fontWeight: "bold" }}
                          formatter={(value: number) => [`${value} hours`, "Avg Resolution"]}
                          labelStyle={{ color: "#64748B", marginBottom: "4px", fontWeight: "bold", paddingBottom: "4px", borderBottom: "1px solid #F1F5F9" }}
                          cursor={{ fill: '#F1F5F9' }}
                        />
                       <Bar 
                          dataKey="avgHours" 
                          fill="#F59E0B" 
                          radius={[4, 4, 0, 0]}
                          barSize={28}
                       />
                     </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Briefing analytics footnotes */}
            <div className="space-y-2.5">
              <span className="text-[9px] uppercase font-mono font-extrabold text-slate-400 tracking-wider flex items-center gap-1">
                <Info size={11} /> Trend Analytics Insight
              </span>

              <div className="space-y-2 text-[11px] leading-relaxed text-slate-600 font-medium mt-1">
                {stats.peakDay && (
                  <div className="flex gap-2 bg-slate-50 border border-slate-150 rounded-xl p-3 shadow-sm">
                    <div className="p-1 rounded-lg bg-orange-100 text-orange-600 mt-0.5 shrink-0 h-fit">
                      <AlertCircle size={12} />
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-800">Peak Incident Concentration</h5>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        The highest activity point occurred on <strong className="font-bold text-slate-700">{stats.peakDay.fullDate}</strong> with <strong className="font-bold text-slate-800">{stats.peakDay.total} incidents</strong> registered. 
                        {stats.peakDay.criticalHigh > 0 && (
                          <span> Out of these, <strong className="font-extrabold text-red-500">{stats.peakDay.criticalHigh}</strong> were classified as severe.</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 bg-slate-50 border border-slate-150 rounded-xl p-3 shadow-sm">
                  <div className="p-1 rounded-lg bg-blue-100 text-blue-600 mt-0.5 shrink-0 h-fit">
                    <Zap size={12} />
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-800">Alert Composition Summary</h5>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Severe (Critical & High) events constitute <strong className="font-bold text-slate-700">
                        {stats.grandTotal > 0 ? Math.round((stats.criticalHighTotal / stats.grandTotal) * 100) : 0}%
                      </strong> of all reports over the last 30 days ({stats.criticalHighTotal} total severe alerts). Watchers are encouraged to cross-reference location indicators with active high-severity indicators.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
