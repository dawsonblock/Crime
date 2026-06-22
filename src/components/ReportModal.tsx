import React, { useState } from "react";
import { X, Sparkles, AlertCircle } from "lucide-react";
import { EventItem } from "../types";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rawText: string, originalUrl: string, mode: "rule-based" | "ai") => Promise<boolean>;
}

export default function ReportModal({ isOpen, onClose, onSubmit }: ReportModalProps) {
  const [rawText, setRawText] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [classifierMode, setClassifierMode] = useState<"rule-based" | "ai">("rule-based");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getIncidentCount = (text: string) => {
    if (!text || text.trim().length < 5) return 0;
    let chunks: string[] = [];
    if (text.includes("\n---\n") || text.includes("\n===\n")) {
      chunks = text.split(/\n-+\n|\n=+\n/).map(c => c.trim()).filter(c => c.length > 5);
    } else if (text.trim().match(/^[-•*]\s+/m)) {
      chunks = text.split(/^[-•*]\s+/m).map(c => c.trim()).filter(c => c.length > 5);
    } else if (text.trim().match(/^\d+\.\s+/m)) {
      chunks = text.split(/^\d+\.\s+/m).map(c => c.trim()).filter(c => c.length > 5);
    } else {
      chunks = text.split(/\n\s*\n+/).map(c => c.trim()).filter(c => c.length > 5);
    }
    return chunks.length || (text.trim().length > 5 ? 1 : 0);
  };

  if (!isOpen) return null;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rawText.trim().length < 5) {
      setErrorMessage("Please input at least some descriptive words about the incident.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const success = await onSubmit(rawText, originalUrl, classifierMode);
      if (success) {
        setRawText("");
        setOriginalUrl("");
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred geocoding this report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillTemplate = (example: string) => {
    setRawText(example);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden text-slate-800 select-none flex flex-col font-sans">
        {/* Modal Head */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">Dynamic Public Safety Incident Filing</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Form scroll container */}
        <form onSubmit={handleFormSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[85vh]">
          {/* Disclaimer warning with privacy masking details */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg flex items-start gap-2 text-xs text-slate-600 leading-relaxed font-medium">
            <AlertCircle size={15} className="shrink-0 text-blue-600 mt-0.5" />
            <span>
              This files a watch update. To protect safety and safety locations, <strong>exact residential or specific street addresses are automatically masked and rounded to block-level approximations</strong> (~110m accuracy).
            </span>
          </div>

          {/* Engine Picker */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 block">
              Classification & Geocoding Engine
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setClassifierMode("rule-based")}
                className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                  classifierMode === "rule-based"
                    ? "bg-blue-50/50 border-blue-500 ring-1 ring-blue-500"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                    classifierMode === "rule-based" ? "border-blue-500 bg-blue-500" : "border-slate-300"
                  }`}>
                    {classifierMode === "rule-based" && <div className="w-1 h-1 bg-white rounded-full" />}
                  </div>
                  <span className="text-xs font-bold text-slate-800">Rule-Based</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal font-medium">
                  Uses instant regex keywords and OpenStreetMap Nominatim for precise lookup.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setClassifierMode("ai")}
                className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                  classifierMode === "ai"
                    ? "bg-blue-50/50 border-blue-500 ring-1 ring-blue-500"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                    classifierMode === "ai" ? "border-blue-500 bg-blue-500" : "border-slate-300"
                  }`}>
                    {classifierMode === "ai" && <div className="w-1 h-1 bg-white rounded-full" />}
                  </div>
                  <span className="text-xs font-bold text-slate-800">Gemini AI Engine</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal font-medium">
                  Utilizes structured deep schema analysis from Gemini 3.5 models.
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 block">
                Raw Bulletin / Report Text *
              </label>
              {rawText.trim().length >= 5 && (
                <span className={`text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded-full ${
                  getIncidentCount(rawText) > 1 
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse" 
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}>
                  {getIncidentCount(rawText) > 1 
                    ? `🛡️ Bulk Mode: Detected ${getIncidentCount(rawText)} Incidents` 
                    : "📝 Mode: Single Incident"}
                </span>
              )}
            </div>
            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setErrorMessage(null);
              }}
              rows={5}
              placeholder="e.g. Police responded to an armed robbery call on Preston crossing. Incident was solved on scene with no injuries.&#10;&#10;(To bulk submit multiple reports, separate each with a blank double-newline space)"
              className="w-full bg-slate-50 border border-slate-200 rounded p-3 text-xs placeholder-slate-400 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans font-medium"
              required
            />
            {getIncidentCount(rawText) > 1 && (
              <p className="text-[10px] text-emerald-650 font-bold font-mono">
                ✓ Auto-splitting raw text block into {getIncidentCount(rawText)} independent incidents to classify and geocode in a single batch.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 block">
              Reference Url Source (Optional)
            </label>
            <input
              type="url"
              value={originalUrl}
              onChange={(e) => setOriginalUrl(e.target.value)}
              placeholder="https://saskatoonpolice.ca/news/bulletin"
              className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 text-xs placeholder-slate-400 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Quick template seeds helper */}
          <div className="space-y-1.5 border-t border-slate-150 pt-2">
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono text-slate-400 block">
              Quick test templates:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  fillTemplate(
                    "Saskatoon Police reports high-priority break-ins along the Preston Crossing neighborhood. Multiple residential locks broken overnight."
                  )
                }
                className="bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[10px] text-slate-600 px-2.5 py-1 rounded cursor-pointer transition-colors font-semibold shadow-sm"
              >
                Preston Break-ins
              </button>
              <button
                type="button"
                onClick={() =>
                  fillTemplate(
                    "Saskatchewan RCMP warning of massive traffic collision and vehicle damage around Highway 11 near Warman. Avoid central bypass lanes."
                  )
                }
                className="bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[10px] text-slate-600 px-2.5 py-1 rounded cursor-pointer transition-colors font-semibold shadow-sm"
              >
                RCMP Collision Alert
              </button>
              <button
                type="button"
                onClick={() =>
                  fillTemplate(
                    "Government SIRT notice detailing official review of Saskatoon Police arrest on Broadway Avenue. Neutral evidence investigation underway."
                  )
                }
                className="bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[10px] text-slate-600 px-2.5 py-1 rounded cursor-pointer transition-colors font-semibold shadow-sm"
              >
                SIRT Broadway Probe
              </button>
              <button
                type="button"
                onClick={() =>
                  fillTemplate(
                    `ASSAULT INCIDENT: Assault with a weapon took place on 800 block of Broadway Avenue, Saskatoon. Police arrest review underway.\n\nTRAFFIC ACCIDENT: Heavy vehicle collision reported around Circle Drive near Preston Crossing. Central lanes blocked.\n\nSASKATOON ALERTS: Police perimeter set up on Preston Avenue for active wanted person inquiry. Shelter in place advised.`
                  )
                }
                className="bg-blue-50 border border-blue-200 text-blue-650 hover:bg-blue-100 text-[10px] px-2.5 py-1 rounded cursor-pointer transition-colors font-bold shadow-sm"
              >
                ⚡ TEST BULK (3 Incidents)
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-750 p-2.5 rounded text-xs font-mono font-semibold">
              Error: {errorMessage}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="cursor-pointer bg-white hover:bg-slate-55 border border-slate-250 px-4 py-2 rounded text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="cursor-pointer bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Sparkles size={13} className={isSubmitting ? "animate-spin" : ""} />
              <span>{isSubmitting ? "Geocoding and Saving..." : "File Safety Bulletin"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
