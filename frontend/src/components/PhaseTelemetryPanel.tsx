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
  Trash2,
  Waves,
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
  onPhaseChange?: (p: AretianPhase) => void;
  language?: "es" | "en";
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

const PHASE_TABS: { id: AretianPhase; labelEs: string; labelEn: string }[] = [
  { id: "diagnostics", labelEs: "Diagnóstico", labelEn: "Diagnostics" },
  { id: "goals", labelEs: "Metas", labelEn: "Goals" },
  { id: "scenarios", labelEs: "Escenarios", labelEn: "Scenarios" },
  { id: "recommendations", labelEs: "Acciones", labelEn: "Actions" },
];

const SCENARIO_PRESETS = [
  { id: "COMPACT_SUSTAINABLE_2050", label: "Compacta 15-Min", badge: "Óptima", badgeCls: "text-[#30D158]" },
  { id: "BAU_TENDENCIAL", label: "BAU Tendencial", badge: "Riesgo", badgeCls: "text-[#FF9F0A]" },
  { id: "HIGH_GROWTH_TOURISM_STRESS", label: "Auge Turístico +65%", badge: "Estrés", badgeCls: "text-[#FF453A]" },
  { id: "CLIMATE_SHOCK_IPCC_SSP585", label: "Choque IPCC SSP5-8.5", badge: "Clima", badgeCls: "text-[#64D2FF]" },
];

const YEARS = [2025, 2027, 2031, 2035, 2040, 2050];

const CHART_TOOLTIP_STYLE = {
  background: "rgba(24, 24, 28, 0.94)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 12,
  fontSize: 11,
  color: "#F5F5F7",
  boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
};

export const PhaseTelemetryPanel: React.FC<Props> = ({
  collapsed,
  onToggleCollapse,
  phase,
  onPhaseChange,
  language = "es",
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
  const isEn = language === "en";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="ios-glass pointer-events-auto absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-[#F5F5F7] hover:bg-white/[0.12] transition-colors cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4 text-[#0A84FF]" aria-hidden="true" />
        <span>{isEn ? "Telemetry & Simulator" : "Telemetría & Simulador"}</span>
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
      className="ios-glass pointer-events-auto absolute right-4 top-4 z-20 flex max-h-[calc(100%-184px)] w-[calc(100vw-32px)] sm:w-[388px] flex-col rounded-[24px] overflow-hidden"
    >
      {/* Apple Sheet Header + Inline 4-Phase iOS Segmented Control */}
      <div className="border-b border-white/[0.08] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium tracking-wide text-[#EBEBF5]/60">
              {phase === "diagnostics" && (isEn ? "Phase 01 · City Science" : "Fase 01 · City Science")}
              {phase === "goals" && (isEn ? "Phase 02 · 2050 Targets" : "Fase 02 · Metas 2050")}
              {phase === "scenarios" && (isEn ? "Phase 03 · Counterfactual Lab" : "Fase 03 · Simulador")}
              {phase === "recommendations" && (isEn ? "Phase 04 · Strategic Lenses" : "Fase 04 · Acciones")}
            </p>
            <h2 className="truncate text-[16px] font-semibold tracking-tight text-[#F5F5F7]">
              {activeStats.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isEn ? "Collapse right panel" : "Colapsar panel derecho"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[#EBEBF5]/75 hover:bg-white/[0.15] hover:text-white transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* 4-Tab iOS Segmented Control */}
        <div
          role="group"
          aria-label={isEn ? "City Science Phases" : "Fases City Science"}
          className="ios-segmented grid grid-cols-4 gap-0.5"
        >
          {PHASE_TABS.map((tab) => {
            const active = phase === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => onPhaseChange?.(tab.id)}
                className={`rounded-full py-1 text-[11px] font-medium transition-all cursor-pointer truncate ${
                  active
                    ? "ios-segment-active font-semibold"
                    : "text-[#EBEBF5]/70 hover:text-[#F5F5F7]"
                }`}
              >
                {isEn ? tab.labelEn : tab.labelEs}
              </button>
            );
          })}
        </div>
      </div>

      <div className="twin-scroll overflow-y-auto p-3.5 space-y-3.5">
        {/* PHASE 1: DIAGNOSTICS */}
        {phase === "diagnostics" && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="ios-surface rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[#EBEBF5]/60">Índice City Science</p>
                <p className="font-mono-num mt-1 text-[22px] font-semibold tracking-tight text-[#30D158]">
                  {activeStats.csi}
                  <span className="text-[11px] font-normal text-[#EBEBF5]/50"> / 100</span>
                </p>
              </div>
              <div className="ios-surface rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[#EBEBF5]/60">Ciudad 15-Minutos</p>
                <p className="font-mono-num mt-1 text-[22px] font-semibold tracking-tight text-[#0A84FF]">
                  {activeStats.c15}
                  <span className="text-[11px] font-normal text-[#EBEBF5]/50"> pts</span>
                </p>
              </div>
              <div className="ios-surface rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[#EBEBF5]/60">Edificios 3D · Pob.</p>
                <p className="font-mono-num mt-1 text-[15px] font-semibold tracking-tight text-[#F5F5F7]">
                  {activeStats.buildings.toLocaleString()}
                </p>
                <p className="font-mono-num mt-0.5 text-[10px] text-[#30D158]">
                  {activeStats.popOfficial2020.toLocaleString()} INEGI 2020
                </p>
                <p className="font-mono-num text-[10px] text-[#64D2FF]">
                  {activeStats.pop.toLocaleString()} Proy. 2025
                </p>
              </div>
              <div className="ios-surface rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[#EBEBF5]/60">Capacidad Infill 2050</p>
                <p className="font-mono-num mt-1 text-[15px] font-semibold tracking-tight text-[#30D158]">
                  +{activeStats.infill.toLocaleString()} viv
                </p>
                <p className="font-mono-num mt-0.5 text-[10px] text-[#EBEBF5]/65">
                  Solar: {activeStats.solarMw.toLocaleString()} MW
                </p>
              </div>
            </div>

            {/* Reconciled Official CONAGUA Aquifer Balance Pill */}
            <div className="ios-surface rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px]">
              <div>
                <span className="text-[10.5px] font-semibold text-[#64D2FF]">
                  Acuíferos BCS (CONAGUA DOF 2023)
                </span>
                <p className="font-mono-num mt-0.5 text-[10.5px] text-[#EBEBF5]/85">
                  {aquifersNoAvailCount} / {aquifersOfficialCount} sin disponibilidad · {aquifersStrictDeficit} déficit &lt; 0 (+1 comp. 0228)
                </p>
              </div>
              <span className="rounded-full bg-[#64D2FF]/15 px-2 py-0.5 font-mono-num text-[9.5px] font-semibold text-[#64D2FF] shrink-0">
                OFICIAL
              </span>
            </div>

            {/* Radar Chart */}
            <div className="ios-surface rounded-2xl p-3.5">
              <p className="text-[11px] font-semibold text-[#EBEBF5]/70 mb-1">
                Huella City Science (6 Dimensiones)
              </p>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="rgba(255,255,255,0.12)" />
                    <PolarAngleAxis dataKey="pillar" tick={{ fill: "rgba(235,235,245,0.75)", fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="score" stroke="#0A84FF" fill="#0A84FF" fillOpacity={0.26} strokeWidth={2} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Deep Click-to-Inspect Telemetry Card */}
            {inspection ? (
              <div className="ios-surface rounded-2xl p-3.5 ring-1 ring-[#0A84FF]/35 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono-num text-[11px] font-semibold text-[#64D2FF]">
                    <MapPin className="h-3.5 w-3.5" />
                    {inspection.coordinates.lon}, {inspection.coordinates.lat}
                  </span>
                  <button
                    type="button"
                    onClick={onClearInspection}
                    className="rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[10.5px] font-medium text-[#EBEBF5]/80 hover:bg-white/[0.15] cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>

                {inspection.building && (
                  <div className="rounded-xl bg-white/[0.04] p-2.5 text-[11px] space-y-0.5">
                    <p className="font-semibold text-[#FF9F0A]">
                      Edificio 3D · {String(inspection.building.city_name || "")}
                    </p>
                    <p className="font-mono-num text-[#F5F5F7]">
                      Altura: {String(inspection.building.height_m)} m ({String(inspection.building.floors)} niveles) · GFA:{" "}
                      {Number(inspection.building.gfa_m2 || 0).toLocaleString()} m²
                    </p>
                    <p className="font-mono-num text-[#EBEBF5]/75">
                      Solar PV Techo: {String(inspection.building.solar_kwp)} kWp · Cota:{" "}
                      {String(inspection.building.ground_elev_m)} msnm
                    </p>
                  </div>
                )}

                {inspection.ageb && (
                  <div className="rounded-xl bg-white/[0.04] p-2.5 text-[11px] space-y-1">
                    <p className="font-semibold text-[#F5F5F7]">
                      AGEB {String(inspection.ageb.cvegeo_ageb)} · {String(inspection.ageb.municipality_name)}
                    </p>
                    <div className="grid grid-cols-3 gap-1 font-mono-num text-[10.5px]">
                      <span className="text-[#30D158]">CSI: {String(inspection.ageb.city_science_index)}</span>
                      <span className="text-[#0A84FF]">15m: {String(inspection.ageb.city15_score)}</span>
                      <span className="text-[#64D2FF]">Frac: {String(inspection.ageb.fractality_score)}</span>
                    </div>
                    <p className="text-[10.5px] text-[#EBEBF5]/75">
                      Pob 2025: {Number(inspection.ageb.pobtot_2025_eic_calibrated || 0).toLocaleString()} hab · Infill: +
                      {Number(inspection.ageb.infill_homes_potential || 0).toLocaleString()} viv · Solar:{" "}
                      {String(inspection.ageb.solar_mw)} MW
                    </p>
                  </div>
                )}

                {inspection.zoning && (
                  <div className="rounded-xl bg-white/[0.04] p-2.5 text-[11px] text-[#EBEBF5]/85">
                    <span className="font-semibold text-[#FF9F0A]">Zonificación:</span>{" "}
                    {String(inspection.zoning.category)} ({String(inspection.zoning.land_use_code || "N/D")}) · COS{" "}
                    {String(inspection.zoning.cos_max ?? "N/D")} / CUS {String(inspection.zoning.cus_max ?? "N/D")}
                  </div>
                )}

                <div className="rounded-xl bg-white/[0.04] p-2.5 text-[11px] space-y-1">
                  {inspection.aquifer && (
                    <p className="text-[#64D2FF]">
                      <strong>Acuífero {String(inspection.aquifer.aquifer_code)}:</strong>{" "}
                      {String(inspection.aquifer.aquifer_name)} · DMA{" "}
                      <span className="font-mono-num font-semibold">{String(inspection.aquifer.dma_2023_hm3)} hm³/yr</span>
                    </p>
                  )}
                  {inspection.tandeo_lapaz && (
                    <p className="text-[#FF453A] font-medium">
                      Alerta Tandeo OOMSAPAS: Sector {String(inspection.tandeo_lapaz.nombre)} (
                      {String(inspection.tandeo_lapaz.dias)})
                    </p>
                  )}
                  {inspection.poer_uga && (
                    <p className="text-[#30D158]">
                      <strong>POERBCS:</strong> {String(inspection.poer_uga.environmental_policy)} (
                      {String(inspection.poer_uga.macro_zone_class)})
                    </p>
                  )}
                  {inspection.protected_area && (
                    <p className="text-[#30D158] font-medium">
                      ANP CONANP: {String(inspection.protected_area.area_name)}
                    </p>
                  )}
                  {inspection.nearest_services?.health?.[0] && (
                    <p className="text-[#EBEBF5]/75">
                      <strong>Salud cercana:</strong> {inspection.nearest_services.health[0].name} (
                      {inspection.nearest_services.health[0].walk_m} m ·{" "}
                      {inspection.nearest_services.health[0].walk_min} min)
                    </p>
                  )}
                  {inspection.nearest_services?.education?.[0] && (
                    <p className="text-[#EBEBF5]/75">
                      <strong>Escuela cercana:</strong> {inspection.nearest_services.education[0].name} (
                      {inspection.nearest_services.education[0].walk_m} m)
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.12] p-3.5 text-center text-[11px] text-[#EBEBF5]/55 leading-relaxed">
                Haz clic en cualquier edificio 3D, AGEB o punto del mapa para inspeccionar su expediente completo.
              </div>
            )}
          </>
        )}

        {/* PHASE 2: GOAL SETTING */}
        {phase === "goals" && (
          <>
            <div className="ios-surface rounded-2xl p-3.5 space-y-3">
              <p className="text-[11px] font-semibold text-[#EBEBF5]/75">
                Metas Normativas Horizontes 2050
              </p>
              {[
                { key: "target_city15_score" as const, label: "Meta Ciudad 15-Min", min: 65, max: 98, unit: "pts" },
                { key: "target_infill_share_pct" as const, label: "Crecimiento vía Infill", min: 20, max: 90, unit: "%" },
                { key: "target_ptar_reuse_pct" as const, label: "Reúso PTAR Línea Morada", min: 20, max: 90, unit: "%" },
                { key: "target_rooftop_solar_pct" as const, label: "Adopción Solar en Techos", min: 10, max: 80, unit: "%" },
                { key: "target_suds_coverage_pct" as const, label: "Arroyos & Drenaje SUDS", min: 20, max: 100, unit: "%" },
              ].map((s) => (
                <div key={s.key} className="space-y-1.5">
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-[#EBEBF5]/85">{s.label}</span>
                    <span className="font-mono-num font-semibold text-[#30D158]">
                      {goalTargets[s.key]} {s.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={s.label}
                    min={s.min}
                    max={s.max}
                    step={1}
                    value={goalTargets[s.key]}
                    onChange={(e) => onGoalTargetChange(s.key, Number(e.target.value))}
                    className="ios-slider"
                  />
                </div>
              ))}
            </div>

            {goalGap && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="ios-surface rounded-2xl p-3">
                    <p className="text-[10.5px] font-medium text-[#EBEBF5]/60">Nuevas Viv. 2050</p>
                    <p className="font-mono-num mt-1 text-[16px] font-semibold text-[#F5F5F7]">
                      {goalGap.projected_new_homes_2050.toLocaleString()}
                    </p>
                    <p className="text-[10.5px] text-[#30D158]">
                      Cobertura infill: {goalGap.infill_absorption_coverage_pct}%
                    </p>
                  </div>
                  <div className="ios-surface rounded-2xl p-3">
                    <p className="text-[10.5px] font-medium text-[#EBEBF5]/60">CAPEX Requerido</p>
                    <p className="font-mono-num mt-1 text-[16px] font-semibold text-[#FF9F0A]">
                      ${goalGap.estimated_capex_mdp_mxn.toLocaleString()} MDP
                    </p>
                    <p className="text-[10.5px] text-[#64D2FF]">
                      Desal: +{goalGap.recommended_desal_lps} lps · {goalGap.target_solar_mw} MW
                    </p>
                  </div>
                </div>

                <div className="ios-surface rounded-2xl p-3.5">
                  <p className="text-[11px] font-semibold text-[#EBEBF5]/70 mb-1.5">
                    Brecha Línea Base vs Meta 2050
                  </p>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={goalGap.pillars} layout="vertical" margin={{ left: 10, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: "rgba(235,235,245,0.55)", fontSize: 9 }} />
                        <YAxis dataKey="label" type="category" width={115} tick={{ fill: "rgba(235,235,245,0.8)", fontSize: 9 }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="current" name="Actual" fill="rgba(255,255,255,0.28)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="target" name="Meta 2050" fill="#30D158" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onApplyOptimalLevers(goalGap.optimal_levers)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0A84FF] hover:bg-[#409CFF] px-4 py-2.5 text-[12px] font-semibold text-white shadow-md shadow-[#0A84FF]/25 transition-colors cursor-pointer"
                >
                  <span>Cargar Palancas Óptimas en Simulador</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </>
        )}

        {/* PHASE 3: SCENARIO LAB */}
        {phase === "scenarios" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {SCENARIO_PRESETS.map((sc) => {
                const active = scenarioName === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onSelectScenario(sc.id)}
                    className={`rounded-2xl p-2.5 text-left transition-all cursor-pointer ${
                      active
                        ? "bg-[#0A84FF]/20 ring-1 ring-[#0A84FF] text-[#F5F5F7]"
                        : "ios-surface text-[#EBEBF5]/80 hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${sc.badgeCls}`}>{sc.badge}</span>
                    <p className="text-[11.5px] font-semibold leading-tight mt-0.5 text-[#F5F5F7]">{sc.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Horizon Time Segmented Pill */}
            <div className="ios-surface rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-medium text-[#EBEBF5]/80">Horizonte Temporal 3D</span>
                <span className="font-mono-num text-[14px] font-semibold text-[#0A84FF]">{targetYear}</span>
              </div>
              <div className="ios-segmented grid grid-cols-6 gap-0.5">
                {YEARS.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => onTargetYearChange(yr)}
                    className={`rounded-full py-1 font-mono-num text-[10px] font-semibold transition-all cursor-pointer ${
                      targetYear === yr ? "ios-segment-active" : "text-[#EBEBF5]/65 hover:text-[#F5F5F7]"
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>

            {simulation && (
              <>
                <div className="ios-surface flex items-center justify-between rounded-2xl px-3 py-2">
                  <span className="text-[10.5px] font-medium text-[#EBEBF5]/85 truncate">
                    {simulation.scenario_meta.title}
                  </span>
                  <span className="rounded-full bg-[#FF9F0A]/15 px-2 py-0.5 font-mono-num text-[9px] font-semibold text-[#FF9F0A] shrink-0">
                    MODELADO
                  </span>
                </div>

                {simulation.breach_warnings.length > 0 && (
                  <div className="rounded-2xl bg-[#FF453A]/15 p-3 ring-1 ring-[#FF453A]/35 text-[11px] text-[#F5F5F7] flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-[#FF453A] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[#FF453A]">
                        Ruptura Capacidad de Carga: {simulation.carrying_capacity_breach_year}
                      </p>
                      <p className="text-[10.5px] text-[#EBEBF5]/85 mt-0.5">{simulation.breach_warnings[0]}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="ios-surface rounded-2xl p-3">
                    <p className="text-[10.5px] text-[#EBEBF5]/60">SDI-100 ({targetYear})</p>
                    <p className="font-mono-num mt-0.5 text-[20px] font-semibold text-[#30D158]">
                      {simulation.active_year_snapshot.sdi_score_100}
                    </p>
                  </div>
                  <div className="ios-surface rounded-2xl p-3">
                    <p className="text-[10.5px] text-[#EBEBF5]/60">Balance Acuífero</p>
                    <p
                      className={`font-mono-num mt-0.5 text-[20px] font-semibold ${
                        simulation.active_year_snapshot.aquifer_effective_balance_hm3_yr >= 0
                          ? "text-[#30D158]"
                          : "text-[#FF453A]"
                      }`}
                    >
                      {simulation.active_year_snapshot.aquifer_effective_balance_hm3_yr} hm³
                    </p>
                  </div>
                  <div className="ios-surface rounded-2xl p-3">
                    <p className="text-[10.5px] text-[#EBEBF5]/60">Margen SIBCS</p>
                    <p className="font-mono-num mt-0.5 text-[14px] font-semibold text-[#64D2FF]">
                      {simulation.active_year_snapshot.sibcs_headroom_mw} MW ({simulation.active_year_snapshot.sibcs_reserve_margin_pct}%)
                    </p>
                  </div>
                  <div className="ios-surface rounded-2xl p-3">
                    <p className="text-[10.5px] text-[#EBEBF5]/60">Solar Desplegada</p>
                    <p className="font-mono-num mt-0.5 text-[14px] font-semibold text-[#FF9F0A]">
                      {simulation.active_year_snapshot.deployed_rooftop_solar_mw.toLocaleString()} MW
                    </p>
                  </div>
                </div>

                {/* Policy Levers */}
                <div className="ios-surface rounded-2xl p-3.5 space-y-2.5">
                  <p className="text-[11px] font-semibold text-[#EBEBF5]/75">
                    Palancas Contrafactuales
                  </p>
                  {[
                    { k: "infill_share_pct", l: "Infill Intraurbano (%)", min: 10, max: 90, step: 2 },
                    { k: "ptar_reuse_target_pct", l: "Reúso Línea Morada (%)", min: 10, max: 90, step: 2 },
                    { k: "desalination_added_lps", l: "Desalación SWRO (lps)", min: 0, max: 600, step: 25 },
                    { k: "distributed_solar_share_pct", l: "Solar Distribuida (%)", min: 5, max: 75, step: 2 },
                    { k: "suds_coverage_pct", l: "Cobertura SUDS (%)", min: 10, max: 95, step: 5 },
                  ].map((lv) => (
                    <div key={lv.k} className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#EBEBF5]/80">{lv.l}</span>
                        <span className="font-mono-num text-[#0A84FF] font-semibold">
                          {customLevers[lv.k] ?? simulation.levers[lv.k]}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label={lv.l}
                        min={lv.min}
                        max={lv.max}
                        step={lv.step}
                        value={customLevers[lv.k] ?? simulation.levers[lv.k]}
                        onChange={(e) => onLeverChange(lv.k, Number(e.target.value))}
                        className="ios-slider"
                      />
                    </div>
                  ))}
                </div>

                {/* Trajectory ComposedChart with P10–P90 VVUQ Confidence Band */}
                <div className="ios-surface rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-[#EBEBF5]/75">
                      Trayectoria 2025–2050 (P10–P90)
                    </p>
                    <span className="rounded-full bg-[#30D158]/15 px-2 py-0.5 font-mono-num text-[9px] font-semibold text-[#30D158]">
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
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="year" tick={{ fill: "rgba(235,235,245,0.55)", fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: "rgba(235,235,245,0.55)", fontSize: 9 }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey="sdi_band"
                          name="Banda SDI P10–P90"
                          stroke="none"
                          fill="#30D158"
                          fillOpacity={0.2}
                        />
                        <Line type="monotone" dataKey="sdi_score_100" name="SDI-100 (P50)" stroke="#30D158" strokeWidth={2.2} />
                        <Line type="monotone" dataKey="sibcs_reserve_margin_pct" name="Margen SIBCS %" stroke="#0A84FF" strokeWidth={1.8} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {simulation.vvuq && (
                    <div className="rounded-xl bg-white/[0.04] p-2.5 space-y-1 text-[10px]">
                      <div className="flex items-center justify-between text-[#64D2FF] font-semibold">
                        <span>Validación &amp; VVUQ</span>
                        <span className="font-mono-num text-[9.5px] text-[#30D158]">
                          MAPE Pob 2010–20:{" "}
                          {String(simulation.vvuq.validation_error_rmse_or_mape.demographic_2010_2020_mape_pct ?? "8.39")}%
                        </span>
                      </div>
                      <p className="font-mono-num text-[10px] text-[#EBEBF5]/80">
                        SDI 2050 P10/P50/P90:{" "}
                        <span className="text-[#30D158] font-semibold">
                          {simulation.trajectory[simulation.trajectory.length - 1]?.sdi_p10 ?? "-"} /{" "}
                          {simulation.sdi_score_2050} /{" "}
                          {simulation.trajectory[simulation.trajectory.length - 1]?.sdi_p90 ?? "-"}
                        </span>{" "}
                        · RMSE: {String(simulation.vvuq.validation_error_rmse_or_mape.aquifer_2020_2023_rmse_hm3 ?? "2.23")} hm³
                      </p>
                      <p className="text-[9.5px] text-[#FF9F0A]/90 leading-snug">
                        {simulation.vvuq.legal_disclaimer}
                      </p>
                    </div>
                  )}
                </div>

                {/* Coupled OGC Physics Simulation Workers (Cloud Run Jobs) */}
                {onRunPhysicsProcess && (
                  <div className="ios-surface rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#64D2FF]">
                        Motores Físicos OGC · Cloud Run Jobs
                      </span>
                      {physicsOverlay && onClearPhysicsOverlay && (
                        <button
                          type="button"
                          onClick={onClearPhysicsOverlay}
                          className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-[#EBEBF5]/80 hover:bg-[#FF453A]/20 hover:text-[#FF453A] cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Limpiar</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("arroyo_flood_sfincs")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-2.5 py-2 text-left text-[11px] font-medium text-[#F5F5F7] hover:bg-white/[0.1] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF453A]/20 text-[#FF453A]">
                            <Waves className="h-3.5 w-3.5" />
                          </span>
                          <span>Inundación 2D Arroyos (SFINCS)</span>
                        </span>
                        <span className="font-mono-num text-[9.5px] text-[#EBEBF5]/55">COG + Vector</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("network_isochrone_r5py")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-2.5 py-2 text-left text-[11px] font-medium text-[#F5F5F7] hover:bg-white/[0.1] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0A84FF]/20 text-[#0A84FF]">
                            <Route className="h-3.5 w-3.5" />
                          </span>
                          <span>Isócronas Red Vial 15-Min (r5py)</span>
                        </span>
                        <span className="font-mono-num text-[9.5px] text-[#EBEBF5]/55">Dijkstra</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("water_network_wntr")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-2.5 py-2 text-left text-[11px] font-medium text-[#F5F5F7] hover:bg-white/[0.1] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#64D2FF]/20 text-[#64D2FF]">
                            <Droplets className="h-3.5 w-3.5" />
                          </span>
                          <span>Hidráulica Tandeo / Morada (WNTR)</span>
                        </span>
                        <span className="font-mono-num text-[9.5px] text-[#EBEBF5]/55">PDD 24h</span>
                      </button>
                    </div>

                    {physicsJobStatus && (
                      <div className="rounded-xl bg-white/[0.04] p-2.5 text-[10.5px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-semibold text-[#F5F5F7]">
                            {physicsJobStatus.status === "accepted" || physicsJobStatus.status === "running" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-[#0A84FF]" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 text-[#30D158]" />
                            )}
                            <span>{physicsJobStatus.processID}</span>
                          </span>
                          <span className="font-mono-num text-[9.5px] uppercase text-[#64D2FF]">
                            {physicsJobStatus.status} · {physicsJobStatus.execution_backend || "async"}
                          </span>
                        </div>
                        {physicsJobStatus.error && (
                          <p className="text-[10px] text-[#FF453A]">{physicsJobStatus.error}</p>
                        )}
                        {physicsOverlay?.jobId === physicsJobStatus.jobID && (
                          <div className="space-y-1 pt-0.5 text-[#EBEBF5]/80 font-mono-num text-[10px]">
                            {physicsOverlay.processId === "arroyo_flood_sfincs" && (
                              <p>
                                Edif. expuestos (&gt;0.3m):{" "}
                                <strong className="text-[#FF453A]">
                                  {Number(physicsOverlay.result.summary.buildings_exposed_gt_03m || 0).toLocaleString()}
                                </strong>{" "}
                                · Máx: {String(physicsOverlay.result.summary.max_depth_m)} m
                              </p>
                            )}
                            {physicsOverlay.processId === "network_isochrone_r5py" && (
                              <p>
                                Área 15m:{" "}
                                <strong className="text-[#0A84FF]">{String(physicsOverlay.result.summary.area_15m_ha)} ha</strong>{" "}
                                · Score red: {String(physicsOverlay.result.summary.network_15m_score)} pts (Δ{" "}
                                {String(physicsOverlay.result.summary.score_delta_network_vs_euclid)})
                              </p>
                            )}
                            {physicsOverlay.processId === "water_network_wntr" && (
                              <p>
                                Presión:{" "}
                                <strong className="text-[#64D2FF]">
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
                                className="inline-flex items-center gap-1 text-[#0A84FF] hover:underline"
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
            <div className="ios-surface flex items-center justify-between rounded-2xl px-3.5 py-3">
              <div>
                <p className="text-[10.5px] text-[#EBEBF5]/60">Índice SDI-100 Ontología v3</p>
                <p className="font-mono-num text-[22px] font-semibold tracking-tight text-[#30D158]">
                  {recommendations.sdi_100.sdi_score_100}
                  <span className="text-[11px] font-normal text-[#EBEBF5]/50"> / 100</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportReport}
                className="flex items-center gap-1.5 rounded-full bg-[#0A84FF] hover:bg-[#409CFF] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Dossier</span>
              </button>
            </div>

            {/* Priority Spatial Action Cards */}
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold text-[#EBEBF5]/65">
                Intervenciones Prioritarias
              </p>
              {recommendations.priority_actions.map((act) => (
                <div
                  key={act.id}
                  className="ios-surface rounded-2xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#FF9F0A]/15 px-2 py-0.5 font-mono-num text-[9.5px] font-semibold text-[#FF9F0A]">
                      {act.priority}
                    </span>
                    <span className="font-mono-num text-[10px] text-[#64D2FF]">{act.metric_badge}</span>
                  </div>
                  <h4 className="text-[12.5px] font-semibold text-[#F5F5F7]">{act.title}</h4>
                  <p className="text-[11px] leading-snug text-[#EBEBF5]/75">{act.rationale}</p>
                  <button
                    type="button"
                    onClick={() => onFlyTo(act.camera)}
                    className="flex items-center gap-1.5 rounded-full bg-[#30D158]/15 px-3 py-1 text-[11px] font-semibold text-[#30D158] hover:bg-[#30D158]/25 transition-colors cursor-pointer"
                  >
                    <Navigation className="h-3 w-3" />
                    <span>Volar al Polígono en 3D</span>
                  </button>
                </div>
              ))}
            </div>

            {/* 6 Ontology Decision Lenses */}
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold text-[#EBEBF5]/65">
                6 Lentes Estratégicas (bcs2050_kg_v3)
              </p>
              <div className="ios-surface rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
                {recommendations.decision_lenses.map((lens) => (
                  <div key={lens.lens_id} className="px-3 py-2.5 flex items-center justify-between text-[11.5px]">
                    <span className="font-medium text-[#F5F5F7]">{lens.lens_name}</span>
                    <span
                      className={`font-mono-num font-semibold ${
                        lens.score_100 >= 72
                          ? "text-[#30D158]"
                          : lens.score_100 >= 48
                            ? "text-[#FF9F0A]"
                            : "text-[#FF453A]"
                      }`}
                    >
                      {lens.score_100} ({lens.verdict})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {recommendations.contradictions.length > 0 && (
              <div className="rounded-2xl bg-[#FF453A]/12 p-3 ring-1 ring-[#FF453A]/30 space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FF453A]">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Contradicciones Territoriales Detectadas
                </p>
                {recommendations.contradictions.slice(0, 3).map((c, idx) => (
                  <p key={idx} className="text-[10.5px] text-[#EBEBF5]/85 leading-snug">
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
