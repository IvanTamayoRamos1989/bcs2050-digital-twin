import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
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
  scenarioName: string;
  onSelectScenario: (name: string) => void;
  targetYear: number;
  onTargetYearChange: (yr: number) => void;
  customLevers: Record<string, number>;
  onLeverChange: (k: string, val: number) => void;
  simulation: SimulationResponse | null;
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
  { id: "COMPACT_SUSTAINABLE_2050", labelEs: "Compacta 15-Min", labelEn: "Compact 15-Min", badgeEs: "Óptima", badgeEn: "Optimal", badgeCls: "text-[var(--hig-green)]" },
  { id: "BAU_TENDENCIAL", labelEs: "BAU Tendencial", labelEn: "BAU Baseline", badgeEs: "Riesgo", badgeEn: "Risk", badgeCls: "text-[var(--hig-amber)]" },
  { id: "HIGH_GROWTH_TOURISM_STRESS", labelEs: "Auge Turístico +65%", labelEn: "Tourism Boom +65%", badgeEs: "Estrés", badgeEn: "Stress", badgeCls: "text-[var(--hig-red)]" },
  { id: "CLIMATE_SHOCK_IPCC_SSP585", labelEs: "Choque IPCC SSP5-8.5", labelEn: "IPCC SSP5-8.5 Shock", badgeEs: "Clima", badgeEn: "Climate", badgeCls: "text-[var(--hig-cyan)]" },
];

const YEARS = [2025, 2027, 2031, 2035, 2040, 2050];

const CHART_TOOLTIP_STYLE = {
  background: "var(--hig-tooltip-bg)",
  border: "1px solid var(--hig-border)",
  borderRadius: 12,
  fontSize: 11,
  color: "var(--hig-ink)",
  boxShadow: "0 10px 28px rgba(0,0,0,0.12)",
};

export const PhaseTelemetryPanel: React.FC<Props> = ({
  collapsed,
  onToggleCollapse,
  phase,
  onPhaseChange,
  language = "en",
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
    return null;
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

  const radarData = isEn
    ? [
        { pillar: "15-Min", score: activeStats.c15 },
        { pillar: "Fractality", score: activeStats.frac },
        { pillar: "Harmony", score: activeStats.harm },
        { pillar: "Land-Use Mix", score: activeStats.ent },
        { pillar: "Carrying Cap.", score: activeStats.carry },
        { pillar: "Vitality", score: activeStats.socio },
      ]
    : [
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
      aria-label={
        isEn
          ? "Technical telemetry, 2050 simulator and physics models inspector"
          : "Panel técnico de telemetría, simulador 2050 y modelos físicos"
      }
      className="hig-glass-sidebar pointer-events-auto absolute z-30 sm:z-20 flex flex-col overflow-hidden max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-h-[76vh] max-sm:rounded-b-none max-sm:rounded-t-[28px] sm:right-4 sm:top-[72px] sm:w-[388px] sm:max-h-[calc(100%-240px)] sm:rounded-[24px]"
    >
      {/* Mobile iOS Sheet Grabber */}
      <div
        aria-hidden="true"
        className="sm:hidden mx-auto mt-2.5 mb-1 h-1 w-9 shrink-0 rounded-full bg-[var(--hig-ink-3)]"
      />

      {/* Inspector Header + Inline 4-Phase HIG Segmented Control */}
      <div className="border-b border-[var(--hig-divider)] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium tracking-wide text-[var(--hig-ink-2)]">
              {phase === "diagnostics" && (isEn ? "Phase 01 · City Science" : "Fase 01 · City Science")}
              {phase === "goals" && (isEn ? "Phase 02 · 2050 Targets" : "Fase 02 · Metas 2050")}
              {phase === "scenarios" && (isEn ? "Phase 03 · Counterfactual Lab" : "Fase 03 · Simulador")}
              {phase === "recommendations" && (isEn ? "Phase 04 · Strategic Lenses" : "Fase 04 · Acciones")}
            </p>
            <h2 className="truncate text-[16px] font-semibold tracking-tight text-[var(--hig-ink)]">
              {activeStats.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isEn ? "Collapse telemetry inspector" : "Colapsar panel derecho"}
            className="hidden sm:flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isEn ? "Done" : "Listo"}
            className="sm:hidden min-h-[36px] rounded-full bg-[var(--hig-pill-bg)] px-3.5 py-1 text-[12px] font-semibold text-[var(--hig-accent)] cursor-pointer"
          >
            {isEn ? "Done" : "Listo"}
          </button>
        </div>

        {/* 4-Tab HIG Segmented Control */}
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
                    : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
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
              <div className="hig-content-group rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[var(--hig-ink-2)]">
                  {isEn ? "City Science Index" : "Índice City Science"}
                </p>
                <p className="font-mono-num mt-1 text-[22px] font-semibold tracking-tight text-[var(--hig-green)]">
                  {activeStats.csi}
                  <span className="text-[11px] font-normal text-[var(--hig-ink-3)]"> / 100</span>
                </p>
              </div>
              <div className="hig-content-group rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[var(--hig-ink-2)]">
                  {isEn ? "15-Minute City" : "Ciudad 15-Minutos"}
                </p>
                <p className="font-mono-num mt-1 text-[22px] font-semibold tracking-tight text-[var(--hig-accent)]">
                  {activeStats.c15}
                  <span className="text-[11px] font-normal text-[var(--hig-ink-3)]"> pts</span>
                </p>
              </div>
              <div className="hig-content-group rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[var(--hig-ink-2)]">
                  {isEn ? "3D Buildings · Pop." : "Edificios 3D · Pob."}
                </p>
                <p className="font-mono-num mt-1 text-[15px] font-semibold tracking-tight text-[var(--hig-ink)]">
                  {activeStats.buildings.toLocaleString()}
                </p>
                <p className="font-mono-num mt-0.5 text-[10px] text-[var(--hig-green)]">
                  {activeStats.popOfficial2020.toLocaleString()} INEGI 2020
                </p>
                <p className="font-mono-num text-[10px] text-[var(--hig-cyan)]">
                  {activeStats.pop.toLocaleString()} {isEn ? "2025 Proj." : "Proy. 2025"}
                </p>
              </div>
              <div className="hig-content-group rounded-2xl p-3">
                <p className="text-[10.5px] font-medium text-[var(--hig-ink-2)]">
                  {isEn ? "2050 Infill Capacity" : "Capacidad Infill 2050"}
                </p>
                <p className="font-mono-num mt-1 text-[15px] font-semibold tracking-tight text-[var(--hig-green)]">
                  +{activeStats.infill.toLocaleString()} {isEn ? "homes" : "viv"}
                </p>
                <p className="font-mono-num mt-0.5 text-[10px] text-[var(--hig-ink-2)]">
                  Solar: {activeStats.solarMw.toLocaleString()} MW
                </p>
              </div>
            </div>

            {/* Reconciled Official CONAGUA Aquifer Balance */}
            <div className="hig-content-group rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px]">
              <div>
                <span className="text-[10.5px] font-semibold text-[var(--hig-cyan)]">
                  {isEn ? "BCS Aquifers (CONAGUA DOF 2023)" : "Acuíferos BCS (CONAGUA DOF 2023)"}
                </span>
                <p className="font-mono-num mt-0.5 text-[10.5px] text-[var(--hig-ink-2)]">
                  {isEn
                    ? `${aquifersNoAvailCount} / ${aquifersOfficialCount} no surplus · ${aquifersStrictDeficit} deficit < 0 (+1 offset 0228)`
                    : `${aquifersNoAvailCount} / ${aquifersOfficialCount} sin disponibilidad · ${aquifersStrictDeficit} déficit < 0 (+1 comp. 0228)`}
                </p>
              </div>
              <span className="rounded-full bg-[#64D2FF]/15 px-2 py-0.5 font-mono-num text-[9.5px] font-semibold text-[var(--hig-cyan)] shrink-0">
                {isEn ? "OFFICIAL" : "OFICIAL"}
              </span>
            </div>

            {/* Radar Chart */}
            <div className="hig-content-group rounded-2xl p-3.5">
              <p className="text-[11px] font-semibold text-[var(--hig-ink-2)] mb-1">
                {isEn ? "City Science Footprint (6 Dimensions)" : "Huella City Science (6 Dimensiones)"}
              </p>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="var(--hig-divider)" />
                    <PolarAngleAxis dataKey="pillar" tick={{ fill: "var(--hig-ink-2)", fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="score" stroke="var(--hig-accent)" fill="var(--hig-accent)" fillOpacity={0.26} strokeWidth={2} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Deep Click-to-Inspect Telemetry Card */}
            {inspection ? (
              <div className="hig-content-group rounded-2xl p-3.5 ring-1 ring-[var(--hig-accent)]/35 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono-num text-[11px] font-semibold text-[var(--hig-cyan)]">
                    <MapPin className="h-3.5 w-3.5" />
                    {inspection.coordinates.lon}, {inspection.coordinates.lat}
                  </span>
                  <button
                    type="button"
                    onClick={onClearInspection}
                    className="rounded-full bg-[var(--hig-pill-bg)] px-2.5 py-0.5 text-[10.5px] font-medium text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] cursor-pointer"
                  >
                    {isEn ? "Close" : "Cerrar"}
                  </button>
                </div>

                {inspection.building && (
                  <div className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 text-[11px] space-y-0.5">
                    <p className="font-semibold text-[var(--hig-amber)]">
                      {isEn ? "3D Building" : "Edificio 3D"} · {String(inspection.building.city_name || "")}
                    </p>
                    <p className="font-mono-num text-[var(--hig-ink)]">
                      {isEn ? "Height" : "Altura"}: {String(inspection.building.height_m)} m ({String(inspection.building.floors)}{" "}
                      {isEn ? "floors" : "niveles"}) · GFA: {Number(inspection.building.gfa_m2 || 0).toLocaleString()} m²
                    </p>
                    <p className="font-mono-num text-[var(--hig-ink-2)]">
                      {isEn ? "Rooftop Solar PV" : "Solar PV Techo"}: {String(inspection.building.solar_kwp)} kWp ·{" "}
                      {isEn ? "Elev" : "Cota"}: {String(inspection.building.ground_elev_m)} {isEn ? "masl" : "msnm"}
                    </p>
                  </div>
                )}

                {inspection.ageb && (
                  <div className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 text-[11px] space-y-1">
                    <p className="font-semibold text-[var(--hig-ink)]">
                      AGEB {String(inspection.ageb.cvegeo_ageb)} · {String(inspection.ageb.municipality_name)}
                    </p>
                    <div className="grid grid-cols-3 gap-1 font-mono-num text-[10.5px]">
                      <span className="text-[var(--hig-green)]">CSI: {String(inspection.ageb.city_science_index)}</span>
                      <span className="text-[var(--hig-accent)]">15m: {String(inspection.ageb.city15_score)}</span>
                      <span className="text-[var(--hig-cyan)]">Frac: {String(inspection.ageb.fractality_score)}</span>
                    </div>
                    <p className="text-[10.5px] text-[var(--hig-ink-2)]">
                      {isEn ? "2025 Pop" : "Pob 2025"}: {Number(inspection.ageb.pobtot_2025_eic_calibrated || 0).toLocaleString()}{" "}
                      {isEn ? "res" : "hab"} · Infill: +{Number(inspection.ageb.infill_homes_potential || 0).toLocaleString()}{" "}
                      {isEn ? "homes" : "viv"} · Solar: {String(inspection.ageb.solar_mw)} MW
                    </p>
                  </div>
                )}

                {inspection.zoning && (
                  <div className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 text-[11px] text-[var(--hig-ink-2)]">
                    <span className="font-semibold text-[var(--hig-amber)]">{isEn ? "Zoning:" : "Zonificación:"}</span>{" "}
                    {String(inspection.zoning.category)} ({String(inspection.zoning.land_use_code || (isEn ? "N/A" : "N/D"))}) · COS{" "}
                    {String(inspection.zoning.cos_max ?? (isEn ? "N/A" : "N/D"))} / CUS{" "}
                    {String(inspection.zoning.cus_max ?? (isEn ? "N/A" : "N/D"))}
                  </div>
                )}

                <div className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 text-[11px] space-y-1">
                  {inspection.aquifer && (
                    <p className="text-[var(--hig-cyan)]">
                      <strong>{isEn ? "Aquifer" : "Acuífero"} {String(inspection.aquifer.aquifer_code)}:</strong>{" "}
                      {String(inspection.aquifer.aquifer_name)} · DMA{" "}
                      <span className="font-mono-num font-semibold">{String(inspection.aquifer.dma_2023_hm3)} hm³/yr</span>
                    </p>
                  )}
                  {inspection.tandeo_lapaz && (
                    <p className="text-[var(--hig-red)] font-medium">
                      {isEn ? "OOMSAPAS Rationing Alert: Sector" : "Alerta Tandeo OOMSAPAS: Sector"}{" "}
                      {String(inspection.tandeo_lapaz.nombre)} ({String(inspection.tandeo_lapaz.dias)})
                    </p>
                  )}
                  {inspection.poer_uga && (
                    <p className="text-[var(--hig-green)]">
                      <strong>POERBCS:</strong> {String(inspection.poer_uga.environmental_policy)} (
                      {String(inspection.poer_uga.macro_zone_class)})
                    </p>
                  )}
                  {inspection.protected_area && (
                    <p className="text-[var(--hig-green)] font-medium">
                      {isEn ? "CONANP Protected Area" : "ANP CONANP"}: {String(inspection.protected_area.area_name)}
                    </p>
                  )}
                  {inspection.nearest_services?.health?.[0] && (
                    <p className="text-[var(--hig-ink-2)]">
                      <strong>{isEn ? "Nearest Health:" : "Salud cercana:"}</strong> {inspection.nearest_services.health[0].name} (
                      {inspection.nearest_services.health[0].walk_m} m ·{" "}
                      {inspection.nearest_services.health[0].walk_min} min)
                    </p>
                  )}
                  {inspection.nearest_services?.education?.[0] && (
                    <p className="text-[var(--hig-ink-2)]">
                      <strong>{isEn ? "Nearest School:" : "Escuela cercana:"}</strong> {inspection.nearest_services.education[0].name} (
                      {inspection.nearest_services.education[0].walk_m} m)
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--hig-border)] p-3.5 text-center text-[11px] text-[var(--hig-ink-3)] leading-relaxed">
                {isEn
                  ? "Click any 3D building, AGEB polygon, or point on the map to inspect its full territorial dossier."
                  : "Haz clic en cualquier edificio 3D, AGEB o punto del mapa para inspeccionar su expediente completo."}
              </div>
            )}
          </>
        )}

        {/* PHASE 2: GOAL SETTING */}
        {phase === "goals" && (
          <>
            <div className="hig-content-group rounded-2xl p-3.5 space-y-3">
              <p className="text-[11px] font-semibold text-[var(--hig-ink-2)]">
                {isEn ? "2050 Normative Horizon Targets" : "Metas Normativas Horizontes 2050"}
              </p>
              {[
                { key: "target_city15_score" as const, label: isEn ? "15-Min City Target" : "Meta Ciudad 15-Min", min: 65, max: 98, unit: "pts" },
                { key: "target_infill_share_pct" as const, label: isEn ? "Infill Growth Share" : "Crecimiento vía Infill", min: 20, max: 90, unit: "%" },
                { key: "target_ptar_reuse_pct" as const, label: isEn ? "WWTP Purple-Line Reuse" : "Reúso PTAR Línea Morada", min: 20, max: 90, unit: "%" },
                { key: "target_rooftop_solar_pct" as const, label: isEn ? "Rooftop Solar Adoption" : "Adopción Solar en Techos", min: 10, max: 80, unit: "%" },
                { key: "target_suds_coverage_pct" as const, label: isEn ? "Arroyos & SUDS Drainage" : "Arroyos & Drenaje SUDS", min: 20, max: 100, unit: "%" },
              ].map((s) => (
                <div key={s.key} className="space-y-1.5">
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-[var(--hig-ink-2)]">{s.label}</span>
                    <span className="font-mono-num font-semibold text-[var(--hig-green)]">
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
                  <div className="hig-content-group rounded-2xl p-3">
                    <p className="text-[10.5px] font-medium text-[var(--hig-ink-2)]">
                      {isEn ? "New Homes 2050" : "Nuevas Viv. 2050"}
                    </p>
                    <p className="font-mono-num mt-1 text-[16px] font-semibold text-[var(--hig-ink)]">
                      {goalGap.projected_new_homes_2050.toLocaleString()}
                    </p>
                    <p className="text-[10.5px] text-[var(--hig-green)]">
                      {isEn ? "Infill coverage:" : "Cobertura infill:"} {goalGap.infill_absorption_coverage_pct}%
                    </p>
                  </div>
                  <div className="hig-content-group rounded-2xl p-3">
                    <p className="text-[10.5px] font-medium text-[var(--hig-ink-2)]">
                      {isEn ? "Required CAPEX" : "CAPEX Requerido"}
                    </p>
                    <p className="font-mono-num mt-1 text-[16px] font-semibold text-[var(--hig-amber)]">
                      ${goalGap.estimated_capex_mdp_mxn.toLocaleString()} MDP
                    </p>
                    <p className="text-[10.5px] text-[var(--hig-cyan)]">
                      Desal: +{goalGap.recommended_desal_lps} lps · {goalGap.target_solar_mw} MW
                    </p>
                  </div>
                </div>

                <div className="hig-content-group rounded-2xl p-3.5">
                  <p className="text-[11px] font-semibold text-[var(--hig-ink-2)] mb-1.5">
                    {isEn ? "Baseline vs 2050 Target Gap" : "Brecha Línea Base vs Meta 2050"}
                  </p>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={goalGap.pillars} layout="vertical" margin={{ left: 10, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--hig-divider)" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--hig-ink-3)", fontSize: 9 }} />
                        <YAxis dataKey="label" type="category" width={115} tick={{ fill: "var(--hig-ink-2)", fontSize: 9 }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="current" name={isEn ? "Current" : "Actual"} fill="var(--hig-ink-3)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="target" name={isEn ? "2050 Target" : "Meta 2050"} fill="var(--hig-green)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onApplyOptimalLevers(goalGap.optimal_levers)}
                  className="hig-lift flex w-full items-center justify-center gap-2 rounded-full bg-[var(--hig-accent)] hover:bg-[var(--hig-accent-hover)] px-4 py-2.5 text-[12px] font-semibold text-white shadow-md shadow-[var(--hig-accent)]/25 transition-colors cursor-pointer"
                >
                  <span>{isEn ? "Load Optimal Levers in Simulator" : "Cargar Palancas Óptimas en Simulador"}</span>
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
                        ? "bg-[var(--hig-accent)]/18 ring-1 ring-[var(--hig-accent)] text-[var(--hig-ink)]"
                        : "hig-content-group text-[var(--hig-ink-2)] hover:bg-[var(--hig-pill-bg)]"
                    }`}
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${sc.badgeCls}`}>
                      {isEn ? sc.badgeEn : sc.badgeEs}
                    </span>
                    <p className="text-[11.5px] font-semibold leading-tight mt-0.5 text-[var(--hig-ink)]">
                      {isEn ? sc.labelEn : sc.labelEs}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Horizon Time Segmented Pill */}
            <div className="hig-content-group rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-medium text-[var(--hig-ink-2)]">
                  {isEn ? "3D Time Horizon" : "Horizonte Temporal 3D"}
                </span>
                <span className="font-mono-num text-[14px] font-semibold text-[var(--hig-accent)]">{targetYear}</span>
              </div>
              <div className="ios-segmented grid grid-cols-6 gap-0.5">
                {YEARS.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => onTargetYearChange(yr)}
                    className={`rounded-full py-1 font-mono-num text-[10px] font-semibold transition-all cursor-pointer ${
                      targetYear === yr ? "ios-segment-active" : "text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>

            {simulation && (
              <>
                <div className="hig-content-group flex items-center justify-between rounded-2xl px-3 py-2">
                  <span className="text-[10.5px] font-medium text-[var(--hig-ink-2)] truncate">
                    {simulation.scenario_meta.title}
                  </span>
                  <span className="rounded-full bg-[#FF9F0A]/15 px-2 py-0.5 font-mono-num text-[9px] font-semibold text-[var(--hig-amber)] shrink-0">
                    {isEn ? "MODELED" : "MODELADO"}
                  </span>
                </div>

                {simulation.breach_warnings.length > 0 && (
                  <div className="rounded-2xl bg-[#FF453A]/14 p-3 ring-1 ring-[#FF453A]/35 text-[11px] text-[var(--hig-ink)] flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-[var(--hig-red)] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[var(--hig-red)]">
                        {isEn ? "Carrying Capacity Breach:" : "Ruptura Capacidad de Carga:"} {simulation.carrying_capacity_breach_year}
                      </p>
                      <p className="text-[10.5px] text-[var(--hig-ink-2)] mt-0.5">{simulation.breach_warnings[0]}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="hig-content-group rounded-2xl p-3">
                    <p className="text-[10.5px] text-[var(--hig-ink-2)]">SDI-100 ({targetYear})</p>
                    <p className="font-mono-num mt-0.5 text-[20px] font-semibold text-[var(--hig-green)]">
                      {simulation.active_year_snapshot.sdi_score_100}
                    </p>
                  </div>
                  <div className="hig-content-group rounded-2xl p-3">
                    <p className="text-[10.5px] text-[var(--hig-ink-2)]">
                      {isEn ? "Aquifer Balance" : "Balance Acuífero"}
                    </p>
                    <p
                      className={`font-mono-num mt-0.5 text-[20px] font-semibold ${
                        simulation.active_year_snapshot.aquifer_effective_balance_hm3_yr >= 0
                          ? "text-[var(--hig-green)]"
                          : "text-[var(--hig-red)]"
                      }`}
                    >
                      {simulation.active_year_snapshot.aquifer_effective_balance_hm3_yr} hm³
                    </p>
                  </div>
                  <div className="hig-content-group rounded-2xl p-3">
                    <p className="text-[10.5px] text-[var(--hig-ink-2)]">
                      {isEn ? "SIBCS Margin" : "Margen SIBCS"}
                    </p>
                    <p className="font-mono-num mt-0.5 text-[14px] font-semibold text-[var(--hig-cyan)]">
                      {simulation.active_year_snapshot.sibcs_headroom_mw} MW ({simulation.active_year_snapshot.sibcs_reserve_margin_pct}%)
                    </p>
                  </div>
                  <div className="hig-content-group rounded-2xl p-3">
                    <p className="text-[10.5px] text-[var(--hig-ink-2)]">
                      {isEn ? "Deployed Solar" : "Solar Desplegada"}
                    </p>
                    <p className="font-mono-num mt-0.5 text-[14px] font-semibold text-[var(--hig-amber)]">
                      {simulation.active_year_snapshot.deployed_rooftop_solar_mw.toLocaleString()} MW
                    </p>
                  </div>
                </div>

                {/* Policy Levers */}
                <div className="hig-content-group rounded-2xl p-3.5 space-y-2.5">
                  <p className="text-[11px] font-semibold text-[var(--hig-ink-2)]">
                    {isEn ? "Counterfactual Levers" : "Palancas Contrafactuales"}
                  </p>
                  {[
                    { k: "infill_share_pct", l: isEn ? "Urban Infill Share (%)" : "Infill Intraurbano (%)", min: 10, max: 90, step: 2 },
                    { k: "ptar_reuse_target_pct", l: isEn ? "Purple-Line Reuse (%)" : "Reúso Línea Morada (%)", min: 10, max: 90, step: 2 },
                    { k: "desalination_added_lps", l: isEn ? "SWRO Desalination (lps)" : "Desalación SWRO (lps)", min: 0, max: 600, step: 25 },
                    { k: "distributed_solar_share_pct", l: isEn ? "Distributed Solar (%)" : "Solar Distribuida (%)", min: 5, max: 75, step: 2 },
                    { k: "suds_coverage_pct", l: isEn ? "SUDS Coverage (%)" : "Cobertura SUDS (%)", min: 10, max: 95, step: 5 },
                  ].map((lv) => (
                    <div key={lv.k} className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--hig-ink-2)]">{lv.l}</span>
                        <span className="font-mono-num text-[var(--hig-accent)] font-semibold">
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
                <div className="hig-content-group rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-[var(--hig-ink-2)]">
                      {isEn ? "2025–2050 Trajectory (P10–P90)" : "Trayectoria 2025–2050 (P10–P90)"}
                    </p>
                    <span className="rounded-full bg-[#30D158]/15 px-2 py-0.5 font-mono-num text-[9px] font-semibold text-[var(--hig-green)]">
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
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--hig-divider)" />
                        <XAxis dataKey="year" tick={{ fill: "var(--hig-ink-3)", fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: "var(--hig-ink-3)", fontSize: 9 }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey="sdi_band"
                          name={isEn ? "SDI Band P10–P90" : "Banda SDI P10–P90"}
                          stroke="none"
                          fill="var(--hig-green)"
                          fillOpacity={0.2}
                        />
                        <Line type="monotone" dataKey="sdi_score_100" name="SDI-100 (P50)" stroke="var(--hig-green)" strokeWidth={2.2} />
                        <Line type="monotone" dataKey="sibcs_reserve_margin_pct" name={isEn ? "SIBCS Margin %" : "Margen SIBCS %"} stroke="var(--hig-accent)" strokeWidth={1.8} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {simulation.vvuq && (
                    <div className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 space-y-1 text-[10px]">
                      <div className="flex items-center justify-between text-[var(--hig-cyan)] font-semibold">
                        <span>{isEn ? "Validation & VVUQ" : "Validación & VVUQ"}</span>
                        <span className="font-mono-num text-[9.5px] text-[var(--hig-green)]">
                          {isEn ? "Pop 2010–20 MAPE:" : "MAPE Pob 2010–20:"}{" "}
                          {String(simulation.vvuq.validation_error_rmse_or_mape.demographic_2010_2020_mape_pct ?? "8.39")}%
                        </span>
                      </div>
                      <p className="font-mono-num text-[10px] text-[var(--hig-ink-2)]">
                        SDI 2050 P10/P50/P90:{" "}
                        <span className="text-[var(--hig-green)] font-semibold">
                          {simulation.trajectory[simulation.trajectory.length - 1]?.sdi_p10 ?? "-"} /{" "}
                          {simulation.sdi_score_2050} /{" "}
                          {simulation.trajectory[simulation.trajectory.length - 1]?.sdi_p90 ?? "-"}
                        </span>{" "}
                        · RMSE: {String(simulation.vvuq.validation_error_rmse_or_mape.aquifer_2020_2023_rmse_hm3 ?? "2.23")} hm³
                      </p>
                      <p className="text-[9.5px] text-[var(--hig-amber)] leading-snug">
                        {simulation.vvuq.legal_disclaimer}
                      </p>
                    </div>
                  )}
                </div>

                {/* Coupled OGC Physics Simulation Workers (Cloud Run Jobs) */}
                {onRunPhysicsProcess && (
                  <div className="hig-content-group rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--hig-cyan)]">
                        {isEn ? "OGC Physics Engines · Cloud Run Jobs" : "Motores Físicos OGC · Cloud Run Jobs"}
                      </span>
                      {physicsOverlay && onClearPhysicsOverlay && (
                        <button
                          type="button"
                          onClick={onClearPhysicsOverlay}
                          className="flex items-center gap-1 rounded-full bg-[var(--hig-pill-bg)] px-2 py-0.5 text-[10px] text-[var(--hig-ink-2)] hover:text-[var(--hig-red)] cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{isEn ? "Clear" : "Limpiar"}</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("arroyo_flood_sfincs")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex w-full items-center justify-between rounded-xl bg-[var(--hig-pill-bg)] px-2.5 py-2 text-left text-[11px] font-medium text-[var(--hig-ink)] hover:bg-[var(--hig-pill-hover)] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF453A]/18 text-[var(--hig-red)]">
                            <Waves className="h-3.5 w-3.5" />
                          </span>
                          <span>{isEn ? "2D Arroyo Flood (SFINCS)" : "Inundación 2D Arroyos (SFINCS)"}</span>
                        </span>
                        <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">COG + Vector</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("network_isochrone_r5py")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex w-full items-center justify-between rounded-xl bg-[var(--hig-pill-bg)] px-2.5 py-2 text-left text-[11px] font-medium text-[var(--hig-ink)] hover:bg-[var(--hig-pill-hover)] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0A84FF]/18 text-[var(--hig-accent)]">
                            <Route className="h-3.5 w-3.5" />
                          </span>
                          <span>{isEn ? "15-Min Road Isochrones (r5py)" : "Isócronas Red Vial 15-Min (r5py)"}</span>
                        </span>
                        <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">Dijkstra</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunPhysicsProcess("water_network_wntr")}
                        disabled={physicsJobStatus?.status === "accepted" || physicsJobStatus?.status === "running"}
                        className="flex w-full items-center justify-between rounded-xl bg-[var(--hig-pill-bg)] px-2.5 py-2 text-left text-[11px] font-medium text-[var(--hig-ink)] hover:bg-[var(--hig-pill-hover)] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#64D2FF]/18 text-[var(--hig-cyan)]">
                            <Droplets className="h-3.5 w-3.5" />
                          </span>
                          <span>{isEn ? "Water Supply & Purple-Line (WNTR)" : "Hidráulica Tandeo / Morada (WNTR)"}</span>
                        </span>
                        <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">PDD 24h</span>
                      </button>
                    </div>

                    {physicsJobStatus && (
                      <div className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 text-[10.5px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-semibold text-[var(--hig-ink)]">
                            {physicsJobStatus.status === "accepted" || physicsJobStatus.status === "running" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-[var(--hig-accent)]" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 text-[var(--hig-green)]" />
                            )}
                            <span>{physicsJobStatus.processID}</span>
                          </span>
                          <span className="font-mono-num text-[9.5px] uppercase text-[var(--hig-cyan)]">
                            {physicsJobStatus.status} · {physicsJobStatus.execution_backend || "async"}
                          </span>
                        </div>
                        {physicsJobStatus.error && (
                          <p className="text-[10px] text-[var(--hig-red)]">{physicsJobStatus.error}</p>
                        )}
                        {physicsOverlay?.jobId === physicsJobStatus.jobID && (
                          <div className="space-y-1 pt-0.5 text-[var(--hig-ink-2)] font-mono-num text-[10px]">
                            {physicsOverlay.processId === "arroyo_flood_sfincs" && (
                              <p>
                                {isEn ? "Exposed bldgs (>0.3m):" : "Edif. expuestos (>0.3m):"}{" "}
                                <strong className="text-[var(--hig-red)]">
                                  {Number(physicsOverlay.result.summary.buildings_exposed_gt_03m || 0).toLocaleString()}
                                </strong>{" "}
                                · {isEn ? "Max" : "Máx"}: {String(physicsOverlay.result.summary.max_depth_m)} m
                              </p>
                            )}
                            {physicsOverlay.processId === "network_isochrone_r5py" && (
                              <p>
                                {isEn ? "15m area:" : "Área 15m:"}{" "}
                                <strong className="text-[var(--hig-accent)]">{String(physicsOverlay.result.summary.area_15m_ha)} ha</strong>{" "}
                                · {isEn ? "Network score:" : "Score red:"} {String(physicsOverlay.result.summary.network_15m_score)} pts (Δ{" "}
                                {String(physicsOverlay.result.summary.score_delta_network_vs_euclid)})
                              </p>
                            )}
                            {physicsOverlay.processId === "water_network_wntr" && (
                              <p>
                                {isEn ? "Pressure:" : "Presión:"}{" "}
                                <strong className="text-[var(--hig-cyan)]">
                                  {String(physicsOverlay.result.summary.baseline_mean_pressure_m)} →{" "}
                                  {String(physicsOverlay.result.summary.scenario_mean_pressure_m)} m
                                </strong>{" "}
                                · {isEn ? "Sectors ≥15m:" : "Sectores ≥15m:"} {String(physicsOverlay.result.summary.nodes_restored_above_15m)}
                              </p>
                            )}
                            {physicsOverlay.result.artifact_urls?.flood_depth_cog && (
                              <a
                                href={physicsOverlay.result.artifact_urls.flood_depth_cog}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[var(--hig-accent)] hover:underline"
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
            <div className="hig-content-group flex items-center justify-between rounded-2xl px-3.5 py-3">
              <div>
                <p className="text-[10.5px] text-[var(--hig-ink-2)]">
                  {isEn ? "Ontology v3 SDI-100 Index" : "Índice SDI-100 Ontología v3"}
                </p>
                <p className="font-mono-num text-[22px] font-semibold tracking-tight text-[var(--hig-green)]">
                  {recommendations.sdi_100.sdi_score_100}
                  <span className="text-[11px] font-normal text-[var(--hig-ink-3)]"> / 100</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportReport}
                className="hig-lift flex items-center gap-1.5 rounded-full bg-[var(--hig-accent)] hover:bg-[var(--hig-accent-hover)] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Dossier</span>
              </button>
            </div>

            {/* Priority Spatial Action Cards */}
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold text-[var(--hig-ink-2)]">
                {isEn ? "Priority Interventions" : "Intervenciones Prioritarias"}
              </p>
              {recommendations.priority_actions.map((act) => (
                <div
                  key={act.id}
                  className="hig-content-group rounded-2xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#FF9F0A]/15 px-2 py-0.5 font-mono-num text-[9.5px] font-semibold text-[var(--hig-amber)]">
                      {act.priority}
                    </span>
                    <span className="font-mono-num text-[10px] text-[var(--hig-cyan)]">{act.metric_badge}</span>
                  </div>
                  <h4 className="text-[12.5px] font-semibold text-[var(--hig-ink)]">{act.title}</h4>
                  <p className="text-[11px] leading-snug text-[var(--hig-ink-2)]">{act.rationale}</p>
                  <button
                    type="button"
                    onClick={() => onFlyTo(act.camera)}
                    className="flex items-center gap-1.5 rounded-full bg-[#30D158]/15 px-3 py-1 text-[11px] font-semibold text-[var(--hig-green)] hover:bg-[#30D158]/25 transition-colors cursor-pointer"
                  >
                    <Navigation className="h-3 w-3" />
                    <span>{isEn ? "Fly to 3D Polygon" : "Volar al Polígono en 3D"}</span>
                  </button>
                </div>
              ))}
            </div>

            {/* 6 Ontology Decision Lenses */}
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold text-[var(--hig-ink-2)]">
                {isEn ? "6 Strategic Lenses (bcs2050_kg_v3)" : "6 Lentes Estratégicas (bcs2050_kg_v3)"}
              </p>
              <div className="hig-content-group rounded-2xl divide-y divide-[var(--hig-divider)] overflow-hidden">
                {recommendations.decision_lenses.map((lens) => (
                  <div key={lens.lens_id} className="px-3 py-2.5 flex items-center justify-between text-[11.5px]">
                    <span className="font-medium text-[var(--hig-ink)]">{lens.lens_name}</span>
                    <span
                      className={`font-mono-num font-semibold ${
                        lens.score_100 >= 72
                          ? "text-[var(--hig-green)]"
                          : lens.score_100 >= 48
                            ? "text-[var(--hig-amber)]"
                            : "text-[var(--hig-red)]"
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
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--hig-red)]">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {isEn ? "Territorial Contradictions Detected" : "Contradicciones Territoriales Detectadas"}
                </p>
                {recommendations.contradictions.slice(0, 3).map((c, idx) => (
                  <p key={idx} className="text-[10.5px] text-[var(--hig-ink-2)] leading-snug">
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
