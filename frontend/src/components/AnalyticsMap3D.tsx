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

function buildMapStyle(mode: BasemapMode): maplibregl.StyleSpecification {
  const maptilerKey = (import.meta.env.VITE_MAPTILER_KEY || "").trim();
  const sources: Record<string, maplibregl.SourceSpecification> = {};
  const layers: maplibregl.LayerSpecification[] = [];

  if (mode === "obsidian") {
    if (maptilerKey) {
      sources.base = {
        type: "raster",
        tiles: [`https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.png?key=${maptilerKey}`],
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

  if (mode === "terrain") {
    sources.terrainDem = {
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
  activeMetric,
  colorblindSafe = true,
  language = "es",
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
      style: buildMapStyle(basemapMode),
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
    map.setStyle(buildMapStyle(basemapMode));
  }, [basemapMode]);

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
          getLineColor: [148, 163, 184, 130],
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
              title: `Acuífero ${p.aquifer_code || ""} · ${p.aquifer_name || ""}`,
              lines: [
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
            const alpha = buildingsVisible ? 55 : 175;
            return interpolateMetricColor(val, metricMeta, alpha, colorblindSafe);
          },
          getLineColor: (f: GeoJSON.Feature) =>
            f.properties?.cvegeo_ageb === selectedAgebId ? [255, 255, 255, 255] : [15, 23, 42, 160],
          getLineWidth: (f: GeoJSON.Feature) => (f.properties?.cvegeo_ageb === selectedAgebId ? 3 : 1),
          lineWidthUnits: "pixels",
          getElevation: (f: GeoJSON.Feature) => {
            if (!extrudeAgebs) return 0;
            const p = f.properties || {};
            const val = Number(p[activeMetric] ?? 0);
            const norm = Math.max(0.05, Math.min(1.2, val / Math.max(1, metricMeta.maxValue)));
            const simBoost = deltas[p.cvegeo_ageb]?.height_multiplier ?? 1.0;
            return norm * 1600 * extrusionScale * simBoost;
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
              lines: [
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
              title: `Zonificación ${object.land_use_code || object.category}`,
              lines: [
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
                "Edificación real BCS (396,823 polígonos) · Clic para inspeccionar",
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
            const surgeTxt = object.surge_risk === 2 ? "ALTO (<6m)" : object.surge_risk === 1 ? "MODERADO (<10m)" : "SEGURO";
            setHoverInfo({
              x,
              y,
              title: `Edificio 3D · ${object.city_name}`,
              lines: [
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
              title: `Subestación ${p.name || "SIBCS"}`,
              lines: [`Voltaje: ${p.voltage || "N/D"} | Operador: ${p.operator || "CFE"}`],
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
              title: `${p.project_name || "Proyecto Estratégico"}`,
              lines: [
                `${p.category || ""} · ${p.capacity_value || ""} ${p.capacity_unit || ""}`,
                `Estatus: ${p.status_2025_2026 || ""} | COD: ${p.target_cod_year || ""}`,
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
              title: `${p.facility_name || "Equipamiento"}`,
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
              lines: [`Flujo Regional Índice: ${object.flow_index}/100`],
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
              title: `Vuelo ${object.callsign || object.icao24}`,
              lines: [
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
              title: `Buque ${object.name || object.mmsi}`,
              lines: [`Tipo: ${object.type} | MMSI: ${object.mmsi}`],
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
                  : "Piloto SCADA en espera";
              setHoverInfo({
                x,
                y,
                title: `OGC Thing · ${object.name}`,
                lines: [
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
                title: `Inundación 2D · Tirante ${p.depth_m} m (${p.severity})`,
                lines: [`Cota DEM: ${p.elev_m} m`, p.in_arroyo ? "Zona de flujo de arroyo activo" : "Llanura / costa"],
              });
            } else if (p.kind === "isochrone_band") {
              setHoverInfo({
                x,
                y,
                title: `Isócrona Red Vial · ${p.label || `${p.minutes} min`}`,
                lines: [`Área alcanzada: ${p.area_ha} ha`, p.include_transit ? "Incluye rutas de autobús" : "Solo peatonal"],
              });
            } else if (p.kind === "water_node") {
              setHoverInfo({
                x,
                y,
                title: `Nodo WNTR · ${p.label || p.node_id}`,
                lines: [
                  `Presión mín: ${p.baseline_min_pressure_m} -> ${p.scenario_min_pressure_m} m (+${p.pressure_gain_m} m)`,
                  `${p.status}`,
                ],
              });
            } else if (p.kind === "water_pipe") {
              setHoverInfo({
                x,
                y,
                title: `Tramo Hidráulico ${p.pipe_id}`,
                lines: [`Diámetro: ${p.diameter_mm} mm · Long: ${p.length_m} m`, `Gasto pico: ${p.peak_flow_lps} lps`],
              });
            } else if (p.kind === "reachable_poi" || p.kind === "isochrone_origin") {
              setHoverInfo({
                x,
                y,
                title: `${p.name || p.label || "Punto"}`,
                lines: [p.sector ? `Sector alcanzable: ${p.sector}` : "Punto origen red 15-min"],
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
    layers,
    liveTelemetry,
    pendingPinCoords,
    sensorThings,
    physicsOverlay,
    onInspectLocation,
    phase,
    selectedAgebId,
    simulation,
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
          className="glass-panel pointer-events-auto absolute left-1/2 top-3 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400/60 bg-slate-950/95 px-4 py-2 text-xs text-amber-200 shadow-2xl"
        >
          <span className="font-semibold">
            {isEn
              ? "Click anywhere on the 3D map to drop your PMDU consultation pin"
              : "Haz clic en cualquier punto del mapa 3D para ubicar tu pin PMDU"}
          </span>
          <button
            type="button"
            onClick={onCancelPinPlacement}
            className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-slate-700 cursor-pointer"
          >
            {isEn ? "Cancel" : "Cancelar"}
          </button>
        </div>
      )}

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="glass-panel pointer-events-none fixed z-40 max-w-xs rounded-lg px-3 py-2 text-[11px] shadow-2xl"
          style={{ left: Math.min(window.innerWidth - 280, hoverInfo.x + 14), top: Math.max(70, hoverInfo.y + 14) }}
        >
          <p className="font-semibold text-sky-300">{hoverInfo.title}</p>
          {hoverInfo.lines.map((ln, idx) => (
            <p key={idx} className="text-slate-200 leading-snug mt-0.5">
              {ln}
            </p>
          ))}
        </div>
      )}

      {/* Bottom Live Viewport Telemetry, Aerial Tours & CAD/BIM Export Trigger */}
      <div className="glass-panel pointer-events-auto absolute bottom-3 left-3 sm:left-1/2 z-20 flex max-w-[calc(100vw-74px)] sm:max-w-[calc(100vw-130px)] sm:-translate-x-1/2 items-center gap-2 overflow-x-auto rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap">
        <span className="flex items-center gap-1 font-mono-num text-slate-300">
          <Compass className="h-3.5 w-3.5 text-sky-400" />
          Z {zoom.toFixed(1)}
        </span>
        <span className="h-3 w-px bg-slate-700" />
        {activeTourId ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-medium text-indigo-200">
              <Film className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
              <span>{tourStepTitle || "Recorrido aéreo 3D..."}</span>
            </span>
            <button
              type="button"
              onClick={() => onStopTour?.()}
              className="flex items-center gap-1 rounded-full bg-rose-500/25 px-2 py-0.5 text-[10px] font-semibold text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/40 cursor-pointer"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>Detener</span>
            </button>
          </div>
        ) : zoom >= 11.5 && layers.buildings3d && phase !== "scenarios" && Boolean(tileset3dUrl) && !tilesetError ? (
          <span className="flex items-center gap-1.5 font-mono-num text-cyan-300">
            <Building2 className="h-3.5 w-3.5" />
            {tilesLoadedCount > 0
              ? `OGC 3D Tiles 1.1 · ${tilesLoadedCount} tiles .glb`
              : "OGC 3D Tiles 1.1 · Streaming"}
          </span>
        ) : zoom >= 11.8 ? (
          <span className="flex items-center gap-1.5 font-mono-num text-emerald-300">
            <Building2 className="h-3.5 w-3.5" />
            {loadingBuildings
              ? "Cargando R-Tree 3D..."
              : `${buildings.length.toLocaleString()} edif. 3D`}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <ZoomIn className="h-3.5 w-3.5 text-amber-400" />
            <button
              type="button"
              onClick={() => onQuickJumpCity("la_paz")}
              className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/35 cursor-pointer"
            >
              La Paz 3D
            </button>
            <button
              type="button"
              onClick={() => onQuickJumpCity("cabo_san_lucas")}
              className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/35 cursor-pointer"
            >
              Los Cabos 3D
            </button>
            <button
              type="button"
              onClick={() => onQuickJumpCity("loreto")}
              className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-500/35 cursor-pointer"
            >
              Loreto 3D
            </button>
          </div>
        )}
        {!activeTourId && (
          <>
            <span className="h-3 w-px bg-slate-700" />
            <button
              type="button"
              onClick={() => onStartTour?.("el_tezal")}
              title="Iniciar recorrido aéreo tipo InfraWorks / Lumion sobre El Tezal"
              className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-200 ring-1 ring-indigo-400/35 hover:bg-indigo-500/35 cursor-pointer"
            >
              <Film className="h-3 w-3 text-indigo-300" />
              <span>Vuelo El Tezal</span>
            </button>
            <select
              aria-label="Seleccionar recorrido aéreo"
              value=""
              onChange={(e) => {
                if (e.target.value) onStartTour?.(e.target.value);
              }}
              className="rounded-full bg-slate-900/90 px-2 py-0.5 text-[10px] font-medium text-slate-300 ring-1 ring-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900">Tours ▾</option>
              {(tours && tours.length > 0
                ? tours
                : [
                    { id: "el_tezal", short_label: "Vuelo El Tezal" },
                    { id: "la_paz_malecon", short_label: "Vuelo Malecón LPZ" },
                    { id: "loreto_bahia", short_label: "Vuelo Loreto" },
                  ]
              ).map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900">
                  {t.short_label}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="h-3 w-px bg-slate-700" />
        <button
          type="button"
          onClick={() => onOpenExportModal?.()}
          title="Exportar a Civil 3D (.DXF), Lumion/Unreal (.OBJ) y BIM ISO 19650"
          className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-400/35 hover:bg-amber-500/35 cursor-pointer"
        >
          <Box className="h-3 w-3 text-amber-300" />
          <span>CAD / BIM / 3D</span>
        </button>
      </div>
    </div>
  );
};
