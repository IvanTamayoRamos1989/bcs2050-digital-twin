import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { TwinAPI } from "./api/client";
import { AnalyticsMap3D } from "./components/AnalyticsMap3D";
import { ChallengeLayerDock } from "./components/ChallengeLayerDock";
import { CitizenScorecardPanel } from "./components/CitizenScorecardPanel";
import { ParticipationPanel } from "./components/ParticipationPanel";
import { PhaseTelemetryPanel } from "./components/PhaseTelemetryPanel";
import { TopCommandBar } from "./components/TopCommandBar";
import { WebGLErrorBoundary } from "./components/WebGLErrorBoundary";

const ArchitectureModal = lazy(() =>
  import("./components/ArchitectureModal").then((m) => ({ default: m.ArchitectureModal })),
);
const CesiumGlobe3D = lazy(() =>
  import("./components/CesiumGlobe3D").then((m) => ({ default: m.CesiumGlobe3D })),
);
const StrategistChatDrawer = lazy(() =>
  import("./components/StrategistChatDrawer").then((m) => ({ default: m.StrategistChatDrawer })),
);
import type {
  ActivePhysicsOverlay,
  AerialTour,
  AgebMetricKey,
  AretianPhase,
  BasemapMode,
  CameraPreset,
  ChallengeId,
  CitizenPin,
  ClientConfigResponse,
  CorridorPreset,
  EngineMode,
  GoalGapResponse,
  InspectResponse,
  LayerVisibility,
  LiveTelemetrySummary,
  OgcPhysicsJobStatus,
  OgcPhysicsProcessId,
  OverviewResponse,
  ParticipationCategoryMeta,
  PmduConsultationPeriod,
  RecommendationsResponse,
  SensorThingRecord,
  SimulationResponse,
  ViewMode,
} from "./types/twin";

const INITIAL_LAYERS: LayerVisibility = {
  buildings3d: true,
  agebs: true,
  zoning: false,
  aquifers: false,
  tandeo: false,
  powerGrid: true,
  services: false,
  transit: false,
  poer: false,
  anps: false,
  corridorArcs: true,
  plannedProjects: true,
  liveTelemetry: true,
  citizenPins: true,
};

const isSmallViewport = () => typeof window !== "undefined" && window.innerWidth < 1024;

export const App: React.FC = () => {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetrySummary | null>(null);
  const [sensorThings, setSensorThings] = useState<SensorThingRecord[]>([]);
  const [phase, setPhase] = useState<AretianPhase>("diagnostics");
  const [viewMode, setViewMode] = useState<ViewMode>("technical");
  const [colorblindSafe, setColorblindSafe] = useState<boolean>(true);
  const [scopeId, setScopeId] = useState<string>("03");
  const [activeCitySlug, setActiveCitySlug] = useState<string>("");
  const [engineMode, setEngineMode] = useState<EngineMode>("deck3d");
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("obsidian");

  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(isSmallViewport);
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(isSmallViewport);
  const [archOpen, setArchOpen] = useState(false);
  const [archMounted, setArchMounted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [language, setLanguage] = useState<"es" | "en">("en");
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [reduceTransparency, setReduceTransparency] = useState<boolean>(false);
  const [largeText, setLargeText] = useState<boolean>(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [clientConfig, setClientConfig] = useState<ClientConfigResponse>({
    google_maps_api_key: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim(),
    cesium_ion_token: (import.meta.env.VITE_CESIUM_ION_TOKEN || "").trim(),
    maptiler_key: (import.meta.env.VITE_MAPTILER_KEY || "").trim(),
  });

  // Moderated Citizen Participation PMDU State
  const [participationOpen, setParticipationOpen] = useState(false);
  const [pinPlacementMode, setPinPlacementMode] = useState(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{ lon: number; lat: number } | null>(null);
  const [citizenPins, setCitizenPins] = useState<CitizenPin[]>([]);
  const [sessionSubmittedPins, setSessionSubmittedPins] = useState<CitizenPin[]>([]);
  const [pmduPeriods, setPmduPeriods] = useState<PmduConsultationPeriod[]>([]);
  const [participationCategories, setParticipationCategories] = useState<ParticipationCategoryMeta[]>([]);

  const [activeChallenge, setActiveChallenge] = useState<ChallengeId>("urban_form_15m");
  const [activeMetric, setActiveMetric] = useState<AgebMetricKey>("city_science_index");
  const [layers, setLayers] = useState<LayerVisibility>(INITIAL_LAYERS);
  const [extrusionScale, setExtrusionScale] = useState<number>(1.0);
  const [agebs3dMode, setAgebs3dMode] = useState<boolean>(false);

  const [cameraTarget, setCameraTarget] = useState<CameraPreset | null>(null);
  const [inspection, setInspection] = useState<InspectResponse | null>(null);

  // Phase 2: Goals
  const [goalTargets, setGoalTargets] = useState({
    target_city15_score: 88,
    target_infill_share_pct: 68,
    target_ptar_reuse_pct: 72,
    target_rooftop_solar_pct: 38,
    target_suds_coverage_pct: 85,
  });
  const [goalGap, setGoalGap] = useState<GoalGapResponse | null>(null);

  // Phase 3: Scenarios
  const [scenarioName, setScenarioName] = useState<string>("COMPACT_SUSTAINABLE_2050");
  const [targetYear, setTargetYear] = useState<number>(2050);
  const [customLevers, setCustomLevers] = useState<Record<string, number>>({});
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);

  // Phase 4: Recommendations
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);

  // Aerial Fly-through Tours & AEC/BIM Viewport State
  const [tours, setTours] = useState<AerialTour[]>([]);
  const [corridors, setCorridors] = useState<Record<string, CorridorPreset>>({});
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [viewportBbox, setViewportBbox] = useState<[number, number, number, number] | null>(null);
  const [viewportZoom, setViewportZoom] = useState<number>(6.4);

  // Coupled Physics Workers (OGC API - Processes -> Cloud Run Jobs)
  const [physicsJobStatus, setPhysicsJobStatus] = useState<OgcPhysicsJobStatus | null>(null);
  const [physicsOverlay, setPhysicsOverlay] = useState<ActivePhysicsOverlay | null>(null);
  const physicsRunTokenRef = useRef<number>(0);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("hig-reduce-transparency", reduceTransparency);
  }, [reduceTransparency]);

  useEffect(() => {
    document.documentElement.classList.toggle("hig-text-large", largeText);
  }, [largeText]);

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setStatusToast(null);
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const refreshParticipationPins = useCallback(() => {
    TwinAPI.getParticipationPins()
      .then((res) => {
        setCitizenPins(res.pins || []);
        setPmduPeriods(res.pmdu_periods || []);
        setParticipationCategories(res.categories || []);
      })
      .catch(() => {});
  }, []);

  const handleRunPhysicsProcess = useCallback(
    async (processId: OgcPhysicsProcessId, customInputs?: Record<string, unknown>) => {
      const token = ++physicsRunTokenRef.current;
      const defaultCity =
        activeCitySlug && ["cabo_san_lucas", "san_jose_del_cabo", "la_paz", "loreto"].includes(activeCitySlug)
          ? activeCitySlug
          : scopeId === "03008"
            ? "cabo_san_lucas"
            : scopeId === "03009"
              ? "loreto"
              : "la_paz";

      const defaultInputs: Record<string, unknown> =
        processId === "arroyo_flood_sfincs"
          ? {
              city_slug: activeCitySlug || (scopeId === "03008" ? "cabo_san_lucas" : defaultCity),
              return_period_yr: 100,
              suds_coverage_pct: customLevers.suds_coverage_pct ?? simulation?.levers.suds_coverage_pct ?? 20,
              slr_m: 0.25,
            }
          : processId === "network_isochrone_r5py"
            ? { city_slug: defaultCity, walk_speed_kmh: 4.5, max_minutes: 15, include_transit: true }
            : {
                pilot_id: scopeId === "03008" ? "los_cabos_desal" : "la_paz_tandeo",
                ptar_reuse_pct: customLevers.ptar_reuse_target_pct ?? simulation?.levers.ptar_reuse_target_pct ?? 65,
                desal_added_lps: customLevers.desalination_added_lps ?? simulation?.levers.desalination_added_lps ?? 150,
                leak_reduction_pct: 14,
              };

      const inputs = customInputs || defaultInputs;
      setPhysicsJobStatus({ jobID: "dispatching...", processID: processId, status: "accepted" });
      try {
        const launch = await TwinAPI.executeOgcProcessAsync(processId, inputs);
        if (physicsRunTokenRef.current !== token) return;
        setPhysicsJobStatus(launch);

        for (let attempt = 0; attempt < 50; attempt += 1) {
          await new Promise((r) => window.setTimeout(r, 1200));
          if (physicsRunTokenRef.current !== token) return;
          const st = await TwinAPI.getOgcJobStatus(launch.jobID);
          if (physicsRunTokenRef.current !== token) return;
          setPhysicsJobStatus(st);
          if (st.status === "successful") {
            const res = await TwinAPI.getOgcJobResults(launch.jobID);
            if (physicsRunTokenRef.current !== token) return;
            setPhysicsOverlay({ jobId: launch.jobID, processId, result: res });
            if (res.camera) setCameraTarget({ ...res.camera });
            return;
          }
          if (st.status === "failed") {
            return;
          }
        }
        setPhysicsJobStatus((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                error:
                  language === "en"
                    ? "Timed out polling Cloud Run Job."
                    : "Tiempo de espera agotado consultando Cloud Run Job.",
              }
            : prev,
        );
      } catch (err) {
        if (physicsRunTokenRef.current !== token) return;
        setPhysicsJobStatus({
          jobID: "error",
          processID: processId,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [activeCitySlug, customLevers, scopeId, simulation],
  );

  // Initial Overview Load, Participation Pins & Live Telemetry Polling
  useEffect(() => {
    TwinAPI.getOverview()
      .then((res) => {
        setOverview(res);
      })
      .catch(() => {});
    TwinAPI.getClientConfig()
      .then((cfg) => {
        setClientConfig((prev) => ({
          google_maps_api_key: cfg.google_maps_api_key || prev.google_maps_api_key,
          cesium_ion_token: cfg.cesium_ion_token || prev.cesium_ion_token,
          maptiler_key: cfg.maptiler_key || prev.maptiler_key,
        }));
      })
      .catch(() => {});
    TwinAPI.getTours()
      .then((res) => {
        setTours(res.tours || []);
        setCorridors(res.corridors || {});
      })
      .catch(() => {});
    refreshParticipationPins();
    const fetchLive = () => {
      TwinAPI.getLiveTelemetry().then(setLiveTelemetry).catch(() => {});
      TwinAPI.getSensorThings()
        .then((res) => setSensorThings(res.value || []))
        .catch(() => {});
    };
    fetchLive();
    const timer = window.setInterval(fetchLive, 60000);
    return () => window.clearInterval(timer);
  }, [refreshParticipationPins]);

  // Refresh Goal Gap when scope or goalTargets change
  useEffect(() => {
    if (phase !== "goals") return;
    const t = window.setTimeout(() => {
      TwinAPI.computeGoalGap({ scope_id: scopeId, ...goalTargets })
        .then(setGoalGap)
        .catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [phase, scopeId, goalTargets]);

  // Refresh Scenario Simulation when scope, scenario, year, or levers change
  useEffect(() => {
    const t = window.setTimeout(() => {
      TwinAPI.simulate({
        scope_id: scopeId,
        scenario_name: scenarioName,
        target_year: targetYear,
        custom_levers: Object.keys(customLevers).length > 0 ? customLevers : null,
      })
        .then(setSimulation)
        .catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [scopeId, scenarioName, targetYear, customLevers]);

  // Refresh Recommendations when scope changes
  useEffect(() => {
    TwinAPI.getRecommendations(scopeId)
      .then(setRecommendations)
      .catch(() => {});
  }, [scopeId]);

  const handleScopeChange = useCallback(
    (newScope: string, cam?: CameraPreset) => {
      setActiveTourId(null);
      setScopeId(newScope);
      setActiveCitySlug("");
      if (cam) {
        setCameraTarget({ ...cam });
      } else if (overview) {
        const corMap: Record<string, CameraPreset> = {
          "CORR-SUR-CABOS": overview.municipalities["03008"]?.camera,
          "CORR-CENTRO-LA-PAZ": overview.municipalities["03003"]?.camera,
          "CORR-VALLE-COMONDU": overview.municipalities["03001"]?.camera,
          "CORR-NORTE-LORETO-MULEGE": overview.municipalities["03009"]?.camera,
        };
        if (corMap[newScope]) setCameraTarget({ ...corMap[newScope] });
      }
    },
    [overview],
  );

  const handleCityJump = useCallback(
    (citySlug: string) => {
      setActiveTourId(null);
      setActiveCitySlug(citySlug);
      if (!citySlug || !overview?.cities[citySlug]) return;
      const city = overview.cities[citySlug];
      setScopeId(city.municipality_code);
      setCameraTarget({ ...city.camera });
      showToast(`${city.name} · ${city.buildings_count.toLocaleString()} ${language === "en" ? "3D buildings" : "edificios 3D"}`);
    },
    [language, overview, showToast],
  );

  const handleToggleLayer = useCallback((k: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const handleInspectLocation = useCallback(
    (lon: number, lat: number, buildingPk?: number | null, agebCvegeo?: string | null) => {
      TwinAPI.inspect({ lon, lat, building_pk: buildingPk, ageb_cvegeo: agebCvegeo })
        .then((res) => {
          setInspection(res);
          setRightCollapsed(false);
          if (typeof window !== "undefined" && window.innerWidth < 768) {
            setLeftCollapsed(true);
          }
          if (viewMode === "technical" && phase !== "diagnostics") setPhase("diagnostics");
        })
        .catch(() => {});
    },
    [phase, viewMode],
  );

  const handleSelectScenario = useCallback((name: string) => {
    setScenarioName(name);
    setCustomLevers({});
  }, []);

  const handleApplyOptimalLevers = useCallback(
    (levers: Record<string, number>) => {
      setScenarioName("COMPACT_SUSTAINABLE_2050");
      setCustomLevers(levers);
      setPhase("scenarios");
      showToast(language === "en" ? "Optimal 2050 levers loaded" : "Palancas óptimas 2050 cargadas");
    },
    [language, showToast],
  );

  const handleStartTour = useCallback(
    (tourId: string) => {
      const target = tours.find((t) => t.id === tourId);
      setEngineMode("deck3d");
      if (target?.scope_id) {
        setScopeId(target.scope_id);
      }
      setActiveTourId(tourId);
    },
    [tours],
  );

  const handleMapClickForPin = useCallback((lon: number, lat: number) => {
    setPendingPinCoords({ lon, lat });
    setPinPlacementMode(false);
    setParticipationOpen(true);
  }, []);

  const handleToggleLeft = useCallback(() => {
    setLeftCollapsed((c) => {
      const next = !c;
      if (!next && typeof window !== "undefined" && window.innerWidth < 768) {
        setRightCollapsed(true);
      }
      return next;
    });
  }, []);

  const wasCompactRef = useRef<boolean>(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    const onResize = () => {
      const compact = window.innerWidth < 768;
      if (compact && !wasCompactRef.current) {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      }
      wasCompactRef.current = compact;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleToggleRight = useCallback(() => {
    setRightCollapsed((c) => {
      const next = !c;
      if (!next && typeof window !== "undefined" && window.innerWidth < 768) {
        setLeftCollapsed(true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        handleToggleLeft();
      } else if (e.key === "]") {
        e.preventDefault();
        handleToggleRight();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleToggleLeft, handleToggleRight]);

  const selectedAgebId =
    inspection?.ageb && typeof inspection.ageb.cvegeo_ageb === "string"
      ? inspection.ageb.cvegeo_ageb
      : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--hig-bg)] text-[var(--hig-ink)] select-none">
      {/* WCAG 2.1 AA Skip Navigation Link */}
      <a href="#main-content" className="skip-link">
        {language === "en" ? "Skip to 3D map content" : "Saltar al mapa 3D principal"}
      </a>

      {/* Edge-to-Edge Full-Bleed Dual-Engine 3D Spatial Canvas */}
      <main id="main-content" tabIndex={-1} className="absolute inset-0 h-full w-full">
        {engineMode === "deck3d" ? (
          <WebGLErrorBoundary
            fallbackTitle={
              language === "en"
                ? "Analytical 3D Viewer (MapLibre + deck.gl)"
                : "Visor 3D Analítico (MapLibre + deck.gl)"
            }
          >
            <AnalyticsMap3D
              cameraTarget={cameraTarget}
              basemapMode={basemapMode}
              theme={theme}
              maptilerKey={clientConfig.maptiler_key}
              activeMetric={activeMetric}
              colorblindSafe={colorblindSafe}
              language={language}
              layers={layers}
              extrusionScale={extrusionScale}
              agebs3dMode={agebs3dMode}
              phase={phase}
              simulation={simulation}
              corridorArcs={overview?.corridor_arcs || []}
              liveTelemetry={liveTelemetry}
              sensorThings={sensorThings}
              physicsOverlay={physicsOverlay}
              citizenPins={citizenPins}
              pendingPinCoords={pendingPinCoords}
              pinPlacementMode={pinPlacementMode}
              onMapClickForPin={handleMapClickForPin}
              onCancelPinPlacement={() => setPinPlacementMode(false)}
              selectedAgebId={selectedAgebId}
              tours={tours}
              activeTourId={activeTourId}
              onStartTour={handleStartTour}
              onStopTour={() => setActiveTourId(null)}
              onViewportChange={(bbox, z) => {
                setViewportBbox(bbox);
                setViewportZoom(z);
              }}
              onOpenExportModal={() => {
                setArchMounted(true);
                setArchOpen(true);
              }}
              onInspectLocation={handleInspectLocation}
              onQuickJumpCity={handleCityJump}
            />
          </WebGLErrorBoundary>
        ) : (
          <WebGLErrorBoundary fallbackTitle={language === "en" ? "CesiumJS 3D Globe" : "Globo 3D CesiumJS"}>
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-[var(--hig-bg)] text-xs font-semibold text-[var(--hig-accent)]">
                  {language === "en" ? "Loading 3D CesiumJS Globe..." : "Cargando Globo 3D CesiumJS..."}
                </div>
              }
            >
              <CesiumGlobe3D
                cameraTarget={cameraTarget}
                activeCitySlug={activeCitySlug || "la_paz"}
                activeMetric={activeMetric}
                extrusionScale={extrusionScale}
                agebs3dMode={agebs3dMode}
                layers={layers}
                colorblindSafe={colorblindSafe}
                language={language}
                googleMapsApiKey={clientConfig.google_maps_api_key}
                cesiumIonToken={clientConfig.cesium_ion_token}
                onInspectLocation={handleInspectLocation}
              />
            </Suspense>
          </WebGLErrorBoundary>
        )}
      </main>

      {/* Floating 3-Island Apple HIG Liquid Glass Toolbar */}
      <TopCommandBar
        overview={overview}
        tours={tours}
        liveTelemetry={liveTelemetry}
        sensorThings={sensorThings}
        liveActive={layers.liveTelemetry}
        onToggleLive={() => handleToggleLayer("liveTelemetry")}
        phase={phase}
        onPhaseChange={setPhase}
        scopeId={scopeId}
        onScopeChange={handleScopeChange}
        activeCitySlug={activeCitySlug}
        onCityJump={handleCityJump}
        onStartTour={handleStartTour}
        engineMode={engineMode}
        onEngineModeChange={setEngineMode}
        basemapMode={basemapMode}
        onBasemapModeChange={(b) => {
          setBasemapMode(b);
          const labels: Record<BasemapMode, string> = {
            obsidian:
              language === "en"
                ? theme === "light" ? "Light Map" : "Dark Map"
                : theme === "light" ? "Mapa base: Claro" : "Mapa base: Oscuro",
            satellite: language === "en" ? "HD Satellite" : "Mapa base: Satélite HD",
            terrain: language === "en" ? "3D Relief" : "Mapa base: Relieve 3D",
          };
          showToast(labels[b]);
        }}
        viewMode={viewMode}
        onViewModeChange={(m) => {
          setViewMode(m);
          setRightCollapsed(false);
          if (typeof window !== "undefined" && window.innerWidth < 768) {
            setLeftCollapsed(true);
          }
          showToast(
            m === "citizen"
              ? language === "en" ? "Citizen Mode" : "Modo Ciudadano"
              : language === "en" ? "Technical Mode" : "Modo Técnico",
          );
        }}
        leftCollapsed={leftCollapsed}
        onToggleLeft={handleToggleLeft}
        rightCollapsed={rightCollapsed}
        onToggleRight={handleToggleRight}
        colorblindSafe={colorblindSafe}
        onToggleColorblindSafe={() => setColorblindSafe((v) => !v)}
        theme={theme}
        onThemeChange={setTheme}
        reduceTransparency={reduceTransparency}
        onToggleReduceTransparency={() => setReduceTransparency((v) => !v)}
        largeText={largeText}
        onToggleLargeText={() => setLargeText((v) => !v)}
        participationOpen={participationOpen}
        onToggleParticipation={() => setParticipationOpen((v) => !v)}
        citizenPinsCount={citizenPins.length}
        onOpenArchitecture={() => {
          setArchMounted(true);
          setArchOpen(true);
        }}
        chatOpen={chatOpen}
        onToggleChat={() => {
          setChatMounted(true);
          setChatOpen((o) => !o);
        }}
        language={language}
        onLanguageChange={setLanguage}
      />

      {/* Passive HIG Status Feedback Pill */}
      {statusToast && (
        <div
          role="status"
          aria-live="polite"
          className="hig-glass-toolbar pointer-events-none fixed left-1/2 top-[72px] z-30 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[11.5px] font-medium text-[var(--hig-ink)] whitespace-nowrap"
        >
          {statusToast}
        </div>
      )}

      {/* Floating Left Apple Maps Sidebar */}
      <ChallengeLayerDock
          collapsed={leftCollapsed}
          onToggleCollapse={handleToggleLeft}
          activeChallenge={activeChallenge}
          onSelectChallenge={setActiveChallenge}
          activeMetric={activeMetric}
          onSelectMetric={setActiveMetric}
          colorblindSafe={colorblindSafe}
          onToggleColorblindSafe={() => setColorblindSafe((v) => !v)}
          language={language}
          layers={layers}
          onToggleLayer={handleToggleLayer}
          extrusionScale={extrusionScale}
          onExtrusionScaleChange={setExtrusionScale}
          agebs3dMode={agebs3dMode}
          onToggleAgebs3d={() => setAgebs3dMode((v) => !v)}
        />

        {/* Floating Right Panel: Citizen Plain-Language Scorecard vs 4-Phase Technical Simulator */}
        {viewMode === "citizen" ? (
          <CitizenScorecardPanel
            collapsed={rightCollapsed}
            onToggleCollapse={handleToggleRight}
            scopeId={scopeId}
            overview={overview}
            inspection={inspection}
            liveTelemetry={liveTelemetry}
            language={language}
            onOpenParticipation={() => setParticipationOpen(true)}
            onSwitchToTechnical={() => setViewMode("technical")}
          />
        ) : (
          <PhaseTelemetryPanel
            collapsed={rightCollapsed}
            onToggleCollapse={handleToggleRight}
            phase={phase}
            onPhaseChange={setPhase}
            language={language}
            scopeId={scopeId}
            overview={overview}
            inspection={inspection}
            onClearInspection={() => setInspection(null)}
            goalTargets={goalTargets}
            onGoalTargetChange={(k, v) => setGoalTargets((prev) => ({ ...prev, [k]: v }))}
            goalGap={goalGap}
            onApplyOptimalLevers={handleApplyOptimalLevers}
            scenarioName={scenarioName}
            onSelectScenario={handleSelectScenario}
            targetYear={targetYear}
            onTargetYearChange={setTargetYear}
            customLevers={customLevers}
            onLeverChange={(k, v) => setCustomLevers((prev) => ({ ...prev, [k]: v }))}
            simulation={simulation}
            recommendations={recommendations}
            physicsOverlay={physicsOverlay}
            physicsJobStatus={physicsJobStatus}
            onRunPhysicsProcess={handleRunPhysicsProcess}
            onClearPhysicsOverlay={() => {
              physicsRunTokenRef.current += 1;
              setPhysicsOverlay(null);
              setPhysicsJobStatus(null);
            }}
            onFlyTo={(cam) => setCameraTarget({ ...cam })}
          />
        )}

      {/* Moderated Citizen Participation PMDU Dialog */}
      <ParticipationPanel
        open={participationOpen}
        onClose={() => setParticipationOpen(false)}
        language={language}
        pins={citizenPins}
        sessionSubmittedPins={sessionSubmittedPins}
        pmduPeriods={pmduPeriods}
        categories={participationCategories}
        pinPlacementMode={pinPlacementMode}
        onTogglePinPlacementMode={() => setPinPlacementMode((v) => !v)}
        pendingPinCoords={pendingPinCoords}
        onSetManualCoords={setPendingPinCoords}
        onPinSubmitted={(pin) => setSessionSubmittedPins((prev) => [pin, ...prev])}
        onPinsUpdated={refreshParticipationPins}
        onFlyTo={(cam) => setCameraTarget({ ...cam })}
      />

      {/* Slide-over AI Territorial Strategist */}
      {chatMounted && (
        <Suspense fallback={null}>
          <StrategistChatDrawer
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            scopeId={scopeId}
            scenarioName={scenarioName}
            language={language}
            onFlyTo={(cam) => setCameraTarget({ ...cam })}
          />
        </Suspense>
      )}

      {/* Executive Governance, Architecture & Commercial Stack Modal */}
      {archMounted && (
        <Suspense fallback={null}>
          <ArchitectureModal
            open={archOpen}
            onClose={() => setArchOpen(false)}
            language={language}
            currentBbox={viewportBbox}
            currentZoom={viewportZoom}
            corridors={corridors}
            onStartTour={handleStartTour}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
