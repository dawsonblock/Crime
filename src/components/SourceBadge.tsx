import React from "react";
import { ShieldCheck, Landmark, Globe, Radio } from "lucide-react";
import { SourceType } from "../types";

interface SourceBadgeProps {
  sourceKey: string;
  sourceType: SourceType;
  sourceName: string;
}

export default function SourceBadge({ sourceKey, sourceType, sourceName }: SourceBadgeProps) {
  // Return different styles based on keys
  let bgClass = "bg-slate-50 border-slate-205 text-slate-600";
  let icon = <Globe size={12} />;

  if (sourceKey === "saskatoon_police_news" || sourceKey === "saskatoon_crime_map") {
    bgClass = "bg-blue-50 border-blue-200 text-blue-700";
    icon = <ShieldCheck size={12} />;
  } else if (sourceKey === "rcmp_saskatchewan_news") {
    bgClass = "bg-red-50 border-red-200 text-red-700";
    icon = <Landmark size={12} />;
  } else if (sourceType === "government" || sourceKey === "saskatchewan_gov_news") {
    bgClass = "bg-emerald-50 border-emerald-200 text-emerald-700";
    icon = <Landmark size={12} />;
  } else if (sourceType === "media") {
    bgClass = "bg-amber-50 border-amber-200 text-amber-700";
    icon = <Radio size={12} />;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${bgClass}`}>
      {icon}
      <span>{sourceName}</span>
    </span>
  );
}
