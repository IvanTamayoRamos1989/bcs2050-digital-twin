import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { ArcLayer, GeoJsonLayer, PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { Box, Building2, Compass, Film, Square, ZoomIn } from "lucide-react";
import { TwinAPI } from "../api/client";
import type {
  ActivePhysicsOverlay,
  AerialTour,
  AgebMetricKey,
  AretianPhase,
  BasemapMode,
  BuildingRecord,
  CameraPreset,
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
  agebs3dMode: boolean;
  phase: AretianPhase;
  simulation: SimulationResponse | null;
  corridorArcs: CorridorArc[];
  liveTelemetry: LiveTelemetrySummary | null;
  sensorThings?: SensorThingRecord[];
  physicsOverlay?: ActivePhysicsOverlay | null;
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
  onInspectLocation: (lon: number, lat: number, buildingPk?: number | null, agebCvegeo?: string | null) => void;
  onQuickJumpCity: (citySlug: string) => void;
}

function buildMapStyle(
  mode: BasemapMode,
  maptilerKeyOverride?: string,
  theme: "dark" | "light" = "light",
): maplibregl.StyleSpecification {
  const maptilerKey = (maptilerKeyOverride ?? import.meta.env.VITE_MAPTILER_KEY ?? "").trim();
  const sources: Record<string, maplibregl.SourceSpecification> = {};
  const layers: maplibregl.LayerSpecification[] = [];

  if (mode === "obsidian") {
    if (theme === "light") {
      if (maptilerKey) {
        sources.base = {
          type: "raster",
          tiles: [`https://api.maptiler.com/maps/dataviz-light/256/{z}/{x}/{y}@2x.png?key=${maptilerKey}`],
          tileSize: 256,
          maxzoom: 19,
        };
        layers.push({ id: "base-layer", type: "raster", source: "base" });
      } else {
        sources.esriLightBase = {
          type: "raster",
          tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 16,
        };
        sources.esriLightRef = {
          type: "raster",
          tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 16,
        };
        layers.push({ id: "light-base-layer", type: "raster", source: "esriLightBase" });
        layers.push({
          id: "light-ref-layer",
          type: "raster",
          source: "esriLightRef",
          paint: { "raster-opacity": 0.78 },
        });
      }
    } else if (maptilerKey) {
      sources.base = {
        type: "raster",
        tiles: [`https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}@2x.png?key=${maptilerKey}`],
        tileSize: 256,
        maxzoom: 19,
      };
      layers.push({ id: "base-layer", type: "raster", source: "base" });
    } else {
      sources.esriDarkBase = {
        type: "raster",
        tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 16,
      };
      sources.esriDarkRef = {
        type: "raster",
        tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 16,
      };
      layers.push({
        id: "dark-base-layer",
        type: "raster",
        source: "esriDarkBase",
        paint: { "raster-brightness-max": 0.45, "raster-contrast": 0.25 },
      });
      layers.push({
        id: "dark-ref-layer",
        type: "raster",
        source: "esriDarkRef",
        paint: { "raster-opacity": 0.72 },
      });
    }
  } else {
    if (maptilerKey) {
      sources.maptilerSat = {
        type: "raster",
        tiles: [`https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}@2x.jpg?key=${maptilerKey}`],
        tileSize: 256,
        maxzoom: 20,
      };
      layers.push({ id: "sat-layer", type: "raster", source: "maptilerSat" });
    } else {
      sources.esriSat = {
        type: "raster",
        tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
      };
      sources.labels = {
        type: "raster",
        tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
      };
      layers.push({ id: "sat-layer", type: "raster", source: "esriSat" });
      layers.push({ id: "labels-layer", type: "raster", source: "labels", paint: { "raster-opacity": 0.85 } });
    }
  }

  if (mode === "terrain") {
    sources.terrainDem = maptilerKey
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

  return {
    version: 8,
    sources,
    layers,
    ...(mode === "terrain" ? { terrain: { source: "terrainDem", exaggeration: 1.8 } } : {}),
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
  agebs3dMode,
  phase,
  simulation,
  corridorArcs,
  liveTelemetry,
  sensorThings = [],
  physicsOverlay = null,
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
  onInspectLocation,
  onQuickJumpCity,
}) => {
  const isEn = language === "en";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const abortBldgRef = useRef<AbortController | null>(null);
  const abortZoneRef = useRef<AbortController | null>(null);
  const activeTourRef = useRef<string | null>(activeTourId ?? null);
  const onStopTourRef = useRef(onStopTour);
  const onViewportChangeRef = useRef(onViewportChange);
  const phaseRef = useRef<AretianPhase>(phase);
  const tilesetErrorRef = useRef<boolean>(false);
  const pinPlacementModeRef = useRef<boolean>(pinPlacementMode);
  const onMapClickForPinRef = useRef(onMapClickForPin);

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

  const [zoom, setZoom] = useState<number>(6.4);
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

    if (z >= 11.8 && (phaseRef.current === "scenarios" || tilesetErrorRef.current)) {
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
      style: buildMapStyle(basemapMode, maptilerKey, theme),
      center: [-111.55, 25.15],
      zoom: 6.4,
      pitch: 36,
      bearing: -8,
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
    const onMoveEnd = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => fetchViewportFeatures(map), 200);
    };
    map.on("load", () => fetchViewportFeatures(map));
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
      }
    });

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      if (timer) window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update basemap style dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildMapStyle(basemapMode, maptilerKey, theme));
  }, [basemapMode, maptilerKey, theme]);

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
            onInspectLocation(coordinate[0], coordinate[1], null, p.cvegeo_ageb);
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

    // 8. REAL 3D BUILDINGS — OGC 3D Tiles 1.1 (.glb streaming from GCS) outside scenarios, or SQLite R-Tree fallback/scenarios
    const use3DTilesStream = layers.buildings3d && phase !== "scenarios" && Boolean(tileset3dUrl) && !tilesetError;
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
            onInspectLocation(coordinate[0], coordinate[1], null, null);
          },
        }),
      );
    } else if (layers.buildings3d && buildings.length > 0) {
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
            onInspectLocation(object.lon, object.lat, object.id, object.ageb_cvegeo);
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

    // 14. Live Aircraft (OpenSky) & AIS Vessels
    if (layers.liveTelemetry && liveTelemetry?.aircraft?.aircraft?.length) {
      list.push(
        new ScatterplotLayer({
          id: "live-aircraft",
          data: liveTelemetry.aircraft.aircraft,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 480,
          radiusMinPixels: 4,
          radiusMaxPixels: 9,
          getFillColor: [250, 204, 21, 245],
          getLineColor: [15, 23, 42, 255],
          lineWidthMinPixels: 1,
          stroked: true,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            setHoverInfo({
              x,
              y,
              title: `${isEn ? "Flight" : "Vuelo"} ${object.callsign || object.icao24}`,
              lines: isEn
                ? [
                    `Country: ${object.country} | Altitude: ${Math.round(object.altitude_m)} m`,
                    `Speed: ${Math.round(object.velocity_ms * 3.6)} km/h`,
                  ]
                : [
                    `País: ${object.country} | Altitud: ${Math.round(object.altitude_m)} m`,
                    `Velocidad: ${Math.round(object.velocity_ms * 3.6)} km/h`,
                  ],
            });
          },
        }),
      );
    }
    if (layers.liveTelemetry && liveTelemetry?.marine?.vessels?.length) {
      list.push(
        new ScatterplotLayer({
          id: "live-vessels-ais",
          data: liveTelemetry.marine.vessels,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 420,
          radiusMinPixels: 4,
          radiusMaxPixels: 8,
          getFillColor: [34, 211, 238, 245],
          getLineColor: [15, 23, 42, 255],
          lineWidthMinPixels: 1,
          stroked: true,
          pickable: true,
          onHover: ({ x, y, object }) => {
            if (!object) return setHoverInfo(null);
            setHoverInfo({
              x,
              y,
              title: `${isEn ? "Vessel" : "Buque"} ${object.name || object.mmsi}`,
              lines: [`${isEn ? "Type" : "Tipo"}: ${object.type} | MMSI: ${object.mmsi}`],
            });
          },
        }),
      );
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
            onInspectLocation(object.lon, object.lat, null, null);
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

    return list;
  }, [
    activeMetric,
    agebs3dMode,
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
    sensorThings,
    physicsOverlay,
    onInspectLocation,
    phase,
    selectedAgebId,
    simulation,
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
    <div className={`relative h-full w-full overflow-hidden ${pinPlacementMode ? "cursor-crosshair" : ""}`}>
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

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="hig-glass-sidebar pointer-events-none fixed z-40 max-w-xs rounded-2xl px-3.5 py-2.5 text-[11.5px]"
          style={{ left: Math.min(window.innerWidth - 280, hoverInfo.x + 14), top: Math.max(76, hoverInfo.y + 14) }}
        >
          <p className="font-semibold text-[var(--hig-cyan)]">{hoverInfo.title}</p>
          {hoverInfo.lines.map((ln, idx) => (
            <p key={idx} className="text-[var(--hig-ink-2)] leading-snug mt-0.5">
              {ln}
            </p>
          ))}
        </div>
      )}

      {/* Bottom Floating HIG Dynamic Island Telemetry & Quick Actions */}
      <div className="hig-glass-toolbar pointer-events-auto absolute max-sm:bottom-3 max-sm:left-2.5 max-sm:max-w-[calc(100vw-122px)] max-sm:px-3 max-sm:gap-2 sm:bottom-4 sm:left-1/2 sm:max-w-[calc(100vw-130px)] sm:-translate-x-1/2 sm:px-4 sm:gap-2.5 z-20 flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-full py-2 text-[11.5px] whitespace-nowrap">
        <span className="flex items-center gap-1.5 font-mono-num text-[var(--hig-ink-2)]">
          <Compass className="h-3.5 w-3.5 text-[var(--hig-accent)]" />
          Z {zoom.toFixed(1)}
        </span>
        <span className="h-3 w-px bg-[var(--hig-divider)]" />
        {activeTourId ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-medium text-[#BF5AF2]">
              <Film className="h-3.5 w-3.5 text-[#BF5AF2] animate-pulse" />
              <span>{tourStepTitle || (isEn ? "3D Aerial Tour..." : "Recorrido aéreo 3D...")}</span>
            </span>
            <button
              type="button"
              onClick={() => onStopTour?.()}
              className="flex items-center gap-1 rounded-full bg-[#FF453A]/20 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--hig-red)] hover:bg-[#FF453A]/30 cursor-pointer"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>{isEn ? "Stop" : "Detener"}</span>
            </button>
          </div>
        ) : zoom >= 11.5 && layers.buildings3d && phase !== "scenarios" && Boolean(tileset3dUrl) && !tilesetError ? (
          <span className="flex items-center gap-1.5 font-mono-num text-[var(--hig-cyan)]">
            <Building2 className="h-3.5 w-3.5" />
            {tilesLoadedCount > 0
              ? `OGC 3D Tiles 1.1 · ${tilesLoadedCount} .glb tiles`
              : "OGC 3D Tiles 1.1 · Streaming"}
          </span>
        ) : zoom >= 11.8 ? (
          <span className="flex items-center gap-1.5 font-mono-num text-[var(--hig-green)]">
            <Building2 className="h-3.5 w-3.5" />
            {loadingBuildings
              ? isEn ? "Loading 3D R-Tree..." : "Cargando R-Tree 3D..."
              : `${buildings.length.toLocaleString()} ${isEn ? "3D bldgs" : "edif. 3D"}`}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <ZoomIn className="h-3.5 w-3.5 text-[var(--hig-amber)]" />
            <button
              type="button"
              onClick={() => onQuickJumpCity("la_paz")}
              className="rounded-full bg-[#0A84FF]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--hig-accent)] hover:bg-[#0A84FF]/25 transition-colors cursor-pointer"
            >
              La Paz 3D
            </button>
            <button
              type="button"
              onClick={() => onQuickJumpCity("cabo_san_lucas")}
              className="rounded-full bg-[#30D158]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--hig-green)] hover:bg-[#30D158]/25 transition-colors cursor-pointer"
            >
              Los Cabos 3D
            </button>
            <button
              type="button"
              onClick={() => onQuickJumpCity("loreto")}
              className="rounded-full bg-[#BF5AF2]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[#8944AB] hover:bg-[#BF5AF2]/25 transition-colors cursor-pointer"
            >
              Loreto 3D
            </button>
          </div>
        )}
        {!activeTourId && (
          <>
            <span className="h-3 w-px bg-[var(--hig-divider)]" />
            <button
              type="button"
              onClick={() => onStartTour?.("el_tezal")}
              title={
                isEn
                  ? "Launch InfraWorks / Lumion-style 3D aerial tour over El Tezal"
                  : "Iniciar recorrido aéreo tipo InfraWorks / Lumion sobre El Tezal"
              }
              className="flex items-center gap-1.5 rounded-full bg-[#0A84FF]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--hig-accent)] hover:bg-[#0A84FF]/25 transition-colors cursor-pointer"
            >
              <Film className="h-3 w-3" />
              <span>{isEn ? "El Tezal Flight" : "Vuelo El Tezal"}</span>
            </button>
            <select
              aria-label={isEn ? "Select aerial tour" : "Seleccionar recorrido aéreo"}
              value=""
              onChange={(e) => {
                if (e.target.value) onStartTour?.(e.target.value);
              }}
              className="rounded-full bg-[var(--hig-pill-bg)] px-2.5 py-0.5 text-[10.5px] font-medium text-[var(--hig-ink)] border border-[var(--hig-divider)] focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-[var(--hig-select-bg)] text-[var(--hig-ink)]">Tours ▾</option>
              {(tours && tours.length > 0
                ? tours
                : [
                    { id: "el_tezal", short_label: isEn ? "El Tezal Flight" : "Vuelo El Tezal" },
                    { id: "la_paz_malecon", short_label: isEn ? "La Paz Waterfront" : "Vuelo Malecón LPZ" },
                    { id: "loreto_bahia", short_label: isEn ? "Loreto Bay" : "Vuelo Loreto" },
                  ]
              ).map((t) => (
                <option key={t.id} value={t.id} className="bg-[var(--hig-select-bg)] text-[var(--hig-ink)]">
                  {isEn
                    ? t.id === "el_tezal"
                      ? "El Tezal Flight"
                      : t.id === "la_paz_malecon"
                        ? "La Paz Waterfront"
                        : t.id === "loreto_bahia"
                          ? "Loreto Bay"
                          : t.short_label
                    : t.short_label}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="h-3 w-px bg-[var(--hig-divider)]" />
        <button
          type="button"
          onClick={() => onOpenExportModal?.()}
          title={
            isEn
              ? "Export to Civil 3D (.DXF), Lumion/Unreal (.OBJ), and ISO 19650 BIM"
              : "Exportar a Civil 3D (.DXF), Lumion/Unreal (.OBJ) y BIM ISO 19650"
          }
          className="flex items-center gap-1.5 rounded-full bg-[#FF9F0A]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--hig-amber)] hover:bg-[#FF9F0A]/25 transition-colors cursor-pointer"
        >
          <Box className="h-3 w-3" />
          <span>CAD / BIM / 3D</span>
        </button>
      </div>
    </div>
  );
};
