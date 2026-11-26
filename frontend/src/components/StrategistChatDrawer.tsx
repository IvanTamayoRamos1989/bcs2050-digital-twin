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
    <div
      role="dialog"
      aria-label={isEn ? "AI Territorial Strategist" : "Estratega Territorial IA"}
      className="hig-glass-sidebar pointer-events-auto absolute bottom-16 left-4 max-sm:inset-x-3 max-sm:w-auto z-30 flex h-[510px] w-[410px] max-w-[94vw] flex-col rounded-[24px] overflow-hidden"
    >
      {/* Apple Messages Header */}
      <div className="flex items-center justify-between border-b border-[var(--hig-divider)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="ios-ai-pill flex h-8 w-8 items-center justify-center rounded-full">
            <Bot className="h-4 w-4 text-[var(--hig-cyan)]" />
          </div>
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-[var(--hig-ink)]">
              {isEn ? "AI Strategist · BCS2050" : "Estratega IA · BCS2050"}
            </p>
            <p className="text-[10.5px] text-[var(--hig-ink-2)]">
              {isEn
                ? "Vertex AI Gemini · BigQuery RAG"
                : "Vertex AI Gemini · RAG BigQuery"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={isEn ? "Close AI Strategist" : "Cerrar Estratega IA"}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--hig-divider)] px-3.5 py-2 twin-scroll">
        {QUICK_PROMPTS[language].map((qp) => (
          <button
            key={qp}
            type="button"
            onClick={() => sendQuery(qp)}
            className="ios-pill shrink-0 px-3 py-1 text-[10.5px] font-medium text-[var(--hig-accent)] cursor-pointer"
          >
            {qp}
          </button>
        ))}
      </div>

      {/* iMessage Bubbles */}
      <div className="twin-scroll flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`px-3.5 py-2.5 text-[12px] leading-relaxed ${
              m.role === "user"
                ? "ml-10 rounded-2xl rounded-br-sm bg-[var(--hig-accent)] text-white shadow-sm"
                : "hig-content-group mr-4 rounded-2xl rounded-bl-sm text-[var(--hig-ink)]"
            }`}
          >
            {/* Engine Mode + Model Badge */}
            {m.role === "assistant" && m.engineMode && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                {m.engineMode === "vertex_gemini_grounded" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#30D158]/15 px-2 py-0.5 text-[9.5px] font-semibold text-[var(--hig-green)]">
                    <ShieldCheck className="h-3 w-3" />
                    <span>{isEn ? "Vertex AI · Grounded" : "Vertex AI · Verificado"}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FF9F0A]/15 px-2 py-0.5 text-[9.5px] font-semibold text-[var(--hig-amber)]">
                    <Cpu className="h-3 w-3" />
                    <span>{isEn ? "Local Deterministic" : "Determinístico Local"}</span>
                  </span>
                )}
                {m.modelUsed && (
                  <span className="rounded-full bg-[var(--hig-pill-bg)] px-2 py-0.5 font-mono-num text-[9px] text-[var(--hig-ink-2)]">
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
                className="mt-2 flex items-center gap-1.5 rounded-full bg-[#30D158]/20 px-3 py-1 text-[10.5px] font-semibold text-[var(--hig-green)] hover:bg-[#30D158]/30 transition-colors cursor-pointer"
              >
                <Navigation className="h-3 w-3" />
                <span>{isEn ? "Fly to site in 3D" : "Volar al sitio en 3D"}</span>
              </button>
            )}

            {/* Structured RAG & Official Citations */}
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2.5 rounded-xl bg-[var(--hig-pill-bg)] border border-[var(--hig-divider)] p-2.5">
                <div className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--hig-cyan)]">
                  <BookOpen className="h-3 w-3" />
                  <span>{isEn ? "Cited Sources" : "Fuentes Citadas"}</span>
                </div>
                <div className="space-y-1">
                  {m.citations.slice(0, 4).map((cit, idx) => (
                    <div key={`${cit.doc_id}-${idx}`} className="text-[10px] text-[var(--hig-ink-2)]">
                      <span className="font-mono-num font-semibold text-[var(--hig-ink)]">[{cit.doc_id}]</span>
                      {cit.page_or_section ? ` · ${cit.page_or_section}` : ""}
                      {typeof cit.distance === "number" ? (
                        <span className="ml-1 font-mono-num text-[var(--hig-green)]">cos {cit.distance.toFixed(3)}</span>
                      ) : null}
                      {cit.excerpt && (
                        <p className="mt-0.5 line-clamp-2 text-[9.5px] text-[var(--hig-ink-3)]">{cit.excerpt}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uncertainty / Scope Note */}
            {m.uncertaintyNote && (
              <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#FF9F0A]/12 px-2.5 py-1.5 text-[9.5px] text-[var(--hig-amber)]">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{m.uncertaintyNote}</span>
              </div>
            )}

            {/* Tools & Lineage Chips */}
            {((m.toolsUsed && m.toolsUsed.length > 0) || (m.lineage && m.lineage.length > 0)) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(m.toolsUsed || []).slice(0, 3).map((tool) => (
                  <span
                    key={tool}
                    className="rounded-full bg-[#0A84FF]/15 px-2 py-0.5 font-mono-num text-[9px] text-[var(--hig-accent)]"
                  >
                    {tool}
                  </span>
                ))}
                {(m.lineage || []).slice(0, 2).map((lin) => (
                  <span
                    key={lin}
                    className="rounded-full bg-[var(--hig-pill-bg)] px-2 py-0.5 font-mono-num text-[9px] text-[var(--hig-ink-2)]"
                  >
                    {lin}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <p className="px-2 text-[11px] font-medium text-[var(--hig-cyan)] animate-pulse">
            {isEn
              ? "Querying Vertex AI Gemini + BigQuery RAG..."
              : "Consultando Vertex AI Gemini + RAG BigQuery..."}
          </p>
        )}
      </div>

      {/* iMessage Pill Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuery(input);
        }}
        className="flex items-center gap-2 border-t border-[var(--hig-divider)] p-3"
      >
        <input
          type="text"
          aria-label={isEn ? "Ask a territorial question" : "Escribir consulta territorial"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isEn ? "Ask BCS2050..." : "Consulta territorial BCS2050..."}
          className="ios-input flex-1 rounded-full px-4 py-2 text-[12px] placeholder:text-[var(--hig-ink-3)]"
        />
        <button
          type="submit"
          disabled={loading}
          aria-label={isEn ? "Send question" : "Enviar consulta"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hig-accent)] hover:bg-[var(--hig-accent-hover)] text-white disabled:opacity-50 transition-colors cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
};
