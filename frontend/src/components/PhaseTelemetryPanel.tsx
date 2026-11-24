import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Droplets,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Route,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  Waves,
  Zap,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ActivePhysicsOverlay,
  AretianPhase,
  CameraPreset,
  GoalGapResponse,
  InspectResponse,
  OgcPhysicsJobStatus,
  OgcPhysicsProcessId,
  OverviewResponse,
  RecommendationsResponse,
  SimulationResponse,
} from "../types/twin";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  phase: AretianPhase;
  scopeId: string;
  overview: OverviewResponse | null;
  inspection: InspectResponse | null;
  onClearInspection: () => void;
  // Phase 2: Goals
  goalTargets: {
    target_city15_score: number;
    target_infill_share_pct: number;
    target_ptar_reuse_pct: number;
    target_rooftop_solar_pct: number;
    target_suds_coverage_pct: number;
  };
  onGoalTargetChange: (k: keyof Props["goalTargets"], val: number) => void;
  goalGap: GoalGapResponse | null;
  onApplyOptimalLevers: (levers: Record<string, number>) => void;
  // Phase 3: Scenarios
  scenarioName: string;
  onSelectScenario: (name: string) => void;
  targetYear: number;
  onTargetYearChange: (yr: number) => void;
  customLevers: Record<string, number>;
  onLeverChange: (k: string, val: number) => void;
  simulation: SimulationResponse | null;
  // Phase 4: Recommendations
  recommendations: RecommendationsResponse | null;
  physicsOverlay?: ActivePhysicsOverlay | null;
  physicsJobStatus?: OgcPhysicsJobStatus | null;
  onRunPhysicsProcess?: (processId: OgcPhysicsProcessId) => void;
  onClearPhysicsOverlay?: () => void;
  onFlyTo: (cam: CameraPreset) => void;
}

const SCENARIO_PRESETS = [
  { id: "COMPACT_SUSTAINABLE_2050", label: "Compacta 15-Min", badge: "Óptima" },
  { id: "BAU_TENDENCIAL", label: "BAU Tendencial", badge: "Riesgo" },
  { id: "HIGH_GROWTH_TOURISM_STRESS", label: "Auge Turístico +65%", badge: "Estrés" },
  { id: "CLIMATE_SHOCK_IPCC_SSP585", label: "Choque IPCC SSP5-8.5", badge: "Clima" },
];

const YEARS = [2025, 2027, 2031, 2035, 2040, 2050];

export const PhaseTelemetryPanel: React.FC<Props> = ({
  collapsed,
  onToggleCollapse,
  phase,
  scopeId,
  overview,
  inspection,
  onClearInspection,
  goalTargets,
  onGoalTargetChange,
  goalGap,
  onApplyOptimalLevers,
  scenarioName,
  onSelectScenario,
  targetYear,
  onTargetYearChange,
  customLevers,
  onLeverChange,
  simulation,
  recommendations,
  physicsOverlay,
  physicsJobStatus,
  onRunPhysicsProcess,
  onClearPhysicsOverlay,
  onFlyTo,
}) => {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="glass-panel pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-slate-800/90 cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span>Telemetría & Simulador</span>
      </button>
    );
  }

  const mun = overview?.municipalities[scopeId];
  const st = overview?.state;
  const officialPop2020 = mun
    ? (mun.population_inegi_2020_official ?? Math.round(mun.population_2020))
    : (st?.population_inegi_2020_official ?? 798447);
  const aquifersOfficialCount = st?.aquifers_bcs_official_count ?? 39;
  const aquifersNoAvailCount = st?.aquifers_bcs_no_availability_count ?? 22;
  const aquifersStrictDeficit = st?.aquifers_strict_deficit_count ?? 21;
  const activeStats = mun
    ? {
        title: `${mun.name} (${mun.municipality_code})`,
        popOfficial2020: officialPop2020,
        pop: mun.population_2025,
        buildings: mun.buildings_3d_count,
        infill: mun.infill_homes_potential,
        solarMw: mun.solar_mw,
        surgeBldgs: mun.surge_exposed_buildings,
        csi: mun.city_science_index,
        c15: mun.city15_score,
        frac: mun.fractality_score,
        harm: mun.harmony_score,
        ent: mun.landuse_entropy_score,
        carry: mun.carrying_resilience_score,
        socio: mun.socioecon_score,
      }
    : {
        title: st?.name || "Baja California Sur",
        popOfficial2020: officialPop2020,
        pop: st?.population_2025 ?? 955463,
        buildings: st?.buildings_3d_count ?? 396823,
        infill: st?.infill_homes_potential ?? 776913,
        solarMw: st?.rooftop_solar_mw ?? 3896.1,
        surgeBldgs: st?.surge_exposed_buildings ?? 24209,
        csi: st?.city_science_index ?? 66.6,
        c15: st?.city15_score ?? 81.0,
        frac: st?.fractality_score ?? 69.4,
        harm: st?.harmony_score ?? 79.6,
        ent: st?.landuse_entropy_score ?? 26.8,
        carry: st?.carrying_resilience_score ?? 71.0,
        socio: st?.socioecon_score ?? 72.0,
      };

  const radarData = [
    { pillar: "15-Min", score: activeStats.c15 },
    { pillar: "Fractalidad", score: activeStats.frac },
    { pillar: "Armonía", score: activeStats.harm },
    { pillar: "Mix Usos", score: activeStats.ent },
    { pillar: "Cap. Carga", score: activeStats.carry },
    { pillar: "Vitalidad", score: activeStats.socio },
  ];

  const handleExportReport = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      scope: activeStats.title,
      city_science_diagnostics: activeStats,
      simulation_2050: simulation,
      recommendations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BCS2050_DigitalTwin_${scopeId}_${scenarioName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      aria-label="Panel técnico de telemetría, simulador 2050 y modelos físicos"
      className="glass-panel pointer-events-auto absolute right-3 top-3 z-20 flex max-h-[calc(100%-64px)] w-[calc(100vw-24px)] sm:w-[392px] flex-col rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-2.5">
        <div>
          <p className="font-mono-num text-[10px] uppercase tracking-widest text-emerald-400">
            {phase === "diagnostics" && "Fase 01 · Diagnóstico City Science"}
            {phase === "goals" && "Fase 02 · Fijación de Metas 2050"}
            {phase === "scenarios" && "Fase 03 · Laboratorio Contrafactual"}
            {phase === "recommendations" && "Fase 04 · Recomendaciones & Lentes"}
          </p>
          <h2 className="text-sm font-bold text-white">{activeStats.title}</h2>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Colapsar panel derecho"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="twin-scroll overflow-y-auto p-3.5 space-y-3.5">
        {/* PHASE 1: DIAGNOSTICS */}
        {phase === "diagnostics" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/70">
                <p className="text-[10px] uppercase text-slate-400">Índice City Science</p>
                <p className="font-mono-num mt-0.5 text-xl font-bold text-emerald-400">
                  {activeStats.csi}
                  <span className="text-xs font-normal text-slate-400"> / 100</span>
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/70">
                <p className="text-[10px] uppercase text-slate-400">Ciudad 15-Minutos</p>
                <p className="font-mono-num mt-0.5 text-xl font-bold text-sky-400">
                  {activeStats.c15}
                  <span className="text-xs font-normal text-slate-400"> pts</span>
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/70">
                <p className="text-[10px] uppercase text-slate-400">Edificios 3D / Población</p>
                <p className="font-mono-num mt-0.5 text-sm font-bold text-white">
                  {activeStats.buildings.toLocaleString()}
                </p>
                <p className="font-mono-num text-[10px] text-emerald-300">
                  {activeStats.popOfficial2020.toLocaleString()} hab · INEGI 2020 (OFICIAL)
                </p>
                <p className="font-mono-num text-[10px] text-sky-300/90">
                  {activeStats.pop.toLocaleString()} hab · Proy. 2025 (MODELADO)
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/70">
                <p className="text-[10px] uppercase text-slate-400">Capacidad Infill 2050</p>
                <p className="font-mono-num mt-0.5 text-sm font-bold text-emerald-300">
                  +{activeStats.infill.toLocaleString()} viv
                </p>
                <p className="font-mono-num text-[10px] text-slate-400">
                  Solar techos: {activeStats.solarMw.toLocaleString()} MW
                </p>
              </div>
            </div>

            {/* Reconciled Official CONAGUA Aquifer Balance Pill */}
            <div className="rounded-lg bg-slate-900/75 px-2.5 py-2 ring-1 ring-cyan-500/30 flex items-center justify-between gap-2 text-[10.5px]">
              <div>
                <span className="font-mono-num uppercase text-[9.5px] text-cyan-300 font-semibold">
                  Acuíferos BCS (CONAGUA DOF 2023 · OFICIAL)
                </span>
                <p className="text-slate-200 font-mono-num mt-0.5">
                  {aquifersNoAvailCount} / {aquifersOfficialCount} sin disponibilidad (DMA ≤ 0) · {aquifersStrictDeficit} déficit &lt; 0 (+1 compartido 0228)
                </p>
              </div>
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono-num text-[9px] font-bold text-cyan-200 ring-1 ring-cyan-400/30 shrink-0">
                OFICIAL
              </span>
            </div>

            {/* Radar Chart */}
            <div className="rounded-lg bg-slate-900/75 p-2.5 ring-1 ring-slate-700/70">
              <p className="font-mono-num text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                Huella City Science (6 Dimensiones)
              </p>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="rgba(148,163,184,0.22)" />
                    <PolarAngleAxis dataKey="pillar" tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="score" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.28} strokeWidth={2} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Deep Click-to-Inspect Telemetry Card */}
            {inspection ? (
              <div className="rounded-lg bg-sky-950/40 p-3 ring-1 ring-sky-400/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono-num text-[10px] uppercase text-sky-300 font-semibold">
                    <MapPin className="h-3.5 w-3.5" />
                    Inspector Puntual ({inspection.coordinates.lon}, {inspection.coordinates.lat})
                  </span>
                  <button
                    type="button"
                    onClick={onClearInspection}
                    className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>

                {inspection.building && (
                  <div className="rounded-md bg-slate-900/80 p-2 text-[11px] space-y-0.5">
                    <p className="font-semibold text-amber-300">
                      Edificio 3D · {String(inspection.building.city_name || "")}
                    </p>
                    <p className="font-mono-num text-slate-200">
                      Altura: {String(inspection.building.height_m)} m ({String(inspection.building.floors)} niveles) ·
                      GFA: {Number(inspection.building.gfa_m2 || 0).toLocaleString()} m²
                    </p>
                    <p className="font-mono-num text-slate-300">
                      Solar PV Techo: {String(inspection.building.solar_kwp)} kWp · Cota:{" "}
                      {String(inspection.building.ground_elev_m)} msnm
                    </p>
                  </div>
                )}

                {inspection.ageb && (
                  <div className="rounded-md bg-slate-900/80 p-2 text-[11px] space-y-1">
                    <p className="font-semibold text-white">
                      AGEB {String(inspection.ageb.cvegeo_ageb)} · {String(inspection.ageb.municipality_name)}
                    </p>
                    <div className="grid grid-cols-3 gap-1 font-mono-num text-[10px]">
                      <span className="text-emerald-300">CSI: {String(inspection.ageb.city_science_index)}</span>
                      <span className="text-sky-300">15m: {String(inspection.ageb.city15_score)}</span>
                      <span className="text-indigo-300">Frac: {String(inspection.ageb.fractality_score)}</span>
                    </div>
                    <p className="text-[10.5px] text-slate-300">
                      Pob 2025: {Number(inspection.ageb.pobtot_2025_eic_calibrated || 0).toLocaleString()} hab ·
                      Infill: +{Number(inspection.ageb.infill_homes_potential || 0).toLocaleString()} viv ·
                      Solar: {String(inspection.ageb.solar_mw)} MW
                    </p>
                  </div>
                )}

                {inspection.zoning && (
                  <div className="rounded-md bg-slate-900/80 p-2 text-[10.5px] text-slate-200">
                    <span className="font-semibold text-amber-300">Zonificación:</span>{" "}
                    {String(inspection.zoning.category)} ({String(inspection.zoning.land_use_code || "N/D")}) ·
                    COS {String(inspection.zoning.cos_max ?? "N/D")} / CUS{" "}
                    {String(inspection.zoning.cus_max ?? "N/D")}
                  </div>
                )}

                <div className="rounded-md bg-slate-900/80 p-2 text-[10.5px] space-y-1">
                  {inspection.aquifer && (
                    <p className="text-cyan-200">
                      <strong>Acuífero {String(inspection.aquifer.aquifer_code)}:</strong>{" "}
                      {String(inspection.aquifer.aquifer_name)} · DMA{" "}
                      <span className="font-mono-num font-bold">{String(inspection.aquifer.dma_2023_hm3)} hm³/yr</span>
                    </p>
                  )}
                  {inspection.tandeo_lapaz && (
                    <p className="text-rose-300 font-semibold">
                      Alerta Tandeo OOMSAPAS: Sector {String(inspection.tandeo_lapaz.nombre)} (
                      {String(inspection.tandeo_lapaz.dias)})
                    </p>
                  )}
                  {inspection.poer_uga && (
                    <p className="text-lime-300">
                      <strong>POERBCS:</strong> {String(inspection.poer_uga.environmental_policy)} (
                      {String(inspection.poer_uga.macro_zone_class)})
                    </p>
                  )}
                  {inspection.protected_area && (
                    <p className="text-emerald-300 font-semibold">
                      ANP CONANP: {String(inspection.protected_area.area_name)}
                    </p>
                  )}
                  {inspection.nearest_services?.health?.[0] && (
                    <p className="text-slate-300">
                      <strong>Salud más cercana:</strong> {inspection.nearest_services.health[0].name} (
                      {inspection.nearest_services.health[0].walk_m} m ·{" "}
                      {inspection.nearest_services.health[0].walk_min} min)
                    </p>
                  )}
                  {inspection.nearest_services?.education?.[0] && (
                    <p className="text-slate-300">
                      <strong>Escuela más cercana:</strong> {inspection.nearest_services.education[0].name} (
                      {inspection.nearest_services.education[0].walk_m} m)
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 p-3 text-center text-[11px] text-slate-400">
                Haz clic en cualquier edificio 3D, AGEB o punto del mapa para inspeccionar su expediente completo (15-Min, Acuífero, POER, ANP y Solar).
              </div>
            )}
          </>
        )}

        {/* PHASE 2: GOAL SETTING */}
        {phase === "goals" && (
          <>
            <div className="rounded-lg bg-slate-900/75 p-3 ring-1 ring-slate-700/70 space-y-2.5">
              <p className="font-mono-num text-[10px] uppercase tracking-wider text-sky-400">
                Metas Normativas Horizontes 2050
              </p>
              {[
                { key: "target_city15_score" as const, label: "Meta Ciudad 15-Min", min: 65, max: 98, unit: "pts" },
                { key: "target_infill_share_pct" as const, label: "Crecimiento vía Infill", min: 20, max: 90, unit: "%" },
                { key: "target_ptar_reuse_pct" as const, label: "Reúso PTAR Línea Morada", min: 20, max: 90, unit: "%" },
                { key: "target_rooftop_solar_pct" as const, label: "Adopción Solar en Techos", min: 10, max: 80, unit: "%" },
                { key: "target_suds_coverage_pct" as const, label: "Arroyos & Drenaje SUDS", min: 20, max: 100, unit: "%" },
              ].map((s) => (
                <div key={s.key} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-200">{s.label}</span>
                    <span className="font-mono-num font-bold text-emerald-300">
                      {goalTargets[s.key]} {s.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={1}
                    value={goalTargets[s.key]}
                    onChange={(e) => onGoalTargetChange(s.key, Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
              ))}
            </div>

            {goalGap && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/70">
                    <p className="text-[10px] uppercase text-slate-400">Nuevas Viv. 2050</p>
                    <p className="font-mono-num text-sm font-bold text-white">
                      {goalGap.projected_new_homes_2050.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-emerald-300">
                      Cobertura infill: {goalGap.infill_absorption_coverage_pct}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/70">
                    <p className="text-[10px] uppercase text-slate-400">CAPEX Requerido</p>
                    <p className="font-mono-num text-sm font-bold text-amber-300">
                      ${goalGap.estimated_capex_mdp_mxn.toLocaleString()} MDP
                    </p>
                    <p className="text-[10px] text-sky-300">
                      Desal: +{goalGap.recommended_desal_lps} lps · {goalGap.target_solar_mw} MW PV
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900/75 p-2.5 ring-1 ring-slate-700/70">
                  <p className="font-mono-num text-[10px] uppercase text-slate-400 mb-1">
                    Brecha Línea Base vs Meta 2050
                  </p>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={goalGap.pillars} layout="vertical" margin={{ left: 10, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <YAxis dataKey="label" type="category" width={115} tick={{ fill: "#cbd5e1", fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                        <Bar dataKey="current" name="Actual" fill="#475569" radius={[0, 3, 3, 0]} />
                        <Bar dataKey="target" name="Meta 2050" fill="#10b981" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onApplyOptimalLevers(goalGap.optimal_levers)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 shadow-lg hover:brightness-110 cursor-pointer"
                >
                  <span>Cargar Palancas Óptimas en Simulador 2050</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </>
        )}

        {/* PHASE 3: SCENARIO LAB */}
        {phase === "scenarios" && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {SCENARIO_PRESETS.map((sc) => {
                const active = scenarioName === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onSelectScenario(sc.id)}
                    className={`rounded-lg p-2 text-left transition-all cursor-pointer ${
                      active
                        ? "bg-sky-500/20 ring-1 ring-sky-400 text-white"
                        : "bg-slate-900/70 ring-1 ring-slate-700/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span className="font-mono-num text-[9px] uppercase text-sky-400">{sc.badge}</span>
                    <p className="text-[11px] font-semibold leading-tight mt-0.5">{sc.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Horizon Time Slider */}
            <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/70 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-200">Horizonte Temporal 3D</span>
                <span className="font-mono-num text-sm font-bold text-sky-400">{targetYear}</span>
              </div>
              <div className="flex justify-between gap-1">
                {YEARS.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => onTargetYearChange(yr)}
                    className={`flex-1 rounded py-1 font-mono-num text-[10px] font-semibold cursor-pointer ${
                      targetYear === yr ? "bg-sky-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>

            {simulation && (
              <>
                <div className="flex items-center justify-between rounded-md bg-indigo-950/50 px-2.5 py-1 ring-1 ring-indigo-400/30">
                  <span className="font-mono-num text-[9.5px] uppercase tracking-wider text-indigo-200">
                    {simulation.scenario_meta.title}
                  </span>
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono-num text-[9px] font-bold text-amber-200 ring-1 ring-amber-400/35">
                    MODELADO · ESCENARIO EXPLORATORIO
                  </span>
                </div>

                {simulation.breach_warnings.length > 0 && (
                  <div className="rounded-lg bg-rose-950/60 p-2.5 ring-1 ring-rose-500/50 text-[11px] text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Ruptura Capacidad de Carga: {simulation.carrying_capacity_breach_year}</p>
                      <p className="text-[10.5px] opacity-90">{simulation.breach_warnings[0]}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-900/80 p-2 ring-1 ring-slate-700/70">
                    <p className="text-[10px] text-slate-400">SDI-100 ({targetYear})</p>
                    <p className="font-mono-num text-lg font-bold text-emerald-400">
                      {simulation.active_year_snapshot.sdi_score_100}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 p-2 ring-1 ring-slate-700/70">
                    <p className="text-[10px] text-slate-400">Balance Acuífero</p>
                    <p
                      className={`font-mono-num text-lg font-bold ${
                        simulation.active_year_snapshot.aquifer_effective_balance_hm3_yr >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {simulation.active_year_snapshot.aquifer_effective_balance_hm3_yr} hm³
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 p-2 ring-1 ring-slate-700/70">
                    <p className="text-[10px] text-slate-400">Margen SIBCS</p>
                    <p className="font-mono-num text-sm font-bold text-sky-300">
                      {simulation.active_year_snapshot.sibcs_headroom_mw} MW (
                      {simulation.active_year_snapshot.sibcs_reserve_margin_pct}%)
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 p-2 ring-1 ring-slate-700/70">
                    <p className="text-[10px] text-slate-400">Solar Desplegada</p>
                    <p className="font-mono-num text-sm font-bold text-amber-300">
                      {simulation.active_year_snapshot.deployed_rooftop_solar_mw.toLocaleString()} MW
                    </p>
                  </div>
                </div>

                {/* Policy Levers */}
                <div className="rounded-lg bg-slate-900/75 p-2.5 ring-1 ring-slate-700/70 space-y-2">
                  <p className="font-mono-num text-[10px] uppercase text-slate-400">
                    Palancas Contrafactuales En Vivo
                  </p>
                  {[
                    { k: "infill_share_pct", l: "Infill Intraurbano (%)", min: 10, max: 90, step: 2 },
                    { k: "ptar_reuse_target_pct", l: "Reúso Línea Morada (%)", min: 10, max: 90, step: 2 },
                    { k: "desalination_added_lps", l: "Desalación SWRO (lps)", min: 0, max: 600, step: 25 },
                    { k: "distributed_solar_share_pct", l: "Solar Distribuida (%)", min: 5, max: 75, step: 2 },
                    { k: "suds_coverage_pct", l: "Cobertura SUDS (%)", min: 10, max: 95, step: 5 },
                  ].map((lv) => (
                    <div key={lv.k} className="space-y-0.5">
                      <div className="flex justify-between text-[10.5px]">
                        <span className="text-slate-300">{lv.l}</span>
                        <span className="font-mono-num text-sky-300 font-semibold">
                          {customLevers[lv.k] ?? simulation.levers[lv.k]}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={lv.min}
                        max={lv.max}
                        step={lv.step}
                        value={customLevers[lv.k] ?? simulation.levers[lv.k]}
                        onChange={(e) => onLeverChange(lv.k, Number(e.target.value))}
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>

                {/* Trajectory ComposedChart with P10–P90 VVUQ Confidence Band */}
                <div className="rounded-lg bg-slate-900/75 p-2.5 ring-1 ring-slate-700/70 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono-num text-[10px] uppercase text-slate-300">
                      Trayectoria 2025–2050 (Banda P10–P90 VVUQ)
                    </p>
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono-num text-[8.5px] font-bold text-emerald-300">
                      ISO 23247-8
                    </span>
                  </div>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={simulation.trajectory.map((t) => ({
                          ...t,
                          sdi_band: [
                            t.sdi_p10 ?? Math.max(0, Number((t.sdi_score_100 - 2.2).toFixed(1))),
                            t.sdi_p90 ?? Math.min(100, Number((t.sdi_score_100 + 2.2).toFixed(1))),
                          ],
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                        <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                        <Area
                          type="monotone"
                          dataKey="sdi_band"
                          name="Banda SDI P10–P90"
                          stroke="none"
                          fill="#10b981"
                          fillOpacity={0.22}
                        />
                        <Line type="monotone" dataKey="sdi_score_100" name="SDI-100 (P50)" stroke="#10b981" strokeWidth={2.2} />
                        <Line type="monotone" dataKey="sibcs_reserve_margin_pct" name="Margen SIBCS %" stroke="#38bdf8" strokeWidth={1.8} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {simulation.vvuq && (
                    <div className="rounded-md bg-slate-950/75 p-2 ring-1 ring-slate-800 space-y-1.5 text-[10px]">
                      <div className="flex items-center justify-between text-sky-300 font-semibold">
                        <span>Validación Histórica &amp; VVUQ</span>
                        <span className="font-mono-num text-[9px] text-emerald-300">
                          MAPE Pob 2010–20:{" "}
                          {String(simulation.vvuq.validation_error_rmse_or_mape.demographic_2010_2020_mape_pct ?? "8.39")}%
                        </span>
                      </div>
                      <p className="font-mono-num text-[9.5px] text-slate-300">
                        SDI 2050 P10/P50/P90:{" "}
                        <span className="text-emerald-300 font-bold">
                          {simulation.trajectory[simulation.trajectory.length - 1]?.sdi_p10 ?? "-"} /{" "}
                          {simulation.sdi_score_2050} /{" "}
                          {simulation.trajectory[simulation.trajectory.length - 1]?.sdi_p90 ?? "-"}
                        </span>{" "}
                        · RMSE Acuíferos: {String(simulation.vvuq.validation_error_rmse_or_mape.aquifer_2020_2023_rmse_hm3 ?? "2.23")} hm³
                      </p>
                      <p className="text-[9px] text-amber-200/85 leading-snug">
                        {simulation.vvuq.legal_disclaimer}
                      </p>
                    </div>
                  )}
                </div>

                {/* Coupled OGC Physics Simulation Workers (Cloud Run Jobs) */}
                {onRunPhysicsProcess && (
                  <div className="rounded-lg bg-slate-900/85 p-2.5 ring-1 ring-cyan-500/35 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">
                        Motores Físicos OGC · Cloud Run Jobs
                      </span>
                      {physicsOverlay && onClearPhysicsOverlay && (
                        <button
                          type="button"
                          onClick={onClearPhysicsOverlay}
                          className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[9.5px] text-slate-300 hover:bg-rose-950 hover:text-rose-200 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Limpiar</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("arroyo_flood_sfincs")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex items-center justify-between rounded-md bg-rose-500/15 px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-rose-200 ring-1 ring-rose-400/35 hover:bg-rose-500/25 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Waves className="h-3.5 w-3.5 text-rose-300" />
                          <span>Inundación 2D Arroyos (SFINCS · Tr100)</span>
                        </span>
                        <span className="font-mono-num text-[9px] text-rose-300">COG + Vector</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("network_isochrone_r5py")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex items-center justify-between rounded-md bg-indigo-500/15 px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-indigo-200 ring-1 ring-indigo-400/35 hover:bg-indigo-500/25 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Route className="h-3.5 w-3.5 text-indigo-300" />
                          <span>Isócronas Red Vial 15-Min (r5py / INEGI)</span>
                        </span>
                        <span className="font-mono-num text-[9px] text-indigo-300">Dijkstra</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("water_network_wntr")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex items-center justify-between rounded-md bg-cyan-500/15 px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-cyan-200 ring-1 ring-cyan-400/35 hover:bg-cyan-500/25 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Droplets className="h-3.5 w-3.5 text-cyan-300" />
                          <span>Hidráulica Tandeo / Línea Morada (WNTR)</span>
                        </span>
                        <span className="font-mono-num text-[9px] text-cyan-300">PDD 24h</span>
                      </button>
                    </div>

                    {physicsJobStatus && (
                      <div className="rounded-md bg-slate-950/80 p-2 ring-1 ring-slate-800 text-[10px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-semibold text-white">
                            {physicsJobStatus.status === "accepted" || physicsJobStatus.status === "running" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            )}
                            <span>{physicsJobStatus.processID}</span>
                          </span>
                          <span className="font-mono-num text-[9px] uppercase text-sky-300">
                            {physicsJobStatus.status} · {physicsJobStatus.execution_backend || "async"}
                          </span>
                        </div>
                        {physicsJobStatus.error && (
                          <p className="text-[9.5px] text-rose-300">{physicsJobStatus.error}</p>
                        )}
                        {physicsOverlay?.jobId === physicsJobStatus.jobID && (
                          <div className="space-y-1 pt-0.5 text-slate-300 font-mono-num text-[9.5px]">
                            {physicsOverlay.processId === "arroyo_flood_sfincs" && (
                              <p>
                                Edif. expuestos (&gt;0.3m):{" "}
                                <strong className="text-rose-300">
                                  {Number(physicsOverlay.result.summary.buildings_exposed_gt_03m || 0).toLocaleString()}
                                </strong>{" "}
                                · Máx: {String(physicsOverlay.result.summary.max_depth_m)} m
                              </p>
                            )}
                            {physicsOverlay.processId === "network_isochrone_r5py" && (
                              <p>
                                Área 15m:{" "}
                                <strong className="text-indigo-300">{String(physicsOverlay.result.summary.area_15m_ha)} ha</strong>{" "}
                                · Score red: {String(physicsOverlay.result.summary.network_15m_score)} pts (Δ{" "}
                                {String(physicsOverlay.result.summary.score_delta_network_vs_euclid)})
                              </p>
                            )}
                            {physicsOverlay.processId === "water_network_wntr" && (
                              <p>
                                Presión:{" "}
                                <strong className="text-cyan-300">
                                  {String(physicsOverlay.result.summary.baseline_mean_pressure_m)} →{" "}
                                  {String(physicsOverlay.result.summary.scenario_mean_pressure_m)} m
                                </strong>{" "}
                                · Sectores ≥15m: {String(physicsOverlay.result.summary.nodes_restored_above_15m)}
                              </p>
                            )}
                            {physicsOverlay.result.artifact_urls?.flood_depth_cog && (
                              <a
                                href={physicsOverlay.result.artifact_urls.flood_depth_cog}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                              >
                                <span>COG GeoTIFF</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* PHASE 4: RECOMMENDATIONS */}
        {phase === "recommendations" && recommendations && (
          <>
            <div className="flex items-center justify-between rounded-lg bg-slate-900/80 px-3 py-2 ring-1 ring-slate-700/70">
              <div>
                <p className="text-[10px] uppercase text-slate-400">Índice SDI-100 Ontología v3</p>
                <p className="font-mono-num text-lg font-bold text-emerald-400">
                  {recommendations.sdi_100.sdi_score_100} / 100
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportReport}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 ring-1 ring-sky-400/40 hover:bg-sky-500/35 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar Dossier</span>
              </button>
            </div>

            {/* Priority Spatial Action Cards */}
            <div className="space-y-2">
              <p className="font-mono-num text-[10px] uppercase tracking-wider text-slate-400">
                Intervenciones Prioritarias Georreferenciadas
              </p>
              {recommendations.priority_actions.map((act) => (
                <div
                  key={act.id}
                  className="rounded-lg bg-slate-900/85 p-2.5 ring-1 ring-slate-700/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono-num text-[9.5px] font-bold text-amber-300">
                      {act.priority}
                    </span>
                    <span className="font-mono-num text-[9.5px] text-sky-300">{act.metric_badge}</span>
                  </div>
                  <h4 className="text-xs font-bold text-white">{act.title}</h4>
                  <p className="text-[11px] leading-snug text-slate-300">{act.rationale}</p>
                  <button
                    type="button"
                    onClick={() => onFlyTo(act.camera)}
                    className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 cursor-pointer"
                  >
                    <Navigation className="h-3 w-3" />
                    <span>Volar al Polígono en 3D</span>
                  </button>
                </div>
              ))}
            </div>

            {/* 6 Ontology Decision Lenses */}
            <div className="space-y-1.5">
              <p className="font-mono-num text-[10px] uppercase tracking-wider text-slate-400">
                6 Lentes Estratégicas (bcs2050_kg_v3)
              </p>
              {recommendations.decision_lenses.map((lens) => (
                <div key={lens.lens_id} className="rounded-lg bg-slate-900/65 p-2 ring-1 ring-slate-700/60">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-200">{lens.lens_name}</span>
                    <span
                      className={`font-mono-num font-bold ${
                        lens.score_100 >= 72
                          ? "text-emerald-400"
                          : lens.score_100 >= 48
                            ? "text-amber-400"
                            : "text-rose-400"
                      }`}
                    >
                      {lens.score_100} ({lens.verdict})
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {recommendations.contradictions.length > 0 && (
              <div className="rounded-lg bg-rose-950/40 p-2.5 ring-1 ring-rose-500/40 space-y-1">
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-rose-300">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Contradicciones Territoriales Detectadas
                </p>
                {recommendations.contradictions.slice(0, 3).map((c, idx) => (
                  <p key={idx} className="text-[10.5px] text-rose-200/90 leading-snug">
                    • {c.message}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
