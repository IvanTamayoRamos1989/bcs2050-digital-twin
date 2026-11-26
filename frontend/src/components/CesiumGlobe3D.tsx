import React, { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Globe2, KeyRound, Layers } from "lucide-react";
import { TwinAPI } from "../api/client";
import type { AgebMetricKey, CameraPreset, LayerVisibility } from "../types/twin";
import { METRIC_CATALOG, interpolateMetricColor } from "../utils/colorScales";

(window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";

interface Props {
  cameraTarget: CameraPreset | null;
  activeCitySlug: string;
  activeMetric: AgebMetricKey;
  extrusionScale: number;
  agebs3dMode: boolean;
  layers: LayerVisibility;
  colorblindSafe?: boolean;
  language?: "es" | "en";
  googleMapsApiKey?: string;
  cesiumIonToken?: string;
  onInspectLocation: (lon: number, lat: number, buildingPk?: number | null, agebCvegeo?: string | null) => void;
}

function buildTilesetStyle(metric: AgebMetricKey, colorblindSafe: boolean): Cesium.Cesium3DTileStyle {
  if (metric === "surge_exposed_pct") {
    return new Cesium.Cesium3DTileStyle({
      color: {
        conditions: colorblindSafe
          ? [
              ["${surge_risk} === 2", "color('#d55e00', 0.96)"],
              ["${surge_risk} === 1", "color('#e69f00', 0.94)"],
              ["true", "color('#0072b2', 0.92)"],
            ]
          : [
              ["${surge_risk} === 2", "color('#ef4444', 0.96)"],
              ["${surge_risk} === 1", "color('#f59e0b', 0.94)"],
              ["true", "color('#22c55e', 0.92)"],
            ],
      },
    });
  }

  if (metric === "solar_mw") {
    return new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          ["${solar_kwp} >= 20", "color('#fde047', 0.96)"],
          ["${solar_kwp} >= 8", "color('#f59e0b', 0.94)"],
          ["true", "color('#94a3b8', 0.9)"],
        ],
      },
    });
  }

  return new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        ["${height_m} >= 16", "color('#38bdf8', 0.96)"],
        ["${height_m} >= 9", "color('#60a5fa', 0.95)"],
        ["${height_m} >= 6", "color('#cbd5e1', 0.94)"],
        ["true", "color('#f1f5f9', 0.94)"],
      ],
    },
  });
}

export const CesiumGlobe3D: React.FC<Props> = ({
  cameraTarget,
  activeCitySlug,
  activeMetric,
  extrusionScale,
  agebs3dMode,
  layers,
  colorblindSafe = true,
  language = "es",
  googleMapsApiKey = "",
  cesiumIonToken = "",
  onInspectLocation,
}) => {
  const isEn = language === "en";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const googleTilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const terrainLoadedRef = useRef<boolean>(false);
  const agebDsRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const powerDsRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const agebsReadyRef = useRef<boolean>(false);

  const [cesiumViewMode, setCesiumViewMode] = useState<"photorealistic" | "analytical">("analytical");
  const [googleTilesLoaded, setGoogleTilesLoaded] = useState<boolean>(false);
  const [worldTerrainLoaded, setWorldTerrainLoaded] = useState<boolean>(false);
  const [streaming3DTiles, setStreaming3DTiles] = useState<boolean>(false);
  const [buildingCount, setBuildingCount] = useState<number>(0);

  const googleKey = (googleMapsApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  const cesiumToken = (cesiumIonToken || import.meta.env.VITE_CESIUM_ION_TOKEN || "").trim();

  const applyAgebStyling = (
    ds: Cesium.GeoJsonDataSource | null,
    visible: boolean,
    extrude: boolean,
    metric: AgebMetricKey,
    scale: number,
    cvdSafe: boolean,
  ) => {
    if (!ds) return;
    ds.show = visible;
    if (!visible) return;
    const meta = METRIC_CATALOG[metric];
    const fillAlpha = extrude ? 105 : 52;
    const lineColor = new Cesium.ConstantProperty(Cesium.Color.fromBytes(226, 232, 240, 115));

    for (const ent of ds.entities.values) {
      if (ent.polygon && ent.properties) {
        const pBag = ent.properties;
        const val = Number(pBag[metric]?.getValue() ?? 50);
        const [r, g, b] = interpolateMetricColor(val, meta, fillAlpha, cvdSafe);
        ent.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.fromBytes(r, g, b, fillAlpha));
        ent.polygon.outline = new Cesium.ConstantProperty(true);
        ent.polygon.outlineColor = lineColor;
        ent.polygon.outlineWidth = new Cesium.ConstantProperty(1);
        ent.polygon.height = new Cesium.ConstantProperty(1.0);
        if (extrude) {
          const cappedH = Math.min(240, Math.max(12, (val / Math.max(1, meta.maxValue)) * 200 * scale));
          ent.polygon.extrudedHeight = new Cesium.ConstantProperty(cappedH);
        } else {
          ent.polygon.extrudedHeight = undefined;
        }
      }
    }
  };

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const esriImagery = new Cesium.UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 18,
    });
    const esriLabels = new Cesium.UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 18,
    });

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: new Cesium.ImageryLayer(esriImagery),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      timeline: false,
      animation: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: false,
    });

    const labelLayer = viewer.imageryLayers.addImageryProvider(esriLabels);
    labelLayer.alpha = 0.85;

    viewer.scene.globe.depthTestAgainstTerrain = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }

    if (cameraTarget) {
      const altitudeM = Math.max(650, 320000 / Math.pow(1.9, Math.max(0, cameraTarget.zoom - 6)));
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(cameraTarget.lon, cameraTarget.lat - 0.012, altitudeM),
        orientation: {
          heading: Cesium.Math.toRadians(cameraTarget.bearing ?? -15),
          pitch: Cesium.Math.toRadians(-38),
          roll: 0,
        },
      });
    } else {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-111.55, 24.5, 480000),
        orientation: {
          heading: Cesium.Math.toRadians(-10),
          pitch: Cesium.Math.toRadians(-55),
          roll: 0,
        },
      });
    }

    TwinAPI.getLayer("agebs")
      .then(async (fc) => {
        if (viewer.isDestroyed()) return;
        const ds = await Cesium.GeoJsonDataSource.load(fc, { clampToGround: false });
        agebDsRef.current = ds;
        agebsReadyRef.current = true;
        applyAgebStyling(ds, layers.agebs, agebs3dMode, activeMetric, extrusionScale, colorblindSafe);
        viewer.dataSources.add(ds);
      })
      .catch(() => {});

    TwinAPI.getLayer("power_lines")
      .then(async (fc) => {
        if (viewer.isDestroyed()) return;
        const ds = await Cesium.GeoJsonDataSource.load(fc, {
          stroke: Cesium.Color.GOLD.withAlpha(0.75),
          strokeWidth: 1.5,
        });
        ds.show = layers.powerGrid;
        powerDsRef.current = ds;
        viewer.dataSources.add(ds);
      })
      .catch(() => {});

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      let buildingPk: number | null = null;
      let agebCvegeo: string | null = null;
      if (picked && typeof (picked as Cesium.Cesium3DTileFeature).getProperty === "function") {
        const feat = picked as Cesium.Cesium3DTileFeature;
        const pkVal = Number(feat.getProperty("pk"));
        if (Number.isFinite(pkVal) && pkVal > 0) buildingPk = pkVal;
        const agebVal = feat.getProperty("ageb_cvegeo");
        if (typeof agebVal === "string" && agebVal.length > 0) agebCvegeo = agebVal;
      }
      const cartesian =
        (viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(click.position) : undefined) ||
        viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        onInspectLocation(
          Cesium.Math.toDegrees(carto.longitude),
          Cesium.Math.toDegrees(carto.latitude),
          buildingPk,
          agebCvegeo,
        );
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;
    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) {
        if (googleTilesetRef.current) {
          viewer.scene.primitives.remove(googleTilesetRef.current);
          googleTilesetRef.current = null;
        }
        if (tilesetRef.current) {
          viewer.scene.primitives.remove(tilesetRef.current);
          tilesetRef.current = null;
        }
        viewer.destroy();
      }
      viewerRef.current = null;
      agebDsRef.current = null;
      powerDsRef.current = null;
      agebsReadyRef.current = false;
      terrainLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamically load Google Photorealistic 3D Tiles whenever runtime or build-time key is present
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !googleKey || googleTilesetRef.current) return;
    let cancelled = false;
    Cesium.createGooglePhotorealistic3DTileset(
      { key: googleKey, onlyUsingWithGoogleGeocoder: true },
      { showCreditsOnScreen: true },
    )
      .then((tileset) => {
        if (cancelled || viewer.isDestroyed()) return;
        viewer.scene.primitives.add(tileset);
        googleTilesetRef.current = tileset;
        setGoogleTilesLoaded(true);
        setCesiumViewMode("photorealistic");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [googleKey]);

  // Dynamically load Cesium ion World Terrain whenever runtime or build-time token is present
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !cesiumToken || terrainLoadedRef.current) return;
    let cancelled = false;
    Cesium.Ion.defaultAccessToken = cesiumToken;
    Cesium.createWorldTerrainAsync()
      .then((terrain) => {
        if (cancelled || viewer.isDestroyed()) return;
        viewer.terrainProvider = terrain;
        terrainLoadedRef.current = true;
        setWorldTerrainLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cesiumToken]);

  // Switch cleanly between Photorealistic 3D Tiles mode and Analytical OGC 3D Tiles mode
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const isPhoto = cesiumViewMode === "photorealistic" && googleTilesLoaded && Boolean(googleTilesetRef.current);

    viewer.scene.globe.show = !isPhoto;
    if (googleTilesetRef.current) {
      googleTilesetRef.current.show = isPhoto;
    }
    if (tilesetRef.current) {
      tilesetRef.current.show = !isPhoto && layers.buildings3d;
      tilesetRef.current.style = buildTilesetStyle(activeMetric, colorblindSafe);
    }
    if (agebsReadyRef.current && agebDsRef.current) {
      applyAgebStyling(
        agebDsRef.current,
        !isPhoto && layers.agebs,
        agebs3dMode,
        activeMetric,
        extrusionScale,
        colorblindSafe,
      );
    }
    if (powerDsRef.current) {
      powerDsRef.current.show = !isPhoto && layers.powerGrid;
    }
  }, [
    cesiumViewMode,
    googleTilesLoaded,
    layers.agebs,
    layers.buildings3d,
    layers.powerGrid,
    agebs3dMode,
    activeMetric,
    extrusionScale,
    colorblindSafe,
  ]);

  // Fly camera on target change (crisp oblique framing for 3D building legibility)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !cameraTarget) return;
    const altitudeM = Math.max(650, 320000 / Math.pow(1.9, Math.max(0, cameraTarget.zoom - 6)));
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cameraTarget.lon, cameraTarget.lat - 0.012, altitudeM),
      orientation: {
        heading: Cesium.Math.toRadians(cameraTarget.bearing ?? -15),
        pitch: Cesium.Math.toRadians(-38),
        roll: 0,
      },
      duration: 1.4,
    });
  }, [cameraTarget]);

  // Stream all 396,823 BCS buildings across 9 cities via OGC 3D Tiles 1.1 (glTF 2.0 + EXT_structural_metadata)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    let cancelled = false;

    const loadFallbackCity = () => {
      const targetCity = activeCitySlug || "la_paz";
      const existing = viewer.dataSources.getByName("bcs_buildings_3d");
      existing.forEach((d) => viewer.dataSources.remove(d, true));
      TwinAPI.getCityBuildingsCesium(targetCity, 1800)
        .then((res) => {
          if (cancelled || viewer.isDestroyed()) return;
          const ds = new Cesium.CustomDataSource("bcs_buildings_3d");
          ds.show = cesiumViewMode === "analytical" && layers.buildings3d;
          for (const b of res.buildings) {
            const flat: number[] = [];
            for (const pt of b.polygon) {
              flat.push(pt[0], pt[1]);
            }
            if (flat.length < 6) continue;
            const col =
              activeMetric === "surge_exposed_pct" && b.surge_risk === 2
                ? Cesium.Color.fromBytes(213, 94, 0, 235)
                : b.height_m >= 16
                  ? Cesium.Color.fromBytes(56, 189, 248, 240)
                  : b.height_m >= 9
                    ? Cesium.Color.fromBytes(96, 165, 250, 235)
                    : Cesium.Color.fromBytes(241, 245, 249, 235);
            ds.entities.add({
              polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
                height: 0,
                extrudedHeight: b.height_m * extrusionScale,
                material: col,
                outline: false,
              },
            });
          }
          viewer.dataSources.add(ds);
          setStreaming3DTiles(false);
          setBuildingCount(res.buildings.length);
        })
        .catch(() => {});
    };

    if (tilesetRef.current) {
      return;
    }

    TwinAPI.get3DTilesInfo()
      .catch(() => ({
        tileset_url: "https://storage.googleapis.com/bcs2050-3dtiles-public/bcs_buildings_v11/tileset.json",
        buildings_count: 396823,
      }))
      .then(async (info) => {
        if (cancelled || viewer.isDestroyed()) return;
        try {
          const tileset = await Cesium.Cesium3DTileset.fromUrl(info.tileset_url, {
            maximumScreenSpaceError: 12,
          });
          if (cancelled || viewer.isDestroyed()) return;
          tileset.style = buildTilesetStyle(activeMetric, colorblindSafe);
          tileset.show = cesiumViewMode === "analytical" && layers.buildings3d;
          viewer.scene.primitives.add(tileset);
          tilesetRef.current = tileset;
          setStreaming3DTiles(true);
          setBuildingCount(info.buildings_count || 396823);
        } catch {
          loadFallbackCity();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCitySlug, activeMetric, cesiumViewMode, colorblindSafe, extrusionScale, layers.buildings3d]);

  const activeModeLabel =
    cesiumViewMode === "photorealistic" && googleTilesLoaded
      ? "Google Photorealistic 3D Tiles"
      : worldTerrainLoaded
        ? "Cesium ion World Terrain + OGC 3D Tiles 1.1"
        : streaming3DTiles
          ? "OGC 3D Tiles 1.1 · glTF 2.0"
          : isEn ? "HD Satellite + 3D Buildings" : "Satélite HD + Edificios 3D";

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        aria-label={isEn ? "CesiumJS 3D Globe of Baja California Sur" : "Globo 3D CesiumJS de Baja California Sur"}
        className="h-full w-full"
      />
      <div className="ios-glass pointer-events-auto absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 overflow-x-auto rounded-full px-4 py-2 text-[11.5px] whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-[#64D2FF] font-semibold">
          <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
          CesiumJS 3D · {activeModeLabel}
        </span>

        {googleTilesLoaded && (
          <>
            <span className="h-3 w-px bg-white/[0.14]" />
            <div role="group" aria-label={isEn ? "Cesium 3D mode switcher" : "Selector modo 3D Cesium"} className="ios-segmented flex items-center">
              <button
                type="button"
                onClick={() => setCesiumViewMode("photorealistic")}
                aria-pressed={cesiumViewMode === "photorealistic"}
                className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-all cursor-pointer ${
                  cesiumViewMode === "photorealistic" ? "bg-[#30D158] text-[#050507]" : "text-[#EBEBF5]/75 hover:text-white"
                }`}
              >
                {isEn ? "Photorealistic 3D" : "Fotorrealista 3D"}
              </button>
              <button
                type="button"
                onClick={() => setCesiumViewMode("analytical")}
                aria-pressed={cesiumViewMode === "analytical"}
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-all cursor-pointer ${
                  cesiumViewMode === "analytical" ? "ios-segment-active" : "text-[#EBEBF5]/75 hover:text-white"
                }`}
              >
                <Layers className="h-2.5 w-2.5" aria-hidden="true" />
                <span>{isEn ? "Analytical OGC" : "Analítico OGC"}</span>
              </button>
            </div>
          </>
        )}

        <span className="h-3 w-px bg-white/[0.14]" />
        <span className="font-mono-num text-[#30D158]">
          {streaming3DTiles
            ? `${buildingCount.toLocaleString()} ${isEn ? "3D bldgs" : "edif. 3D"}`
            : `${buildingCount.toLocaleString()} ${isEn ? "bldgs" : "edif."} (${activeCitySlug || "la_paz"})`}
        </span>

        {cesiumViewMode === "analytical" && (
          <>
            <span className="hidden sm:inline-flex h-3 w-px bg-white/[0.14]" />
            <span className="hidden sm:flex items-center gap-2 text-[10.5px] text-[#EBEBF5]/80">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#F5F5F7] ring-1 ring-white/30" /> &lt;6m
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#0A84FF]" /> 9–15m
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#64D2FF]" /> 16m+
              </span>
            </span>
          </>
        )}

        {!googleKey && (
          <span className="hidden lg:flex items-center gap-1 text-[10px] text-[#FF9F0A]">
            <KeyRound className="h-3 w-3" aria-hidden="true" />
            VITE_GOOGLE_MAPS_API_KEY
          </span>
        )}
      </div>
    </div>
  );
};
