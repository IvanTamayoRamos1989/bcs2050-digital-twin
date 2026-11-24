import React from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Factory,
  Footprints,
  Route,
} from "lucide-react";
import type { AgebMetricKey, ChallengeId, LayerVisibility } from "../types/twin";
import { METRIC_CATALOG } from "../utils/colorScales";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeChallenge: ChallengeId;
  onSelectChallenge: (c: ChallengeId) => void;
  activeMetric: AgebMetricKey;
  onSelectMetric: (m: AgebMetricKey) => void;
  layers: LayerVisibility;
  onToggleLayer: (k: keyof LayerVisibility) => void;
  extrusionScale: number;
  onExtrusionScaleChange: (v: number) => void;
  agebs3dMode: boolean;
  onToggleAgebs3d: () => void;
}

const CHALLENGES: {
  id: ChallengeId;
  label: string;
  icon: React.ReactNode;
  defaultMetric: AgebMetricKey;
  metrics: AgebMetricKey[];
}[] = [
  {
    id: "housing_land",
    label: "Vivienda y Suelo",
    icon: <Building2 className="h-3.5 w-3.5" />,
    defaultMetric: "infill_homes_potential",
    metrics: ["infill_homes_potential", "density_hab_ha_2025", "city_science_index"],
  },
  {
    id: "urban_form_15m",
    label: "Forma Urbana 15-Min",
    icon: <Footprints className="h-3.5 w-3.5" />,
    defaultMetric: "city15_score",
    metrics: ["city15_score", "fractality_score", "harmony_score", "landuse_entropy_score"],
  },
  {
    id: "economy_clusters",
    label: "Economía y Clústeres",
    icon: <Factory className="h-3.5 w-3.5" />,
    defaultMetric: "city_science_index",
    metrics: ["city_science_index", "landuse_entropy_score", "density_hab_ha_2025"],
  },
  {
    id: "water_energy_climate",
    label: "Agua, Energía y Clima",
    icon: <Droplets className="h-3.5 w-3.5" />,
    defaultMetric: "carrying_resilience_score",
    metrics: ["carrying_resilience_score", "solar_mw", "surge_exposed_pct"],
  },
  {
    id: "mobility_corridors",
    label: "Movilidad y Corredores",
    icon: <Route className="h-3.5 w-3.5" />,
    defaultMetric: "city15_score",
    metrics: ["city15_score", "fractality_score", "carrying_resilience_score"],
  },
];

const LAYER_CONTROLS: { key: keyof LayerVisibility; label: string; count: string; dot: string }[] = [
  { key: "buildings3d", label: "Edificios 3D Reales", count: "396,823", dot: "bg-sky-400" },
  { key: "agebs", label: "AGEBs City Science", count: "1,155", dot: "bg-emerald-400" },
  { key: "zoning", label: "Zonificación CUS/COS", count: "79,515", dot: "bg-amber-400" },
  { key: "aquifers", label: "Acuíferos CONAGUA", count: "40", dot: "bg-cyan-400" },
  { key: "tandeo", label: "Tandeo OOMSAPAS LPZ", count: "280", dot: "bg-rose-400" },
  { key: "powerGrid", label: "Red Eléctrica SIBCS", count: "150", dot: "bg-yellow-400" },
  { key: "plannedProjects", label: "Desaladoras / Proyectos", count: "9", dot: "bg-fuchsia-400" },
  { key: "services", label: "Equipamiento Esencial", count: "3,510", dot: "bg-teal-300" },
  { key: "transit", label: "Paradas y Rutas", count: "122", dot: "bg-indigo-400" },
  { key: "corridorArcs", label: "Arcos Corredores BCS", count: "6", dot: "bg-sky-300" },
  { key: "poer", label: "UGAs POERBCS", count: "1,990", dot: "bg-lime-400" },
  { key: "anps", label: "ANPs CONANP", count: "76", dot: "bg-green-500" },
  { key: "liveTelemetry", label: "Monitoreo Vivo AIS/Aéreo", count: "LIVE", dot: "bg-cyan-300" },
];

export const ChallengeLayerDock: React.FC<Props> = ({
  collapsed,
  onToggleCollapse,
  activeChallenge,
  onSelectChallenge,
  activeMetric,
  onSelectMetric,
  layers,
  onToggleLayer,
  extrusionScale,
  onExtrusionScaleChange,
  agebs3dMode,
  onToggleAgebs3d,
}) => {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="glass-panel pointer-events-auto absolute left-3 top-[92px] z-20 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-slate-800/90 cursor-pointer"
      >
        <ChevronRight className="h-4 w-4" />
        <span>Retos y Capas</span>
      </button>
    );
  }

  const currentChallenge = CHALLENGES.find((c) => c.id === activeChallenge) || CHALLENGES[0];
  const metricMeta = METRIC_CATALOG[activeMetric];

  return (
    <aside className="glass-panel pointer-events-auto absolute left-3 top-[92px] z-20 flex max-h-[calc(100vh-108px)] w-[304px] flex-col rounded-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-3.5 py-2.5">
        <div>
          <p className="font-mono-num text-[10px] uppercase tracking-widest text-sky-400">
            5 Retos Urbanos · Capas
          </p>
          <h2 className="text-xs font-bold text-white">Explorador City Science</h2>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Colapsar panel izquierdo"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="twin-scroll overflow-y-auto p-3 space-y-3.5">
        {/* 5 Core Challenges */}
        <div className="grid grid-cols-1 gap-1">
          {CHALLENGES.map((ch) => {
            const active = ch.id === activeChallenge;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  onSelectChallenge(ch.id);
                  onSelectMetric(ch.defaultMetric);
                }}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/50"
                    : "bg-slate-900/50 text-slate-300 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={active ? "text-sky-400" : "text-slate-400"}>{ch.icon}</span>
                  {ch.label}
                </span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
              </button>
            );
          })}
        </div>

        {/* Active KPI Metric */}
        <div className="rounded-lg bg-slate-900/75 p-2.5 ring-1 ring-slate-700/70 space-y-2">
          <p className="font-mono-num text-[10px] uppercase tracking-wider text-slate-400">
            Variable Temática 3D Activa
          </p>
          <div className="flex flex-wrap gap-1">
            {currentChallenge.metrics.map((mKey) => {
              const mm = METRIC_CATALOG[mKey];
              const isSel = mKey === activeMetric;
              return (
                <button
                  key={mKey}
                  type="button"
                  onClick={() => onSelectMetric(mKey)}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold cursor-pointer ${
                    isSel
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {mm.shortLabel}
                </button>
              );
            })}
          </div>
          <p className="text-[10.5px] leading-snug text-slate-300">{metricMeta.description}</p>

          {/* Dynamic Gradient Legend */}
          <div className="pt-1">
            <div
              className="h-2 w-full rounded-full"
              style={{
                background: `linear-gradient(90deg, rgb(${metricMeta.lowColor.join(",")}), rgb(${metricMeta.midColor.join(",")}), rgb(${metricMeta.highColor.join(",")}))`,
              }}
            />
            <div className="mt-1 flex justify-between font-mono-num text-[9.5px] text-slate-400">
              <span>0 {metricMeta.unit}</span>
              <span>{Math.round(metricMeta.maxValue / 2)} {metricMeta.unit}</span>
              <span>{metricMeta.maxValue}+ {metricMeta.unit}</span>
            </div>
          </div>
        </div>

        {/* 3D Extrusion Controls */}
        <div className="rounded-lg bg-slate-900/75 p-2.5 ring-1 ring-slate-700/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-200">Extrusión 3D</span>
            <span className="font-mono-num text-[11px] text-sky-400">{extrusionScale.toFixed(1)}×</span>
          </div>
          <input
            aria-label="Factor de extrusión 3D"
            type="range"
            min={0.5}
            max={4.0}
            step={0.1}
            value={extrusionScale}
            onChange={(e) => onExtrusionScaleChange(Number(e.target.value))}
            className="w-full accent-sky-400 cursor-pointer"
          />
          <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
            <span>Extruir Prismas AGEB 3D</span>
            <input
              type="checkbox"
              checked={agebs3dMode}
              onChange={onToggleAgebs3d}
              className="accent-sky-400 cursor-pointer"
            />
          </label>
        </div>

        {/* Layer Toggles */}
        <div className="space-y-1.5">
          <p className="font-mono-num text-[10px] uppercase tracking-wider text-slate-400">
            Capas Geoespaciales del Gemelo
          </p>
          {LAYER_CONTROLS.map((lc) => {
            const on = layers[lc.key];
            return (
              <label
                key={lc.key}
                className="flex items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-slate-800/70 cursor-pointer"
              >
                <span className="flex items-center gap-2 text-slate-200">
                  <span className={`h-2 w-2 rounded-full ${lc.dot} ${on ? "opacity-100" : "opacity-30"}`} />
                  <span className={on ? "text-slate-100" : "text-slate-500"}>{lc.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono-num text-[9.5px] text-slate-400">{lc.count}</span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggleLayer(lc.key)}
                    className="accent-sky-400 cursor-pointer"
                  />
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
