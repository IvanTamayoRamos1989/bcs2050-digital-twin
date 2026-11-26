import React, { useEffect, useRef, useState } from "react";
import {
  Anchor,
  Bot,
  ChevronRight,
  CloudSun,
  ExternalLink,
  Globe2,
  Layers,
  MessageSquarePlus,
  Moon,
  PanelLeft,
  PanelRight,
  Plane,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
  X,
} from "lucide-react";
import type {
  AerialTour,
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
import { SpatialSearchField } from "./SpatialSearchField";

interface Props {
  overview: OverviewResponse | null;
  tours?: AerialTour[];
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
  onStartTour?: (tourId: string) => void;
  engineMode: EngineMode;
  onEngineModeChange: (m: EngineMode) => void;
  basemapMode: BasemapMode;
  onBasemapModeChange: (b: BasemapMode) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  leftCollapsed: boolean;
  onToggleLeft: () => void;
  rightCollapsed: boolean;
  onToggleRight: () => void;
  colorblindSafe: boolean;
  onToggleColorblindSafe: () => void;
  theme: "dark" | "light";
  onThemeChange: (t: "dark" | "light") => void;
  reduceTransparency: boolean;
  onToggleReduceTransparency: () => void;
  largeText: boolean;
  onToggleLargeText: () => void;
  participationOpen: boolean;
  onToggleParticipation: () => void;
  citizenPinsCount: number;
  onOpenArchitecture: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  language: "es" | "en";
  onLanguageChange: (lang: "es" | "en") => void;
  onFlyTo?: (cam: CameraPreset) => void;
  onBeforeOpenPopover?: () => void;
  onTrackTarget?: (lon: number, lat: number, elevM: number | null, label: string) => void;
}

export const TopCommandBar: React.FC<Props> = ({
  overview,
  tours = [],
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
  onStartTour,
  engineMode,
  onEngineModeChange,
  basemapMode,
  onBasemapModeChange,
  viewMode,
  onViewModeChange,
  leftCollapsed,
  onToggleLeft,
  rightCollapsed,
  onToggleRight,
  colorblindSafe,
  onToggleColorblindSafe,
  theme,
  onThemeChange,
  reduceTransparency,
  onToggleReduceTransparency,
  largeText,
  onToggleLargeText,
  participationOpen,
  onToggleParticipation,
  citizenPinsCount,
  onOpenArchitecture,
  chatOpen,
  onToggleChat,
  language,
  onLanguageChange,
  onFlyTo,
  onBeforeOpenPopover,
  onTrackTarget,
}) => {
  void _phase;
  void _onPhaseChange;

  const [livePopoverOpen, setLivePopoverOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const liveContainerRef = useRef<HTMLDivElement | null>(null);
  const settingsContainerRef = useRef<HTMLDivElement | null>(null);

  const totalBuildings = overview?.state.buildings_3d_count ?? 396823;
  const isEn = language === "en";
  const weatherFeed = liveTelemetry?.feeds?.weather;
  const airList = liveTelemetry?.aircraft?.aircraft ?? [];
  const vesselList = liveTelemetry?.marine?.vessels ?? [];
  const airCount = liveTelemetry?.aircraft?.count ?? 0;
  const marineCount = liveTelemetry?.marine?.count ?? 0;
  const overallStatus = liveTelemetry?.overall_status || weatherFeed?.status || "CACHED";
  const statusDotClass =
    overallStatus === "LIVE"
      ? "bg-[#30D158]"
      : overallStatus === "OFFLINE"
        ? "bg-[#FF453A]"
        : "bg-[#FF9F0A]";
  const sensorCount = sensorThings.length || 14;

  useEffect(() => {
    if (!livePopoverOpen && !settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLivePopoverOpen(false);
        setSettingsOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (livePopoverOpen && liveContainerRef.current && !liveContainerRef.current.contains(target)) {
        setLivePopoverOpen(false);
      }
      if (settingsOpen && settingsContainerRef.current && !settingsContainerRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [livePopoverOpen, settingsOpen]);

  const basemapOptions: { id: BasemapMode; labelEs: string; labelEn: string }[] = [
    { id: "obsidian", labelEs: theme === "light" ? "Claro" : "Oscuro", labelEn: theme === "light" ? "Light" : "Dark" },
    { id: "satellite", labelEs: "Satélite", labelEn: "Satellite" },
    { id: "terrain", labelEs: "Topo", labelEn: "Topo" },
  ];

  return (
    <header className="pointer-events-none absolute top-3.5 max-sm:left-2.5 max-sm:right-2.5 sm:left-4 sm:right-4 z-30 flex items-center justify-between gap-2 whitespace-nowrap">
      {/* Island 1 (Leading): Sidebar Toggle, Anodized Squircle & Spotlight Search */}
      <div className="pointer-events-auto hig-glass-toolbar flex items-center gap-1.5 rounded-full p-1.5 min-w-0">
        <button
          type="button"
          onClick={onToggleLeft}
          aria-pressed={!leftCollapsed}
          aria-label={isEn ? "Toggle explorer sidebar" : "Mostrar u ocultar explorador"}
          title={isEn ? "Explorer Sidebar ([)" : "Explorador ([)"}
          className={`hig-lift flex h-8 w-8 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
            !leftCollapsed
              ? "bg-[var(--hig-accent)]/20 text-[var(--hig-accent)]"
              : "ios-pill text-[var(--hig-ink-2)]"
          }`}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="hidden sm:flex items-center gap-1.5 px-1 shrink-0">
          <div
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[var(--hig-seg-active)] text-[9.5px] font-semibold tracking-tight text-[var(--hig-ink)] ring-1 ring-[var(--hig-border)] shadow-[inset_0_1px_0_var(--hig-specular),0_1px_3px_rgba(0,0,0,0.08)]"
          >
            BCS
          </div>
          <span
            title={`${totalBuildings.toLocaleString()} ${isEn ? "3D buildings live" : "edificios 3D en vivo"}`}
            className={`h-1.5 w-1.5 rounded-full ${statusDotClass} ${overallStatus === "LIVE" ? "animate-pulse" : ""}`}
          />
        </div>

        <SpatialSearchField
          overview={overview}
          tours={tours}
          scopeId={scopeId}
          activeCitySlug={activeCitySlug}
          language={language}
          onScopeChange={onScopeChange}
          onCityJump={onCityJump}
          onStartTour={(tourId) => onStartTour?.(tourId)}
        />
      </div>

      {/* Island 2 (Center): 3D Engine & Basemap Segmented Controls */}
      <div className="pointer-events-auto hidden md:flex items-center gap-1.5 hig-glass-toolbar rounded-full p-1.5 shrink-0">
        <div
          role="group"
          aria-label={isEn ? "3D engine switcher" : "Selector de motor 3D"}
          className="ios-segmented flex items-center"
        >
          <button
            type="button"
            onClick={() => onEngineModeChange("deck3d")}
            aria-pressed={engineMode === "deck3d"}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              engineMode === "deck3d"
                ? "ios-segment-active font-semibold"
                : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
            }`}
          >
            <Layers className="h-3 w-3" aria-hidden="true" />
            <span>{isEn ? "Analytical 3D" : "3D Analítico"}</span>
          </button>
          <button
            type="button"
            onClick={() => onEngineModeChange("cesium3d")}
            aria-pressed={engineMode === "cesium3d"}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              engineMode === "cesium3d"
                ? "ios-segment-active font-semibold"
                : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
            }`}
          >
            <Globe2 className="h-3 w-3" aria-hidden="true" />
            <span>{isEn ? "Globe" : "Globo"}</span>
          </button>
        </div>

        {engineMode === "deck3d" && (
          <>
            <span className="hidden lg:block h-4 w-px bg-[var(--hig-divider)]" />
            <div
              role="group"
              aria-label={isEn ? "Basemap style" : "Estilo de mapa base"}
              className="hidden lg:flex ios-segmented items-center"
            >
              {basemapOptions.map((bm) => {
                const active = basemapMode === bm.id;
                return (
                  <button
                    key={bm.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onBasemapModeChange(bm.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? "ios-segment-active font-semibold"
                        : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
                    }`}
                  >
                    {isEn ? bm.labelEn : bm.labelEs}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Island 3 (Trailing): Mode, Participation, Telemetry, Single Primary AI Action, Inspector Toggle & Control Center */}
      <div className="pointer-events-auto hig-glass-toolbar flex items-center gap-1.5 rounded-full p-1.5 shrink-0">
        {/* Citizen vs Technical Mode Segmented Pill */}
        <div
          role="group"
          aria-label={isEn ? "Interface view mode" : "Modo de interfaz"}
          className="hidden xl:flex ios-segmented items-center"
        >
          <button
            type="button"
            onClick={() => onViewModeChange("citizen")}
            aria-pressed={viewMode === "citizen"}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              viewMode === "citizen"
                ? "bg-[#30D158] text-[#050507] font-semibold shadow-sm"
                : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
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
                : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
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
          title={isEn ? "PMDU Citizen Participation Pins" : "Pines de Participación Ciudadana PMDU"}
          className={`hig-lift flex h-8 max-sm:h-11 items-center gap-1.5 rounded-full px-2.5 max-sm:px-3 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
            participationOpen
              ? "bg-[var(--hig-accent)] text-white font-semibold"
              : "ios-pill text-[var(--hig-ink)]"
          }`}
        >
          <MessageSquarePlus className="h-3.5 w-3.5 text-[var(--hig-cyan)]" aria-hidden="true" />
          <span className="hidden xl:inline">{isEn ? "Participate" : "Participación"}</span>
          <span className="font-mono-num rounded-full bg-[var(--hig-pill-bg)] px-1.5 py-0.2 text-[10px] font-semibold">
            {citizenPinsCount}
          </span>
        </button>

        {/* Live Telemetry & SensorThings Pill */}
        <div ref={liveContainerRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              if (!livePopoverOpen) onBeforeOpenPopover?.();
              setLivePopoverOpen((o) => !o);
            }}
            aria-expanded={livePopoverOpen}
            aria-label={
              isEn
                ? "Live weather, flights, ships and OGC SensorThings telemetry"
                : "Estado de telemetría en vivo, vuelos, buques y OGC SensorThings"
            }
            title={isEn ? "Live Weather, Air & Marine Traffic" : "Clima, Tráfico Aéreo y Marítimo en Vivo"}
            className={`hig-lift hidden md:flex h-8 items-center gap-1.5 rounded-full px-2.5 font-mono-num text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
              liveActive
                ? "ios-pill text-[var(--hig-ink)]"
                : "ios-pill opacity-60 text-[var(--hig-ink-2)]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass} ${overallStatus === "LIVE" ? "animate-pulse" : ""}`} />
            <CloudSun className="h-3.5 w-3.5 text-[#FF9F0A]" aria-hidden="true" />
            <span>
              {liveTelemetry?.weather?.la_paz?.temp_c != null
                ? `${Math.round(liveTelemetry.weather.la_paz.temp_c)}°`
                : "BCS"}
            </span>
            {airCount > 0 && (
              <span className="hidden xl:inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#D97706]">
                <Plane className="h-2.5 w-2.5" aria-hidden="true" />
                {airCount}
              </span>
            )}
            {marineCount > 0 && (
              <span className="hidden xl:inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--hig-accent)]">
                <Anchor className="h-2.5 w-2.5" aria-hidden="true" />
                {marineCount}
              </span>
            )}
          </button>

          {livePopoverOpen && (
            <div className="hig-glass-popover absolute right-0 top-12 z-50 w-84 max-w-[calc(100vw-24px)] rounded-[22px] p-3.5 text-left whitespace-normal">
              <div className="mb-2.5 flex items-center justify-between border-b border-[var(--hig-divider)] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--hig-accent)]/15 text-[var(--hig-cyan)]">
                    <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold tracking-tight text-[var(--hig-ink)]">
                      {isEn ? "Live Telemetry & Traffic" : "Telemetría y Tráfico en Vivo"}
                    </p>
                    <p className="font-mono-num text-[10px] text-[var(--hig-ink-3)]">
                      {liveTelemetry?.ingested_at ? `${liveTelemetry.ingested_at.slice(11, 19)} UTC` : "OGC SensorThings"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLivePopoverOpen(false)}
                  aria-label={isEn ? "Close telemetry details" : "Cerrar detalle telemetría"}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hig-content-group rounded-2xl divide-y divide-[var(--hig-divider)] overflow-hidden">
                {[
                  { key: "weather", labelEs: "Clima 5 Municipios", labelEn: "5-Mun Weather", feed: liveTelemetry?.feeds?.weather },
                  { key: "aircraft", labelEs: "Tráfico Aéreo (ADS-B)", labelEn: "Aircraft ADS-B", feed: liveTelemetry?.feeds?.aircraft },
                  { key: "marine", labelEs: "Buques Marítimos (AIS)", labelEn: "Marine Vessels (AIS)", feed: liveTelemetry?.feeds?.marine },
                  { key: "cyclones", labelEs: "Ciclones Pacífico (NHC)", labelEn: "Pacific Cyclones", feed: liveTelemetry?.feeds?.cyclones },
                ].map(({ key, labelEs, labelEn, feed }) => {
                  const st = feed?.status || "OFFLINE";
                  const badgeCls =
                    st === "LIVE"
                      ? "bg-[#30D158]/20 text-[var(--hig-green)]"
                      : st === "CACHED" || st === "STALE"
                        ? "bg-[#FF9F0A]/20 text-[var(--hig-amber)]"
                        : "bg-[#FF453A]/20 text-[var(--hig-red)]";
                  return (
                    <div key={key} className="px-3 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[var(--hig-ink)]">{isEn ? labelEn : labelEs}</span>
                        <span className={`rounded-full px-2 py-0.5 font-mono-num text-[9.5px] font-semibold ${badgeCls}`}>
                          {feed ? (isEn ? feed.freshness_en : feed.freshness_es) : "OFFLINE"}
                        </span>
                      </div>
                      {feed && (
                        <p className="mt-0.5 text-[10px] text-[var(--hig-ink-2)]">
                          {isEn ? "Items" : "Registros"}: <span className="font-mono-num text-[var(--hig-ink)]">{feed.count}</span>
                          {feed.notice ? ` · ${feed.notice}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {(airList.length > 0 || vesselList.length > 0) && onFlyTo && (
                <div className="mt-2.5 hig-content-group rounded-2xl p-2 space-y-1 max-h-40 overflow-y-auto twin-scroll">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--hig-ink-3)]">
                    {isEn ? "Click to Track on 3D Map" : "Clic para Seguir en Mapa 3D"}
                  </p>
                  {airList.slice(0, 5).map((a) => (
                    <button
                      key={`air-${a.icao24}`}
                      type="button"
                      onClick={() => {
                        const cam = { lon: a.lon, lat: a.lat, zoom: 9.8, pitch: 52, bearing: -12 };
                        onFlyTo(cam);
                        onTrackTarget?.(a.lon, a.lat, Math.round(a.altitude_m || 0), a.callsign || a.icao24);
                        setLivePopoverOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-[10.5px] hover:bg-[var(--hig-pill-hover)] cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Plane className="h-3 w-3 text-[#D97706] shrink-0" />
                        <span className="font-semibold text-[var(--hig-ink)] truncate">{a.callsign || a.icao24}</span>
                      </span>
                      <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)] shrink-0">
                        {Math.round(a.altitude_m || 0)} m · {a.speed_kt ?? 0} kt
                      </span>
                    </button>
                  ))}
                  {vesselList.slice(0, 5).map((v) => (
                    <button
                      key={`ves-${v.mmsi}`}
                      type="button"
                      onClick={() => {
                        const cam = { lon: v.lon, lat: v.lat, zoom: 10.2, pitch: 48, bearing: -12 };
                        onFlyTo(cam);
                        onTrackTarget?.(v.lon, v.lat, 0, v.name || v.mmsi);
                        setLivePopoverOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-[10.5px] hover:bg-[var(--hig-pill-hover)] cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Anchor className="h-3 w-3 text-[var(--hig-accent)] shrink-0" />
                        <span className="font-semibold text-[var(--hig-ink)] truncate">{v.name || v.mmsi}</span>
                      </span>
                      <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)] shrink-0">
                        {v.sog ?? 0} kt · {v.type || "Vessel"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onToggleLive}
                  className="rounded-full bg-[var(--hig-accent)]/18 px-3 py-1.5 text-[10.5px] font-semibold text-[var(--hig-accent)] hover:bg-[var(--hig-accent)]/28 cursor-pointer"
                >
                  {liveActive
                    ? isEn ? "Hide 3D Sensors" : "Ocultar Sensores 3D"
                    : isEn ? "Show 3D Sensors" : "Mostrar Sensores 3D"}
                </button>
                <a
                  href="/FROST-Server/v1.1/Things"
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono-num text-[10px] text-[var(--hig-accent)] hover:underline"
                >
                  OGC Sensors ({sensorCount})
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Single Primary Trailing Action: Apple Intelligence AI Strategist */}
        <button
          type="button"
          onClick={onToggleChat}
          aria-pressed={chatOpen}
          aria-label={isEn ? "AI Strategist Territorial Assistant (/)" : "Estratega IA Territorial (/)"}
          title={isEn ? "AI Strategist (/)" : "Estratega IA (/)"}
          className={`hig-lift flex h-8 max-sm:h-11 max-sm:w-11 sm:px-3 items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
            chatOpen
              ? "bg-[var(--hig-accent)] text-white shadow-md shadow-[var(--hig-accent)]/30"
              : "ios-ai-pill text-[var(--hig-ink)]"
          }`}
        >
          <Bot className="h-3.5 w-3.5 text-[var(--hig-cyan)]" aria-hidden="true" />
          <span className="hidden sm:inline">{isEn ? "AI Strategist" : "Estratega IA"}</span>
        </button>

        {/* Inspector Toggle */}
        <button
          type="button"
          onClick={onToggleRight}
          aria-pressed={!rightCollapsed}
          aria-label={isEn ? "Toggle telemetry inspector" : "Mostrar u ocultar inspector"}
          title={isEn ? "Telemetry Inspector (])" : "Inspector (])"}
          className={`hig-lift flex h-8 w-8 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
            !rightCollapsed
              ? "bg-[var(--hig-accent)]/20 text-[var(--hig-accent)]"
              : "ios-pill text-[var(--hig-ink-2)]"
          }`}
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Control Center / Preferences & Governance */}
        <div ref={settingsContainerRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setLivePopoverOpen(false);
              if (!settingsOpen) onBeforeOpenPopover?.();
              setSettingsOpen((o) => !o);
            }}
            aria-expanded={settingsOpen}
            aria-label={isEn ? "Settings, 3D modes and governance" : "Ajustes, modos 3D y gobernanza"}
            title={isEn ? "Control Center" : "Centro de Control"}
            className={`hig-lift flex h-8 w-8 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-full transition-all cursor-pointer ${
              settingsOpen
                ? "bg-[var(--hig-accent)] text-white"
                : "ios-pill text-[var(--hig-ink)]"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {settingsOpen && (
            <div className="hig-glass-popover absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-24px)] rounded-[22px] p-3.5 text-left whitespace-normal space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--hig-divider)] pb-2">
                <p className="text-[12.5px] font-semibold tracking-tight text-[var(--hig-ink)]">
                  {isEn ? "Control Center" : "Centro de Control"}
                </p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label={isEn ? "Close settings" : "Cerrar ajustes"}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Mobile / Tablet Responsive Controls */}
              <div className="xl:hidden hig-content-group rounded-2xl p-2.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--hig-ink-2)]">{isEn ? "Interface" : "Interfaz"}</span>
                  <div className="ios-segmented flex items-center">
                    <button
                      type="button"
                      onClick={() => onViewModeChange("citizen")}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        viewMode === "citizen" ? "bg-[#30D158] text-[#050507] font-semibold" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      {isEn ? "Citizen" : "Ciudadano"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewModeChange("technical")}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        viewMode === "technical" ? "ios-segment-active font-semibold" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      {isEn ? "Tech" : "Técnico"}
                    </button>
                  </div>
                </div>

                <div className="md:hidden flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--hig-ink-2)]">{isEn ? "3D Engine" : "Motor 3D"}</span>
                  <div className="ios-segmented flex items-center">
                    <button
                      type="button"
                      onClick={() => onEngineModeChange("deck3d")}
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        engineMode === "deck3d" ? "ios-segment-active font-semibold" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      {isEn ? "Analytical 3D" : "3D Analítico"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEngineModeChange("cesium3d")}
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                        engineMode === "cesium3d" ? "ios-segment-active font-semibold" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      {isEn ? "Globe" : "Globo"}
                    </button>
                  </div>
                </div>

                {engineMode === "deck3d" && (
                  <div className="lg:hidden flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--hig-ink-2)]">{isEn ? "Basemap" : "Mapa Base"}</span>
                    <div className="ios-segmented flex items-center">
                      {basemapOptions.map((bm) => (
                        <button
                          key={bm.id}
                          type="button"
                          onClick={() => onBasemapModeChange(bm.id)}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer ${
                            basemapMode === bm.id ? "ios-segment-active font-semibold" : "text-[var(--hig-ink-2)]"
                          }`}
                        >
                          {isEn ? bm.labelEn : bm.labelEs}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Appearance & HIG Accessibility */}
              <div className="hig-content-group rounded-2xl divide-y divide-[var(--hig-divider)] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[11.5px] font-medium text-[var(--hig-ink)]">
                    {isEn ? "Appearance" : "Apariencia"}
                  </span>
                  <div
                    role="group"
                    aria-label={isEn ? "Appearance mode" : "Modo de apariencia"}
                    className="ios-segmented flex items-center"
                  >
                    <button
                      type="button"
                      onClick={() => onThemeChange("light")}
                      aria-pressed={theme === "light"}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold cursor-pointer ${
                        theme === "light" ? "ios-segment-active" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      <Sun className="h-3 w-3" aria-hidden="true" />
                      <span>{isEn ? "Light" : "Claro"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onThemeChange("dark")}
                      aria-pressed={theme === "dark"}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold cursor-pointer ${
                        theme === "dark" ? "ios-segment-active" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      <Moon className="h-3 w-3" aria-hidden="true" />
                      <span>{isEn ? "Dark" : "Oscuro"}</span>
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between px-3 py-2.5 cursor-pointer">
                  <div>
                    <p className="text-[11.5px] font-medium text-[var(--hig-ink)]">
                      {isEn ? "Reduce Transparency" : "Reducir Transparencia"}
                    </p>
                    <p className="text-[10px] text-[var(--hig-ink-3)]">
                      {isEn ? "Solid legible surfaces" : "Superficies sólidas de alto contraste"}
                    </p>
                  </div>
                  <IosSwitch
                    checked={reduceTransparency}
                    onChange={onToggleReduceTransparency}
                    ariaLabel={isEn ? "Reduce Transparency" : "Reducir Transparencia"}
                    accent="blue"
                  />
                </label>

                <label className="flex items-center justify-between px-3 py-2.5 cursor-pointer">
                  <div>
                    <p className="text-[11.5px] font-medium text-[var(--hig-ink)]">
                      {isEn ? "Colorblind Palette (CVD)" : "Paleta Inclusiva (CVD)"}
                    </p>
                    <p className="text-[10px] text-[var(--hig-ink-3)]">Okabe-Ito / Viridis</p>
                  </div>
                  <IosSwitch
                    checked={colorblindSafe}
                    onChange={onToggleColorblindSafe}
                    ariaLabel={isEn ? "CVD colorblind-safe Okabe-Ito palette" : "CVD paleta inclusiva para daltonismo Okabe-Ito"}
                    accent="blue"
                  />
                </label>

                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[11.5px] font-medium text-[var(--hig-ink)]">
                    {isEn ? "Text Size (Dynamic)" : "Tamaño de Texto"}
                  </span>
                  <div
                    role="group"
                    aria-label={isEn ? "Dynamic text size" : "Tamaño dinámico de texto"}
                    className="ios-segmented flex items-center"
                  >
                    <button
                      type="button"
                      onClick={() => { if (largeText) onToggleLargeText(); }}
                      aria-pressed={!largeText}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold cursor-pointer ${
                        !largeText ? "ios-segment-active" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (!largeText) onToggleLargeText(); }}
                      aria-pressed={largeText}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer ${
                        largeText ? "ios-segment-active" : "text-[var(--hig-ink-2)]"
                      }`}
                    >
                      A+
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[11.5px] font-medium text-[var(--hig-ink)]">
                    {isEn ? "Language" : "Idioma"}
                  </span>
                  <div
                    role="group"
                    aria-label={isEn ? "Language switcher" : "Selector de idioma"}
                    className="ios-segmented flex items-center"
                  >
                    <button
                      type="button"
                      onClick={() => onLanguageChange("en")}
                      aria-pressed={language === "en"}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-all cursor-pointer ${
                        language === "en"
                          ? "ios-segment-active"
                          : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
                      }`}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => onLanguageChange("es")}
                      aria-pressed={language === "es"}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-all cursor-pointer ${
                        language === "es"
                          ? "ios-segment-active"
                          : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
                      }`}
                    >
                      ES
                    </button>
                  </div>
                </div>
              </div>

              {/* Institutional Governance & Executive Panel */}
              <div className="hig-content-group rounded-2xl divide-y divide-[var(--hig-divider)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    onOpenArchitecture();
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--hig-pill-bg)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--hig-ink)]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--hig-green)]" aria-hidden="true" />
                    <span>{isEn ? "Governance & Stack" : "Gobernanza & Stack"}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--hig-ink-3)]" aria-hidden="true" />
                </button>

                <a
                  href="https://panel.bcs2050.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-[var(--hig-pill-bg)] transition-colors"
                >
                  <span className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--hig-ink)]">
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--hig-accent)]" aria-hidden="true" />
                    <span>{isEn ? "Executive Panel (Web)" : "Panel Ejecutivo BCS2050"}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--hig-ink-3)]" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
