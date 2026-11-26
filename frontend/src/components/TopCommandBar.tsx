import React, { useEffect, useState } from "react";
import {
  Bot,
  ChevronRight,
  Compass,
  ExternalLink,
  Globe2,
  Layers,
  MapPin,
  MessageSquarePlus,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
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
import { IosSwitch } from "./IosSwitch";

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

export const TopCommandBar: React.FC<Props> = ({
  overview,
  liveTelemetry,
  sensorThings = [],
  liveActive,
  onToggleLive,
  phase: _phase,
  onPhaseChange: _onPhaseChange,
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
  void _phase;
  void _onPhaseChange;

  const [livePopoverOpen, setLivePopoverOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cities = overview ? Object.values(overview.cities) : [];
  const totalBuildings = overview?.state.buildings_3d_count ?? 396823;
  const isEn = language === "en";
  const weatherFeed = liveTelemetry?.feeds?.weather;
  const overallStatus = liveTelemetry?.overall_status || weatherFeed?.status || "CACHED";
  const statusDotClass =
    overallStatus === "LIVE"
      ? "bg-[#30D158]"
      : overallStatus === "OFFLINE"
        ? "bg-[#FF453A]"
        : "bg-[#FF9F0A]";
  const shortStatus =
    overallStatus === "LIVE"
      ? isEn
        ? "Live"
        : "Vivo"
      : overallStatus === "OFFLINE"
        ? isEn
          ? "Offline"
          : "Sin red"
        : isEn
          ? "Cached"
          : "Caché";
  const sensorCount = sensorThings.length || 14;

  useEffect(() => {
    if (!livePopoverOpen && !settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLivePopoverOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [livePopoverOpen, settingsOpen]);

  return (
    <header className="ios-topbar pointer-events-auto relative z-30 flex h-14 w-full max-w-full flex-nowrap items-center justify-between gap-1.5 px-3 sm:px-4 whitespace-nowrap">
      {/* Left: Machined Anodized Brand Squircle + Scope & 3D City Jump */}
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-b from-[#2E2E35] to-[#17171B] text-[10.5px] font-semibold tracking-tight text-[#F5F5F7] ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_rgba(0,0,0,0.45)]"
          >
            BCS
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <h1 className="text-[13.5px] font-semibold tracking-tight text-[#F5F5F7]">
              BCS 2050
            </h1>
            <span
              title={`${totalBuildings.toLocaleString()} ${isEn ? "3D buildings live" : "edificios 3D en vivo"}`}
              className={`h-1.5 w-1.5 rounded-full ${statusDotClass} ${overallStatus === "LIVE" ? "animate-pulse" : ""}`}
            />
          </div>
        </div>

        {/* Scope Selector Pill */}
        <div className="ios-pill flex items-center gap-1.5 px-2.5 py-1.5 min-w-0 max-w-[144px] overflow-hidden">
          <Compass className="h-3.5 w-3.5 text-[#0A84FF] shrink-0" aria-hidden="true" />
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
            className="w-full min-w-0 truncate bg-transparent text-[11.5px] font-medium text-[#F5F5F7] focus:outline-none cursor-pointer"
          >
            <option value="03" className="bg-[#16161A] text-[#F5F5F7]">Estado BCS (03)</option>
            <optgroup label={isEn ? "Municipalities (5)" : "Municipios (5)"} className="bg-[#16161A] text-[#F5F5F7]">
              <option value="03003" className="bg-[#16161A] text-[#F5F5F7]">La Paz (03003)</option>
              <option value="03008" className="bg-[#16161A] text-[#F5F5F7]">Los Cabos (03008)</option>
              <option value="03009" className="bg-[#16161A] text-[#F5F5F7]">Loreto (03009)</option>
              <option value="03001" className="bg-[#16161A] text-[#F5F5F7]">Comondú (03001)</option>
              <option value="03002" className="bg-[#16161A] text-[#F5F5F7]">Mulegé (03002)</option>
            </optgroup>
            <optgroup label={isEn ? "Strategic Corridors (4)" : "Corredores Estratégicos (4)"} className="bg-[#16161A] text-[#F5F5F7]">
              <option value="CORR-SUR-CABOS" className="bg-[#16161A] text-[#F5F5F7]">Corredor Sur · Los Cabos</option>
              <option value="CORR-CENTRO-LA-PAZ" className="bg-[#16161A] text-[#F5F5F7]">Corredor Centro · La Paz</option>
              <option value="CORR-VALLE-COMONDU" className="bg-[#16161A] text-[#F5F5F7]">Corredor Valle · Comondú</option>
              <option value="CORR-NORTE-LORETO-MULEGE" className="bg-[#16161A] text-[#F5F5F7]">Corredor Norte · Loreto–Mulegé</option>
            </optgroup>
          </select>
        </div>

        {/* 9-City Camera Jump Pill */}
        <div className="ios-pill hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 min-w-0 max-w-[136px] overflow-hidden">
          <MapPin className="h-3.5 w-3.5 text-[#30D158] shrink-0" aria-hidden="true" />
          <select
            aria-label={isEn ? "Fly to 3D City" : "Vuelo rápido a Ciudad 3D"}
            value={activeCitySlug}
            onChange={(e) => onCityJump(e.target.value)}
            className="w-full min-w-0 truncate bg-transparent text-[11.5px] font-medium text-[#F5F5F7] focus:outline-none cursor-pointer"
          >
            <option value="" className="bg-[#16161A] text-[#F5F5F7]">
              {isEn ? "Fly to 3D City..." : "Ciudad 3D..."}
            </option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug} className="bg-[#16161A] text-[#F5F5F7]">
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center: Spatial 3D Engine Segmented Pill + Basemap Selector */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        <div
          role="group"
          aria-label={isEn ? "3D engine switcher" : "Selector de motor 3D"}
          className="ios-segmented flex items-center"
        >
          <button
            type="button"
            onClick={() => onEngineModeChange("deck3d")}
            aria-pressed={engineMode === "deck3d"}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              engineMode === "deck3d"
                ? "ios-segment-active font-semibold"
                : "text-[#EBEBF5]/70 hover:text-[#F5F5F7]"
            }`}
          >
            <Layers className="h-3 w-3" aria-hidden="true" />
            <span>{isEn ? "Analytical 3D" : "3D Analítico"}</span>
          </button>
          <button
            type="button"
            onClick={() => onEngineModeChange("cesium3d")}
            aria-pressed={engineMode === "cesium3d"}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              engineMode === "cesium3d"
                ? "ios-segment-active font-semibold"
                : "text-[#EBEBF5]/70 hover:text-[#F5F5F7]"
            }`}
          >
            <Globe2 className="h-3 w-3" aria-hidden="true" />
            <span>{isEn ? "Cesium Globe" : "Globo Cesium"}</span>
          </button>
        </div>

        {engineMode === "deck3d" && (
          <div className="ios-pill hidden lg:flex items-center px-2.5 py-1.5 shrink-0">
            <select
              aria-label={isEn ? "Basemap style" : "Estilo de mapa base"}
              value={basemapMode}
              onChange={(e) => onBasemapModeChange(e.target.value as BasemapMode)}
              className="bg-transparent text-[11.5px] font-medium text-[#F5F5F7] focus:outline-none cursor-pointer whitespace-nowrap"
            >
              <option value="obsidian" className="bg-[#16161A] text-[#F5F5F7]">
                {isEn ? "Obsidian Map" : "Mapa Obsidian"}
              </option>
              <option value="satellite" className="bg-[#16161A] text-[#F5F5F7]">
                {isEn ? "HD Satellite" : "Satélite HD"}
              </option>
              <option value="terrain" className="bg-[#16161A] text-[#F5F5F7]">
                {isEn ? "3D Relief" : "Relieve 3D"}
              </option>
            </select>
          </div>
        )}
      </div>

      {/* Right: Citizen/Tech Segmented Pill, Participation, Telemetry, Apple Intelligence & Control Center */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Citizen vs Technical Mode Segmented Pill */}
        <div
          role="group"
          aria-label={isEn ? "Interface view mode" : "Modo de interfaz"}
          className="hidden sm:flex ios-segmented items-center"
        >
          <button
            type="button"
            onClick={() => onViewModeChange("citizen")}
            aria-pressed={viewMode === "citizen"}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              viewMode === "citizen"
                ? "bg-[#30D158] text-[#050507] font-semibold shadow-sm"
                : "text-[#EBEBF5]/75 hover:text-[#F5F5F7]"
            }`}
          >
            <Users className="h-3 w-3" aria-hidden="true" />
            <span>{isEn ? "Citizen" : "Ciudadano"}</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("technical")}
            aria-pressed={viewMode === "technical"}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              viewMode === "technical"
                ? "ios-segment-active font-semibold"
                : "text-[#EBEBF5]/75 hover:text-[#F5F5F7]"
            }`}
          >
            <span>{isEn ? "Technical" : "Técnico"}</span>
          </button>
        </div>

        {/* Citizen Participation Pill */}
        <button
          type="button"
          onClick={onToggleParticipation}
          aria-pressed={participationOpen}
          aria-label={isEn ? "Participate in PMDU consultation pins" : "Participación ciudadana PMDU"}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11.5px] font-medium transition-all cursor-pointer whitespace-nowrap ${
            participationOpen
              ? "bg-[#0A84FF] text-white font-semibold shadow-sm"
              : "ios-pill text-[#F5F5F7]"
          }`}
        >
          <MessageSquarePlus className="h-3.5 w-3.5 text-[#64D2FF]" aria-hidden="true" />
          <span className="hidden min-[1420px]:inline">{isEn ? "Participate" : "Participación"}</span>
          <span className="font-mono-num rounded-full bg-white/[0.14] px-1.5 py-0.2 text-[10px] text-[#F5F5F7]">
            {citizenPinsCount}
          </span>
        </button>

        {/* Live Telemetry & SensorThings Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setLivePopoverOpen((o) => !o);
            }}
            aria-expanded={livePopoverOpen}
            aria-label={
              isEn
                ? "Asynchronous telemetry cache and OGC SensorThings v1.1 status"
                : "Estado de telemetría en caché y OGC SensorThings v1.1"
            }
            className={`hidden md:flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono-num text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              liveActive
                ? "ios-pill text-[#F5F5F7]"
                : "bg-white/[0.04] border border-white/10 text-[#EBEBF5]/60 hover:bg-white/[0.08]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass} ${overallStatus === "LIVE" ? "animate-pulse" : ""}`} />
            <span>
              {liveTelemetry?.weather?.la_paz?.temp_c != null
                ? `${Math.round(liveTelemetry.weather.la_paz.temp_c)}°`
                : "BCS"}{" "}
              · {shortStatus}
            </span>
          </button>

          {livePopoverOpen && (
            <div className="ios-glass absolute right-0 top-11 z-50 w-80 rounded-[22px] p-3.5 text-left whitespace-normal">
              <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#64D2FF]/15 text-[#64D2FF]">
                    <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold tracking-tight text-[#F5F5F7]">
                      {isEn ? "Live Telemetry & OGC" : "Telemetría & OGC SensorThings"}
                    </p>
                    <p className="font-mono-num text-[10px] text-[#EBEBF5]/60">
                      {liveTelemetry?.cache_backend || "firestore:bcs-studio"} ·{" "}
                      {liveTelemetry?.ingested_at ? `${liveTelemetry.ingested_at.slice(11, 19)} UTC` : "--"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLivePopoverOpen(false)}
                  aria-label={isEn ? "Close telemetry details" : "Cerrar detalle telemetría"}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-[#EBEBF5]/75 hover:bg-white/[0.15] hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="ios-surface rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
                {[
                  { key: "weather", labelEs: "Clima 5 Municipios", labelEn: "5-Mun Weather", feed: liveTelemetry?.feeds?.weather },
                  { key: "aircraft", labelEs: "Tráfico Aéreo (ADS-B)", labelEn: "Aircraft ADS-B", feed: liveTelemetry?.feeds?.aircraft },
                  { key: "marine", labelEs: "Buques Marítimos (AIS)", labelEn: "Marine Vessels (AIS)", feed: liveTelemetry?.feeds?.marine },
                  { key: "cyclones", labelEs: "Ciclones Pacífico (NHC)", labelEn: "Pacific Cyclones", feed: liveTelemetry?.feeds?.cyclones },
                ].map(({ key, labelEs, labelEn, feed }) => {
                  const st = feed?.status || "OFFLINE";
                  const badgeCls =
                    st === "LIVE"
                      ? "bg-[#30D158]/20 text-[#30D158]"
                      : st === "CACHED"
                        ? "bg-[#FF9F0A]/20 text-[#FF9F0A]"
                        : st === "STALE"
                          ? "bg-[#FF9F0A]/25 text-[#FFD60A]"
                          : "bg-[#FF453A]/20 text-[#FF453A]";
                  return (
                    <div key={key} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-medium text-[#F5F5F7]">{isEn ? labelEn : labelEs}</span>
                        <span className={`rounded-full px-2 py-0.5 font-mono-num text-[9.5px] font-semibold ${badgeCls}`}>
                          {feed ? (isEn ? feed.freshness_en : feed.freshness_es) : "OFFLINE"}
                        </span>
                      </div>
                      {feed && (
                        <p className="mt-0.5 text-[10px] text-[#EBEBF5]/60">
                          {isEn ? "Items" : "Registros"}: <span className="font-mono-num text-[#F5F5F7]">{feed.count}</span>
                          {feed.notice ? ` · ${feed.notice}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onToggleLive}
                  className="rounded-full bg-[#0A84FF]/20 px-3 py-1.5 text-[10.5px] font-semibold text-[#64D2FF] hover:bg-[#0A84FF]/30 cursor-pointer"
                >
                  {liveActive
                    ? isEn ? "Hide 3D Sensors" : "Ocultar Sensores 3D"
                    : isEn ? "Show 3D Sensors" : "Mostrar Sensores 3D"}
                </button>
                <a
                  href="/FROST-Server/v1.1/Things"
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono-num text-[10px] text-[#0A84FF] hover:underline"
                >
                  /FROST-Server ({sensorCount})
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Apple Intelligence AI Strategist Pill */}
        <button
          type="button"
          onClick={onToggleChat}
          aria-pressed={chatOpen}
          aria-label={isEn ? "AI Strategist Territorial Assistant" : "Estratega IA Territorial"}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
            chatOpen
              ? "bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/30"
              : "ios-ai-pill text-[#F5F5F7]"
          }`}
        >
          <Bot className="h-3.5 w-3.5 text-[#64D2FF]" aria-hidden="true" />
          <span className="hidden sm:inline">{isEn ? "AI Strategist" : "Estratega IA"}</span>
        </button>

        {/* Control Center / Settings & Governance Popover Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setLivePopoverOpen(false);
              setSettingsOpen((o) => !o);
            }}
            aria-expanded={settingsOpen}
            aria-label={isEn ? "Settings and governance" : "Ajustes y gobernanza"}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all cursor-pointer ${
              settingsOpen
                ? "bg-[#0A84FF] text-white"
                : "ios-pill text-[#F5F5F7]"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {settingsOpen && (
            <div className="ios-glass absolute right-0 top-11 z-50 w-76 rounded-[22px] p-3.5 text-left whitespace-normal space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                <p className="text-[12px] font-semibold tracking-tight text-[#F5F5F7]">
                  {isEn ? "Control Center" : "Centro de Control"}
                </p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label={isEn ? "Close settings" : "Cerrar ajustes"}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-[#EBEBF5]/75 hover:bg-white/[0.15] hover:text-white cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Mobile/Tablet Viewport Parity Controls */}
              <div className="xl:hidden ios-surface rounded-2xl p-2.5 space-y-2.5">
                <div className="sm:hidden flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#EBEBF5]/80">{isEn ? "Interface" : "Interfaz"}</span>
                  <div className="ios-segmented flex items-center">
                    <button
                      type="button"
                      onClick={() => onViewModeChange("citizen")}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        viewMode === "citizen" ? "bg-[#30D158] text-[#050507] font-semibold" : "text-[#EBEBF5]/75"
                      }`}
                    >
                      {isEn ? "Citizen" : "Ciudadano"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewModeChange("technical")}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        viewMode === "technical" ? "ios-segment-active font-semibold" : "text-[#EBEBF5]/75"
                      }`}
                    >
                      {isEn ? "Tech" : "Técnico"}
                    </button>
                  </div>
                </div>

                <div className="md:hidden flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#EBEBF5]/80">{isEn ? "3D Engine" : "Motor 3D"}</span>
                  <div className="ios-segmented flex items-center">
                    <button
                      type="button"
                      onClick={() => onEngineModeChange("deck3d")}
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        engineMode === "deck3d" ? "ios-segment-active font-semibold" : "text-[#EBEBF5]/75"
                      }`}
                    >
                      3D Analítico
                    </button>
                    <button
                      type="button"
                      onClick={() => onEngineModeChange("cesium3d")}
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        engineMode === "cesium3d" ? "ios-segment-active font-semibold" : "text-[#EBEBF5]/75"
                      }`}
                    >
                      Cesium
                    </button>
                  </div>
                </div>

                {engineMode === "deck3d" && (
                  <div className="lg:hidden flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#EBEBF5]/80">{isEn ? "Basemap" : "Mapa Base"}</span>
                    <select
                      aria-label={isEn ? "Basemap style (mobile)" : "Estilo de mapa base (móvil)"}
                      value={basemapMode}
                      onChange={(e) => onBasemapModeChange(e.target.value as BasemapMode)}
                      className="ios-input rounded-xl px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                    >
                      <option value="obsidian" className="bg-[#16161A] text-[#F5F5F7]">
                        {isEn ? "Obsidian Map" : "Mapa Obsidian"}
                      </option>
                      <option value="satellite" className="bg-[#16161A] text-[#F5F5F7]">
                        {isEn ? "HD Satellite" : "Satélite HD"}
                      </option>
                      <option value="terrain" className="bg-[#16161A] text-[#F5F5F7]">
                        {isEn ? "3D Relief" : "Relieve 3D"}
                      </option>
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="mobile-city-jump" className="block text-[10.5px] text-[#EBEBF5]/70 mb-1">
                    {isEn ? "Fly to 3D City" : "Vuelo a Ciudad 3D"}
                  </label>
                  <select
                    id="mobile-city-jump"
                    value={activeCitySlug}
                    onChange={(e) => {
                      onCityJump(e.target.value);
                      setSettingsOpen(false);
                    }}
                    className="ios-input w-full rounded-xl px-2.5 py-1.5 text-[11px] font-medium cursor-pointer"
                  >
                    <option value="" className="bg-[#16161A] text-[#F5F5F7]">
                      {isEn ? "Select 3D city..." : "Elegir ciudad 3D..."}
                    </option>
                    {cities.map((c) => (
                      <option key={c.slug} value={c.slug} className="bg-[#16161A] text-[#F5F5F7]">
                        {c.name} ({c.buildings_count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Accessibility, Language & Institutional Links */}
              <div className="ios-surface rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <p className="text-[11.5px] font-medium text-[#F5F5F7]">
                      {isEn ? "Colorblind Palette (CVD)" : "Paleta Inclusiva (CVD)"}
                    </p>
                    <p className="text-[10px] text-[#EBEBF5]/55">Okabe-Ito / Viridis</p>
                  </div>
                  <IosSwitch
                    checked={colorblindSafe}
                    onChange={onToggleColorblindSafe}
                    ariaLabel={isEn ? "CVD colorblind-safe Okabe-Ito palette" : "CVD paleta inclusiva para daltonismo Okabe-Ito"}
                    accent="blue"
                  />
                </div>

                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[11.5px] font-medium text-[#F5F5F7]">
                    {isEn ? "Language" : "Idioma"}
                  </span>
                  <div
                    role="group"
                    aria-label={isEn ? "Language switcher" : "Selector de idioma"}
                    className="ios-segmented flex items-center"
                  >
                    <button
                      type="button"
                      onClick={() => onLanguageChange("es")}
                      aria-pressed={language === "es"}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-all cursor-pointer ${
                        language === "es"
                          ? "ios-segment-active"
                          : "text-[#EBEBF5]/70 hover:text-[#F5F5F7]"
                      }`}
                    >
                      ES
                    </button>
                    <button
                      type="button"
                      onClick={() => onLanguageChange("en")}
                      aria-pressed={language === "en"}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-all cursor-pointer ${
                        language === "en"
                          ? "ios-segment-active"
                          : "text-[#EBEBF5]/70 hover:text-[#F5F5F7]"
                      }`}
                    >
                      EN
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    onOpenArchitecture();
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-[11.5px] font-medium text-[#F5F5F7]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#30D158]" aria-hidden="true" />
                    <span>{isEn ? "Governance & Stack" : "Gobernanza & Stack"}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-[#EBEBF5]/45" aria-hidden="true" />
                </button>

                <a
                  href="https://panel.bcs2050.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-white/[0.06] transition-colors"
                >
                  <span className="flex items-center gap-2 text-[11.5px] font-medium text-[#F5F5F7]">
                    <ExternalLink className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
                    <span>{isEn ? "Executive Panel (Web)" : "Panel Ejecutivo BCS2050"}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-[#EBEBF5]/45" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
