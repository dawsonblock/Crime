import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Send, Sparkles, MessageSquare, AlertTriangle, ArrowRight, RefreshCw, Compass, ShieldAlert, Cpu } from "lucide-react";
import { EventItem } from "../types";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
}

interface SafetyChatbotProps {
  events: EventItem[];
  onSelectEvent: (event: EventItem) => void;
}

export default function SafetyChatbot({ events, onSelectEvent }: SafetyChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Suggested starting prompts
  const starterPrompts = [
    { text: "Are there any active safety warnings or RCMP alerts outside Saskatoon?", label: "🌾 Saskatchewan RCMP" },
    { text: "What are the latest police releases or events reported in Regina today?", label: "👑 Regina Alerts" },
    { text: "Show me critical or high severity safety risks currently listed across the province.", label: "🚨 Critical Threats" },
    { text: "Are there any police operations or incidents reported in Prince Albert or Moose Jaw?", label: "📍 PA & Moose Jaw" },
  ];

  // Initialize with a welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "model",
          text: "Hello! I am your **Saskatchewan Safety AI Advisor**, a specialized assistant trained on live incident logs from Saskatoon, Regina, Prince Albert, Moose Jaw, and Saskatchewan-wide RCMP sectors, government safety notices, and news bulletins.\n\nAsk me anything about active safety risks, municipal trends, highway conditions, or traffic accidents, and I will parse our live provincial map index to provide you with concise answers, patterns, and citations.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, []);

  // Scroll to bottom on updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleTagClick = (eventId: string) => {
    const found = events.find((e) => e.id === eventId);
    if (found) {
      onSelectEvent(found);
    }
  };

  const parseMessageText = (content: string) => {
    if (!content) return "";
    
    // Split segments based on either **bold** placeholders or [Incident #ID] tags
    const regex = /(\*\*.*?\*\*|\[Incident\s+#\S+\])/g;
    const parts = content.split(regex);
    
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const text = part.substring(2, part.length - 2);
        return (
          <strong key={index} className="font-extrabold text-slate-900 bg-slate-100/60 px-1 rounded">
            {text}
          </strong>
        );
      } else {
        const tagMatch = part.match(/^\[Incident\s+#(\S+)\]$/);
        if (tagMatch) {
          const eventId = tagMatch[1];
          const hasEvent = events.some(e => e.id === eventId);
          return (
            <button
              key={index}
              onClick={() => handleTagClick(eventId)}
              className={`inline-flex items-center gap-1 font-extrabold px-1.5 py-0.5 rounded text-[10px] my-0.5 font-mono cursor-pointer shadow-sm border transition-colors uppercase select-none leading-none ${
                hasEvent 
                  ? "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 hover:border-blue-300"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700"
              }`}
              title={hasEvent ? "Click to view event details on map" : "Historical incident or not in current list"}
            >
              🔍 {eventId}
            </button>
          );
        }
      }
      return part;
    });
  };

  const submitQuery = async (queryText: string) => {
    if (!queryText.trim()) return;

    setErrorText(null);
    const userMsgId = "msg-user-" + Math.random().toString(36).substring(2, 9);
    const userMessage: Message = {
      id: userMsgId,
      role: "user",
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    try {
      // package previous context for full-conversation flow
      // convert messages state into simple format for the server API proxy
      const history = messages.map((m) => ({
        role: m.role,
        text: m.text
      }));
      // Append current user query
      history.push({ role: "user", text: queryText });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Could not synchronize message update with the safety network.");
      }

      const data = await response.json();
      
      const modelMsgId = "msg-model-" + Math.random().toString(36).substring(2, 9);
      const modelMessage: Message = {
        id: modelMsgId,
        role: "model",
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      setMessages((prev) => [...prev, modelMessage]);
    } catch (err: any) {
      console.error("AI chatbot error:", err);
      setErrorText(err.message || "Failed to receive answer from Saskatoon AI network.");
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuery(inputValue);
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Dynamic Header Info */}
      <div className="bg-slate-50 border-b border-slate-200 p-3 shrink-0 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded">
            <Cpu size={14} className="animate-pulse" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-800 uppercase block tracking-wider font-sans">
              Saskatchewan Safety AI
            </span>
            <span className="text-[9.5px] text-slate-400 font-medium block">
              Grounded on {events.length} active Saskatchewan incidents
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold bg-blue-50 text-blue-700 py-0.5 px-2 rounded-full border border-blue-150">
          <Sparkles size={10} className="animate-spin" />
          <span>GEMINI ACTIVE</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 bg-slate-50/50" ref={scrollRef}>
        {messages.map((msg) => {
          const isModel = msg.role === "model";
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex flex-col ${isModel ? "items-start" : "items-end"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-[11px] leading-relaxed shadow-sm font-medium ${
                  isModel
                    ? "bg-white border border-slate-200/80 text-slate-800 rounded-tl-none"
                    : "bg-blue-600 border border-blue-500 text-white rounded-tr-none shadow-blue-100"
                }`}
              >
                {/* Formatted multi-line layout support */}
                <div className="whitespace-pre-line space-y-1">
                  {msg.text.split("\n\n").map((para, pIdx) => (
                    <p key={pIdx} className="leading-relaxed">
                      {parseMessageText(para)}
                    </p>
                  ))}
                </div>
              </div>
              <span className="text-[8.5px] text-slate-400 font-mono mt-1 px-1.5 font-bold">
                {msg.timestamp}
              </span>
            </motion.div>
          );
        })}

        {/* Typing Placeholder Loader */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start"
          >
            <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5 text-[10.5px] text-slate-500 font-medium">
              <RefreshCw size={11} className="animate-spin text-blue-500" />
              <span>Analyzing Saskatoon map grids...</span>
            </div>
          </motion.div>
        )}

        {/* Error strip with retry option */}
        {errorText && (
          <div className="p-3.5 bg-red-50 border border-red-150 rounded-xl space-y-2 text-center shadow-inner">
            <AlertTriangle size={15} className="mx-auto text-red-500 animate-bounce" />
            <p className="text-[10px] leading-relaxed text-slate-600 font-semibold">{errorText}</p>
            <button
              onClick={() => {
                const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
                if (lastUserMsg) {
                  submitQuery(lastUserMsg.text);
                } else {
                  setErrorText(null);
                }
              }}
              className="cursor-pointer bg-red-650 hover:bg-red-700 text-white font-bold tracking-wide uppercase text-[9px] font-mono px-3 py-1.5 rounded-lg transition"
            >
              Retry Connection
            </button>
          </div>
        )}
      </div>

      {/* Suggested Starter Prompts Rail */}
      {messages.length === 1 && !isTyping && (
        <div className="p-3 bg-white border-t border-slate-100 shrink-0 select-none">
          <span className="text-[8.5px] uppercase font-mono font-bold text-slate-400 tracking-wider flex items-center gap-1 mb-2">
            <Compass size={11} /> Suggested Inquiries
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {starterPrompts.map((p, pIdx) => (
              <button
                key={pIdx}
                onClick={() => submitQuery(p.text)}
                className="cursor-pointer p-2 rounded-lg bg-slate-50 border border-slate-200/70 hover:bg-blue-50 hover:border-blue-150 text-[10px] text-slate-650 font-bold hover:text-blue-700 text-left transition-all truncate"
              >
                <div className="flex items-center justify-between gap-1 overflow-hidden">
                  <span>{p.label}</span>
                  <ArrowRight size={9} className="opacity-60 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form Submission controls */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-200 bg-white flex gap-2 shrink-0 print-hidden">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask AI Advisor (e.g. 'Show active break-ins', 'Circle Drive status')..."
          className="flex-1 text-[11px] border border-slate-200 outline-none rounded-xl px-3.5 py-2 hover:border-slate-300 focus:border-blue-500 font-medium transition-colors bg-slate-50/50 focus:bg-white"
          disabled={isTyping}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isTyping}
          className="cursor-pointer bg-blue-600 disabled:bg-slate-100 hover:bg-blue-500 text-white disabled:text-slate-400 p-2.5 rounded-xl transition-all shadow-sm shrink-0 flex items-center justify-center border border-blue-550 disabled:border-slate-200"
        >
          <Send size={12} className="text-current" />
        </button>
      </form>
    </div>
  );
}
