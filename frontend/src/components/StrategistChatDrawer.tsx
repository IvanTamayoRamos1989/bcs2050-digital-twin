import React, { useState } from "react";
import { AlertTriangle, BookOpen, Bot, Cpu, Navigation, Send, ShieldCheck, X } from "lucide-react";
import { TwinAPI } from "../api/client";
import type { CameraPreset, ChatCitation } from "../types/twin";

interface Props {
  open: boolean;
  onClose: () => void;
  scopeId: string;
  scenarioName: string;
  language?: "es" | "en";
  onFlyTo: (cam: CameraPreset) => void;
}

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  flyTo?: CameraPreset | null;
  lineage?: string[];
  engineMode?: string;
  modelUsed?: string | null;
  toolsUsed?: string[];
  citations?: ChatCitation[];
  uncertaintyNote?: string | null;
}

const QUICK_PROMPTS: Record<"es" | "en", string[]> = {
  es: [
    "¿Dónde absorber vivienda infill 2050 sin romper agua o POER?",
    "Evalúa el déficit hídrico CONAGUA e IMPLAN Los Cabos v3",
    "¿Qué potencial solar en techos tienen La Paz y Los Cabos?",
    "¿Cuántos edificios 3D están bajo cota +6m ante huracanes?",
  ],
  en: [
    "Where can Los Cabos absorb 2050 infill housing without breaking water limits?",
    "Evaluate CONAGUA aquifer deficit and IMPLAN Los Cabos v3 water layers",
    "What is the rooftop solar PV potential across 396,823 3D buildings?",
    "How many 3D buildings sit below +6m coastal surge elevation?",
  ],
};

export const StrategistChatDrawer: React.FC<Props> = ({
  open,
  onClose,
  scopeId,
  scenarioName,
  language = "es",
  onFlyTo,
}) => {
  const isEn = language === "en";
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: isEn
        ? "I am **BCS2050 AI Territorial Strategist**. Ask me about 15-min infill housing, CONAGUA aquifer deficits, IMPLAN Los Cabos v3 zoning, rooftop solar across 396,823 3D buildings, or +6m cyclonic surge risk."
        : "Soy el **Estratega Territorial BCS2050**. Pregúntame sobre vivienda infill 15-min, déficit de acuíferos CONAGUA, zonificación IMPLAN Los Cabos v3, solar en 396,823 techos 3D o riesgo costero +6m.",
      lineage: ["Vertex AI Gemini", "BigQuery VECTOR_SEARCH", "Ontology v3.0"],
    },
  ]);

  if (!open) return null;

  const sendQuery = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const res = await TwinAPI.chat({
        query: trimmed,
        scope_id: scopeId,
        scenario_name: scenarioName,
        language,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.answer_markdown,
          flyTo: res.fly_to,
          lineage: res.lineage,
          engineMode: res.engine_mode,
          modelUsed: res.model_used,
          toolsUsed: res.tools_used,
          citations: res.citations,
          uncertaintyNote: res.uncertainty_note,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `${isEn ? "Error querying territorial engine" : "Error al consultar motor territorial"}: ${(err as Error).message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel pointer-events-auto absolute bottom-16 left-4 z-30 flex h-[510px] w-[420px] max-w-[92vw] flex-col rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700/70 bg-slate-900/90 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-emerald-400" />
          <div>
            <p className="text-xs font-bold text-white">
              {isEn ? "AI Territorial Strategist · BCS2050" : "Estratega Territorial IA · BCS2050"}
            </p>
            <p className="text-[10px] text-slate-400">
              {isEn
                ? "Vertex AI Gemini · BigQuery RAG + Ontology v3"
                : "Vertex AI Gemini · RAG BigQuery + Ontología v3"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={isEn ? "Close AI Strategist" : "Cerrar Estratega IA"}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-800 px-3 py-2 twin-scroll">
        {QUICK_PROMPTS[language].map((qp) => (
          <button
            key={qp}
            type="button"
            onClick={() => sendQuery(qp)}
            className="shrink-0 rounded-full bg-slate-800/90 px-2.5 py-1 text-[10px] text-sky-300 ring-1 ring-slate-700 hover:bg-sky-500/20 cursor-pointer"
          >
            {qp}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="twin-scroll flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg p-2.5 text-[11.5px] leading-relaxed ${
              m.role === "user"
                ? "ml-8 bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/30"
                : "mr-2 bg-slate-900/90 text-slate-200 ring-1 ring-slate-700/70"
            }`}
          >
            {/* Engine Mode + Model Badge */}
            {m.role === "assistant" && m.engineMode && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                {m.engineMode === "vertex_gemini_grounded" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-300 ring-1 ring-emerald-400/35">
                    <ShieldCheck className="h-3 w-3" />
                    <span>{isEn ? "Vertex AI Gemini · Grounded" : "Vertex AI Gemini · Fundamentado"}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-amber-300 ring-1 ring-amber-400/35">
                    <Cpu className="h-3 w-3" />
                    <span>{isEn ? "Deterministic Fallback" : "Modo Determinístico Local"}</span>
                  </span>
                )}
                {m.modelUsed && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono-num text-[9px] text-slate-400">
                    {m.modelUsed}
                  </span>
                )}
              </div>
            )}

            <div className="whitespace-pre-wrap">{m.text.replace(/\*\*/g, "")}</div>

            {m.flyTo && (
              <button
                type="button"
                onClick={() => onFlyTo(m.flyTo!)}
                className="mt-2 flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/35 cursor-pointer"
              >
                <Navigation className="h-3 w-3" />
                <span>{isEn ? "Fly to site in 3D" : "Volar al sitio en 3D"}</span>
              </button>
            )}

            {/* Structured RAG & Official Citations */}
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/60 p-2">
                <div className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-sky-300">
                  <BookOpen className="h-3 w-3" />
                  <span>{isEn ? "Cited Sources" : "Fuentes Citadas"}</span>
                </div>
                <div className="space-y-1">
                  {m.citations.slice(0, 4).map((cit, idx) => (
                    <div key={`${cit.doc_id}-${idx}`} className="text-[9.5px] text-slate-400">
                      <span className="font-mono-num font-semibold text-slate-200">[{cit.doc_id}]</span>
                      {cit.page_or_section ? ` · ${cit.page_or_section}` : ""}
                      {typeof cit.distance === "number" ? (
                        <span className="ml-1 font-mono-num text-emerald-400">cos {cit.distance.toFixed(3)}</span>
                      ) : null}
                      {cit.excerpt && (
                        <p className="mt-0.5 line-clamp-2 text-[9px] text-slate-500">{cit.excerpt}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uncertainty / Scope Note */}
            {m.uncertaintyNote && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-[9.5px] text-amber-200/80">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                <span>{m.uncertaintyNote}</span>
              </div>
            )}

            {/* Tools & Lineage Chips */}
            {((m.toolsUsed && m.toolsUsed.length > 0) || (m.lineage && m.lineage.length > 0)) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(m.toolsUsed || []).slice(0, 3).map((tool) => (
                  <span
                    key={tool}
                    className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono-num text-[9px] text-sky-300 ring-1 ring-sky-400/20"
                  >
                    {tool}
                  </span>
                ))}
                {(m.lineage || []).slice(0, 2).map((lin) => (
                  <span
                    key={lin}
                    className="rounded bg-slate-800 px-1.5 py-0.5 font-mono-num text-[9px] text-slate-400"
                  >
                    {lin}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <p className="text-[11px] text-sky-400 animate-pulse">
            {isEn
              ? "Querying Vertex AI Gemini + BigQuery RAG..."
              : "Consultando Vertex AI Gemini + RAG BigQuery..."}
          </p>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuery(input);
        }}
        className="flex items-center gap-2 border-t border-slate-700/70 bg-slate-950/80 p-2.5"
      >
        <input
          type="text"
          aria-label={isEn ? "Ask a territorial question" : "Escribir consulta territorial"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isEn ? "Ask a territorial question on BCS2050..." : "Consulta territorial sobre BCS2050..."}
          className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-400 ring-1 ring-slate-700 focus:outline-none focus:ring-sky-400"
        />
        <button
          type="submit"
          disabled={loading}
          aria-label={isEn ? "Send question" : "Enviar consulta"}
          className="rounded-lg bg-emerald-500 p-2 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
};
