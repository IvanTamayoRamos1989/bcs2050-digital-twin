import React, { useCallback, useEffect, useState } from "react";
import { TwinAPI } from "./api/client";
import { AnalyticsMap3D } from "./components/AnalyticsMap3D";
import { ArchitectureModal } from "./components/ArchitectureModal";
import { CesiumGlobe3D } from "./components/CesiumGlobe3D";
import { ChallengeLayerDock } from "./components/ChallengeLayerDock";
import { PhaseTelemetryPanel } from "./components/PhaseTelemetryPanel";
import { StrategistChatDrawer } from "./components/StrategistChatDrawer";
import { TopCommandBar } from "./components/TopCommandBar";
import { WebGLErrorBoundary } from "./components/WebGLErrorBoundary";
import type {
  AerialTour,
  AgebMetricKey,
  AretianPhase,
  BasemapMode,
  CameraPreset,
  ChallengeId,
  CorridorPreset,
  EngineMode,
  GoalGapResponse,
  InspectResponse,
  LayerVisibility,
  LiveTelemetrySummary,
  OverviewResponse,
  RecommendationsResponse,
  SimulationResponse,
} from "./types/twin";

const INITIAL_LAYERS: LayerVisibility = {
  buildings3d: true,
  agebs: true,
  zoning: true,
  aquifers: false,
  tandeo: true,
  powerGrid: true,
  services: false,
  transit: true,
  poer: false,
  anps: false,
  corridorArcs: true,
  plannedProjects: true,
  liveTelemetry: true,
};

export const App: React.FC = () => {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetrySummary | null>(null);
  const [phase, setPhase] = useState<AretianPhase>("diagnostics");
  const [scopeId, setScopeId] = useState<string>("03");
  const [activeCitySlug, setActiveCitySlug] = useState<string>("");
  const [engineMode, setEngineMode] = useState<EngineMode>("deck3d");
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("obsidian");

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const [activeChallenge, setActiveChallenge] = useState<ChallengeId>("urban_form_15m");
  const [activeMetric, setActiveMetric] = useState<AgebMetricKey>("city_science_index");
  const [layers, setLayers] = useState<LayerVisibility>(INITIAL_LAYERS);
  const [extrusionScale, setExtrusionScale] = useState<number>(1.3);
  const [agebs3dMode, setAgebs3dMode] = useState<boolean>(true);

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

  // Initial Overview Load & Live Telemetry Polling
  useEffect(() => {
    TwinAPI.getOverview()
      .then((res) => {
        setOverview(res);
      })
      .catch(() => {});
    TwinAPI.getTours()
      .then((res) => {
        setTours(res.tours || []);
        setCorridors(res.corridors || {});
      })
      .catch(() => {});
    const fetchLive = () => {
      TwinAPI.getLiveTelemetry().then(setLiveTelemetry).catch(() => {});
    };
    fetchLive();
    const timer = window.setInterval(fetchLive, 45000);
    return () => window.clearInterval(timer);
  }, []);

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
    },
    [overview],
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
          if (phase !== "diagnostics") setPhase("diagnostics");
        })
        .catch(() => {});
    },
    [phase],
  );

  const handleSelectScenario = useCallback((name: string) => {
    setScenarioName(name);
    setCustomLevers({});
  }, []);

  const handleApplyOptimalLevers = useCallback((levers: Record<string, number>) => {
    setScenarioName("COMPACT_SUSTAINABLE_2050");
    setCustomLevers(levers);
    setPhase("scenarios");
  }, []);

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

  const selectedAgebId =
    inspection?.ageb && typeof inspection.ageb.cvegeo_ageb === "string"
      ? inspection.ageb.cvegeo_ageb
      : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050811] select-none">
      {/* Top Executive Navigation */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
        <TopCommandBar
          overview={overview}
          liveTelemetry={liveTelemetry}
          liveActive={layers.liveTelemetry}
          onToggleLive={() => handleToggleLayer("liveTelemetry")}
          phase={phase}
          onPhaseChange={setPhase}
          scopeId={scopeId}
          onScopeChange={handleScopeChange}
          activeCitySlug={activeCitySlug}
          onCityJump={handleCityJump}
          engineMode={engineMode}
          onEngineModeChange={setEngineMode}
          basemapMode={basemapMode}
          onBasemapModeChange={setBasemapMode}
          onOpenArchitecture={() => setArchOpen(true)}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((o) => !o)}
        />
      </div>

      {/* Full-Bleed Dual-Engine 3D Viewport */}
      <main className="h-full w-full">
        {engineMode === "deck3d" ? (
          <WebGLErrorBoundary fallbackTitle="Visor 3D Analítico (MapLibre + deck.gl)">
            <AnalyticsMap3D
              cameraTarget={cameraTarget}
              basemapMode={basemapMode}
              activeMetric={activeMetric}
              layers={layers}
              extrusionScale={extrusionScale}
              agebs3dMode={agebs3dMode}
              phase={phase}
              simulation={simulation}
              corridorArcs={overview?.corridor_arcs || []}
              liveTelemetry={liveTelemetry}
              selectedAgebId={selectedAgebId}
              tours={tours}
              activeTourId={activeTourId}
              onStartTour={handleStartTour}
              onStopTour={() => setActiveTourId(null)}
              onViewportChange={(bbox, z) => {
                setViewportBbox(bbox);
                setViewportZoom(z);
              }}
              onOpenExportModal={() => setArchOpen(true)}
              onInspectLocation={handleInspectLocation}
              onQuickJumpCity={handleCityJump}
            />
          </WebGLErrorBoundary>
        ) : (
          <WebGLErrorBoundary fallbackTitle="Globo 3D CesiumJS">
            <CesiumGlobe3D
              cameraTarget={cameraTarget}
              activeCitySlug={activeCitySlug || "la_paz"}
              activeMetric={activeMetric}
              extrusionScale={extrusionScale}
              onInspectLocation={handleInspectLocation}
            />
          </WebGLErrorBoundary>
        )}
      </main>

      {/* Floating Left Challenge & Layer Dock */}
      <ChallengeLayerDock
        collapsed={leftCollapsed}
        onToggleCollapse={() => setLeftCollapsed((c) => !c)}
        activeChallenge={activeChallenge}
        onSelectChallenge={setActiveChallenge}
        activeMetric={activeMetric}
        onSelectMetric={setActiveMetric}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        extrusionScale={extrusionScale}
        onExtrusionScaleChange={setExtrusionScale}
        agebs3dMode={agebs3dMode}
        onToggleAgebs3d={() => setAgebs3dMode((v) => !v)}
      />

      {/* Floating Right 4-Phase Telemetry & Simulator Panel */}
      <PhaseTelemetryPanel
        collapsed={rightCollapsed}
        onToggleCollapse={() => setRightCollapsed((c) => !c)}
        phase={phase}
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
        onFlyTo={(cam) => setCameraTarget({ ...cam })}
      />

      {/* Slide-over AI Territorial Strategist */}
      <StrategistChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        scopeId={scopeId}
        scenarioName={scenarioName}
        onFlyTo={(cam) => setCameraTarget({ ...cam })}
      />

      {/* Executive Architecture & Commercial Stack Modal */}
      <ArchitectureModal
        open={archOpen}
        onClose={() => setArchOpen(false)}
        currentBbox={viewportBbox}
        currentZoom={viewportZoom}
        corridors={corridors}
        onStartTour={handleStartTour}
      />
    </div>
  );
};

export default App;
