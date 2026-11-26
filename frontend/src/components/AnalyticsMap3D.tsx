import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { ArcLayer, GeoJsonLayer, IconLayer, LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { Box, Building2, ChevronUp, Compass, Film, Layers, LocateFixed, Mountain, Sparkles, Square, X } from "lucide-react";
import { TwinAPI } from "../api/client";
import { fmtNumber } from "../utils/formatters";
import type {
  ActivePhysicsOverlay,
  AerialTour,
  AgebMetricKey,
  AretianPhase,
  BasemapMode,
  BuildingRecord,
  CameraPreset,
  ChatMapAction,
  CitizenPin,
  CorridorArc,
  LayerVisibility,
  LiveTelemetrySummary,
  SensorThingRecord,
  SimulationResponse,
  ZoningParcelRecord,
} from "../types/twin";
import {
  METRIC_CATALOG,
  ZONING_CATEGORY_COLORS,
  ZONING_CATEGORY_COLORS_COLORBLIND,
  getBuildingColor,
  interpolateMetricColor,
} from "../utils/colorScales";

interface Props {
  cameraTarget: CameraPreset | null;
  basemapMode: BasemapMode;
  theme?: "dark" | "light";
  maptilerKey?: string;
  activeMetric: AgebMetricKey;
  colorblindSafe?: boolean;
  language?: "es" | "en";
  layers: LayerVisibility;
  extrusionScale: number;
  terrain3dEnabled?: boolean;
  terrainExaggeration?: number;
  agebs3dMode: boolean;
  phase: AretianPhase;
  simulation: SimulationResponse | null;
  corridorArcs: CorridorArc[];
  liveTelemetry: LiveTelemetrySummary | null;
  sensorThings?: SensorThingRecord[];
  physicsOverlay?: ActivePhysicsOverlay | null;
  aiMapHighlight?: ChatMapAction | null;
  onClearAiHighlight?: () => void;
  citizenPins?: CitizenPin[];
  pendingPinCoords?: { lon: number; lat: number } | null;
  pinPlacementMode?: boolean;
  onMapClickForPin?: (lon: number, lat: number) => void;
  onCancelPinPlacement?: () => void;
  selectedAgebId: string | null;
  tours?: AerialTour[];
  activeTourId?: string | null;
  onStartTour?: (tourId: string) => void;
  onStopTour?: () => void;
  onViewportChange?: (bbox: [number, number, number, number], zoom: number) => void;
  onOpenExportModal?: () => void;
  selectedPoint?: { lon: number; lat: number } | null;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  onInspectLocation: (
    lon: number,
    lat: number,
    buildingPk?: number | null,
    agebCvegeo?: string | null,
    terrainElevM?: number | null,
  ) => void;
  onQuickJumpCity: (citySlug: string) => void;
}

const AIRCRAFT_ICON_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#FFFFFF" d="M32 4c2.4 0 4 2.2 4 5.5v14.8l19 11.4c1.2.7 1.8 1.8 1.5 2.9-.3 1.1-1.3 1.6-2.7 1.2L36 34.8v13.2l6.2 4.6c.8.6 1.2 1.4.9 2.2-.3.7-1.1 1.1-2 .9L32 53.5l-9.1 2.2c-.9.2-1.7-.2-2-.9-.3-.8.1-1.6.9-2.2L28 48V34.8l-17.8 5c-1.4.4-2.4-.1-2.7-1.2-.3-1.1.3-2.2 1.5-2.9L28 24.3V9.5C28 6.2 29.6 4 32 4z"/></svg>',
  );

const VESSEL_ICON_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#FFFFFF" d="M32 5L47 43l-15-6-15 6L32 5z"/><circle fill="#FFFFFF" cx="32" cy="51" r="4.5"/></svg>',
  );

const TRAFFIC_ICON_MAPPING = {
  marker: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true },
};

function rgbToCss(rgba: [number, number, number, number]): string {
  return `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`;
}

function buildDemSourceSpec(maptilerKey: string): maplibregl.SourceSpecification {
  return maptilerKey
    ? {
        type: "raster-dem",
        tiles: [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${maptilerKey}`],
        tileSize: 256,
        encoding: "mapbox",
        maxzoom: 14,
      }
    : {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: 15,
      };
}

function getHillshadePaint(
  mode: BasemapMode,
  theme: "dark" | "light",
): maplibregl.HillshadeLayerSpecification["paint"] {
  if (mode === "obsidian" && theme === "light") {
    return {
      "hillshade-exaggeration": 0.48,
      "hillshade-illumination-direction": 315,
      "hillshade-shadow-color": "#7C8EA6",
      "hillshade-highlight-color": "#FFFFFF",
      "hillshade-accent-color": "#CBD5E1",
    };
  }
  if (mode === "obsidian") {
    return {
      "hillshade-exaggeration": 0.55,
      "hillshade-illumination-direction": 315,
      "hillshade-shadow-color": "#020617",
      "hillshade-highlight-color": "#64748B",
      "hillshade-accent-color": "#1E293B",
    };
  }
  if (mode === "terrain") {
    return {
      "hillshade-exaggeration": 0.42,
      "hillshade-illumination-direction": 315,
      "hillshade-shadow-color": "#64748B",
      "hillshade-highlight-color": "#FFFFFF",
      "hillshade-accent-color": "#94A3B8",
    };
  }
  return {
    "hillshade-exaggeration": 0.24,
    "hillshade-illumination-direction": 315,
    "hillshade-shadow-color": "#0F172A",
    "hillshade-highlight-color": "#F8FAFC",
    "hillshade-accent-color": "#334155",
  };
}

function getSkySpec(theme: "dark" | "light"): maplibregl.SkySpecification {
  return theme === "light"
    ? {
        "sky-color": "#DCE8F5",
        "sky-horizon-blend": 0.45,
        "horizon-color": "#F5F7FA",
        "horizon-fog-blend": 0.5,
        "fog-color": "#F5F7FA",
        "fog-ground-blend": 0.45,
      }
    : {
        "sky-color": "#0B1220",
        "sky-horizon-blend": 0.4,
        "horizon-color": "#1E293B",
        "horizon-fog-blend": 0.5,
        "fog-color": "#0F172A",
        "fog-ground-blend": 0.45,
      };
}

function buildMapStyle(
  mode: BasemapMode,
  maptilerKeyOverride?: string,
  theme: "dark" | "light" = "light",
  terrain3dEnabled = true,
  terrainExaggeration = 1.5,
): maplibregl.StyleSpecification {
  const maptilerKey = (maptilerKeyOverride ?? import.meta.env.VITE_MAPTILER_KEY ?? "").trim();
  const sources: Record<string, maplibregl.SourceSpecification> = {};
  const layers: maplibregl.LayerSpecification[] = [];

  // 1. Light Vector/Raster Basemap
  if (maptilerKey) {
    sources.lightBase = {
      type: "raster",
      tiles: [`https://api.maptiler.com/maps/dataviz-light/256/{z}/{x}/{y}@2x.png?key=${maptilerKey}`],
      tileSize: 256,
      maxzoom: 19,
    };
    sources.darkBase = {
      type: "raster",
      tiles: [`https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}@2x.png?key=${maptilerKey}`],
      tileSize: 256,
      maxzoom: 19,
    };
  } else {
    sources.lightBase = {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
    };
    sources.lightRef = {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
    };
    sources.darkBase = {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
    };
    sources.darkRef = {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
    };
  }

  // 2. Always-available HD Satellite (ArcGIS World Imagery) & Shaded Topographic (ArcGIS World Topo)
  sources.satImagery = {
    type: "raster",
    tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
  };
  sources.satLabels = {
    type: "raster",
    tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
  };
  sources.topoBase = {
    type: "raster",
    tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
  };

  const showLight = mode === "obsidian" && theme === "light";
  const showDark = mode === "obsidian" && theme === "dark";
  const showSat = mode === "satellite";
  const showTopo = mode === "terrain";

  layers.push({
    id: "base-light-layer",
    type: "raster",
    source: "lightBase",
    layout: { visibility: showLight ? "visible" : "none" },
  });
  if (sources.lightRef) {
    layers.push({
      id: "base-light-ref-layer",
      type: "raster",
      source: "lightRef",
      layout: { visibility: showLight ? "visible" : "none" },
      paint: { "raster-opacity": 0.78 },
    });
  }

  layers.push({
    id: "base-dark-layer",
    type: "raster",
    source: "darkBase",
    layout: { visibility: showDark ? "visible" : "none" },
    paint: maptilerKey ? {} : { "raster-brightness-max": 0.45, "raster-contrast": 0.25 },
  });
  if (sources.darkRef) {
    layers.push({
      id: "base-dark-ref-layer",
      type: "raster",
      source: "darkRef",
      layout: { visibility: showDark ? "visible" : "none" },
      paint: { "raster-opacity": 0.72 },
    });
  }

  layers.push({
    id: "base-sat-layer",
    type: "raster",
    source: "satImagery",
    layout: { visibility: showSat ? "visible" : "none" },
  });
  layers.push({
    id: "base-sat-labels-layer",
    type: "raster",
    source: "satLabels",
    layout: { visibility: showSat ? "visible" : "none" },
    paint: { "raster-opacity": 0.85 },
  });
  layers.push({
    id: "base-topo-layer",
    type: "raster",
    source: "topoBase",
    layout: { visibility: showTopo ? "visible" : "none" },
  });

  // Distinct DEM sources for 3D terrain displacement & architectural hillshade relief
  sources.terrainDem = buildDemSourceSpec(maptilerKey);
  sources.hillshadeDem = buildDemSourceSpec(maptilerKey);

  layers.push({
    id: "terrain-hillshade",
    type: "hillshade",
    source: "hillshadeDem",
    layout: {
      visibility: terrain3dEnabled && terrainExaggeration > 0 ? "visible" : "none",
    },
    paint: getHillshadePaint(mode, theme),
  });

  return {
    version: 8,
    sources,
    layers,
    sky: getSkySpec(theme),
    ...(terrain3dEnabled && terrainExaggeration > 0
      ? { terrain: { source: "terrainDem", exaggeration: terrainExaggeration } }
      : {}),
  };
}

export const AnalyticsMap3D: React.FC<Props> = ({
  cameraTarget,
  basemapMode,
  theme = "light",
  maptilerKey = "",
  activeMetric,
  colorblindSafe = true,
  language = "en",
  layers,
  extrusionScale,
  terrain3dEnabled = true,
  terrainExaggeration = 1.5,
  agebs3dMode,
  phase,
  simulation,
  corridorArcs,
  liveTelemetry,
  sensorThings = [],
  physicsOverlay = null,
  aiMapHighlight = null,
  onClearAiHighlight,
  citizenPins = [],
  pendingPinCoords = null,
  pinPlacementMode = false,
  onMapClickForPin,
  onCancelPinPlacement,
  selectedAgebId,
  tours,
  activeTourId,
  onStartTour,
  onStopTour,
  onViewportChange,
  onOpenExportModal,
  selectedPoint = null,
  leftSidebarOpen = false,
  rightSidebarOpen = false,
  onInspectLocation,
  onQuickJumpCity,
}) => {
  const isEn = language === "en";
  const [toursMenuOpen, setToursMenuOpen] = useState(false);
  const [citiesMenuOpen, setCitiesMenuOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [isPitchFlat, setIsPitchFlat] = useState(false);
  const toursPopoverRef = useRef<HTMLDivElement | null>(null);
  const citiesPopoverRef = useRef<HTMLDivElement | null>(null);
  const prevMaptilerKeyRef = useRef<string>(maptilerKey);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const abortBldgRef = useRef<AbortController | null>(null);
  const abortZoneRef = useRef<AbortController | null>(null);
  const activeTourRef = useRef<string | null>(activeTourId ?? null);
  const onStopTourRef = useRef(onStopTour);
  const onViewportChangeRef = useRef(onViewportChange);
  const onInspectLocationRef = useRef(onInspectLocation);
  const phaseRef = useRef<AretianPhase>(phase);
  const terrainActiveRef = useRef<boolean>(terrain3dEnabled && terrainExaggeration > 0);
  const tilesetErrorRef = useRef<boolean>(false);
  const pinPlacementModeRef = useRef<boolean>(pinPlacementMode);
  const onMapClickForPinRef = useRef(onMapClickForPin);
  const lastInspectHandledAtRef = useRef<number>(0);

  const queryRealElevation = useCallback((map: maplibregl.Map, lngLat: maplibregl.LngLatLike): number | null => {
    try {
      const rawDelta = map.queryTerrainElevation(lngLat);
      if (rawDelta == null || !Number.isFinite(rawDelta)) return null;
      const centerElev = (map as unknown as { transform?: { elevation?: number } }).transform?.elevation ?? 0;
      const exag = terrain3dEnabled && terrainExaggeration > 0 ? terrainExaggeration : 1.0;
      const absReal = (rawDelta + centerElev) / Math.max(0.01, exag);
      if (absReal < 0 && absReal > -2.0) return 0;
      return Math.max(0, Math.round(absReal));
    } catch {
      return null;
    }
  }, [terrain3dEnabled, terrainExaggeration]);

  const queryRealElevationRef = useRef(queryRealElevation);
  useEffect(() => {
    queryRealElevationRef.current = queryRealElevation;
  }, [queryRealElevation]);

  useEffect(() => {
    onInspectLocationRef.current = onInspectLocation;
  }, [onInspectLocation]);

  useEffect(() => {
    terrainActiveRef.current = terrain3dEnabled && terrainExaggeration > 0;
  }, [terrain3dEnabled, terrainExaggeration]);

  useEffect(() => {
    pinPlacementModeRef.current = pinPlacementMode;
  }, [pinPlacementMode]);

  useEffect(() => {
    onMapClickForPinRef.current = onMapClickForPin;
  }, [onMapClickForPin]);

  useEffect(() => {
    activeTourRef.current = activeTourId ?? null;
  }, [activeTourId]);

  useEffect(() => {
    onStopTourRef.current = onStopTour;
  }, [onStopTour]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "scenarios" && mapRef.current) {
      fetchViewportFeatures(mapRef.current);
    }
  }, [phase]);

  const [zoom, setZoom] = useState<number>(6.6);
  const [liveElevationM, setLiveElevationM] = useState<number | null>(null);
  const [styleVersion, setStyleVersion] = useState<number>(0);
  const [buildings, setBuildings] = useState<BuildingRecord[]>([]);
  const [zoning, setZoning] = useState<ZoningParcelRecord[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [tourStepTitle, setTourStepTitle] = useState<string>("");
  const [tileset3dUrl, setTileset3dUrl] = useState<string>(
    "https://storage.googleapis.com/bcs2050-3dtiles-public/bcs_buildings_v11/tileset.json",
  );
  const [tilesLoadedCount, setTilesLoadedCount] = useState<number>(0);
  const [tilesetError, setTilesetError] = useState<boolean>(false);

  const [geoCache, setGeoCache] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    TwinAPI.get3DTilesInfo()
      .then((info) => {
        if (!cancelled && info.tileset_url) {
          setTileset3dUrl(info.tileset_url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-fetch static GeoJSON layers when enabled
  useEffect(() => {
    const needed: string[] = [];
    if (layers.agebs && !geoCache.agebs) needed.push("agebs");
    if (layers.aquifers && !geoCache.aquifers) needed.push("aquifers");
    if (layers.tandeo && !geoCache.tandeo) needed.push("tandeo");
    if (layers.powerGrid && !geoCache.power_lines) needed.push("power_lines", "substations", "power_plants");
    if (layers.plannedProjects && !geoCache.planned_projects) needed.push("planned_projects");
    if (layers.services && !geoCache.services) needed.push("services");
    if (layers.transit && !geoCache.transit_stops) needed.push("transit_stops", "transit_lines");
    if (layers.poer && !geoCache.poer_ugas) needed.push("poer_ugas");
    if (layers.anps && !geoCache.anps) needed.push("anps");
    if (layers.waterNetworkLc && !geoCache.water_network_lc) needed.push("water_network_lc");
    if (layers.arroyosRivers && !geoCache.arroyos_rivers) needed.push("arroyos_rivers");
    if (layers.hazardAtlas && !geoCache.hazard_atlas) needed.push("hazard_atlas");
    if (layers.parksPublicSpace && !geoCache.parks_public_space) needed.push("parks_public_space");
    if (layers.landTenure && !geoCache.land_tenure) needed.push("land_tenure");
    if (layers.mobilityArterials && !geoCache.mobility_arterials) needed.push("mobility_arterials");
    if (layers.airportsPortsMarinas && !geoCache.airports_ports_marinas) needed.push("airports_ports_marinas");
    if (layers.coastalEcosystems && !geoCache.coastal_ecosystems) needed.push("coastal_ecosystems");
    if (layers.culturalHeritage && !geoCache.cultural_heritage) needed.push("cultural_heritage");
    if (layers.wasteManagement && !geoCache.waste_routes_lpz) needed.push("waste_routes_lpz", "waste_sites");
    if (layers.topographyContours && !geoCache.topography_contours) needed.push("topography_contours");
    if (!geoCache.municipalities) needed.push("municipalities");

    if (needed.length === 0) return;
    let cancelled = false;
    Promise.all(
      Array.from(new Set(needed)).map(async (id) => {
        try {
          const fc = await TwinAPI.getLayer(id);
          return [id, fc] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setGeoCache((prev) => {
        const next = { ...prev };
        for (const item of entries) {
          if (item) next[item[0]] = item[1];
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [layers, geoCache]);

  const fetchViewportFeatures = useCallback((map: maplibregl.Map) => {
    const z = map.getZoom();
    const roundedZoom = Number(z.toFixed(1));
    setZoom(roundedZoom);
    const b = map.getBounds();
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    onViewportChangeRef.current?.(bbox, roundedZoom);

    if (z >= 11.8 && (terrainActiveRef.current || phaseRef.current === "scenarios" || tilesetErrorRef.current)) {
      abortBldgRef.current?.abort();
      const ctrl = new AbortController();
      abortBldgRef.current = ctrl;
      setLoadingBuildings(true);
      const limit = z >= 14.2 ? 9500 : z >= 13.0 ? 6500 : 3500;
      TwinAPI.getBuildings(bbox, limit, ctrl.signal)
        .then((res) => {
          setBuildings(res.buildings);
          setLoadingBuildings(false);
        })
        .catch(() => setLoadingBuildings(false));
    } else if (z < 11.8) {
      setBuildings([]);
    }

    if (z >= 12.6) {
      abortZoneRef.current?.abort();
      const zctrl = new AbortController();
      abortZoneRef.current = zctrl;
      TwinAPI.getZoning(bbox, 3000, zctrl.signal)
        .then((res) => setZoning(res.parcels))
        .catch(() => {});
    } else {
      setZoning([]);
    }
  }, []);

  // Initialize MapLibre + MapboxOverlay once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(basemapMode, maptilerKey, theme, terrain3dEnabled, terrainExaggeration),
      center: [-111.55, 25.15],
      zoom: 6.6,
      pitch: 48,
      bearing: -14,
      maxPitch: 75,
      antialias: true,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });
    map.addControl(overlay);

    let timer: number | null = null;
    let elevRaf: number | null = null;
    const onMoveEnd = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        fetchViewportFeatures(map);
        setLiveElevationM(queryRealElevationRef.current(map, map.getCenter()));
      }, 200);
    };
    map.on("style.load", () => {
      setStyleVersion((v) => v + 1);
    });
    map.on("load", () => {
      fetchViewportFeatures(map);
      setLiveElevationM(queryRealElevationRef.current(map, map.getCenter()));
    });
    map.on("idle", () => {
      setLiveElevationM((prev) => prev ?? queryRealElevationRef.current(map, map.getCenter()));
    });
    map.on("mousemove", (ev) => {
      if (elevRaf !== null) return;
      elevRaf = window.requestAnimationFrame(() => {
        elevRaf = null;
        const elev = queryRealElevationRef.current(map, ev.lngLat);
        if (elev !== null) {
          setLiveElevationM(elev);
        }
      });
    });
    map.on("moveend", onMoveEnd);
    const stopActiveTourOnUserInput = () => {
      if (activeTourRef.current) {
        onStopTourRef.current?.();
      }
    };
    map.on("dragstart", stopActiveTourOnUserInput);
    map.on("wheel", stopActiveTourOnUserInput);
    map.on("click", (ev) => {
      if (pinPlacementModeRef.current && onMapClickForPinRef.current) {
        onMapClickForPinRef.current(ev.lngLat.lng, ev.lngLat.lat);
        return;
      }
      window.setTimeout(() => {
        if (Date.now() - lastInspectHandledAtRef.current < 90) return;
        const elev = queryRealElevationRef.current(map, ev.lngLat);
        lastInspectHandledAtRef.current = Date.now();
        onInspectLocationRef.current(ev.lngLat.lng, ev.lngLat.lat, null, null, elev);
      }, 45);
    });

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      if (timer) window.clearTimeout(timer);
      if (elevRaf !== null) window.cancelAnimationFrame(elevRaf);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild persistent style ONLY when runtime MapTiler key changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevMaptilerKeyRef.current === maptilerKey) return;
    prevMaptilerKeyRef.current = maptilerKey;
    map.setStyle(buildMapStyle(basemapMode, maptilerKey, theme, terrain3dEnabled, terrainExaggeration), {
      diff: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]);

  // Instant basemap / theme switching via native layer visibility (preserves terrain DEM drape cleanly)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncVisibility = () => {
      const showLight = basemapMode === "obsidian" && theme === "light";
      const showDark = basemapMode === "obsidian" && theme === "dark";
      const showSat = basemapMode === "satellite";
      const showTopo = basemapMode === "terrain";

      const toggle = (id: string, visible: boolean) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
        }
      };

      toggle("base-light-layer", showLight);
      toggle("base-light-ref-layer", showLight);
      toggle("base-dark-layer", showDark);
      toggle("base-dark-ref-layer", showDark);
      toggle("base-sat-layer", showSat);
      toggle("base-sat-labels-layer", showSat);
      toggle("base-topo-layer", showTopo);

      if (map.getLayer("terrain-hillshade")) {
        const hs = getHillshadePaint(basemapMode, theme) || {};
        for (const [k, v] of Object.entries(hs)) {
          map.setPaintProperty("terrain-hillshade", k, v);
        }
      }
      if (typeof map.setSky === "function") {
        map.setSky(getSkySpec(theme));
      }
      map.triggerRepaint();
    };

    if (map.isStyleLoaded()) {
      syncVisibility();
    } else {
      map.once("style.load", syncVisibility);
    }
  }, [basemapMode, theme, styleVersion]);

  // Dismiss Tours / Cities popovers on outside click or Escape
  useEffect(() => {
    if (!toursMenuOpen && !citiesMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToursMenuOpen(false);
        setCitiesMenuOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (toursMenuOpen && toursPopoverRef.current && !toursPopoverRef.current.contains(t)) {
        setToursMenuOpen(false);
      }
      if (citiesMenuOpen && citiesPopoverRef.current && !citiesPopoverRef.current.contains(t)) {
        setCitiesMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [toursMenuOpen, citiesMenuOpen]);

  // Dynamically toggle 3D Terrain DEM displacement & Hillshade intensity without full style reload
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyTerrain = () => {
      if (!map.getSource("terrainDem")) return;
      const active = terrain3dEnabled && terrainExaggeration > 0;
      map.setTerrain(active ? { source: "terrainDem", exaggeration: terrainExaggeration } : null);
      if (map.getLayer("terrain-hillshade")) {
        map.setLayoutProperty("terrain-hillshade", "visibility", active ? "visible" : "none");
      }
      setLiveElevationM(queryRealElevation(map, map.getCenter()));
      if (active) {
        fetchViewportFeatures(map);
      }
    };
    if (map.isStyleLoaded()) {
      applyTerrain();
    } else {
      map.once("style.load", applyTerrain);
    }
  }, [terrain3dEnabled, terrainExaggeration, styleVersion, fetchViewportFeatures, queryRealElevation]);

  // Smooth camera flights
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraTarget) return;
    map.flyTo({
      center: [cameraTarget.lon, cameraTarget.lat],
      zoom: cameraTarget.zoom,
      pitch: cameraTarget.pitch ?? 55,
      bearing: cameraTarget.bearing ?? -18,
      duration: 1200,
      essential: true,
    });
  }, [cameraTarget]);

  // InfraWorks / Lumion-style aerial urban planning fly-through sequence
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeTourId) {
      setTourStepTitle("");
      return;
    }
    const tour = tours?.find((t) => t.id === activeTourId);
    if (!tour || tour.waypoints.length === 0) {
      setTourStepTitle("");
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    const runStep = (idx: number) => {
      if (cancelled) return;
      if (idx >= tour.waypoints.length) {
        setTourStepTitle("");
        onStopTourRef.current?.();
        return;
      }
      const wp = tour.waypoints[idx];
      const dur = wp.duration_ms ?? 5200;
      setTourStepTitle(wp.title);
      map.flyTo({
        center: [wp.lon, wp.lat],
        zoom: wp.zoom,
        pitch: wp.pitch,
        bearing: wp.bearing,
        duration: dur,
        essential: true,
      });
      const tid = window.setTimeout(() => runStep(idx + 1), dur + 350);
      timers.push(tid);
    };

    runStep(0);
    return () => {
      cancelled = true;
      timers.forEach((tid) => window.clearTimeout(tid));
      setTourStepTitle("");
    };
  }, [activeTourId, tours]);

  // Sync Native MapLibre 3D-Draped Elevation Contours (10m Urban / 200m Regional)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncContours = () => {
      const emptyFc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      const contourFc = geoCache.topography_contours || emptyFc;
      const src = map.getSource("bcs-topography-contours") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(contourFc);
      } else {
        map.addSource("bcs-topography-contours", {
          type: "geojson",
          data: contourFc,
        });
      }

      const vis = layers.topographyContours ? "visible" : "none";
      const lineOpacityReg = theme === "light" ? 0.48 : 0.56;
      const lineOpacityUrb = theme === "light" ? 0.62 : 0.72;
      const colorExpr: maplibregl.ExpressionSpecification = [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "elevation_m"], 0],
        0, "#0284C7",
        10, "#0E7490",
        50, "#64748B",
        250, "#9A7B56",
        600, "#B45309",
        1200, "#9A3412",
        1800, "#7C2D12",
      ];

      if (!map.getLayer("topography-contours-regional")) {
        map.addLayer({
          id: "topography-contours-regional",
          type: "line",
          source: "bcs-topography-contours",
          minzoom: 5.5,
          filter: ["==", ["get", "scope"], "REGIONAL_50M"],
          layout: {
            visibility: vis,
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": colorExpr,
            "line-width": ["case", ["boolean", ["get", "is_index"], false], 1.35, 0.75],
            "line-opacity": lineOpacityReg,
          },
        });
      } else {
        map.setLayoutProperty("topography-contours-regional", "visibility", vis);
        map.setPaintProperty("topography-contours-regional", "line-opacity", lineOpacityReg);
      }

      if (!map.getLayer("topography-contours-urban")) {
        map.addLayer({
          id: "topography-contours-urban",
          type: "line",
          source: "bcs-topography-contours",
          minzoom: 10.2,
          filter: ["==", ["get", "scope"], "URBAN_10M"],
          layout: {
            visibility: vis,
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": colorExpr,
            "line-width": ["case", ["boolean", ["get", "is_index"], false], 1.25, 0.6],
            "line-opacity": lineOpacityUrb,
          },
        });
      } else {
        map.setLayoutProperty("topography-contours-urban", "visibility", vis);
        map.setPaintProperty("topography-contours-urban", "line-opacity", lineOpacityUrb);
      }
    };

    if (map.isStyleLoaded()) {
      syncContours();
    } else {
      map.once("style.load", syncContours);
    }
  }, [geoCache.topography_contours, layers.topographyContours, theme, styleVersion]);

  // Build Terrain-Seated 3D Buildings GeoJSON when 3D Terrain is active
  const terrainBuildingsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const useNativeTerrainBuildings =
      terrain3dEnabled && terrainExaggeration > 0 && layers.buildings3d && buildings.length > 0 && zoom >= 11.5;
    if (!useNativeTerrainBuildings) {
      return { type: "FeatureCollection", features: [] };
    }
    const deltas = phase === "scenarios" && simulation ? simulation.ageb_deltas : {};
    const features: GeoJSON.Feature[] = [];
    for (const d of buildings) {
      if (!d.polygon || d.polygon.length < 3) continue;
      const ring = [...d.polygon];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
      const mult = deltas[d.ageb_cvegeo]?.height_multiplier ?? 1.0;
      const renderHeight = Number((d.height_m * extrusionScale * mult).toFixed(2));
      const fillColor = rgbToCss(getBuildingColor(d, activeMetric, mult, colorblindSafe));
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          pk: d.id,
          building_id: d.building_id,
          city_name: d.city_name,
          ageb_cvegeo: d.ageb_cvegeo,
          height_m: d.height_m,
          floors: d.floors,
          gfa_m2: d.gfa_m2,
          ground_elev_m: d.ground_elev_m,
          solar_kwp: d.solar_kwp,
          surge_risk: d.surge_risk,
          lon: d.lon,
          lat: d.lat,
          render_height: renderHeight,
          fill_color: fillColor,
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [
    terrain3dEnabled,
    terrainExaggeration,
    layers.buildings3d,
    buildings,
    zoom,
    phase,
    simulation,
    extrusionScale,
    activeMetric,
    colorblindSafe,
  ]);

  // Sync Native MapLibre Terrain-Seated 3D Buildings Layer & Pointer Interactions
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncBuildings = () => {
      const showLayer =
        terrain3dEnabled && terrainExaggeration > 0 && layers.buildings3d && buildings.length > 0 && zoom >= 11.5;
      const src = map.getSource("bcs-buildings-terrain-src") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(terrainBuildingsGeoJson);
      } else {
        map.addSource("bcs-buildings-terrain-src", {
          type: "geojson",
          data: terrainBuildingsGeoJson,
        });
      }

      if (!map.getLayer("bcs-buildings-terrain-3d")) {
        map.addLayer({
          id: "bcs-buildings-terrain-3d",
          type: "fill-extrusion",
          source: "bcs-buildings-terrain-src",
          minzoom: 11.5,
          layout: {
            visibility: showLayer ? "visible" : "none",
          },
          paint: {
            "fill-extrusion-color": ["get", "fill_color"],
            "fill-extrusion-height": ["get", "render_height"],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.92,
            "fill-extrusion-vertical-gradient": true,
          },
        });
      } else {
        map.setLayoutProperty("bcs-buildings-terrain-3d", "visibility", showLayer ? "visible" : "none");
      }
    };

    if (map.isStyleLoaded()) {
      syncBuildings();
    } else {
      map.once("style.load", syncBuildings);
    }
  }, [terrainBuildingsGeoJson, terrain3dEnabled, terrainExaggeration, layers.buildings3d, buildings.length, zoom, styleVersion]);

  // Bind hover/click handlers for Terrain-Seated 3D Buildings per style load
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMouseMove = (ev: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feat = ev.features?.[0];
      if (!feat) return;
      const p = feat.properties || {};
      const surgeRisk = Number(p.surge_risk ?? 0);
      const surgeTxt = isEn
        ? surgeRisk === 2 ? "HIGH (<6m)" : surgeRisk === 1 ? "MODERATE (<10m)" : "SAFE"
        : surgeRisk === 2 ? "ALTO (<6m)" : surgeRisk === 1 ? "MODERADO (<10m)" : "SEGURO";
      map.getCanvas().style.cursor = "pointer";
      setHoverInfo({
        x: ev.originalEvent.clientX,
        y: ev.originalEvent.clientY,
        title: isEn ? `3D Building · ${p.city_name || "BCS"}` : `Edificio 3D · ${p.city_name || "BCS"}`,
        lines: isEn
          ? [
              `Height: ${p.height_m} m (${p.floors} floors) · GFA ${Math.round(Number(p.gfa_m2 || 0)).toLocaleString()} m²`,
              `Rooftop Solar: ${p.solar_kwp} kWp | Ground Elev: ${p.ground_elev_m} m ASL (${surgeTxt})`,
            ]
          : [
              `Altura: ${p.height_m} m (${p.floors} niveles) · GFA ${Math.round(Number(p.gfa_m2 || 0)).toLocaleString()} m²`,
              `Solar Techo: ${p.solar_kwp} kWp | Cota Terreno: ${p.ground_elev_m} msnm (${surgeTxt})`,
            ],
      });
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      setHoverInfo(null);
    };

    const onBuildingClick = (ev: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feat = ev.features?.[0];
      if (!feat) return;
      const p = feat.properties || {};
      lastInspectHandledAtRef.current = Date.now();
      const pk = Number(p.pk);
      const ageb = typeof p.ageb_cvegeo === "string" ? p.ageb_cvegeo : null;
      const groundElev = Number.isFinite(Number(p.ground_elev_m))
        ? Number(p.ground_elev_m)
        : queryRealElevationRef.current(map, ev.lngLat);
      onInspectLocationRef.current(
        Number(p.lon ?? ev.lngLat.lng),
        Number(p.lat ?? ev.lngLat.lat),
        Number.isFinite(pk) && pk > 0 ? pk : null,
        ageb,
        groundElev,
      );
    };

    map.on("mousemove", "bcs-buildings-terrain-3d", onMouseMove);
    map.on("mouseleave", "bcs-buildings-terrain-3d", onMouseLeave);
    map.on("click", "bcs-buildings-terrain-3d", onBuildingClick);
    return () => {
      map.off("mousemove", "bcs-buildings-terrain-3d", onMouseMove);
      map.off("mouseleave", "bcs-buildings-terrain-3d", onMouseLeave);
      map.off("click", "bcs-buildings-terrain-3d", onBuildingClick);
    };
  }, [isEn, styleVersion]);

  // Construct deck.gl layer stack
  const deckLayers = useMemo(() => {
    const list: unknown[] = [];
    const metricMeta = METRIC_CATALOG[activeMetric];
    const deltas = phase === "scenarios" && simulation ? simulation.ageb_deltas : {};

    // 1. State/Municipal Outlines
    if (geoCache.municipalities) {
      list.push(
        new GeoJsonLayer({
          id: "municipalities-outline",
          data: geoCache.municipalities,
          stroked: true,
          filled: false,
          getLineColor: theme === "light" ? [71, 85, 105, 130] : [148, 163, 184, 130],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }

    // 2. Aquifers
    if (layers.aquifers && geoCache.aquifers) {
      list.push(
        new GeoJsonLayer({
          id: "aquifers-layer",
          data: geoCache.aquifers,
          stroked: true,
          filled: true,
          getFillColor: (f: GeoJSON.Feature) => {
            const dma = Number(f.properties?.dma_2023_hm3 ?? 0);
            if (dma < -10) return [239, 68, 68, 65];
            if (dma < 0) return [245, 158, 11, 50];
            return [6, 182, 212, 42];
          },
          getLineColor: [34, 211, 238, 150],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: isEn
                ? `Aquifer ${p.aquifer_code || ""} · ${p.aquifer_name || ""}`
                : `Acuífero ${p.aquifer_code || ""} · ${p.aquifer_name || ""}`,
              lines: isEn
                ? [
                    `DMA 2023: ${p.dma_2023_hm3} hm³/yr`,
                    `Exploitation: ${p.exploitation_ratio_pct}% | ${p.veda_status || ""}`,
                  ]
                : [
                    `DMA 2023: ${p.dma_2023_hm3} hm³/año`,
                    `Explotación: ${p.exploitation_ratio_pct}% | ${p.veda_status || ""}`,
                  ],
            });
          },
        }),
      );
    }

    // 3. POER UGAs
    if (layers.poer && geoCache.poer_ugas) {
      list.push(
        new GeoJsonLayer({
          id: "poer-layer",
          data: geoCache.poer_ugas,
          stroked: true,
          filled: true,
          getFillColor: [132, 204, 22, 45],
          getLineColor: [163, 230, 53, 130],
          getLineWidth: 1,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }

    // 4. CONANP ANPs
    if (layers.anps && geoCache.anps) {
      list.push(
        new GeoJsonLayer({
          id: "anps-layer",
          data: geoCache.anps,
          stroked: true,
          filled: true,
          getFillColor: [34, 197, 94, 58],
          getLineColor: [74, 222, 128, 180],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }

    // 5. La Paz Tandeo Sectors
    if (layers.tandeo && geoCache.tandeo) {
      list.push(
        new GeoJsonLayer({
          id: "tandeo-layer",
          data: geoCache.tandeo,
          stroked: true,
          filled: true,
          getFillColor: [244, 63, 94, 72],
          getLineColor: [251, 113, 133, 195],
          getLineWidth: 1.2,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }

    // 6. City Science AGEBs (1,155)
    if (layers.agebs && geoCache.agebs) {
      const use3DTiles = layers.buildings3d && phase !== "scenarios" && Boolean(tileset3dUrl) && !tilesetError;
      const buildingsVisible = layers.buildings3d && zoom >= 11.8 && (use3DTiles || buildings.length > 0);
      const extrudeAgebs = agebs3dMode && !buildingsVisible;
      list.push(
        new GeoJsonLayer({
          id: "agebs-city-science",
          data: geoCache.agebs,
          extruded: extrudeAgebs,
          wireframe: true,
          stroked: true,
          filled: true,
          getFillColor: (f: GeoJSON.Feature) => {
            const p = f.properties || {};
            const val = Number(p[activeMetric] ?? 0);
            const alpha = buildingsVisible ? 32 : 92;
            return interpolateMetricColor(val, metricMeta, alpha, colorblindSafe);
          },
          getLineColor: (f: GeoJSON.Feature) =>
            f.properties?.cvegeo_ageb === selectedAgebId
              ? theme === "light" ? [0, 122, 255, 255] : [255, 255, 255, 255]
              : theme === "light" ? [100, 116, 139, 95] : [203, 213, 225, 95],
          getLineWidth: (f: GeoJSON.Feature) => (f.properties?.cvegeo_ageb === selectedAgebId ? 3 : 1),
          lineWidthUnits: "pixels",
          getElevation: (f: GeoJSON.Feature) => {
            if (!extrudeAgebs) return 0;
            const p = f.properties || {};
            const val = Number(p[activeMetric] ?? 0);
            const norm = Math.max(0.05, Math.min(1.0, val / Math.max(1, metricMeta.maxValue)));
            const simBoost = deltas[p.cvegeo_ageb]?.height_multiplier ?? 1.0;
            return norm * 300 * extrusionScale * simBoost;
          },
          pickable: true,
          autoHighlight: true,
          highlightColor: [56, 189, 248, 120],
          updateTriggers: {
            getFillColor: [activeMetric, buildingsVisible, zoom, colorblindSafe],
            getElevation: [activeMetric, extrusionScale, extrudeAgebs, phase, simulation],
            getLineColor: [selectedAgebId],
          },
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: `${p.municipality_name || "BCS"} · AGEB ${p.cvegeo_ageb || ""}`,
              lines: isEn
                ? [
                    `${metricMeta.shortLabelEn}: ${p[activeMetric] ?? 0} ${metricMeta.unit}`,
                    `2025 Pop: ${(p.pobtot_2025_eic_calibrated || 0).toLocaleString()} | 3D Bldgs: ${(p.buildings_3d_count || 0).toLocaleString()}`,
                    `15-Min City: ${p.city15_score} | 2050 Infill: +${p.infill_homes_potential} homes`,
                  ]
                : [
                    `${metricMeta.shortLabel}: ${p[activeMetric] ?? 0} ${metricMeta.unit}`,
                    `Población 2025: ${(p.pobtot_2025_eic_calibrated || 0).toLocaleString()} | Edificios 3D: ${(p.buildings_3d_count || 0).toLocaleString()}`,
                    `Ciudad 15-Min: ${p.city15_score} | Infill 2050: +${p.infill_homes_potential} viv`,
                  ],
            });
          },
          onClick: ({ coordinate, object }) => {
            if (!coordinate || !object) return;
            const p = object.properties || {};
            lastInspectHandledAtRef.current = Date.now();
            const elev = mapRef.current
              ? queryRealElevationRef.current(mapRef.current, [coordinate[0], coordinate[1]])
              : null;
            onInspectLocation(coordinate[0], coordinate[1], null, p.cvegeo_ageb, elev);
          },
        }),
      );
    }

    // 7. Zoning Parcels (zoom >= 12.6)
    if (layers.zoning && zoning.length > 0) {
      list.push(
        new PolygonLayer<ZoningParcelRecord>({
          id: "zoning-parcels-layer",
          data: zoning,
          stroked: true,
          filled: true,
          extruded: false,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => {
            const palette = colorblindSafe ? ZONING_CATEGORY_COLORS_COLORBLIND : ZONING_CATEGORY_COLORS;
            return palette[d.category] || [148, 163, 184, 110];
          },
          updateTriggers: {
            getFillColor: [colorblindSafe],
          },
          getLineColor: [255, 255, 255, 45],
          getLineWidth: 0.6,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            setHoverInfo({
              x,
              y,
              title: isEn
                ? `Zoning ${object.land_use_code || object.category}`
                : `Zonificación ${object.land_use_code || object.category}`,
              lines: isEn
                ? [
                    `${object.category} (${object.area_ha.toFixed(2)} ha)`,
                    `Max COS: ${object.cos_max ?? "N/A"} | Max CUS: ${object.cus_max ?? "N/A"} | Floors: ${object.max_levels ?? "N/A"}`,
                  ]
                : [
                    `${object.category} (${object.area_ha.toFixed(2)} ha)`,
                    `COS máx: ${object.cos_max ?? "N/D"} | CUS máx: ${object.cus_max ?? "N/D"} | Niveles: ${object.max_levels ?? "N/D"}`,
                  ],
            });
          },
        }),
      );
    }

    // 8. REAL 3D BUILDINGS — When Flat (3D Terrain OFF), render OGC 3D Tiles 1.1 or SQLite R-Tree deck.gl layer;
    // when 3D Terrain is ON, native MapLibre `bcs-buildings-terrain-3d` seats buildings directly on DEM hills.
    const terrainActiveNow = terrain3dEnabled && terrainExaggeration > 0;
    const use3DTilesStream =
      !terrainActiveNow && layers.buildings3d && phase !== "scenarios" && Boolean(tileset3dUrl) && !tilesetError;
    if (use3DTilesStream && zoom >= 11.5) {
      list.push(
        new Tile3DLayer({
          id: "buildings-3dtiles-v11",
          data: tileset3dUrl,
          pickable: true,
          onTilesetLoad: () => {
            tilesetErrorRef.current = false;
            setTilesetError(false);
          },
          onTileLoad: () => {
            setTilesLoadedCount((c) => c + 1);
          },
          onTileError: () => {
            tilesetErrorRef.current = true;
            setTilesetError(true);
            if (mapRef.current) {
              fetchViewportFeatures(mapRef.current);
            }
          },
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            setHoverInfo({
              x,
              y,
              title: "OGC 3D Tiles 1.1 · Streaming glTF 2.0",
              lines: [
                `Tile: ${object.id || "bcs_buildings_v11"} · EXT_structural_metadata`,
                isEn
                  ? "BCS Real Buildings (396,823 polygons) · Click to inspect"
                  : "Edificación real BCS (396,823 polígonos) · Clic para inspeccionar",
              ],
            });
          },
          onClick: ({ coordinate }) => {
            if (!coordinate) return;
            lastInspectHandledAtRef.current = Date.now();
            onInspectLocation(coordinate[0], coordinate[1], null, null, null);
          },
        }),
      );
    } else if (!terrainActiveNow && layers.buildings3d && buildings.length > 0) {
      list.push(
        new PolygonLayer<BuildingRecord>({
          id: "buildings-3d-real",
          data: buildings,
          extruded: true,
          wireframe: false,
          stroked: false,
          getPolygon: (d) => d.polygon,
          getElevation: (d) => {
            const mult = deltas[d.ageb_cvegeo]?.height_multiplier ?? 1.0;
            return d.height_m * extrusionScale * mult;
          },
          getFillColor: (d) => {
            const mult = deltas[d.ageb_cvegeo]?.height_multiplier ?? 1.0;
            return getBuildingColor(d, activeMetric, mult, colorblindSafe);
          },
          material: {
            ambient: 0.42,
            diffuse: 0.68,
            shininess: 32,
            specularColor: [56, 189, 248],
          },
          pickable: true,
          autoHighlight: true,
          highlightColor: [250, 204, 21, 220],
          updateTriggers: {
            getElevation: [extrusionScale, phase, simulation],
            getFillColor: [activeMetric, phase, simulation, colorblindSafe],
          },
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const surgeTxt = isEn
              ? object.surge_risk === 2 ? "HIGH (<6m)" : object.surge_risk === 1 ? "MODERATE (<10m)" : "SAFE"
              : object.surge_risk === 2 ? "ALTO (<6m)" : object.surge_risk === 1 ? "MODERADO (<10m)" : "SEGURO";
            setHoverInfo({
              x,
              y,
              title: isEn ? `3D Building · ${object.city_name}` : `Edificio 3D · ${object.city_name}`,
              lines: isEn
                ? [
                    `Height: ${object.height_m} m (${object.floors} floors) · GFA ${Math.round(object.gfa_m2).toLocaleString()} m²`,
                    `Rooftop Solar: ${object.solar_kwp} kWp | Elev: ${object.ground_elev_m} m (${surgeTxt})`,
                  ]
                : [
                    `Altura: ${object.height_m} m (${object.floors} niveles) · GFA ${Math.round(object.gfa_m2).toLocaleString()} m²`,
                    `Solar Techo: ${object.solar_kwp} kWp | Cota: ${object.ground_elev_m} m (${surgeTxt})`,
                  ],
            });
          },
          onClick: ({ object }) => {
            if (!object) return;
            lastInspectHandledAtRef.current = Date.now();
            onInspectLocation(object.lon, object.lat, object.id, object.ageb_cvegeo, object.ground_elev_m);
          },
        }),
      );
    }

    // 9. SIBCS Power Transmission Lines
    if (layers.powerGrid && geoCache.power_lines) {
      list.push(
        new GeoJsonLayer({
          id: "sibcs-lines",
          data: geoCache.power_lines,
          stroked: true,
          filled: false,
          getLineColor: [250, 204, 21, 215],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }
    if (layers.powerGrid && geoCache.substations) {
      list.push(
        new GeoJsonLayer({
          id: "sibcs-substations",
          data: geoCache.substations,
          pointType: "circle",
          getPointRadius: 180,
          pointRadiusMinPixels: 4,
          pointRadiusMaxPixels: 9,
          getFillColor: [250, 204, 21, 245],
          getLineColor: [15, 23, 42, 255],
          getLineWidth: 1.5,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: isEn ? `Substation ${p.name || "SIBCS"}` : `Subestación ${p.name || "SIBCS"}`,
              lines: isEn
                ? [`Voltage: ${p.voltage || "N/A"} | Operator: ${p.operator || "CFE"}`]
                : [`Voltaje: ${p.voltage || "N/D"} | Operador: ${p.operator || "CFE"}`],
            });
          },
        }),
      );
    }

    // 10. Planned Desal & Energy Projects
    if (layers.plannedProjects && geoCache.planned_projects) {
      list.push(
        new GeoJsonLayer({
          id: "planned-projects-layer",
          data: geoCache.planned_projects,
          pointType: "circle",
          getPointRadius: 450,
          pointRadiusMinPixels: 6,
          pointRadiusMaxPixels: 13,
          getFillColor: [217, 70, 239, 235],
          getLineColor: [255, 255, 255, 240],
          getLineWidth: 2,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: `${p.project_name || (isEn ? "Strategic Project" : "Proyecto Estratégico")}`,
              lines: [
                `${p.category || ""} · ${p.capacity_value || ""} ${p.capacity_unit || ""}`,
                `${isEn ? "Status" : "Estatus"}: ${p.status_2025_2026 || ""} | COD: ${p.target_cod_year || ""}`,
              ],
            });
          },
        }),
      );
    }

    // 11. Essential Services (3,510)
    if (layers.services && geoCache.services) {
      list.push(
        new GeoJsonLayer({
          id: "services-layer",
          data: geoCache.services,
          pointType: "circle",
          getPointRadius: 45,
          pointRadiusMinPixels: 2.5,
          pointRadiusMaxPixels: 7,
          getFillColor: (f: GeoJSON.Feature) => {
            const c = f.properties?.category;
            if (c === "health") return [244, 63, 94, 235];
            if (c === "education") return [56, 189, 248, 235];
            return [168, 85, 247, 225];
          },
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: `${p.facility_name || (isEn ? "Facility" : "Equipamiento")}`,
              lines: [`Sector: ${p.sector || ""}`, `${p.localidad_name || ""}`],
            });
          },
        }),
      );
    }

    // 12. Transit Lines & Stops
    if (layers.transit && geoCache.transit_lines) {
      list.push(
        new GeoJsonLayer({
          id: "transit-lines",
          data: geoCache.transit_lines,
          stroked: true,
          filled: false,
          getLineColor: [129, 140, 248, 230],
          getLineWidth: 2.5,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }
    if (layers.transit && geoCache.transit_stops) {
      list.push(
        new GeoJsonLayer({
          id: "transit-stops",
          data: geoCache.transit_stops,
          pointType: "circle",
          getPointRadius: 65,
          pointRadiusMinPixels: 3,
          pointRadiusMaxPixels: 8,
          getFillColor: [129, 140, 248, 240],
          getLineColor: [255, 255, 255, 200],
          getLineWidth: 1,
          pickable: false,
        }),
      );
    }

    // 13. Regional Strategic Corridor Flow Arcs
    if (layers.corridorArcs && corridorArcs.length > 0 && zoom < 12.5) {
      list.push(
        new ArcLayer<CorridorArc>({
          id: "corridor-arcs",
          data: corridorArcs,
          getSourcePosition: (d) => d.source,
          getTargetPosition: (d) => d.target,
          getSourceColor: [56, 189, 248, 220],
          getTargetColor: [16, 185, 129, 220],
          getWidth: (d) => Math.max(2, d.flow_index / 20),
          getHeight: 0.45,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            setHoverInfo({
              x,
              y,
              title: object.name,
              lines: [isEn ? `Regional Flow Index: ${object.flow_index}/100` : `Flujo Regional Índice: ${object.flow_index}/100`],
            });
          },
        }),
      );
    }

    // 13b. Google Cloud BigQuery Enriched Thematic Layers (Lazy-Fetched on Toggle)
    if (layers.landTenure && geoCache.land_tenure) {
      list.push(
        new GeoJsonLayer({
          id: "land-tenure-layer",
          data: geoCache.land_tenure,
          stroked: true,
          filled: true,
          getFillColor: (f: GeoJSON.Feature) =>
            f.properties?.tenure_type === "territorial_reserve" ? [52, 199, 89, 80] : [217, 119, 6, 48],
          getLineColor: (f: GeoJSON.Feature) =>
            f.properties?.tenure_type === "territorial_reserve" ? [22, 163, 74, 210] : [180, 83, 9, 175],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: `${p.tenure_type === "territorial_reserve" ? (isEn ? "Territorial Reserve" : "Reserva Territorial") : "Ejido / RAN"} · ${p.name || ""}`,
              lines: [`${p.municipality || "BCS"} · ${p.legal_regime || p.source || ""}`],
            });
          },
        }),
      );
    }

    if (layers.coastalEcosystems && geoCache.coastal_ecosystems) {
      list.push(
        new GeoJsonLayer({
          id: "coastal-ecosystems-layer",
          data: geoCache.coastal_ecosystems,
          stroked: true,
          filled: true,
          pointType: "circle",
          getPointRadius: 180,
          pointRadiusMinPixels: 5,
          pointRadiusMaxPixels: 10,
          getFillColor: (f: GeoJSON.Feature) => {
            const t = f.properties?.eco_type;
            if (t === "mangrove") return [0, 199, 190, 110];
            if (t === "ramsar") return [16, 185, 129, 65];
            if (t === "coral_reef") return [244, 63, 94, 215];
            return [14, 165, 233, 215];
          },
          getLineColor: [13, 148, 136, 200],
          getLineWidth: 1.4,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: `${p.name || "Coastal Ecosystem"}`,
              lines: [`${String(p.eco_type || "").toUpperCase()} · ${p.area_ha ? `${p.area_ha} ha · ` : ""}${p.source || ""}`],
            });
          },
        }),
      );
    }

    if (layers.hazardAtlas && geoCache.hazard_atlas) {
      list.push(
        new GeoJsonLayer({
          id: "hazard-atlas-layer",
          data: geoCache.hazard_atlas,
          stroked: true,
          filled: true,
          pointType: "circle",
          getPointRadius: 240,
          pointRadiusMinPixels: 6,
          pointRadiusMaxPixels: 12,
          getFillColor: (f: GeoJSON.Feature) => {
            const ht = f.properties?.hazard_type;
            if (ht === "flood_tr100") return [220, 38, 38, 115];
            if (ht === "storm_surge") return [234, 88, 12, 105];
            if (ht === "heatwave") return [245, 158, 11, 80];
            if (ht === "cyclone_basin") return [99, 102, 241, 32];
            return [190, 18, 60, 235];
          },
          getLineColor: (f: GeoJSON.Feature) => {
            const ht = f.properties?.hazard_type;
            if (ht === "flood_tr100") return [185, 28, 28, 210];
            if (ht === "storm_surge") return [194, 65, 12, 200];
            return [99, 102, 241, 140];
          },
          getLineWidth: 1.2,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.name || (isEn ? "Hazard Zone" : "Zona de Riesgo"),
              lines: [`${p.hazard_type || ""} ${p.severity ? `· ${p.severity}` : ""} · ${p.source || ""}`],
            });
          },
        }),
      );
    }

    if (layers.arroyosRivers && geoCache.arroyos_rivers) {
      list.push(
        new GeoJsonLayer({
          id: "arroyos-rivers-layer",
          data: geoCache.arroyos_rivers,
          stroked: true,
          filled: false,
          getLineColor: [0, 145, 178, 205],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.name || (isEn ? "Arroyo Channel" : "Cauce / Arroyo"),
              lines: [`${p.municipality || "Los Cabos"} · ${p.source || ""}`],
            });
          },
        }),
      );
    }

    if (layers.waterNetworkLc && geoCache.water_network_lc) {
      list.push(
        new GeoJsonLayer({
          id: "water-network-lc-layer",
          data: geoCache.water_network_lc,
          stroked: true,
          filled: true,
          pointType: "circle",
          getPointRadius: 90,
          pointRadiusMinPixels: 5,
          pointRadiusMaxPixels: 10,
          getLineColor: (f: GeoJSON.Feature) => {
            const st = f.properties?.subtype;
            if (st === "purple_line") return [168, 85, 247, 235];
            if (st === "aqueduct") return [2, 132, 199, 235];
            return [56, 189, 248, 195];
          },
          getFillColor: (f: GeoJSON.Feature) => {
            const st = f.properties?.subtype;
            if (st === "tank") return [37, 99, 235, 235];
            if (st === "well") return [13, 148, 136, 235];
            return [168, 85, 247, 235];
          },
          getLineWidth: (f: GeoJSON.Feature) => (f.properties?.subtype === "purple_line" || f.properties?.subtype === "aqueduct" ? 2.8 : 1.5),
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: `${p.name || "Water Infrastructure"}`,
              lines: [`${p.subtype || ""} · ${p.municipality || "Los Cabos"} (${p.source || ""})`],
            });
          },
        }),
      );
    }

    if (layers.parksPublicSpace && geoCache.parks_public_space) {
      list.push(
        new GeoJsonLayer({
          id: "parks-public-space-layer",
          data: geoCache.parks_public_space,
          stroked: true,
          filled: true,
          pointType: "circle",
          getPointRadius: 80,
          pointRadiusMinPixels: 5,
          pointRadiusMaxPixels: 10,
          getFillColor: (f: GeoJSON.Feature) =>
            f.properties?.space_type === "beach_access" ? [6, 182, 212, 230] : [34, 197, 94, 130],
          getLineColor: (f: GeoJSON.Feature) =>
            f.properties?.space_type === "beach_access" ? [255, 255, 255, 230] : [21, 128, 61, 210],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.name || (isEn ? "Park / Public Space" : "Parque / Espacio Público"),
              lines: [`${p.space_type || ""} · ${p.municipality || "BCS"} (${p.source || ""})`],
            });
          },
        }),
      );
    }

    if (layers.mobilityArterials && geoCache.mobility_arterials) {
      list.push(
        new GeoJsonLayer({
          id: "mobility-arterials-layer",
          data: geoCache.mobility_arterials,
          stroked: true,
          filled: false,
          getLineColor: (f: GeoJSON.Feature) =>
            f.properties?.road_type === "bikeway" ? [16, 185, 129, 235] : [245, 158, 11, 210],
          getLineWidth: (f: GeoJSON.Feature) => (f.properties?.road_type === "bikeway" ? 2.5 : 2.0),
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.name || (isEn ? "Arterial Corridor" : "Vialidad Primaria"),
              lines: [`${p.road_type || ""} · ${p.municipality || "Los Cabos"}`],
            });
          },
        }),
      );
    }

    if (layers.airportsPortsMarinas && geoCache.airports_ports_marinas) {
      list.push(
        new GeoJsonLayer({
          id: "airports-ports-marinas-layer",
          data: geoCache.airports_ports_marinas,
          pointType: "circle",
          getPointRadius: 320,
          pointRadiusMinPixels: 6,
          pointRadiusMaxPixels: 13,
          getFillColor: (f: GeoJSON.Feature) => {
            const ht = f.properties?.hub_type;
            if (ht === "airport") return [0, 122, 255, 240];
            if (ht === "marina") return [168, 85, 247, 235];
            return [14, 165, 233, 235];
          },
          getLineColor: [255, 255, 255, 240],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.name || "Logistics Hub",
              lines: [`${String(p.hub_type || "").toUpperCase()} · ${p.iata_code ? `IATA ${p.iata_code} · ` : ""}${p.source || ""}`],
            });
          },
        }),
      );
    }

    if (layers.culturalHeritage && geoCache.cultural_heritage) {
      list.push(
        new GeoJsonLayer({
          id: "cultural-heritage-layer",
          data: geoCache.cultural_heritage,
          pointType: "circle",
          getPointRadius: 280,
          pointRadiusMinPixels: 6,
          pointRadiusMaxPixels: 12,
          getFillColor: (f: GeoJSON.Feature) => {
            const ht = f.properties?.heritage_type;
            if (ht === "unesco") return [234, 179, 8, 245];
            if (ht === "mission") return [217, 119, 6, 240];
            return [168, 85, 247, 230];
          },
          getLineColor: [255, 255, 255, 240],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.name || "Cultural Heritage",
              lines: [`${String(p.heritage_type || "").toUpperCase()} · ${p.source || ""}`],
            });
          },
        }),
      );
    }

    if (layers.wasteManagement && geoCache.waste_routes_lpz) {
      list.push(
        new GeoJsonLayer({
          id: "waste-routes-lpz-layer",
          data: geoCache.waste_routes_lpz,
          stroked: true,
          filled: true,
          getFillColor: [162, 132, 94, 60],
          getLineColor: [146, 64, 14, 175],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.name || "Waste Collection Sector",
              lines: [`La Paz · ${p.source || ""}`],
            });
          },
        }),
      );
    }

    if (layers.wasteManagement && geoCache.waste_sites) {
      list.push(
        new GeoJsonLayer({
          id: "waste-sites-layer",
          data: geoCache.waste_sites,
          pointType: "circle",
          getPointRadius: 340,
          pointRadiusMinPixels: 6,
          pointRadiusMaxPixels: 13,
          getFillColor: [180, 83, 9, 240],
          getLineColor: [255, 255, 255, 235],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: p.facility_or_project_name || "Waste Disposal Site",
              lines: [`${p.municipality_name || "BCS"} · ${p.facility_type || ""} (${p.project_status || ""})`],
            });
          },
        }),
      );
    }

    // 14. Real-Time Air Traffic (ADS-B: adsb.fi / adsb.lol / OpenSky) & Maritime Vessels (AISStream)
    if (layers.airTraffic && liveTelemetry?.aircraft?.aircraft?.length) {
      type AircraftItem = NonNullable<LiveTelemetrySummary["aircraft"]>["aircraft"][number];
      const airData = liveTelemetry.aircraft.aircraft;
      const airborne = airData.filter((a) => !a.on_ground && (a.altitude_m || 0) > 100);
      if (airborne.length > 0) {
        list.push(
          new LineLayer<AircraftItem>({
            id: "live-aircraft-alt-stems",
            data: airborne,
            getSourcePosition: (d) => [d.lon, d.lat, 0],
            getTargetPosition: (d) => [d.lon, d.lat, Math.min(4800, Math.max(80, (d.altitude_m || 0) * 0.42))],
            getColor: [245, 158, 11, 130],
            getWidth: 1.5,
            widthUnits: "pixels",
            pickable: false,
          }),
        );
      }
      list.push(
        new IconLayer<AircraftItem>({
          id: "live-aircraft",
          data: airData,
          iconAtlas: AIRCRAFT_ICON_URL,
          iconMapping: TRAFFIC_ICON_MAPPING,
          getIcon: () => "marker",
          getPosition: (d) => [d.lon, d.lat, d.on_ground ? 12 : Math.min(4800, Math.max(80, (d.altitude_m || 0) * 0.42))],
          getSize: 24,
          sizeMinPixels: 18,
          sizeMaxPixels: 30,
          getAngle: (d) => -(d.heading || 0),
          getColor: (d) => (d.on_ground ? [148, 163, 184, 235] : [245, 158, 11, 250]),
          billboard: false,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const altFt = object.altitude_ft ?? Math.round((object.altitude_m || 0) / 0.3048);
            const spdKt = object.speed_kt ?? Math.round((object.velocity_ms || 0) / 0.514444);
            const kmh = Math.round((object.velocity_ms || 0) * 3.6);
            setHoverInfo({
              x,
              y,
              title: `${isEn ? "Live Flight" : "Vuelo en Vivo"} · ${object.callsign || object.icao24}`,
              lines: isEn
                ? [
                    `${object.aircraft_desc || object.aircraft_type || "Aircraft"}${object.registration ? ` (${object.registration})` : ""}${object.country ? ` · ${object.country}` : ""}`,
                    `Alt: ${altFt.toLocaleString()} ft (${Math.round(object.altitude_m || 0).toLocaleString()} m) | Speed: ${spdKt} kt (${kmh} km/h)`,
                    `Hdg: ${Math.round(object.heading || 0)}°${object.squawk ? ` | Squawk: ${object.squawk}` : ""} · ${object.provider || liveTelemetry.aircraft.source || "ADS-B"}`,
                  ]
                : [
                    `${object.aircraft_desc || object.aircraft_type || "Aeronave"}${object.registration ? ` (${object.registration})` : ""}${object.country ? ` · ${object.country}` : ""}`,
                    `Altitud: ${altFt.toLocaleString()} ft (${Math.round(object.altitude_m || 0).toLocaleString()} m) | Vel: ${spdKt} kt (${kmh} km/h)`,
                    `Rumbo: ${Math.round(object.heading || 0)}°${object.squawk ? ` | Squawk: ${object.squawk}` : ""} · ${object.provider || liveTelemetry.aircraft.source || "ADS-B"}`,
                  ],
            });
          },
          onClick: ({ object }) => {
            if (!object) return;
            lastInspectHandledAtRef.current = Date.now();
            onInspectLocation(object.lon, object.lat, null, null, Math.round(object.altitude_m || 0));
          },
        }),
      );
      if (zoom >= 6.5) {
        list.push(
          new TextLayer<AircraftItem>({
            id: "live-aircraft-labels",
            data: airData,
            getPosition: (d) => [d.lon, d.lat, d.on_ground ? 12 : Math.min(4800, Math.max(80, (d.altitude_m || 0) * 0.42))],
            getText: (d) => `${d.callsign || d.icao24}${d.altitude_m > 100 ? ` · ${Math.round((d.altitude_ft ?? d.altitude_m / 0.3048) / 1000)}k ft` : ""}`,
            getSize: 10.5,
            sizeUnits: "pixels",
            getColor: theme === "light" ? [146, 64, 14, 245] : [253, 224, 71, 245],
            getPixelOffset: [0, 16],
            background: true,
            getBackgroundColor: theme === "light" ? [255, 255, 255, 210] : [15, 23, 42, 210],
            backgroundPadding: [4, 2],
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 700,
            pickable: false,
          }),
        );
      }
    }
    if (layers.marineTraffic && liveTelemetry?.marine?.vessels?.length) {
      type VesselItem = NonNullable<LiveTelemetrySummary["marine"]>["vessels"][number];
      const vesselData = liveTelemetry.marine.vessels;
      list.push(
        new IconLayer<VesselItem>({
          id: "live-vessels-ais",
          data: vesselData,
          iconAtlas: VESSEL_ICON_URL,
          iconMapping: TRAFFIC_ICON_MAPPING,
          getIcon: () => "marker",
          getPosition: (d) => [d.lon, d.lat, 8],
          getSize: 22,
          sizeMinPixels: 16,
          sizeMaxPixels: 26,
          getAngle: (d) => -(Number(d.heading ?? d.cog ?? 0)),
          getColor: (d) => {
            const t = String(d.type || "");
            if (t.includes("Passenger") || t.includes("Ferry")) return [0, 122, 255, 245];
            if (t.includes("Cargo")) return [0, 199, 190, 245];
            if (t.includes("Tanker")) return [255, 149, 0, 245];
            if (t.includes("Fishing") || t.includes("Yacht")) return [48, 209, 88, 245];
            return [88, 86, 214, 245];
          },
          billboard: false,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            setHoverInfo({
              x,
              y,
              title: `${isEn ? "Live Vessel" : "Embarcación AIS"} · ${object.name || object.mmsi}`,
              lines: isEn
                ? [
                    `Type: ${object.type || "Vessel"} · MMSI ${object.mmsi}`,
                    `Speed: ${object.sog ?? 0} kt | Heading: ${Math.round(Number(object.heading ?? object.cog ?? 0))}°${object.destination ? ` | Dest: ${object.destination}` : ""}`,
                    "Source: AISStream.io Live WebSocket",
                  ]
                : [
                    `Tipo: ${object.type || "Embarcación"} · MMSI ${object.mmsi}`,
                    `Vel: ${object.sog ?? 0} kt | Rumbo: ${Math.round(Number(object.heading ?? object.cog ?? 0))}°${object.destination ? ` | Dest: ${object.destination}` : ""}`,
                    "Fuente: AISStream.io WebSocket Vivo",
                  ],
            });
          },
          onClick: ({ object }) => {
            if (!object) return;
            lastInspectHandledAtRef.current = Date.now();
            onInspectLocation(object.lon, object.lat, null, null, 0);
          },
        }),
      );
      if (zoom >= 7.2) {
        list.push(
          new TextLayer<VesselItem>({
            id: "live-vessels-labels",
            data: vesselData,
            getPosition: (d) => [d.lon, d.lat, 8],
            getText: (d) => d.name || d.mmsi,
            getSize: 10,
            sizeUnits: "pixels",
            getColor: theme === "light" ? [3, 105, 161, 240] : [125, 211, 252, 240],
            getPixelOffset: [0, 15],
            background: true,
            getBackgroundColor: theme === "light" ? [255, 255, 255, 205] : [15, 23, 42, 205],
            backgroundPadding: [4, 2],
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontWeight: 600,
            pickable: false,
          }),
        );
      }
    }

    // 14b. OGC SensorThings API v1.1 Live & Pilot Stations
    if (layers.liveTelemetry && sensorThings.length > 0) {
      const validThings = sensorThings.filter(
        (t) => Array.isArray(t.Locations?.[0]?.location?.coordinates) && t.Locations![0].location!.coordinates.length === 2,
      );
      if (validThings.length > 0) {
        list.push(
          new ScatterplotLayer<SensorThingRecord>({
            id: "ogc-sensorthings-live",
            data: validThings,
            getPosition: (d) => d.Locations![0].location!.coordinates,
            getRadius: 1100,
            radiusMinPixels: 6,
            radiusMaxPixels: 13,
            getFillColor: (d) => {
              const cat = d.properties?.category;
              if (cat === "conagua_aquifer") return [59, 130, 246, 235];
              if (cat === "weather") return [34, 211, 238, 235];
              return [251, 191, 36, 235];
            },
            getLineColor: [255, 255, 255, 220],
            lineWidthMinPixels: 1.5,
            stroked: true,
            pickable: true,
            onHover: ({ x, y, object }) => {
              if (!object) return setHoverInfo(null);
              const ds = object.Datastreams?.[0];
              const obs = ds?.Observations?.[0];
              const unit = ds?.unitOfMeasurement?.symbol || "";
              const valStr =
                obs?.result !== null && obs?.result !== undefined
                  ? `${obs.result} ${unit}`.trim()
                  : isEn ? "SCADA Pilot Standby" : "Piloto SCADA en espera";
              setHoverInfo({
                x,
                y,
                title: `OGC Thing · ${object.name}`,
                lines: isEn
                  ? [
                      `ID: ${object["@iot.id"]} · Status: ${object.properties?.feed_status || "LIVE"}`,
                      `${ds?.name || "Reading"}: ${valStr}`,
                      `Source: ${object.properties?.source || "OGC SensorThings v1.1"}`,
                    ]
                  : [
                      `ID: ${object["@iot.id"]} · Estado: ${object.properties?.feed_status || "LIVE"}`,
                      `${ds?.name || "Medición"}: ${valStr}`,
                      `Fuente: ${object.properties?.source || "OGC SensorThings v1.1"}`,
                    ],
              });
            },
          }),
        );
      }
    }

    // 15. Coupled OGC Physics Simulation Overlay (SFINCS Flood / r5py Isochrones / WNTR Pipes)
    if (physicsOverlay?.result?.overlay_geojson) {
      const procId = physicsOverlay.processId;
      list.push(
        new GeoJsonLayer({
          id: `ogc-physics-overlay-${physicsOverlay.jobId}`,
          data: physicsOverlay.result.overlay_geojson,
          extruded: procId === "arroyo_flood_sfincs",
          filled: true,
          stroked: true,
          pointType: "circle",
          getPointRadius: (f: GeoJSON.Feature) => (f.properties?.kind === "isochrone_origin" ? 130 : 85),
          pointRadiusMinPixels: 4,
          pointRadiusMaxPixels: 11,
          getLineWidth: (f: GeoJSON.Feature) => (f.properties?.kind === "water_pipe" ? 3 : 1.5),
          lineWidthUnits: "pixels",
          getElevation: (f: GeoJSON.Feature) => {
            if (procId !== "arroyo_flood_sfincs") return 0;
            return Math.max(0.2, Number(f.properties?.depth_m || 0.3)) * 18.0 * extrusionScale;
          },
          getFillColor: (f: GeoJSON.Feature) => {
            const p = f.properties || {};
            if (p.kind === "flood_depth_cell") {
              const d = Number(p.depth_m || 0);
              if (d >= 2.0) return [239, 68, 68, 210];
              if (d >= 1.0) return [249, 115, 22, 185];
              return [56, 189, 248, 165];
            }
            if (p.kind === "isochrone_band") {
              const m = Number(p.minutes || 15);
              if (m <= 5) return [16, 185, 129, 125];
              if (m <= 10) return [56, 189, 248, 88];
              return [99, 102, 241, 62];
            }
            if (p.kind === "water_node") {
              return Number(p.scenario_min_pressure_m || 0) >= 15.0 ? [16, 185, 129, 235] : [244, 63, 94, 235];
            }
            if (p.kind === "isochrone_origin") return [250, 204, 21, 250];
            return [34, 211, 238, 210];
          },
          getLineColor: (f: GeoJSON.Feature) => {
            const p = f.properties || {};
            if (p.kind === "water_pipe") return [34, 211, 238, 235];
            if (p.kind === "isochrone_band") return [255, 255, 255, 180];
            return [15, 23, 42, 210];
          },
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            if (p.kind === "flood_depth_cell") {
              setHoverInfo({
                x,
                y,
                title: isEn
                  ? `2D Flood · Depth ${p.depth_m} m (${p.severity})`
                  : `Inundación 2D · Tirante ${p.depth_m} m (${p.severity})`,
                lines: isEn
                  ? [`DEM Elev: ${p.elev_m} m`, p.in_arroyo ? "Active arroyo channel flow" : "Floodplain / coastal zone"]
                  : [`Cota DEM: ${p.elev_m} m`, p.in_arroyo ? "Zona de flujo de arroyo activo" : "Llanura / costa"],
              });
            } else if (p.kind === "isochrone_band") {
              setHoverInfo({
                x,
                y,
                title: isEn
                  ? `Road Network Isochrone · ${p.label || `${p.minutes} min`}`
                  : `Isócrona Red Vial · ${p.label || `${p.minutes} min`}`,
                lines: isEn
                  ? [`Reachable area: ${p.area_ha} ha`, p.include_transit ? "Includes transit routes" : "Walk-only"]
                  : [`Área alcanzada: ${p.area_ha} ha`, p.include_transit ? "Incluye rutas de autobús" : "Solo peatonal"],
              });
            } else if (p.kind === "water_node") {
              setHoverInfo({
                x,
                y,
                title: isEn ? `WNTR Node · ${p.label || p.node_id}` : `Nodo WNTR · ${p.label || p.node_id}`,
                lines: [
                  `${isEn ? "Min pressure" : "Presión mín"}: ${p.baseline_min_pressure_m} -> ${p.scenario_min_pressure_m} m (+${p.pressure_gain_m} m)`,
                  `${p.status}`,
                ],
              });
            } else if (p.kind === "water_pipe") {
              setHoverInfo({
                x,
                y,
                title: isEn ? `Hydraulic Pipe ${p.pipe_id}` : `Tramo Hidráulico ${p.pipe_id}`,
                lines: isEn
                  ? [`Diameter: ${p.diameter_mm} mm · Length: ${p.length_m} m`, `Peak flow: ${p.peak_flow_lps} lps`]
                  : [`Diámetro: ${p.diameter_mm} mm · Long: ${p.length_m} m`, `Gasto pico: ${p.peak_flow_lps} lps`],
              });
            } else if (p.kind === "reachable_poi" || p.kind === "isochrone_origin") {
              setHoverInfo({
                x,
                y,
                title: `${p.name || p.label || (isEn ? "Point" : "Punto")}`,
                lines: [
                  p.sector
                    ? `${isEn ? "Reachable sector" : "Sector alcanzable"}: ${p.sector}`
                    : isEn ? "15-min network origin" : "Punto origen red 15-min",
                ],
              });
            }
          },
        }),
      );
    }

    // 16. Moderated Citizen Participation PMDU Pins
    if (layers.citizenPins && citizenPins.length > 0) {
      list.push(
        new ScatterplotLayer<CitizenPin>({
          id: "citizen-participation-pins",
          data: citizenPins,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 220,
          radiusMinPixels: 7,
          radiusMaxPixels: 15,
          getFillColor: (d) => {
            if (d.category === "water") return [0, 114, 178, 245];
            if (d.category === "flood_heat") return [213, 94, 0, 245];
            if (d.category === "mobility") return [86, 180, 233, 245];
            if (d.category === "housing") return [204, 121, 167, 245];
            if (d.category === "solar_energy") return [240, 228, 66, 245];
            return [0, 158, 115, 245];
          },
          getLineColor: [255, 255, 255, 250],
          lineWidthMinPixels: 2,
          stroked: true,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            setHoverInfo({
              x,
              y,
              title: `${object.title}`,
              lines: [
                `${object.pmdu_period} · ${object.author_alias}`,
                `${object.comment.slice(0, 110)}${object.comment.length > 110 ? "..." : ""}`,
              ],
            });
          },
          onClick: ({ object }) => {
            if (!object) return;
            lastInspectHandledAtRef.current = Date.now();
            const elev = mapRef.current
              ? queryRealElevationRef.current(mapRef.current, [object.lon, object.lat])
              : null;
            onInspectLocation(object.lon, object.lat, null, null, elev);
          },
        }),
      );
    }

    if (pendingPinCoords) {
      list.push(
        new ScatterplotLayer({
          id: "citizen-pin-draft",
          data: [pendingPinCoords],
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 260,
          radiusMinPixels: 9,
          radiusMaxPixels: 18,
          getFillColor: [250, 204, 21, 245],
          getLineColor: [15, 23, 42, 255],
          lineWidthMinPixels: 2.5,
          stroked: true,
          pickable: false,
        }),
      );
    }

    // 17. Aino-Style AI Spatial Chat Highlight Overlay
    if (aiMapHighlight?.highlight_geojson?.features && aiMapHighlight.highlight_geojson.features.length > 0) {
      list.push(
        new GeoJsonLayer({
          id: `ai-spatial-highlight-${aiMapHighlight.intent}`,
          data: aiMapHighlight.highlight_geojson,
          stroked: true,
          filled: true,
          pointType: "circle",
          getPointRadius: 260,
          pointRadiusMinPixels: 7,
          pointRadiusMaxPixels: 14,
          getFillColor: (f: GeoJSON.Feature) =>
            (f.properties?._ai_color as [number, number, number, number]) || [10, 132, 255, 165],
          getLineColor: (f: GeoJSON.Feature) =>
            (f.properties?._ai_line_color as [number, number, number, number]) || [255, 255, 255, 235],
          getLineWidth: 2.2,
          lineWidthMinPixels: 1.5,
          lineWidthUnits: "pixels",
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 140],
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            const p = object.properties || {};
            setHoverInfo({
              x,
              y,
              title: String(p._ai_title || aiMapHighlight.title || "AI Spatial Filter"),
              lines: [
                String(p._ai_detail || aiMapHighlight.subtitle || ""),
                isEn ? "Aino Spatial Filter · Click to inspect" : "Filtro Espacial IA · Clic para inspeccionar",
              ].filter(Boolean),
            });
          },
          onClick: ({ coordinate }) => {
            if (!coordinate) return;
            lastInspectHandledAtRef.current = Date.now();
            const elev = mapRef.current
              ? queryRealElevationRef.current(mapRef.current, [coordinate[0], coordinate[1]])
              : null;
            onInspectLocation(coordinate[0], coordinate[1], null, null, elev);
          },
        }),
      );
    }

    // 18. Glowing Click-to-Inspect Location Selection Ring
    if (selectedPoint) {
      list.push(
        new ScatterplotLayer({
          id: "selected-inspect-ring-outer",
          data: [selectedPoint],
          getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
          getRadius: 210,
          radiusMinPixels: 11,
          radiusMaxPixels: 22,
          getFillColor: [0, 122, 255, 58],
          getLineColor: [255, 255, 255, 245],
          lineWidthMinPixels: 2.5,
          stroked: true,
          pickable: false,
        }),
        new ScatterplotLayer({
          id: "selected-inspect-ring-core",
          data: [selectedPoint],
          getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
          getRadius: 85,
          radiusMinPixels: 5,
          radiusMaxPixels: 9,
          getFillColor: [0, 122, 255, 255],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          pickable: false,
        }),
      );
    }

    return list;
  }, [
    activeMetric,
    agebs3dMode,
    aiMapHighlight,
    buildings,
    citizenPins,
    colorblindSafe,
    corridorArcs,
    extrusionScale,
    geoCache,
    isEn,
    layers,
    liveTelemetry,
    pendingPinCoords,
    selectedPoint,
    sensorThings,
    physicsOverlay,
    onInspectLocation,
    phase,
    selectedAgebId,
    simulation,
    terrain3dEnabled,
    terrainExaggeration,
    theme,
    tileset3dUrl,
    tilesetError,
    zoom,
    zoning,
  ]);

  useEffect(() => {
    overlayRef.current?.setProps({ layers: deckLayers as never[] });
  }, [deckLayers]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${pinPlacementMode ? "cursor-crosshair" : ""} ${
        rightSidebarOpen ? "telemetry-open" : ""
      }`}
    >
      <div
        ref={containerRef}
        aria-label={isEn ? "Interactive 3D map of Baja California Sur" : "Mapa 3D interactivo de Baja California Sur"}
        className="h-full w-full"
      />

      {pinPlacementMode && (
        <div
          role="status"
          aria-live="polite"
          className="hig-glass-toolbar pointer-events-auto absolute left-1/2 top-[72px] z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-[#FF9F0A]/50 px-4 py-2 text-[12px] text-[var(--hig-amber)]"
        >
          <span className="font-semibold">
            {isEn
              ? "Click anywhere on the 3D map to drop your PMDU consultation pin"
              : "Haz clic en cualquier punto del mapa 3D para ubicar tu pin PMDU"}
          </span>
          <button
            type="button"
            onClick={onCancelPinPlacement}
            className="rounded-full bg-[var(--hig-pill-bg)] px-3 py-0.5 text-[11px] font-semibold text-[var(--hig-ink)] hover:bg-[var(--hig-pill-hover)] cursor-pointer"
          >
            {isEn ? "Cancel" : "Cancelar"}
          </button>
        </div>
      )}

      {/* Aino-Style Active Spatial Chat Filter Legend Pill */}
      {!pinPlacementMode && aiMapHighlight && (
        <div
          role="region"
          aria-label={isEn ? "Active AI map visualization" : "Visualización IA activa en mapa"}
          className="hig-glass-toolbar pointer-events-auto absolute left-1/2 top-[72px] z-20 flex max-w-[calc(100vw-40px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] shadow-md"
        >
          <span className="flex items-center gap-1.5 font-semibold text-[var(--hig-accent)]">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{aiMapHighlight.title}</span>
          </span>
          <span className="font-mono-num rounded-full bg-[var(--hig-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--hig-accent)]">
            {aiMapHighlight.matched_count}
          </span>
          {aiMapHighlight.legend && aiMapHighlight.legend.length > 0 && (
            <>
              <span className="hidden md:inline-block h-3 w-px bg-[var(--hig-divider)]" />
              <div className="hidden md:flex items-center gap-2.5">
                {aiMapHighlight.legend.map((lg) => (
                  <span key={lg.label} className="inline-flex items-center gap-1 text-[10.5px] text-[var(--hig-ink-2)] whitespace-nowrap">
                    <span className="h-2 w-2 rounded-full shrink-0 ring-1 ring-black/10" style={{ backgroundColor: lg.color }} />
                    <span>{lg.label}</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {onClearAiHighlight && (
            <button
              type="button"
              onClick={onClearAiHighlight}
              aria-label={isEn ? "Clear AI map visualization" : "Quitar filtro IA del mapa"}
              className="flex h-6 w-6 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Hover Tooltip (Clamped Inside Canvas & Away from Sidebars) */}
      {hoverInfo && (
        <div
          className="hig-glass-popover pointer-events-none fixed z-40 max-w-[270px] rounded-2xl px-3.5 py-2.5 text-[11.5px]"
          style={{
            left: Math.max(
              16,
              Math.min(
                typeof window !== "undefined"
                  ? window.innerWidth - (rightSidebarOpen && window.innerWidth >= 640 ? 430 : 290)
                  : 800,
                hoverInfo.x + 14,
              ),
            ),
            top: Math.max(
              76,
              Math.min(typeof window !== "undefined" ? window.innerHeight - 168 : 600, hoverInfo.y + 14),
            ),
          }}
        >
          <p className="font-semibold text-[var(--hig-cyan)]">{hoverInfo.title}</p>
          {hoverInfo.lines.map((ln, idx) => (
            <p key={idx} className="text-[var(--hig-ink-2)] leading-snug mt-0.5">
              {ln}
            </p>
          ))}
        </div>
      )}

      {/* Compact Floating 2D/3D Pitch & Reset BCS Controls (Right above MapLibre Nav) */}
      <div
        className={`pointer-events-auto absolute max-sm:bottom-[272px] max-sm:right-[22px] sm:bottom-[168px] ${
          rightSidebarOpen ? "sm:right-[428px]" : "sm:right-[26px]"
        } z-20 flex flex-col gap-1.5 transition-all`}
      >
        <button
          type="button"
          onClick={() => {
            const m = mapRef.current;
            if (!m) return;
            const nextFlat = !isPitchFlat;
            setIsPitchFlat(nextFlat);
            m.easeTo({ pitch: nextFlat ? 0 : 52, duration: 550 });
          }}
          aria-pressed={!isPitchFlat}
          aria-label={isEn ? "Toggle 2D / 3D camera tilt" : "Alternar inclinación 2D / 3D"}
          title={isEn ? "Toggle 2D / 3D Tilt" : "Inclinación 2D / 3D"}
          className="hig-glass-toolbar hig-lift flex h-8 w-8 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-full font-mono-num text-[10.5px] font-bold text-[var(--hig-ink)] cursor-pointer"
        >
          {isPitchFlat ? "2D" : "3D"}
        </button>
        <button
          type="button"
          onClick={() => {
            const m = mapRef.current;
            if (!m) return;
            setIsPitchFlat(false);
            m.flyTo({ center: [-111.55, 25.15], zoom: 6.6, pitch: 48, bearing: -14, duration: 1000 });
          }}
          aria-label={isEn ? "Reset view to all of Baja California Sur" : "Restablecer vista estatal BCS"}
          title={isEn ? "Reset Statewide View" : "Vista Estatal BCS"}
          className="hig-glass-toolbar hig-lift flex h-8 w-8 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-full text-[var(--hig-accent)] cursor-pointer"
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Desktop Active Layer Legend Pill (Bottom-Left) */}
      <div
        className={`hidden md:block pointer-events-auto absolute bottom-4 z-20 transition-all ${
          leftSidebarOpen ? "left-[324px]" : "left-4"
        }`}
      >
        {legendOpen && (
          <div className="hig-glass-popover mb-2 w-64 rounded-2xl p-3 text-[11px] space-y-2">
            <div className="flex items-center justify-between border-b border-[var(--hig-divider)] pb-1.5">
              <span className="font-semibold text-[var(--hig-ink)]">
                {isEn ? "Active Map Legend" : "Leyenda Activa"}
              </span>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                aria-label={isEn ? "Close legend" : "Cerrar leyenda"}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1 text-[10.5px] text-[var(--hig-ink-2)]">
              {layers.agebs && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#30D158]" />
                    <span>{isEn ? METRIC_CATALOG[activeMetric].shortLabelEn : METRIC_CATALOG[activeMetric].shortLabel}</span>
                  </span>
                  <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">1,155 AGEBs</span>
                </div>
              )}
              {layers.buildings3d && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#007AFF]" />
                    <span>{isEn ? "3D Buildings" : "Edificios 3D"}</span>
                  </span>
                  <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">396,823</span>
                </div>
              )}
              {layers.airTraffic && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                    <span>{isEn ? "Live Aircraft (ADS-B)" : "Aviones (ADS-B)"}</span>
                  </span>
                  <span className="font-mono-num text-[9.5px] text-[#D97706]">
                    {liveTelemetry?.aircraft?.count ?? 0}
                  </span>
                </div>
              )}
              {layers.marineTraffic && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#007AFF]" />
                    <span>{isEn ? "Live Vessels (AIS)" : "Buques (AIS)"}</span>
                  </span>
                  <span className="font-mono-num text-[9.5px] text-[var(--hig-accent)]">
                    {liveTelemetry?.marine?.count ?? 0}
                  </span>
                </div>
              )}
              {layers.aquifers && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#0A84FF]" />
                    <span>{isEn ? "CONAGUA Aquifers" : "Acuíferos CONAGUA"}</span>
                  </span>
                  <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">40</span>
                </div>
              )}
              {layers.anps && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28CD41]" />
                    <span>{isEn ? "Protected Areas (ANPs)" : "Áreas Naturales ANP"}</span>
                  </span>
                  <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">76</span>
                </div>
              )}
              {layers.hazardAtlas && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF3B30]" />
                    <span>{isEn ? "Flood & Surge Risk" : "Atlas de Riesgos"}</span>
                  </span>
                  <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">641</span>
                </div>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className={`hig-glass-toolbar hig-lift flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold cursor-pointer ${
            legendOpen ? "text-[var(--hig-accent)]" : "text-[var(--hig-ink)]"
          }`}
        >
          <Layers className="h-3.5 w-3.5 text-[var(--hig-accent)]" aria-hidden="true" />
          <span>{isEn ? "Legend" : "Leyenda"}</span>
        </button>
      </div>

      {/* Bottom Floating HIG Dynamic Island Telemetry & Quick Actions */}
      <div className="hig-glass-toolbar pointer-events-auto absolute max-sm:bottom-3 max-sm:left-2.5 max-sm:right-[62px] sm:bottom-4 sm:left-1/2 sm:max-w-[calc(100vw-240px)] sm:-translate-x-1/2 max-sm:px-3 sm:px-3.5 z-20 flex items-center justify-between sm:justify-center gap-2 rounded-full max-sm:min-h-[44px] py-1.5 text-[11.5px] whitespace-nowrap">
        <span className="flex items-center gap-1.5 font-mono-num text-[var(--hig-ink-2)] shrink-0">
          <Compass className="h-3.5 w-3.5 text-[var(--hig-accent)]" aria-hidden="true" />
          Z {zoom.toFixed(1)}
        </span>
        <span className="h-3 w-px bg-[var(--hig-divider)] shrink-0" />
        <span className="flex items-center gap-1 font-mono-num text-[var(--hig-green)] shrink-0">
          <Mountain className="h-3.5 w-3.5" aria-hidden="true" />
          {liveElevationM !== null
            ? `${fmtNumber(liveElevationM, language)} ${isEn ? "m ASL" : "msnm"}`
            : isEn ? "— m ASL" : "— msnm"}
        </span>

        {activeTourId ? (
          <>
            <span className="h-3 w-px bg-[var(--hig-divider)] shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center gap-1.5 font-medium text-[#BF5AF2] truncate">
                <Film className="h-3.5 w-3.5 text-[#BF5AF2] animate-pulse shrink-0" aria-hidden="true" />
                <span className="truncate">{tourStepTitle || (isEn ? "3D Tour..." : "Vuelo 3D...")}</span>
              </span>
              <button
                type="button"
                onClick={() => onStopTour?.()}
                className="flex min-h-[28px] max-sm:min-h-[36px] items-center gap-1 rounded-full bg-[#FF453A]/20 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--hig-red)] hover:bg-[#FF453A]/30 cursor-pointer shrink-0"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                <span>{isEn ? "Stop" : "Detener"}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {zoom >= 11.5 && (
              <>
                <span className="hidden md:inline-block h-3 w-px bg-[var(--hig-divider)] shrink-0" />
                <span className="hidden md:inline-flex items-center gap-1 font-mono-num text-[var(--hig-cyan)] shrink-0">
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {terrain3dEnabled && terrainExaggeration > 0 && layers.buildings3d
                    ? loadingBuildings
                      ? isEn ? "Loading 3D..." : "Cargando 3D..."
                      : `${fmtNumber(buildings.length, language)} ${isEn ? "3D bldgs" : "edif. 3D"}`
                    : tilesLoadedCount > 0
                      ? `${tilesLoadedCount} .glb tiles`
                      : `${fmtNumber(buildings.length, language)} 3D`}
                </span>
              </>
            )}

            {/* Cities Popover (Mobile) & Inline Quick-Jump Pills (Desktop — Always Accessible!) */}
            <span className="h-3 w-px bg-[var(--hig-divider)] shrink-0" />
            <div className="hidden sm:flex items-center gap-1">
              {[
                { slug: "la_paz", label: "La Paz", cls: "bg-[#0A84FF]/15 text-[var(--hig-accent)] hover:bg-[#0A84FF]/25" },
                { slug: "cabo_san_lucas", label: "Los Cabos", cls: "bg-[#30D158]/15 text-[var(--hig-green)] hover:bg-[#30D158]/25" },
                { slug: "loreto", label: "Loreto", cls: "bg-[#BF5AF2]/15 text-[#8944AB] hover:bg-[#BF5AF2]/25" },
              ].map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => onQuickJumpCity(c.slug)}
                  className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors cursor-pointer ${c.cls}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div ref={citiesPopoverRef} className="relative sm:hidden">
              <button
                type="button"
                onClick={() => {
                  setToursMenuOpen(false);
                  setCitiesMenuOpen((v) => !v);
                }}
                aria-expanded={citiesMenuOpen}
                className="flex min-h-[44px] items-center gap-1 rounded-full bg-[#0A84FF]/15 px-3.5 py-1.5 text-[11px] font-semibold text-[var(--hig-accent)] cursor-pointer"
              >
                <span>{isEn ? "Cities" : "Ciudades"}</span>
                <ChevronUp className="h-3 w-3" aria-hidden="true" />
              </button>
              {citiesMenuOpen && (
                <div className="hig-glass-popover fixed bottom-[66px] right-[62px] z-50 w-44 rounded-2xl p-1.5 space-y-1">
                  {[
                    { slug: "la_paz", label: "La Paz 3D" },
                    { slug: "cabo_san_lucas", label: "Los Cabos 3D" },
                    { slug: "loreto", label: "Loreto 3D" },
                    { slug: "san_jose_del_cabo", label: "San José del Cabo" },
                  ].map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => {
                        setCitiesMenuOpen(false);
                        onQuickJumpCity(c.slug);
                      }}
                      className="flex w-full min-h-[40px] items-center rounded-xl px-3 py-1.5 text-left text-[12px] font-medium text-[var(--hig-ink)] hover:bg-[var(--hig-pill-hover)] cursor-pointer"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Frosted Popover Menu for 3D Aerial Tours */}
            <div ref={toursPopoverRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => {
                  setCitiesMenuOpen(false);
                  setToursMenuOpen((v) => !v);
                }}
                aria-expanded={toursMenuOpen}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors cursor-pointer ${
                  toursMenuOpen
                    ? "bg-[var(--hig-accent)] text-white"
                    : "bg-[var(--hig-pill-bg)] text-[var(--hig-ink)] hover:bg-[var(--hig-pill-hover)]"
                }`}
              >
                <Film className="h-3 w-3 text-[#BF5AF2]" aria-hidden="true" />
                <span>{isEn ? "3D Tours" : "Vuelos 3D"}</span>
                <ChevronUp className="h-3 w-3 opacity-70" aria-hidden="true" />
              </button>
              {toursMenuOpen && (
                <div className="hig-glass-popover fixed bottom-[64px] left-1/2 -translate-x-1/2 z-50 w-56 rounded-2xl p-1.5 space-y-0.5">
                  <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--hig-ink-3)]">
                    {isEn ? "3D Aerial Fly-throughs" : "Recorridos Aéreos 3D"}
                  </p>
                  {(tours && tours.length > 0
                    ? tours
                    : [
                        { id: "el_tezal", short_label: "El Tezal Flight" },
                        { id: "la_paz_malecon", short_label: "La Paz Waterfront" },
                        { id: "loreto_bahia", short_label: "Loreto Bay" },
                      ]
                  ).map((t) => {
                    const label = isEn
                      ? t.id === "el_tezal"
                        ? "El Tezal Flight"
                        : t.id === "la_paz_malecon"
                          ? "La Paz Waterfront"
                          : t.id === "loreto_bahia"
                            ? "Loreto Bay"
                            : t.short_label
                      : t.short_label;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setToursMenuOpen(false);
                          onStartTour?.(t.id);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11.5px] font-medium text-[var(--hig-ink)] hover:bg-[var(--hig-pill-hover)] cursor-pointer"
                      >
                        <Film className="h-3.5 w-3.5 text-[#BF5AF2] shrink-0" aria-hidden="true" />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <span className="hidden lg:inline-block h-3 w-px bg-[var(--hig-divider)] shrink-0" />
        <button
          type="button"
          onClick={() => onOpenExportModal?.()}
          title={
            isEn
              ? "Open CAD (.DXF UTM 12N), .OBJ 3D Mesh & BIM ISO 19650 exporter"
              : "Abrir exportador CAD (.DXF UTM 12N), Malla .OBJ 3D y BIM ISO 19650"
          }
          className="hidden lg:flex items-center gap-1.5 rounded-full bg-[#FF9F0A]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--hig-amber)] hover:bg-[#FF9F0A]/25 transition-colors cursor-pointer shrink-0"
        >
          <Box className="h-3 w-3" aria-hidden="true" />
          <span>CAD / BIM / 3D</span>
        </button>
      </div>
    </div>
  );
};
