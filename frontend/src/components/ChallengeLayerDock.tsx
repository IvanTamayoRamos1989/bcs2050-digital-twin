import React from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Eye,
  Factory,
  Footprints,
  Route,
} from "lucide-react";
import type { AgebMetricKey, ChallengeId, LayerVisibility } from "../types/twin";
import { METRIC_CATALOG, getMetricGradientCss } from "../utils/colorScales";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeChallenge: ChallengeId;
  onSelectChallenge: (c: ChallengeId) => void;
  activeMetric: AgebMetricKey;
  onSelectMetric: (m: AgebMetricKey) => void;
  colorblindSafe: boolean;
  onToggleColorblindSafe: () => void;
  language: "es" | "en";
  layers: LayerVisibility;
  onToggleLayer: (k: keyof LayerVisibility) => void;
  extrusionScale: number;
  onExtrusionScaleChange: (v: number) => void;
  agebs3dMode: boolean;
  onToggleAgebs3d: () => void;
}

const CHALLENGES: {
  id: ChallengeId;
  labelEs: string;
  labelEn: string;
  icon: React.ReactNode;
  defaultMetric: AgebMetricKey;
  metrics: AgebMetricKey[];
}[] = [
  {
    id: "housing_land",
    labelEs: "Vivienda y Suelo",
    labelEn: "Housing & Land Use",
    icon: <Building2 className="h-3.5 w-3.5" />,
    defaultMetric: "infill_homes_potential",
    metrics: ["infill_homes_potential", "density_hab_ha_2025", "city_science_index"],
  },
  {
    id: "urban_form_15m",
    labelEs: "Forma Urbana 15-Min",
    labelEn: "15-Min Urban Form",
    icon: <Footprints className="h-3.5 w-3.5" />,
    defaultMetric: "city15_score",
    metrics: ["city15_score", "fractality_score", "harmony_score", "landuse_entropy_score"],
  },
  {
    id: "economy_clusters",
    labelEs: "Economía y Clústeres",
    labelEn: "Economy & Clusters",
    icon: <Factory className="h-3.5 w-3.5" />,
    defaultMetric: "city_science_index",
    metrics: ["city_science_index", "landuse_entropy_score", "density_hab_ha_2025"],
  },
  {
    id: "water_energy_climate",
    labelEs: "Agua, Energía y Clima",
    labelEn: "Water, Energy & Climate",
    icon: <Droplets className="h-3.5 w-3.5" />,
    defaultMetric: "carrying_resilience_score",
    metrics: ["carrying_resilience_score", "solar_mw", "surge_exposed_pct"],
  },
  {
    id: "mobility_corridors",
    labelEs: "Movilidad y Corredores",
    labelEn: "Mobility & Corridors",
    icon: <Route className="h-3.5 w-3.5" />,
    defaultMetric: "city15_score",
    metrics: ["city15_score", "fractality_score", "carrying_resilience_score"],
  },
];

const LAYER_CONTROLS: {
  key: keyof LayerVisibility;
  labelEs: string;
  labelEn: string;
  count: string;
  dot: string;
}[] = [
  { key: "buildings3d", labelEs: "Edificios 3D Reales", labelEn: "3D Real Buildings", count: "396,823", dot: "bg-sky-400" },
  { key: "agebs", labelEs: "AGEBs City Science", labelEn: "City Science AGEBs", count: "1,155", dot: "bg-emerald-400" },
  { key: "zoning", labelEs: "Zonificación CUS/COS", labelEn: "PMDU Zoning CUS/COS", count: "79,515", dot: "bg-amber-400" },
  { key: "citizenPins", labelEs: "Participación PMDU", labelEn: "PMDU Citizen Pins", count: "PMDU", dot: "bg-sky-300" },
  { key: "aquifers", labelEs: "Acuíferos CONAGUA", labelEn: "CONAGUA Aquifers", count: "40", dot: "bg-cyan-400" },
  { key: "tandeo", labelEs: "Tandeo OOMSAPAS LPZ", labelEn: "OOMSAPAS Rationing", count: "280", dot: "bg-rose-400" },
  { key: "powerGrid", labelEs: "Red Eléctrica SIBCS", labelEn: "SIBCS Power Grid", count: "150", dot: "bg-yellow-400" },
  { key: "plannedProjects", labelEs: "Desaladoras / Proyectos", labelEn: "Desal & Strategic Proj.", count: "9", dot: "bg-fuchsia-400" },
  { key: "services", labelEs: "Equipamiento Esencial", labelEn: "Essential Services", count: "3,510", dot: "bg-teal-300" },
  { key: "transit", labelEs: "Paradas y Rutas", labelEn: "Transit Stops & Lines", count: "122", dot: "bg-indigo-400" },
  { key: "corridorArcs", labelEs: "Arcos Corredores BCS", labelEn: "Corridor Flow Arcs", count: "6", dot: "bg-sky-300" },
  { key: "poer", labelEs: "UGAs POERBCS", labelEn: "POERBCS Eco Zones", count: "1,990", dot: "bg-lime-400" },
  { key: "anps", labelEs: "ANPs CONANP", labelEn: "Protected Areas", count: "76", dot: "bg-green-500" },
  { key: "liveTelemetry", labelEs: "Monitoreo Vivo AIS/Aéreo", labelEn: "Live Telemetry/OGC", count: "LIVE", dot: "bg-cyan-300" },
];

export const ChallengeLayerDock: React.FC<Props> = ({
  collapsed,
  onToggleCollapse,
  activeChallenge,
  onSelectChallenge,
  activeMetric,
  onSelectMetric,
  colorblindSafe,
  onToggleColorblindSafe,
  language,
  layers,
  onToggleLayer,
  extrusionScale,
  onExtrusionScaleChange,
  agebs3dMode,
  onToggleAgebs3d,
}) => {
  const isEn = language === "en";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="glass-panel pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-slate-800/90 cursor-pointer"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        <span>{isEn ? "Challenges & Layers" : "Retos y Capas"}</span>
      </button>
    );
  }

  const currentChallenge = CHALLENGES.find((c) => c.id === activeChallenge) || CHALLENGES[0];
  const metricMeta = METRIC_CATALOG[activeMetric];

  return (
    <aside
      aria-label={isEn ? "Urban challenges and map layers" : "Retos urbanos y capas del mapa"}
      className="glass-panel pointer-events-auto absolute left-3 top-3 z-20 flex max-h-[calc(100%-64px)] w-[calc(100vw-24px)] sm:w-[304px] flex-col rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-slate-700/70 px-3.5 py-2.5">
        <div>
          <p className="font-mono-num text-[10px] uppercase tracking-widest text-sky-300">
            {isEn ? "5 Urban Challenges · Layers" : "5 Retos Urbanos · Capas"}
          </p>
          <h2 className="text-xs font-bold text-white">
            {isEn ? "City Science Explorer" : "Explorador City Science"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isEn ? "Collapse left panel" : "Colapsar panel izquierdo"}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
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
                aria-pressed={active}
                onClick={() => {
                  onSelectChallenge(ch.id);
                  onSelectMetric(ch.defaultMetric);
                }}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-sky-500/25 text-white ring-1 ring-sky-400/60"
                    : "bg-slate-900/60 text-slate-200 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={active ? "text-sky-300" : "text-slate-300"} aria-hidden="true">{ch.icon}</span>
                  {isEn ? ch.labelEn : ch.labelEs}
                </span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {/* Active KPI Metric */}
        <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/80 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono-num text-[10px] uppercase tracking-wider text-slate-300">
              {isEn ? "Active 3D Metric" : "Variable 3D Activa"}
            </p>
            <button
              type="button"
              onClick={onToggleColorblindSafe}
              aria-pressed={colorblindSafe}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold cursor-pointer ${
                colorblindSafe
                  ? "bg-amber-400 text-slate-950"
                  : "bg-slate-800 text-slate-200 ring-1 ring-slate-600"
              }`}
            >
              <Eye className="h-2.5 w-2.5" aria-hidden="true" />
              <span>{colorblindSafe ? "Okabe-Ito ON" : "Standard"}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {currentChallenge.metrics.map((mKey) => {
              const mm = METRIC_CATALOG[mKey];
              const isSel = mKey === activeMetric;
              return (
                <button
                  key={mKey}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => onSelectMetric(mKey)}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold cursor-pointer ${
                    isSel
                      ? "bg-emerald-400 text-slate-950"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {isEn ? mm.shortLabelEn : mm.shortLabel}
                </button>
              );
            })}
          </div>
          <p className="text-[10.5px] leading-snug text-slate-200">
            {isEn ? metricMeta.descriptionEn : metricMeta.description}
          </p>

          {/* Dynamic Colorblind-Safe / Standard Gradient Legend */}
          <div className="pt-1">
            <div
              className="h-2 w-full rounded-full ring-1 ring-slate-700"
              style={{
                background: getMetricGradientCss(metricMeta, colorblindSafe),
              }}
            />
            <div className="mt-1 flex justify-between font-mono-num text-[9.5px] text-slate-300">
              <span>0 {metricMeta.unit}</span>
              <span>{Math.round(metricMeta.maxValue / 2)} {metricMeta.unit}</span>
              <span>{metricMeta.maxValue}+ {metricMeta.unit}</span>
            </div>
          </div>
        </div>

        {/* 3D Extrusion Controls */}
        <div className="rounded-lg bg-slate-900/80 p-2.5 ring-1 ring-slate-700/80 space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="extrusion-slider" className="text-[11px] font-medium text-slate-100">
              {isEn ? "3D Extrusion" : "Extrusión 3D"}
            </label>
            <span className="font-mono-num text-[11px] text-sky-300">{extrusionScale.toFixed(1)}×</span>
          </div>
          <input
            id="extrusion-slider"
            aria-label={isEn ? "3D extrusion scale" : "Factor de extrusión 3D"}
            type="range"
            min={0.5}
            max={4.0}
            step={0.1}
            value={extrusionScale}
            onChange={(e) => onExtrusionScaleChange(Number(e.target.value))}
            className="w-full accent-sky-400 cursor-pointer"
          />
          <label className="flex items-center justify-between text-[11px] text-slate-200 cursor-pointer">
            <span>{isEn ? "Extrude 3D AGEB Prisms" : "Extruir Prismas AGEB 3D"}</span>
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
          <p className="font-mono-num text-[10px] uppercase tracking-wider text-slate-300">
            {isEn ? "Geospatial Twin Layers" : "Capas Geoespaciales del Gemelo"}
          </p>
          {LAYER_CONTROLS.map((lc) => {
            const on = layers[lc.key];
            return (
              <label
                key={lc.key}
                className="flex items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-slate-800/70 cursor-pointer"
              >
                <span className="flex items-center gap-2 text-slate-100">
                  <span className={`h-2 w-2 rounded-full ${lc.dot} ${on ? "opacity-100" : "opacity-35"}`} aria-hidden="true" />
                  <span className={on ? "text-slate-100" : "text-slate-300"}>{isEn ? lc.labelEn : lc.labelEs}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono-num text-[9.5px] text-slate-300">{lc.count}</span>
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
