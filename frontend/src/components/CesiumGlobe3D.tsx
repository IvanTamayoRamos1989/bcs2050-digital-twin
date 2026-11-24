import React, { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Globe2, KeyRound } from "lucide-react";
import { TwinAPI } from "../api/client";
import type { AgebMetricKey, CameraPreset } from "../types/twin";
import { METRIC_CATALOG, interpolateMetricColor } from "../utils/colorScales";

(window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";

interface Props {
  cameraTarget: CameraPreset | null;
  activeCitySlug: string;
  activeMetric: AgebMetricKey;
  extrusionScale: number;
  onInspectLocation: (lon: number, lat: number, buildingPk?: number | null, agebCvegeo?: string | null) => void;
}

export const CesiumGlobe3D: React.FC<Props> = ({
  cameraTarget,
  activeCitySlug,
  activeMetric,
  extrusionScale,
  onInspectLocation,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const [tilesMode, setTilesMode] = useState<string>("Satélite Mundial + Vector 3D");
  const [streaming3DTiles, setStreaming3DTiles] = useState<boolean>(false);
  const [buildingCount, setBuildingCount] = useState<number>(0);

  const googleKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  const cesiumToken = (import.meta.env.VITE_CESIUM_ION_TOKEN || "").trim();

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    if (cesiumToken) {
      Cesium.Ion.defaultAccessToken = cesiumToken;
    }

    const esriImagery = new Cesium.UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
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

    viewer.scene.globe.depthTestAgainstTerrain = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-111.55, 24.5, 480000),
      orientation: {
        heading: Cesium.Math.toRadians(-10),
        pitch: Cesium.Math.toRadians(-55),
        roll: 0,
      },
    });

    // Optional paid Google Photorealistic 3D Tiles upgrade
    if (googleKey) {
      Cesium.createGooglePhotorealistic3DTileset({ key: googleKey })
        .then((tileset) => {
          if (!viewer.isDestroyed()) {
            viewer.scene.primitives.add(tileset);
            setTilesMode("Google Photorealistic 3D Tiles (Activo)");
          }
        })
        .catch(() => {});
    } else if (cesiumToken) {
      Cesium.createWorldTerrainAsync()
        .then((terrain) => {
          if (!viewer.isDestroyed()) {
            viewer.terrainProvider = terrain;
            setTilesMode("Cesium ion World Terrain 3D (Activo)");
          }
        })
        .catch(() => {});
    }

    // Load AGEBs + SIBCS Power Lines onto 3D Globe
    TwinAPI.getLayer("agebs")
      .then(async (fc) => {
        if (viewer.isDestroyed()) return;
        const ds = await Cesium.GeoJsonDataSource.load(fc, { clampToGround: false });
        const meta = METRIC_CATALOG[activeMetric];
        for (const ent of ds.entities.values) {
          if (ent.polygon && ent.properties) {
            const pBag = ent.properties;
            const val = Number(pBag[activeMetric]?.getValue() ?? 50);
            const [r, g, b] = interpolateMetricColor(val, meta, 200);
            ent.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.fromBytes(r, g, b, 155));
            ent.polygon.outline = new Cesium.ConstantProperty(true);
            ent.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.fromBytes(15, 23, 42, 200));
            ent.polygon.extrudedHeight = new Cesium.ConstantProperty(
              Math.max(40, (val / Math.max(1, meta.maxValue)) * 900 * extrusionScale),
            );
          }
        }
        viewer.dataSources.add(ds);
      })
      .catch(() => {});

    TwinAPI.getLayer("power_lines")
      .then(async (fc) => {
        if (viewer.isDestroyed()) return;
        const ds = await Cesium.GeoJsonDataSource.load(fc, {
          stroke: Cesium.Color.GOLD,
          strokeWidth: 2,
        });
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
        if (tilesetRef.current) {
          viewer.scene.primitives.remove(tilesetRef.current);
          tilesetRef.current = null;
        }
        viewer.destroy();
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly camera on target change
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !cameraTarget) return;
    const altitudeM = Math.max(950, 420000 / Math.pow(1.9, Math.max(0, cameraTarget.zoom - 6)));
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cameraTarget.lon, cameraTarget.lat - 0.015, altitudeM),
      orientation: {
        heading: Cesium.Math.toRadians(cameraTarget.bearing ?? -15),
        pitch: Cesium.Math.toRadians(-42),
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
          for (const b of res.buildings) {
            const flat: number[] = [];
            for (const pt of b.polygon) {
              flat.push(pt[0], pt[1]);
            }
            if (flat.length < 6) continue;
            const col =
              b.surge_risk === 2
                ? Cesium.Color.fromBytes(239, 68, 68, 220)
                : b.height_m >= 12
                  ? Cesium.Color.fromBytes(56, 189, 248, 230)
                  : Cesium.Color.fromBytes(148, 163, 184, 215);
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
            maximumScreenSpaceError: 16,
          });
          if (cancelled || viewer.isDestroyed()) return;
          tileset.style = new Cesium.Cesium3DTileStyle({
            color: {
              conditions: [
                ["${surge_risk} === 2", "color('#ef4444', 0.9)"],
                ["${height_m} >= 12", "color('#38bdf8', 0.92)"],
                ["true", "color('#cbd5e1', 0.88)"],
              ],
            },
          });
          viewer.scene.primitives.add(tileset);
          tilesetRef.current = tileset;
          setStreaming3DTiles(true);
          setTilesMode("OGC 3D Tiles 1.1 · glTF 2.0");
          setBuildingCount(info.buildings_count || 396823);
        } catch {
          loadFallbackCity();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCitySlug, extrusionScale]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      <div className="glass-panel pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-1.5 text-[11px]">
        <span className="flex items-center gap-1.5 text-sky-300 font-semibold">
          <Globe2 className="h-3.5 w-3.5" />
          CesiumJS 3D · {tilesMode}
        </span>
        <span className="h-3 w-px bg-slate-700" />
        <span className="font-mono-num text-emerald-300">
          {streaming3DTiles
            ? `OGC 3D Tiles 1.1 · ${buildingCount.toLocaleString()} edificios 3D (9 ciudades)`
            : `${buildingCount.toLocaleString()} edificios 3D (${activeCitySlug || "la_paz"})`}
        </span>
        {!googleKey && (
          <span className="hidden md:flex items-center gap-1 text-[10px] text-amber-300">
            <KeyRound className="h-3 w-3" />
            Agrega VITE_GOOGLE_MAPS_API_KEY para Google 3D Tiles fotorrealistas
          </span>
        )}
      </div>
    </div>
  );
};
