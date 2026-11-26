import React, { useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  Droplets,
  Eye,
  Factory,
  Footprints,
  Route,
} from "lucide-react";
import type { AgebMetricKey, ChallengeId, LayerVisibility } from "../types/twin";
import { METRIC_CATALOG, getMetricGradientCss } from "../utils/colorScales";
import { IosSwitch } from "./IosSwitch";

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
  terrain3dEnabled: boolean;
  onToggleTerrain3d: () => void;
  terrainExaggeration: number;
  onTerrainExaggerationChange: (v: number) => void;
  agebs3dMode: boolean;
  onToggleAgebs3d: () => void;
}

const CHALLENGES: {
  id: ChallengeId;
  labelEs: string;
  labelEn: string;
  icon: React.ReactNode;
  tintCls: string;
  defaultMetric: AgebMetricKey;
  metrics: AgebMetricKey[];
}[] = [
  {
    id: "housing_land",
    labelEs: "Vivienda y Suelo",
    labelEn: "Housing & Land Use",
    icon: <Building2 className="h-3.5 w-3.5" />,
    tintCls: "bg-[#0A84FF]/18 text-[var(--hig-accent)]",
    defaultMetric: "infill_homes_potential",
    metrics: ["infill_homes_potential", "density_hab_ha_2025", "irs_score_2025_eic_calibrated", "city_science_index"],
  },
  {
    id: "urban_form_15m",
    labelEs: "Forma Urbana 15-Min",
    labelEn: "15-Min Urban Form",
    icon: <Footprints className="h-3.5 w-3.5" />,
    tintCls: "bg-[#30D158]/18 text-[var(--hig-green)]",
    defaultMetric: "city15_score",
    metrics: ["city15_score", "fractality_score", "harmony_score", "landuse_entropy_score"],
  },
  {
    id: "economy_clusters",
    labelEs: "Economía y Clústeres",
    labelEn: "Economy & Clusters",
    icon: <Factory className="h-3.5 w-3.5" />,
    tintCls: "bg-[#FF9F0A]/18 text-[var(--hig-amber)]",
    defaultMetric: "city_science_index",
    metrics: ["city_science_index", "landuse_entropy_score", "density_hab_ha_2025", "irs_score_2025_eic_calibrated"],
  },
  {
    id: "water_energy_climate",
    labelEs: "Agua, Energía y Clima",
    labelEn: "Water, Energy & Climate",
    icon: <Droplets className="h-3.5 w-3.5" />,
    tintCls: "bg-[#64D2FF]/18 text-[var(--hig-cyan)]",
    defaultMetric: "carrying_resilience_score",
    metrics: ["carrying_resilience_score", "solar_mw", "surge_exposed_pct"],
  },
  {
    id: "mobility_corridors",
    labelEs: "Movilidad y Corredores",
    labelEn: "Mobility & Corridors",
    icon: <Route className="h-3.5 w-3.5" />,
    tintCls: "bg-[#BF5AF2]/18 text-[#BF5AF2]",
    defaultMetric: "city15_score",
    metrics: ["city15_score", "fractality_score", "carrying_resilience_score"],
  },
];

interface LayerGroupDef {
  id: string;
  titleEn: string;
  titleEs: string;
  defaultOpen: boolean;
  items: {
    key: keyof LayerVisibility;
    labelEs: string;
    labelEn: string;
    count: string;
    dot: string;
  }[];
}

const LAYER_GROUPS: LayerGroupDef[] = [
  {
    id: "core_urban",
    titleEn: "Core Urban & 3D",
    titleEs: "Urbano Base y 3D",
    defaultOpen: true,
    items: [
      { key: "buildings3d", labelEs: "Edificios 3D Reales", labelEn: "3D Real Buildings", count: "396,823", dot: "bg-[#007AFF]" },
      { key: "topographyContours", labelEs: "Curvas de Nivel (10m/200m)", labelEn: "Elevation Contours (10m/200m)", count: "5,724", dot: "bg-[#A2845E]" },
      { key: "agebs", labelEs: "AGEBs City Science", labelEn: "City Science AGEBs", count: "1,155", dot: "bg-[#30D158]" },
      { key: "zoning", labelEs: "Zonificación CUS/COS", labelEn: "PMDU Zoning CUS/COS", count: "79,515", dot: "bg-[#FF9F0A]" },
      { key: "landTenure", labelEs: "Ejidos RAN & Reservas", labelEn: "Ejidos & Land Reserves", count: "124", dot: "bg-[#B25000]" },
      { key: "parksPublicSpace", labelEs: "Parques y Acceso a Playas", labelEn: "Parks & Beach Access", count: "1,458", dot: "bg-[#34C759]" },
      { key: "services", labelEs: "Equipamiento Esencial", labelEn: "Essential Services", count: "3,510", dot: "bg-[#32ADE6]" },
    ],
  },
  {
    id: "water",
    titleEn: "Water & Hydrology",
    titleEs: "Agua e Hidrología",
    defaultOpen: true,
    items: [
      { key: "aquifers", labelEs: "Acuíferos CONAGUA", labelEn: "CONAGUA Aquifers", count: "40", dot: "bg-[#0A84FF]" },
      { key: "tandeo", labelEs: "Tandeo OOMSAPAS LPZ", labelEn: "La Paz Rationing Zones", count: "280", dot: "bg-[#FF453A]" },
      { key: "waterNetworkLc", labelEs: "Red Agua y Morada Cabos", labelEn: "Los Cabos Water & Purple", count: "3,614", dot: "bg-[#AF52DE]" },
      { key: "arroyosRivers", labelEs: "Arroyos y Cauces", labelEn: "Arroyos & Channels", count: "425", dot: "bg-[#00C7BE]" },
    ],
  },
  {
    id: "climate_risk",
    titleEn: "Climate & Risk Atlas",
    titleEs: "Clima y Atlas de Riesgos",
    defaultOpen: true,
    items: [
      { key: "hazardAtlas", labelEs: "Inundación, Marea y Calor", labelEn: "Flood, Surge & Heat Atlas", count: "641", dot: "bg-[#FF3B30]" },
      { key: "liveTelemetry", labelEs: "Sensores OGC y Clima", labelEn: "OGC Weather & Sensors", count: "LIVE", dot: "bg-[#007AFF]" },
    ],
  },
  {
    id: "mobility",
    titleEn: "Mobility & Logistics",
    titleEs: "Movilidad y Logística",
    defaultOpen: true,
    items: [
      { key: "airTraffic", labelEs: "Tráfico Aéreo Vivo (ADS-B)", labelEn: "Live Air Traffic (ADS-B)", count: "LIVE", dot: "bg-[#F59E0B]" },
      { key: "marineTraffic", labelEs: "Tráfico Marítimo Vivo (AIS)", labelEn: "Live Marine Traffic (AIS)", count: "LIVE", dot: "bg-[#007AFF]" },
      { key: "transit", labelEs: "Rutas y Paradas Transporte", labelEn: "Transit Routes & Stops", count: "1,170", dot: "bg-[#5856D6]" },
      { key: "mobilityArterials", labelEs: "Vialidades y Ciclovías", labelEn: "Arterials & Bikeways", count: "194", dot: "bg-[#FF9500]" },
      { key: "corridorArcs", labelEs: "Arcos Corredores BCS", labelEn: "Corridor Flow Arcs", count: "6", dot: "bg-[#32ADE6]" },
      { key: "airportsPortsMarinas", labelEs: "Aeropuertos, Puertos y Marinas", labelEn: "Airports, Ports & Marinas", count: "208", dot: "bg-[#007AFF]" },
    ],
  },
  {
    id: "energy_waste",
    titleEn: "Energy & Waste",
    titleEs: "Energía y Residuos",
    defaultOpen: false,
    items: [
      { key: "powerGrid", labelEs: "Red Eléctrica SIBCS", labelEn: "SIBCS Power Grid", count: "150", dot: "bg-[#FFCC00]" },
      { key: "plannedProjects", labelEs: "Desaladoras / Proyectos", labelEn: "Desal & Strategic Proj.", count: "9", dot: "bg-[#AF52DE]" },
      { key: "wasteManagement", labelEs: "Rellenos y Rutas Residuos", labelEn: "Landfills & Waste Routes", count: "175", dot: "bg-[#A2845E]" },
    ],
  },
  {
    id: "ecology_civic",
    titleEn: "Ecology, Heritage & Civic",
    titleEs: "Ecología, Patrimonio y Cívico",
    defaultOpen: false,
    items: [
      { key: "coastalEcosystems", labelEs: "Manglares, Ramsar y Arrecifes", labelEn: "Mangroves, Ramsar & Reefs", count: "955", dot: "bg-[#00C7BE]" },
      { key: "poer", labelEs: "UGAs POERBCS", labelEn: "POERBCS Eco Zones", count: "1,990", dot: "bg-[#30D158]" },
      { key: "anps", labelEs: "ANPs CONANP", labelEn: "Protected Areas (ANPs)", count: "76", dot: "bg-[#28CD41]" },
      { key: "culturalHeritage", labelEs: "Misiones, UNESCO y Arqueol.", labelEn: "Missions, UNESCO & Heritage", count: "66", dot: "bg-[#FF9500]" },
      { key: "citizenPins", labelEs: "Participación PMDU", labelEn: "PMDU Citizen Pins", count: "PMDU", dot: "bg-[#5856D6]" },
    ],
  },
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
  terrain3dEnabled,
  onToggleTerrain3d,
  terrainExaggeration,
  onTerrainExaggerationChange,
  agebs3dMode,
  onToggleAgebs3d,
}) => {
  const isEn = language === "en";
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYER_GROUPS.map((g) => [g.id, g.defaultOpen])),
  );

  if (collapsed) {
    return null;
  }

  const toggleGroup = (gid: string) => {
    setOpenGroups((prev) => ({ ...prev, [gid]: !prev[gid] }));
  };

  const currentChallenge = CHALLENGES.find((c) => c.id === activeChallenge) || CHALLENGES[0];
  const metricMeta = METRIC_CATALOG[activeMetric];

  return (
    <aside
      aria-label={isEn ? "Urban challenges and map layers" : "Retos urbanos y capas del mapa"}
      className="hig-glass-sidebar pointer-events-auto absolute z-30 sm:z-20 flex flex-col overflow-hidden max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-h-[76vh] max-sm:rounded-b-none max-sm:rounded-t-[28px] sm:left-4 sm:top-[72px] sm:w-[300px] sm:max-h-[calc(100%-152px)] sm:rounded-[24px]"
    >
      {/* Mobile iOS Sheet Grabber */}
      <div
        aria-hidden="true"
        className="sm:hidden mx-auto mt-2.5 mb-1 h-1 w-9 shrink-0 rounded-full bg-[var(--hig-ink-3)]"
      />

      {/* Sidebar Header */}
      <div className="flex items-center justify-between border-b border-[var(--hig-divider)] px-4 py-3">
        <div>
          <p className="text-[10.5px] font-medium tracking-wide text-[var(--hig-ink-2)]">
            {isEn ? "5 Urban Challenges" : "5 Retos Urbanos"}
          </p>
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--hig-ink)]">
            City Science
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isEn ? "Collapse left sidebar" : "Colapsar explorador"}
          className="hidden sm:flex h-7 w-7 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
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

      <div className="twin-scroll overflow-y-auto p-3.5 space-y-3.5">
        {/* 5 Core Challenges — HIG Standard Grouped List */}
        <div className="hig-content-group rounded-2xl divide-y divide-[var(--hig-divider)] overflow-hidden">
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
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12px] transition-colors cursor-pointer ${
                  active
                    ? "bg-[var(--hig-accent)]/16 text-[var(--hig-ink)] font-semibold"
                    : "text-[var(--hig-ink-2)] hover:bg-[var(--hig-pill-bg)] hover:text-[var(--hig-ink)] font-medium"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ch.tintCls}`}
                    aria-hidden="true"
                  >
                    {ch.icon}
                  </span>
                  <span className="truncate">{isEn ? ch.labelEn : ch.labelEs}</span>
                </span>
                {active && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--hig-accent)]" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Active 3D Metric Card */}
        <div className="hig-content-group rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-[var(--hig-ink-2)]">
              {isEn ? "Active 3D Metric" : "Variable 3D Activa"}
            </p>
            <button
              type="button"
              onClick={onToggleColorblindSafe}
              aria-pressed={colorblindSafe}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                colorblindSafe
                  ? "bg-[#FF9F0A]/20 text-[var(--hig-amber)] ring-1 ring-[#FF9F0A]/40"
                  : "bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)]"
              }`}
            >
              <Eye className="h-2.5 w-2.5" aria-hidden="true" />
              <span>{colorblindSafe ? "Okabe-Ito" : "Standard"}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {currentChallenge.metrics.map((mKey) => {
              const mm = METRIC_CATALOG[mKey];
              const isSel = mKey === activeMetric;
              return (
                <button
                  key={mKey}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => onSelectMetric(mKey)}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-all cursor-pointer ${
                    isSel
                      ? "bg-[var(--hig-accent)] text-white shadow-sm"
                      : "bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)]"
                  }`}
                >
                  {isEn ? mm.shortLabelEn : mm.shortLabel}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] leading-snug text-[var(--hig-ink-2)]">
            {isEn ? metricMeta.descriptionEn : metricMeta.description}
          </p>

          {/* Gradient Scale Legend */}
          <div className="pt-0.5">
            <div
              className="h-1.5 w-full rounded-full ring-1 ring-[var(--hig-divider)]"
              style={{
                background: getMetricGradientCss(metricMeta, colorblindSafe),
              }}
            />
            <div className="mt-1.5 flex justify-between font-mono-num text-[10px] text-[var(--hig-ink-3)]">
              <span>0 {metricMeta.unit}</span>
              <span>{Math.round(metricMeta.maxValue / 2)} {metricMeta.unit}</span>
              <span>{metricMeta.maxValue}+ {metricMeta.unit}</span>
            </div>
          </div>
        </div>

        {/* 3D Terrain Model & Extrusion Controls */}
        <div className="hig-content-group rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--hig-ink)]">
              {isEn ? "3D Terrain Relief" : "Modelo de Terreno 3D"}
            </span>
            <IosSwitch
              checked={terrain3dEnabled}
              onChange={onToggleTerrain3d}
              ariaLabel={isEn ? "Enable 3D terrain elevation" : "Activar relieve de terreno 3D"}
              accent="green"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="terrain-exag-slider" className="text-[11.5px] font-medium text-[var(--hig-ink-2)]">
                {isEn ? "Terrain Vertical Scale" : "Escala Vertical Terreno"}
              </label>
              <span className="font-mono-num text-[11.5px] font-semibold text-[var(--hig-green)]">
                {!terrain3dEnabled
                  ? isEn ? "Flat" : "Plano"
                  : terrainExaggeration === 1
                    ? "1.0× True"
                    : `${terrainExaggeration.toFixed(1)}×`}
              </span>
            </div>
            <input
              id="terrain-exag-slider"
              aria-label={isEn ? "Terrain vertical exaggeration" : "Exageración vertical del terreno"}
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              disabled={!terrain3dEnabled}
              value={terrainExaggeration}
              onChange={(e) => onTerrainExaggerationChange(Number(e.target.value))}
              className="ios-slider disabled:opacity-45"
            />
          </div>

          <div className="pt-2 border-t border-[var(--hig-divider)] space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="extrusion-slider" className="text-[11.5px] font-medium text-[var(--hig-ink-2)]">
                {isEn ? "Building Extrusion" : "Extrusión Edificios"}
              </label>
              <span className="font-mono-num text-[11.5px] font-semibold text-[var(--hig-accent)]">
                {extrusionScale.toFixed(1)}×
              </span>
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
              className="ios-slider"
            />
            <label className="flex items-center justify-between pt-1.5 border-t border-[var(--hig-divider)] text-[12px] text-[var(--hig-ink-2)] cursor-pointer">
              <span>{isEn ? "Extrude 3D AGEB Prisms" : "Extruir Prismas AGEB 3D"}</span>
              <IosSwitch
                checked={agebs3dMode}
                onChange={onToggleAgebs3d}
                ariaLabel={isEn ? "Extrude 3D AGEB Prisms" : "Extruir Prismas AGEB 3D"}
                accent="blue"
              />
            </label>
          </div>
        </div>

        {/* Geospatial Layer Toggles — 6 Orderly Apple HIG Grouped Sections */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--hig-ink-3)]">
              {isEn ? "Geospatial Layers" : "Capas Geoespaciales"}
            </p>
            <span className="font-mono-num text-[10px] text-[var(--hig-ink-3)]">
              {Object.values(layers).filter(Boolean).length}/{Object.keys(layers).length}
            </span>
          </div>
          {LAYER_GROUPS.map((grp) => {
            const expanded = Boolean(openGroups[grp.id]);
            const activeCount = grp.items.filter((it) => layers[it.key]).length;
            return (
              <div key={grp.id} className="hig-content-group rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(grp.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold text-[var(--hig-ink)] hover:bg-[var(--hig-pill-bg)] transition-colors cursor-pointer"
                >
                  <span className="truncate">{isEn ? grp.titleEn : grp.titleEs}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {activeCount > 0 && (
                      <span className="font-mono-num rounded-full bg-[var(--hig-accent)]/15 px-1.5 py-0.2 text-[9.5px] font-semibold text-[var(--hig-accent)]">
                        {activeCount}
                      </span>
                    )}
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-[var(--hig-ink-3)] transition-transform ${expanded ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {expanded && (
                  <div className="divide-y divide-[var(--hig-divider)] border-t border-[var(--hig-divider)]">
                    {grp.items.map((lc) => {
                      const on = layers[lc.key];
                      const labelText = isEn ? lc.labelEn : lc.labelEs;
                      return (
                        <label
                          key={lc.key}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] hover:bg-[var(--hig-pill-bg)] transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${lc.dot} ${on ? "opacity-100" : "opacity-35"}`}
                              aria-hidden="true"
                            />
                            <span className={`truncate ${on ? "text-[var(--hig-ink)] font-medium" : "text-[var(--hig-ink-2)]"}`}>
                              {labelText}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">{lc.count}</span>
                            <IosSwitch
                              checked={on}
                              onChange={() => onToggleLayer(lc.key)}
                              ariaLabel={labelText}
                              accent="green"
                            />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
