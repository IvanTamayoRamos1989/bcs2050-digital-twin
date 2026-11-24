import React, { useState } from "react";
import {
  Activity,
  Bot,
  Compass,
  Eye,
  ExternalLink,
  Globe2,
  Layers,
  MapPin,
  MessageSquarePlus,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import type {
  AretianPhase,
  BasemapMode,
  CameraPreset,
  EngineMode,
  LiveTelemetrySummary,
  OverviewResponse,
  SensorThingRecord,
  ViewMode,
} from "../types/twin";

interface Props {
  overview: OverviewResponse | null;
  liveTelemetry: LiveTelemetrySummary | null;
  sensorThings?: SensorThingRecord[];
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
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  colorblindSafe: boolean;
  onToggleColorblindSafe: () => void;
  participationOpen: boolean;
  onToggleParticipation: () => void;
  citizenPinsCount: number;
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
  sensorThings = [],
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
  viewMode,
  onViewModeChange,
  colorblindSafe,
  onToggleColorblindSafe,
  participationOpen,
  onToggleParticipation,
  citizenPinsCount,
  onOpenArchitecture,
  chatOpen,
  onToggleChat,
  language,
  onLanguageChange,
}) => {
  const [livePopoverOpen, setLivePopoverOpen] = useState(false);
  const cities = overview ? Object.values(overview.cities) : [];
  const totalBuildings = overview?.state.buildings_3d_count ?? 396823;
  const isEn = language === "en";
  const weatherFeed = liveTelemetry?.feeds?.weather;
  const overallStatus = liveTelemetry?.overall_status || weatherFeed?.status || "CACHED";
  const statusDotClass =
    overallStatus === "LIVE"
      ? "bg-emerald-400"
      : overallStatus === "OFFLINE"
        ? "bg-rose-400"
        : "bg-amber-400";
  const freshnessPillText = weatherFeed
    ? isEn
      ? weatherFeed.freshness_en
      : weatherFeed.freshness_es
    : overallStatus;
  const sensorCount = sensorThings.length || 14;

  return (
    <header className="glass-panel pointer-events-auto relative z-30 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-sky-400/20 max-w-full">
      {/* Brand + Scale Counter */}
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25"
        >
          BCS
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xs font-bold tracking-wider text-white uppercase">
              BCS2050 · City Digital Twin
            </h1>
            <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono-num text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/35">
              LIVE · {totalBuildings.toLocaleString()} {isEn ? "3D BUILDINGS" : "EDIFICIOS 3D"}
            </span>
          </div>
          <p className="text-[10px] text-slate-300 hidden xl:block">
            {isEn
              ? "City Science (Aretian Benchmark) · Esri Digital Thread · Ontology v3.0"
              : "City Science (Aretian Benchmark) · Esri Digital Thread · Ontología v3.0"}
          </p>
        </div>
      </div>

      {/* Citizen vs Technical Mode Toggle + 4-Phase Workflow Switcher */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          role="group"
          aria-label={isEn ? "Interface view mode" : "Modo de interfaz"}
          className="flex items-center rounded-lg bg-slate-900/95 p-0.5 ring-1 ring-slate-700/80"
        >
          <button
            type="button"
            onClick={() => onViewModeChange("citizen")}
            aria-pressed={viewMode === "citizen"}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
              viewMode === "citizen"
                ? "bg-emerald-400 text-slate-950"
                : "text-slate-200 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>{isEn ? "Citizen Mode" : "Modo Ciudadano"}</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("technical")}
            aria-pressed={viewMode === "technical"}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
              viewMode === "technical"
                ? "bg-sky-400 text-slate-950"
                : "text-slate-200 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>{isEn ? "Technical" : "Técnico"}</span>
          </button>
        </div>

        {viewMode === "technical" && (
          <nav
            aria-label={isEn ? "City Science Phases" : "Fases City Science"}
            className="hidden lg:flex items-center gap-1 rounded-lg bg-slate-900/95 p-1 ring-1 ring-slate-700/80"
          >
            {PHASES.map((p) => {
              const active = phase === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPhaseChange(p.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-sky-400 text-slate-950 font-semibold shadow-md shadow-sky-500/30"
                      : "text-slate-200 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span className="font-mono-num opacity-85 text-[10px]">{p.num}</span>
                  {p.icon}
                  <span>{isEn ? p.labelEn : p.labelEs}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* Scope, City Jump, Engine, Participation & Tools */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Scope Selector */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-900/95 px-2 py-1 ring-1 ring-slate-700/80">
          <Compass className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
          <select
            aria-label={isEn ? "Territorial Scope" : "Ámbito Territorial"}
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
            className="bg-transparent text-[11px] font-medium text-slate-100 focus:outline-none cursor-pointer"
          >
            <option value="03" className="bg-slate-900">Estado BCS (03)</option>
            <optgroup label={isEn ? "Municipalities (5)" : "Municipios (5)"} className="bg-slate-900">
              <option value="03003" className="bg-slate-900">La Paz (03003)</option>
              <option value="03008" className="bg-slate-900">Los Cabos (03008)</option>
              <option value="03009" className="bg-slate-900">Loreto (03009)</option>
              <option value="03001" className="bg-slate-900">Comondú (03001)</option>
              <option value="03002" className="bg-slate-900">Mulegé (03002)</option>
            </optgroup>
            <optgroup label={isEn ? "Strategic Corridors (4)" : "Corredores Estratégicos (4)"} className="bg-slate-900">
              <option value="CORR-SUR-CABOS" className="bg-slate-900">Corredor Sur · Los Cabos</option>
              <option value="CORR-CENTRO-LA-PAZ" className="bg-slate-900">Corredor Centro · La Paz</option>
              <option value="CORR-VALLE-COMONDU" className="bg-slate-900">Corredor Valle · Comondú</option>
              <option value="CORR-NORTE-LORETO-MULEGE" className="bg-slate-900">Corredor Norte · Loreto–Mulegé</option>
            </optgroup>
          </select>
        </div>

        {/* 9-City Camera Jump */}
        <div className="hidden sm:flex items-center gap-1 rounded-lg bg-slate-900/95 px-2 py-1 ring-1 ring-slate-700/80">
          <MapPin className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
          <select
            aria-label={isEn ? "Fly to 3D City" : "Vuelo rápido a Ciudad 3D"}
            value={activeCitySlug}
            onChange={(e) => onCityJump(e.target.value)}
            className="bg-transparent text-[11px] font-medium text-slate-100 focus:outline-none cursor-pointer"
          >
            <option value="" className="bg-slate-900">
              {isEn ? "Fly to 3D City..." : "Vuelo a Ciudad 3D..."}
            </option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug} className="bg-slate-900">
                {c.name} ({c.buildings_count.toLocaleString()} {isEn ? "bldgs" : "edif."})
              </option>
            ))}
          </select>
        </div>

        {/* Dual 3D Engine Toggle */}
        <div
          role="group"
          aria-label={isEn ? "3D engine switcher" : "Selector de motor 3D"}
          className="hidden md:flex items-center rounded-lg bg-slate-900/95 p-0.5 ring-1 ring-slate-700/80"
        >
          <button
            type="button"
            onClick={() => onEngineModeChange("deck3d")}
            aria-pressed={engineMode === "deck3d"}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer ${
              engineMode === "deck3d" ? "bg-indigo-600 text-white font-semibold" : "text-slate-200 hover:text-white"
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>{isEn ? "Analytical 3D" : "3D Analítico"}</span>
          </button>
          <button
            type="button"
            onClick={() => onEngineModeChange("cesium3d")}
            aria-pressed={engineMode === "cesium3d"}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer ${
              engineMode === "cesium3d" ? "bg-indigo-600 text-white font-semibold" : "text-slate-200 hover:text-white"
            }`}
          >
            <Globe2 className="h-3 w-3" />
            <span>{isEn ? "Cesium Globe" : "Globo Cesium"}</span>
          </button>
        </div>

        {/* Basemap Mode */}
        {engineMode === "deck3d" && (
          <select
            aria-label={isEn ? "Basemap style" : "Estilo de mapa base"}
            value={basemapMode}
            onChange={(e) => onBasemapModeChange(e.target.value as BasemapMode)}
            className="hidden lg:block rounded-lg bg-slate-900/95 px-2 py-1 text-[11px] font-medium text-slate-100 ring-1 ring-slate-700/80 focus:outline-none cursor-pointer"
          >
            <option value="obsidian" className="bg-slate-900">
              {isEn ? "Obsidian Map" : "Mapa Obsidian"}
            </option>
            <option value="satellite" className="bg-slate-900">
              {isEn ? "HD Satellite" : "Satélite HD"}
            </option>
            <option value="terrain" className="bg-slate-900">
              {isEn ? "3D Relief" : "Relieve 3D"}
            </option>
          </select>
        )}

        {/* Colorblind-Safe Okabe-Ito / Viridis Toggle */}
        <button
          type="button"
          onClick={onToggleColorblindSafe}
          aria-pressed={colorblindSafe}
          aria-label={isEn ? "CVD colorblind-safe Okabe-Ito palette" : "CVD paleta inclusiva para daltonismo Okabe-Ito"}
          title={isEn ? "Colorblind-safe Okabe-Ito / Viridis palette (WCAG)" : "Paleta segura para daltonismo Okabe-Ito / Viridis (WCAG)"}
          className={`hidden sm:flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold transition-all cursor-pointer ${
            colorblindSafe
              ? "bg-amber-400 text-slate-950"
              : "bg-slate-800/90 text-slate-200 ring-1 ring-slate-600 hover:bg-slate-700"
          }`}
        >
          <Eye className="h-3 w-3" />
          <span>CVD</span>
        </button>

        {/* Citizen Participation PMDU Button */}
        <button
          type="button"
          onClick={onToggleParticipation}
          aria-pressed={participationOpen}
          aria-label={isEn ? "Participate in PMDU consultation pins" : "Participación ciudadana PMDU"}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
            participationOpen
              ? "bg-sky-400 text-slate-950"
              : "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/45 hover:bg-sky-500/35"
          }`}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{isEn ? "Participate" : "Participación"}</span>
          <span className="font-mono-num rounded-full bg-slate-950/60 px-1.5 text-[9.5px] text-white">
            {citizenPinsCount}
          </span>
        </button>

        {/* Live Telemetry & SensorThings */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setLivePopoverOpen((o) => !o)}
            aria-expanded={livePopoverOpen}
            aria-label={
              isEn
                ? "Asynchronous telemetry cache and OGC SensorThings v1.1 status"
                : "Estado de telemetría en caché y OGC SensorThings v1.1"
            }
            className={`hidden md:flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono-num text-[10.5px] transition-all cursor-pointer ${
              liveActive
                ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/50"
                : "bg-slate-800/90 text-slate-200 ring-1 ring-slate-600/70 hover:bg-slate-700"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${statusDotClass} ${overallStatus === "LIVE" ? "animate-pulse" : ""}`} />
            <Radio className="h-3 w-3 text-cyan-300" aria-hidden="true" />
            <span>
              {liveTelemetry?.weather?.la_paz?.temp_c != null
                ? `${Math.round(liveTelemetry.weather.la_paz.temp_c)}°C`
                : "BCS"}{" "}
              · {freshnessPillText} · {sensorCount} OGC
            </span>
          </button>

          {livePopoverOpen && (
            <div className="glass-panel absolute right-0 top-10 z-50 w-80 rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 text-left shadow-2xl">
              <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <p className="text-[11px] font-bold text-white">
                    {isEn ? "Live Telemetry & OGC SensorThings" : "Telemetría en Vivo & OGC SensorThings"}
                  </p>
                  <p className="font-mono-num text-[9.5px] text-slate-300">
                    {liveTelemetry?.cache_backend || "firestore:bcs-studio"} ·{" "}
                    {liveTelemetry?.ingested_at ? `${liveTelemetry.ingested_at.slice(11, 19)} UTC` : "--"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLivePopoverOpen(false)}
                  aria-label={isEn ? "Close telemetry details" : "Cerrar detalle telemetría"}
                  className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                {[
                  { key: "weather", labelEs: "Clima 5 Municipios (Open-Meteo)", labelEn: "5-Mun Weather (Open-Meteo)", feed: liveTelemetry?.feeds?.weather },
                  { key: "aircraft", labelEs: "Tráfico Aéreo (OpenSky)", labelEn: "Aircraft ADS-B (OpenSky)", feed: liveTelemetry?.feeds?.aircraft },
                  { key: "marine", labelEs: "Buques Marítimos (AIS Proxy)", labelEn: "Marine Vessels (AIS Proxy)", feed: liveTelemetry?.feeds?.marine },
                  { key: "cyclones", labelEs: "Ciclones Pacífico (NOAA NHC)", labelEn: "Pacific Cyclones (NOAA NHC)", feed: liveTelemetry?.feeds?.cyclones },
                ].map(({ key, labelEs, labelEn, feed }) => {
                  const st = feed?.status || "OFFLINE";
                  const badgeCls =
                    st === "LIVE"
                      ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40"
                      : st === "CACHED"
                        ? "bg-amber-500/20 text-amber-200 ring-amber-400/40"
                        : st === "STALE"
                          ? "bg-orange-500/20 text-orange-200 ring-orange-400/40"
                          : "bg-rose-500/20 text-rose-200 ring-rose-400/40";
                  return (
                    <div key={key} className="rounded-lg bg-slate-900/90 px-2.5 py-1.5 ring-1 ring-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-medium text-slate-100">{isEn ? labelEn : labelEs}</span>
                        <span className={`rounded-full px-1.5 py-0.5 font-mono-num text-[9px] font-semibold ring-1 ${badgeCls}`}>
                          {feed ? (isEn ? feed.freshness_en : feed.freshness_es) : "OFFLINE"}
                        </span>
                      </div>
                      {feed && (
                        <p className="mt-0.5 text-[9.5px] text-slate-300">
                          {isEn ? "Items" : "Registros"}: <span className="font-mono-num text-white">{feed.count}</span>
                          {feed.notice ? ` · ${feed.notice}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t border-slate-800 pt-2">
                <button
                  type="button"
                  onClick={onToggleLive}
                  className="rounded-md bg-cyan-500/20 px-2 py-1 text-[10px] font-semibold text-cyan-200 ring-1 ring-cyan-400/40 hover:bg-cyan-500/30 cursor-pointer"
                >
                  {liveActive
                    ? isEn ? "Hide 3D Sensors" : "Ocultar Sensores 3D"
                    : isEn ? "Show 3D Sensors" : "Mostrar Sensores 3D"}
                </button>
                <a
                  href="/FROST-Server/v1.1/Things"
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono-num text-[10px] text-sky-300 hover:underline"
                >
                  /FROST-Server/v1.1 ({sensorCount})
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Language Switcher */}
        <div
          role="group"
          aria-label={isEn ? "Language switcher" : "Selector de idioma"}
          className="flex items-center rounded-lg bg-slate-900/95 p-0.5 ring-1 ring-slate-700/80"
        >
          <button
            type="button"
            onClick={() => onLanguageChange("es")}
            aria-pressed={language === "es"}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
              language === "es"
                ? "bg-sky-400 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            ES
          </button>
          <button
            type="button"
            onClick={() => onLanguageChange("en")}
            aria-pressed={language === "en"}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
              language === "en"
                ? "bg-sky-400 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            EN
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenArchitecture}
          className="hidden sm:inline-flex rounded-lg bg-slate-800/95 px-2.5 py-1 text-[11px] font-medium text-slate-100 ring-1 ring-slate-600/70 hover:bg-slate-700 cursor-pointer"
        >
          {isEn ? "Governance & Stack" : "Gobernanza & Stack"}
        </button>

        <a
          href="https://panel.bcs2050.com"
          target="_blank"
          rel="noreferrer"
          className="hidden xl:flex items-center gap-1 rounded-lg bg-slate-800/95 px-2 py-1 text-[11px] font-medium text-slate-100 ring-1 ring-slate-600/70 hover:bg-slate-700"
        >
          <span>Panel</span>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>

        <button
          type="button"
          onClick={onToggleChat}
          aria-pressed={chatOpen}
          aria-label={isEn ? "AI Strategist Territorial Assistant" : "Estratega IA Territorial"}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
            chatOpen
              ? "bg-emerald-400 text-slate-950"
              : "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/45 hover:bg-emerald-500/30"
          }`}
        >
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{isEn ? "AI Strategist" : "Estratega IA"}</span>
        </button>
      </div>
    </header>
  );
};
