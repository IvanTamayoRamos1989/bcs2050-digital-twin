import React from "react";
import {
  Activity,
  Bot,
  Compass,
  ExternalLink,
  Globe2,
  Layers,
  MapPin,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  AretianPhase,
  BasemapMode,
  CameraPreset,
  EngineMode,
  LiveTelemetrySummary,
  OverviewResponse,
} from "../types/twin";

interface Props {
  overview: OverviewResponse | null;
  liveTelemetry: LiveTelemetrySummary | null;
  liveActive: boolean;
  onToggleLive: () => void;
  phase: AretianPhase;
  onPhaseChange: (p: AretianPhase) => void;
  scopeId: string;
  onScopeChange: (scopeId: string, cam?: CameraPreset) => void;
  activeCitySlug: string;
  onCityJump: (citySlug: string) => void;
  engineMode: EngineMode;
  onEngineModeChange: (m: EngineMode) => void;
  basemapMode: BasemapMode;
  onBasemapModeChange: (b: BasemapMode) => void;
  onOpenArchitecture: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  language: "es" | "en";
  onLanguageChange: (lang: "es" | "en") => void;
}

const PHASES: { id: AretianPhase; num: string; labelEs: string; labelEn: string; icon: React.ReactNode }[] = [
  { id: "diagnostics", num: "01", labelEs: "Diagnóstico", labelEn: "Diagnostics", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "goals", num: "02", labelEs: "Metas 2050", labelEn: "2050 Goals", icon: <Target className="h-3.5 w-3.5" /> },
  { id: "scenarios", num: "03", labelEs: "Escenarios", labelEn: "Scenarios", icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
  { id: "recommendations", num: "04", labelEs: "Acciones", labelEn: "Actions", icon: <Sparkles className="h-3.5 w-3.5" /> },
];

export const TopCommandBar: React.FC<Props> = ({
  overview,
  liveTelemetry,
  liveActive,
  onToggleLive,
  phase,
  onPhaseChange,
  scopeId,
  onScopeChange,
  activeCitySlug,
  onCityJump,
  engineMode,
  onEngineModeChange,
  basemapMode,
  onBasemapModeChange,
  onOpenArchitecture,
  chatOpen,
  onToggleChat,
  language,
  onLanguageChange,
}) => {
  const cities = overview ? Object.values(overview.cities) : [];
  const totalBuildings = overview?.state.buildings_3d_count ?? 396823;

  return (
    <header className="glass-panel pointer-events-auto relative z-30 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-sky-400/20">
      {/* Brand + Scale Counter */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25">
          BCS
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-white uppercase">
              BCS2050 · City Digital Twin
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono-num text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              LIVE · {totalBuildings.toLocaleString()} {language === "en" ? "3D BUILDINGS" : "EDIFICIOS 3D"}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 hidden md:block">
            {language === "en"
              ? "City Science (Aretian Benchmark) · Esri Digital Thread · Ontology v3.0"
              : "City Science (Aretian Benchmark) · Esri Digital Thread · Ontología v3.0"}
          </p>
        </div>
      </div>

      {/* 4-Phase Aretian Workflow Switcher */}
      <nav aria-label="Fases City Science" className="flex items-center gap-1 rounded-lg bg-slate-900/90 p-1 ring-1 ring-slate-700/70">
        {PHASES.map((p) => {
          const active = phase === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPhaseChange(p.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                active
                  ? "bg-sky-500 text-slate-950 font-semibold shadow-md shadow-sky-500/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="font-mono-num opacity-75 text-[10px]">{p.num}</span>
              {p.icon}
              <span>{language === "en" ? p.labelEn : p.labelEs}</span>
            </button>
          );
        })}
      </nav>

      {/* Scope, City Jump, Engine & Tools */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Scope Selector */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-900/90 px-2 py-1 ring-1 ring-slate-700/70">
          <Compass className="h-3.5 w-3.5 text-sky-400" />
          <select
            aria-label="Ámbito Territorial"
            value={scopeId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "03") {
                onScopeChange(val, overview?.state.camera);
              } else if (overview?.municipalities[val]) {
                onScopeChange(val, overview.municipalities[val].camera);
              } else {
                onScopeChange(val);
              }
            }}
            className="bg-transparent text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="03" className="bg-slate-900">Estado BCS (03)</option>
            <optgroup label="Municipios (5)" className="bg-slate-900">
              <option value="03003" className="bg-slate-900">La Paz (03003)</option>
              <option value="03008" className="bg-slate-900">Los Cabos (03008)</option>
              <option value="03009" className="bg-slate-900">Loreto (03009)</option>
              <option value="03001" className="bg-slate-900">Comondú (03001)</option>
              <option value="03002" className="bg-slate-900">Mulegé (03002)</option>
            </optgroup>
            <optgroup label="Corredores Estratégicos (4)" className="bg-slate-900">
              <option value="CORR-SUR-CABOS" className="bg-slate-900">Corredor Sur · Los Cabos</option>
              <option value="CORR-CENTRO-LA-PAZ" className="bg-slate-900">Corredor Centro · La Paz</option>
              <option value="CORR-VALLE-COMONDU" className="bg-slate-900">Corredor Valle · Comondú</option>
              <option value="CORR-NORTE-LORETO-MULEGE" className="bg-slate-900">Corredor Norte · Loreto–Mulegé</option>
            </optgroup>
          </select>
        </div>

        {/* 9-City Camera Jump */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-900/90 px-2 py-1 ring-1 ring-slate-700/70">
          <MapPin className="h-3.5 w-3.5 text-emerald-400" />
          <select
            aria-label="Vuelo rápido a Ciudad 3D"
            value={activeCitySlug}
            onChange={(e) => onCityJump(e.target.value)}
            className="bg-transparent text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="" className="bg-slate-900">Vuelo a Ciudad 3D...</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug} className="bg-slate-900">
                {c.name} ({c.buildings_count.toLocaleString()} edif.)
              </option>
            ))}
          </select>
        </div>

        {/* Dual 3D Engine Toggle */}
        <div className="flex items-center rounded-lg bg-slate-900/90 p-0.5 ring-1 ring-slate-700/70">
          <button
            type="button"
            onClick={() => onEngineModeChange("deck3d")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer ${
              engineMode === "deck3d" ? "bg-indigo-500 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>3D Analítico</span>
          </button>
          <button
            type="button"
            onClick={() => onEngineModeChange("cesium3d")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer ${
              engineMode === "cesium3d" ? "bg-indigo-500 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            <Globe2 className="h-3 w-3" />
            <span>Globo Cesium</span>
          </button>
        </div>

        {/* Basemap Mode */}
        {engineMode === "deck3d" && (
          <select
            aria-label="Estilo de mapa base"
            value={basemapMode}
            onChange={(e) => onBasemapModeChange(e.target.value as BasemapMode)}
            className="rounded-lg bg-slate-900/90 px-2 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-slate-700/70 focus:outline-none cursor-pointer"
          >
            <option value="obsidian" className="bg-slate-900">Mapa Obsidian</option>
            <option value="satellite" className="bg-slate-900">Satélite HD</option>
            <option value="terrain" className="bg-slate-900">Relieve 3D</option>
          </select>
        )}

        <button
          type="button"
          onClick={onToggleLive}
          title="Monitoreo en vivo (Clima Open-Meteo, Vuelos OpenSky, Barcos AIS, Ciclones NHC)"
          className={`hidden md:flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono-num text-[10.5px] transition-all cursor-pointer ${
            liveActive
              ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50"
              : "bg-slate-800/90 text-slate-300 ring-1 ring-slate-600/60 hover:bg-slate-700"
          }`}
        >
          <Radio className={`h-3 w-3 ${liveActive ? "text-cyan-400 animate-pulse" : "text-slate-400"}`} />
          <span>
            {liveTelemetry?.weather?.la_paz?.temp_c != null
              ? `${Math.round(liveTelemetry.weather.la_paz.temp_c)}°C`
              : "BCS"}{" "}
            · {liveTelemetry?.aircraft?.count ?? 0}✈ · {liveTelemetry?.marine?.count ?? 0}⛵
          </span>
        </button>

        <div
          role="group"
          aria-label="Language switcher"
          className="flex items-center rounded-lg bg-slate-900/90 p-0.5 ring-1 ring-slate-700/70"
        >
          <button
            type="button"
            onClick={() => onLanguageChange("es")}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
              language === "es"
                ? "bg-sky-500 text-slate-950"
                : "text-slate-400 hover:text-white"
            }`}
          >
            ES
          </button>
          <button
            type="button"
            onClick={() => onLanguageChange("en")}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
              language === "en"
                ? "bg-sky-500 text-slate-950"
                : "text-slate-400 hover:text-white"
            }`}
          >
            EN
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenArchitecture}
          className="rounded-lg bg-slate-800/90 px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-slate-600/60 hover:bg-slate-700 cursor-pointer"
        >
          {language === "en" ? "Stack & Licenses" : "Stack & Licencias"}
        </button>

        <a
          href="https://panel.bcs2050.com"
          target="_blank"
          rel="noreferrer"
          className="hidden xl:flex items-center gap-1 rounded-lg bg-slate-800/90 px-2 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-slate-600/60 hover:bg-slate-700"
        >
          <span>Panel</span>
          <ExternalLink className="h-3 w-3" />
        </a>

        <button
          type="button"
          onClick={onToggleChat}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
            chatOpen
              ? "bg-emerald-500 text-slate-950"
              : "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25"
          }`}
        >
          <Bot className="h-3.5 w-3.5" />
          <span>{language === "en" ? "AI Strategist" : "Estratega IA"}</span>
        </button>
      </div>
    </header>
  );
};
