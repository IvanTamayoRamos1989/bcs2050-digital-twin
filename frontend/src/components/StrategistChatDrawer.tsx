import React, { useState } from "react";
import { Bot, Navigation, Send, X } from "lucide-react";
import { TwinAPI } from "../api/client";
import type { CameraPreset } from "../types/twin";

interface Props {
  open: boolean;
  onClose: () => void;
  scopeId: string;
  scenarioName: string;
  onFlyTo: (cam: CameraPreset) => void;
}

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  flyTo?: CameraPreset | null;
  lineage?: string[];
}

const QUICK_PROMPTS = [
  "¿Dónde absorber vivienda infill 2050 sin romper agua o POER?",
  "¿Qué potencial solar en techos tienen La Paz y Los Cabos?",
  "¿Cuántos edificios 3D están bajo cota +6m ante huracanes?",
  "Evalúa el déficit hídrico y zonas de tandeo en BCS",
];

export const StrategistChatDrawer: React.FC<Props> = ({
  open,
  onClose,
  scopeId,
  scenarioName,
  onFlyTo,
}) => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "Soy el **Estratega Territorial BCS2050**. Pregúntame sobre capacidad de vivienda 15-min, déficit de acuíferos CONAGUA, solar distribuida en los 396,823 techos 3D o riesgo costero ciclónico.",
      lineage: ["City Science Engine", "Ontology v3.0"],
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
      const res = await TwinAPI.chat({ query: trimmed, scope_id: scopeId, scenario_name: scenarioName });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.answer_markdown,
          flyTo: res.fly_to,
          lineage: res.lineage,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error al consultar motor territorial: ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel pointer-events-auto absolute bottom-16 left-4 z-30 flex h-[470px] w-[390px] flex-col rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700/70 bg-slate-900/90 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-emerald-400" />
          <div>
            <p className="text-xs font-bold text-white">Estratega Territorial IA · BCS2050</p>
            <p className="text-[10px] text-slate-400">Cálculo determinista + trazabilidad de fuentes</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar Estratega IA"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-800 px-3 py-2 twin-scroll">
        {QUICK_PROMPTS.map((qp) => (
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
                : "mr-4 bg-slate-900/90 text-slate-200 ring-1 ring-slate-700/70"
            }`}
          >
            <div className="whitespace-pre-wrap">{m.text.replace(/\*\*/g, "")}</div>
            {m.flyTo && (
              <button
                type="button"
                onClick={() => onFlyTo(m.flyTo!)}
                className="mt-2 flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/35 cursor-pointer"
              >
                <Navigation className="h-3 w-3" />
                <span>Volar al sitio en 3D</span>
              </button>
            )}
            {m.lineage && m.lineage.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.lineage.slice(0, 3).map((lin) => (
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
        {loading && <p className="text-[11px] text-sky-400 animate-pulse">Consultando ontología y métricas 3D...</p>}
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Consulta territorial sobre BCS2050..."
          className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 ring-1 ring-slate-700 focus:outline-none focus:ring-sky-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-500 p-2 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
};
