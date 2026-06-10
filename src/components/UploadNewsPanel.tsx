import React, { useState, useRef } from "react";
import { Upload, X, Sparkles, AlertCircle, FileText, CheckCircle2, ChevronRight, Check } from "lucide-react";
import { EventItem, SeverityType, SourceType } from "../types";

interface UploadNewsPanelProps {
  onSuccess: (addedCount: number, addedEvents: EventItem[]) => void;
  configSources: { key: string; name: string }[];
}

export default function UploadNewsPanel({ onSuccess, configSources }: UploadNewsPanelProps) {
  const [rawText, setRawText] = useState("");
  const [sourceName, setSourceName] = useState("Uploaded Crime News");
  const [sourceKey, setSourceKey] = useState("cbc_saskatoon_news");
  const [parserMode, setParserMode] = useState<"rule-based" | "ai">("ai");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Drag and drop states
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Status & logs feedback
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    count: number;
    message: string;
    events: EventItem[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Handle Manual File Choice
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Process and read file contents
  const handleFile = (file: File) => {
    const reader = new FileReader();
    setUploadedFileName(file.name);
    
    // Auto-detect a handsome default source label from file name
    const cleanName = file.name
      .replace(/\.(txt|json|csv)$/i, "")
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    setSourceName(`File: ${cleanName}`);

    reader.onload = (e) => {
      const textContent = e.target?.result;
      if (typeof textContent === "string") {
        setRawText(textContent);
        setErrorText(null);
      }
    };
    reader.onerror = () => {
      setErrorText("Oops! Failed to load and read the selected file.");
    };
    reader.readAsText(file);
  };

  const handleClearFile = () => {
    setUploadedFileName(null);
    setRawText("");
    setSourceName("Uploaded Crime News");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const triggerFileSelector = () => {
    fileInputRef.current?.click();
  };

  // Form submit handler to push to full-stack API
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rawText.trim().length < 10) {
      setErrorText("Pasted text or file body must contain at least 10 constructive characters to parse effectively.");
      return;
    }

    setIsProcessing(true);
    setErrorText(null);
    setSuccessResult(null);

    try {
      const response = await fetch("/api/events/upload-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: rawText,
          mode: parserMode,
          sourceKey,
          sourceName,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "The server rejected this news parser upload.");
      }

      const resData = await response.json();
      if (resData.success) {
        setSuccessResult({
          count: resData.count,
          message: resData.message,
          events: resData.addedEvents || [],
        });
        
        // Pass counts and fresh list up to App.tsx so they instantly pin on the map
        onSuccess(resData.count, resData.addedEvents || []);
      } else {
        throw new Error("News ingestion response did not indicate success state.");
      }
    } catch (err: any) {
      console.error("Error submitting crime news source:", err);
      setErrorText(err.message || "Network request failed processing crime news feed.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 scrollbar-thin scrollbar-thumb-slate-200">
      
      {/* Short instructions warning box */}
      <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-[11px] leading-relaxed flex gap-2.5 font-medium shadow-sm">
        <Sparkles size={14} className="shrink-0 text-blue-600 mt-0.5 animate-pulse" />
        <div>
          <span className="font-bold">Crime News Feed Parser:</span> Paste raw crime reviews or upload articles (.txt, .csv, .json). AI Engine extracts incidents, geolocates approximate coordinates in Saskatoon, and registers them directly!
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 select-none">
        
        {/* Source info meta inputs */}
        <div className="grid grid-cols-2 gap-3 pb-1">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Source Stream Name
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. Saskatoon StarPhoenix Digest"
              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-semibold"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Associated map Category
            </label>
            <select
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold cursor-pointer"
            >
              {configSources.map((src) => (
                <option key={src.key} value={src.key}>
                  {src.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Drag and Drop Box Area */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
            Select or Drop News File (.txt, .json, .csv)
          </span>
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileSelector}
            className={`cursor-pointer border-2 border-dashed rounded-lg p-5 text-center transition-all ${
              dragActive 
                ? "border-blue-500 bg-blue-50/40" 
                : uploadedFileName 
                  ? "border-emerald-400 bg-emerald-50/20" 
                  : "border-slate-250 bg-white hover:bg-slate-50 hover:border-slate-355"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.json,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {uploadedFileName ? (
              <div className="flex flex-col items-center justify-center gap-1.5">
                <div className="p-2 bg-emerald-55 text-emerald-600 rounded-md">
                  <FileText size={20} />
                </div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>{uploadedFileName}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFile();
                    }}
                    className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 cursor-pointer"
                    title="Remove File"
                  >
                    <X size={13} />
                  </button>
                </div>
                <p className="text-[9.5px] text-slate-450 font-medium">Text loaded into parser. Click area to switch file.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5">
                <div className="p-1.5 bg-slate-100 text-slate-500 rounded-md">
                  <Upload size={18} />
                </div>
                <p className="text-xs font-bold text-slate-700">Drag & drop news file here, or browse</p>
                <p className="text-[9.5px] text-slate-400 font-medium">Supports plain news lines, structured arrays, or crime spreadsheets</p>
              </div>
            )}
          </div>
        </div>

        {/* Text Area copy paste input */}
        <div className="space-y-1">
          <div className="flex justify-between items-center select-none">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Or paste raw news text directly
            </span>
            {rawText.length > 0 && !uploadedFileName && (
              <button
                type="button"
                onClick={() => setRawText("")}
                className="text-[9.5px] text-red-550 hover:text-red-700 font-bold tracking-wide uppercase transition-colors"
              >
                Clear paste
              </button>
            )}
          </div>
          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              setErrorText(null);
            }}
            rows={4}
            placeholder="e.g. ASSAULT REPORT: Early Monday, police arrested an active suspect following a physical attack near Spadina Crescent. Victim sustained minor injuries...
WANTED PERSON: RCMP seeking assistance finding missing suspect around Stonebridge region..."
            className="w-full bg-white border border-slate-200 rounded p-3 text-xs placeholder-slate-405 text-slate-800 focus:outline-none focus:border-blue-500 font-sans font-medium leading-relaxed"
          />
        </div>

        {/* Parsing Engine Picker */}
        <div className="grid grid-cols-2 gap-3.5 pt-1 select-none">
          <button
            type="button"
            onClick={() => setParserMode("ai")}
            className={`text-left p-2.5 rounded-lg border cursor-pointer transition-all ${
              parserMode === "ai"
                ? "bg-blue-50/45 border-blue-500 ring-1 ring-blue-500/10"
                : "bg-white border-slate-200 hover:bg-slate-150/40"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <input
                type="radio"
                checked={parserMode === "ai"}
                onChange={() => setParserMode("ai")}
                className="h-3.5 w-3.5 text-blue-600 focus:ring-0 border-slate-300 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                <Sparkles size={11} className="text-blue-500 animate-pulse" />
                Gemini AI Ingest
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed">
              Extracts multiple complex stories, filters content, and predicts coordinates.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setParserMode("rule-based")}
            className={`text-left p-2.5 rounded-lg border cursor-pointer transition-all ${
              parserMode === "rule-based"
                ? "bg-blue-50/45 border-blue-500 ring-1 ring-blue-500/10"
                : "bg-white border-slate-200 hover:bg-slate-150/40"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <input
                type="radio"
                checked={parserMode === "rule-based"}
                onChange={() => setParserMode("rule-based")}
                className="h-3.5 w-3.5 text-blue-600 focus:ring-0 border-slate-300 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800">Rule-Based Parser</span>
            </div>
            <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed">
              Regex search patterns parse headlines and locations instantly.
            </p>
          </button>
        </div>

        {errorText && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs leading-relaxed font-mono font-semibold text-red-800 flex gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-600 mt-0.5" />
            <span>Error: {errorText}</span>
          </div>
        )}

        {/* Submit Ingestion */}
        <button
          type="submit"
          disabled={isProcessing || rawText.trim().length === 0}
          className="w-full cursor-pointer bg-blue-600 hover:bg-blue-500 disabled:opacity-45 text-white font-bold text-xs py-2.5 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Processing Crime News...</span>
            </>
          ) : (
            <>
              <Upload size={14} />
              <span>Ingest and Map Crime News</span>
            </>
          )}
        </button>
      </form>

      {/* Success Extraction report results list */}
      {successResult && (
        <div className="border border-slate-200/80 bg-white p-3.5 rounded-xl text-slate-800 select-none shadow-sm space-y-3 font-sans animate-fade-in">
          <div className="flex items-start gap-2 text-emerald-800 bg-emerald-50/50 p-2.5 border border-emerald-100 rounded-lg">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <div className="text-xs font-bold">Ingest Complete!</div>
              <p className="text-[10.5px] text-slate-600 leading-normal font-medium mt-0.5">{successResult.message}</p>
            </div>
          </div>

          {successResult.events.length > 0 && (
            <div className="space-y-2">
              <span className="text-[9.5px] uppercase font-bold tracking-wider text-slate-400 block font-mono">
                Extracted Incidents ({successResult.events.length})
              </span>
              
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {successResult.events.map((evt, idx) => (
                  <div key={evt.id || idx} className="p-2 border border-slate-100 bg-slate-50/40 rounded text-xs select-none hover:bg-slate-50">
                    <div className="flex justify-between items-center gap-2 mb-1">
                      <span className="text-[9px] px-1 py-0.5 bg-blue-100/70 text-blue-700 rounded font-mono font-bold tracking-wide capitalize">
                        {evt.eventType.replace(/_/g, " ")}
                      </span>
                      <span className="text-[9.5px] text-slate-400 font-mono italic">
                        {evt.locationText}
                      </span>
                    </div>
                    <div className="font-bold text-slate-800 text-[11px] line-clamp-1 flex items-center gap-1">
                      <ChevronRight size={11} className="text-slate-400" />
                      <span>{evt.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
