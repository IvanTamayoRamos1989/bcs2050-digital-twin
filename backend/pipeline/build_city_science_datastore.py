"""Deterministic City Science ETL & R-Tree Spatial Datastore Builder for BCS2050 Digital Twin.

Ingests real Baja California Sur GeoPackages from `foster_rfi_20261123_delivery/`:
- 396,823 3D buildings across 9 cities
- 79,515 harmonized urban land-use zoning polygons
- 1,155 INEGI/CONEVAL AGEBs
- 3,510 essential services (health, education, civic)
- 115 public transit stops & 7 trunk routes
- 40 CONAGUA aquifers (2020 vs 2023 DMA)
- 280 La Paz OOMSAPAS tandeo rationing sectors
- 102 SIBCS power transmission lines, 34 substations, 14 power plants
- 9 planned desalination/energy/H2 projects & 3 deferred interconnect corridors
- 1,990 POER regional land-use zones & 76 CONANP protected areas (ANPs)
- 5 municipal IPCC AR6 climate profiles & 11 waste facilities

Computes real Aretian "Performance Follows Form" City Science KPIs (15-Minute City score,
multi-scale box-counting Urban Form Fractality, Morphological Harmony, Land-Use Shannon Entropy,
Infill Housing Envelope, Rooftop Solar PV MW/GWh, Coastal Surge Risk, Carrying Capacity Resilience)
and compiles:
  1. `data/spatial_index.sqlite` (R-Tree spatial index for sub-50ms 3D viewport queries)
  2. `data/layers/*.geojson` (simplified WebGL-ready analytical & infrastructure layers)
  3. `data/city_science_summary.json` (statewide, corridor, municipal & 9-city rollups)
"""

from __future__ import annotations

import glob
import json
import math
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import transform

WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = Path(os.environ.get("BCS2050_RFI_DIR", str(WORKSPACE_ROOT / "foster_rfi_20261123_delivery")))
OUT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
OUT_LAYERS_DIR = OUT_DATA_DIR / "layers"

CITY_CAMERA_PRESETS: dict[str, dict[str, Any]] = {
    "la_paz": {
        "name": "La Paz",
        "municipality_code": "03003",
        "lon": -110.3128,
        "lat": 24.1426,
        "zoom": 13.6,
        "pitch": 56,
        "bearing": -22,
    },
    "cabo_san_lucas": {
        "name": "Cabo San Lucas",
        "municipality_code": "03008",
        "lon": -109.9167,
        "lat": 22.8905,
        "zoom": 13.8,
        "pitch": 58,
        "bearing": -28,
    },
    "san_jose_del_cabo": {
        "name": "San José del Cabo",
        "municipality_code": "03008",
        "lon": -109.6989,
        "lat": 23.0617,
        "zoom": 13.8,
        "pitch": 58,
        "bearing": 20,
    },
    "corredor_turistico": {
        "name": "Corredor Turístico Los Cabos",
        "municipality_code": "03008",
        "lon": -109.805,
        "lat": 22.975,
        "zoom": 12.2,
        "pitch": 54,
        "bearing": -16,
    },
    "loreto": {
        "name": "Loreto",
        "municipality_code": "03009",
        "lon": -111.3489,
        "lat": 26.0124,
        "zoom": 14.1,
        "pitch": 58,
        "bearing": -26,
    },
    "todos_santos": {
        "name": "Todos Santos",
        "municipality_code": "03003",
        "lon": -110.2266,
        "lat": 23.4488,
        "zoom": 14.0,
        "pitch": 55,
        "bearing": -18,
    },
    "ciudad_constitucion": {
        "name": "Ciudad Constitución",
        "municipality_code": "03001",
        "lon": -111.6625,
        "lat": 25.0322,
        "zoom": 13.7,
        "pitch": 54,
        "bearing": -12,
    },
    "santa_rosalia": {
        "name": "Santa Rosalía",
        "municipality_code": "03002",
        "lon": -112.2673,
        "lat": 27.3396,
        "zoom": 14.3,
        "pitch": 58,
        "bearing": 22,
    },
    "guerrero_negro": {
        "name": "Guerrero Negro",
        "municipality_code": "03002",
        "lon": -114.0485,
        "lat": 27.9688,
        "zoom": 14.0,
        "pitch": 54,
        "bearing": -15,
    },
}

MUNICIPAL_META: dict[str, dict[str, Any]] = {
    "03001": {"name": "Comondú", "corridor": "CORR-VALLE-COMONDU", "lon": -111.6625, "lat": 25.0322, "zoom": 9.3},
    "03002": {"name": "Mulegé", "corridor": "CORR-NORTE-LORETO-MULEGE", "lon": -112.90, "lat": 27.25, "zoom": 8.2},
    "03003": {"name": "La Paz", "corridor": "CORR-CENTRO-LA-PAZ", "lon": -110.3128, "lat": 24.1426, "zoom": 10.6},
    "03008": {"name": "Los Cabos", "corridor": "CORR-SUR-CABOS", "lon": -109.805, "lat": 23.02, "zoom": 10.5},
    "03009": {"name": "Loreto", "corridor": "CORR-NORTE-LORETO-MULEGE", "lon": -111.352, "lat": 25.97, "zoom": 10.5},
}


def _sf(val: Any, default: float = 0.0) -> float:
    try:
        if val is None or pd.isna(val):
            return default
        f = float(val)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


def _si(val: Any, default: int = 0) -> int:
    try:
        if val is None or pd.isna(val):
            return default
        f = float(val)
        return int(round(f)) if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


def _ss(val: Any, default: str = "") -> str:
    if val is None or (isinstance(val, float) and not math.isfinite(val)):
        return default
    s = str(val).strip()
    return default if s.lower() in {"nan", "none", "null"} else s


def _round_geom_coords(geom: Any, decimals: int = 5) -> Any:
    if geom is None or geom.is_empty:
        return geom
    return transform(lambda x, y, z=None: (round(x, decimals), round(y, decimals)), geom)


def _extract_primary_ring_coords(geom: Any, decimals: int = 5) -> list[list[float]] | None:
    if geom is None or geom.is_empty:
        return None
    poly = None
    if isinstance(geom, Polygon):
        poly = geom
    elif isinstance(geom, MultiPolygon):
        geoms = list(geom.geoms)
        if geoms:
            poly = max(geoms, key=lambda g: g.area)
    if poly is None or poly.is_empty:
        return None
    coords = list(poly.exterior.coords)
    if len(coords) < 4:
        return None
    return [[round(float(c[0]), decimals), round(float(c[1]), decimals)] for c in coords]


def _sanitize_props(props: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for k, v in props.items():
        if isinstance(v, dict):
            clean[k] = _sanitize_props(v)
        elif isinstance(v, list):
            clean[k] = [x for x in v]
        elif isinstance(v, (np.floating, float)):
            clean[k] = round(float(v), 4) if math.isfinite(float(v)) else 0.0
        elif isinstance(v, (np.integer, int)):
            clean[k] = int(v)
        elif isinstance(v, (np.bool_, bool)):
            clean[k] = bool(v)
        elif v is None or (isinstance(v, float) and not math.isfinite(v)):
            clean[k] = None
        else:
            s = str(v)
            clean[k] = None if s.lower() in {"nan", "none", "<na>"} else s
    return clean


def _write_geojson(gdf: gpd.GeoDataFrame, path: Path, simplify_tol: float | None = None, decimals: int = 5) -> int:
    work = gdf.copy()
    if work.crs is not None and work.crs.to_epsg() != 4326:
        work = work.to_crs(epsg=4326)
    features: list[dict[str, Any]] = []
    geom_col = work.geometry.name
    prop_cols = [c for c in work.columns if c != geom_col]
    for _, row in work.iterrows():
        geom = row[geom_col]
        if geom is None or geom.is_empty:
            continue
        if simplify_tol and simplify_tol > 0:
            geom = geom.simplify(simplify_tol, preserve_topology=True)
            if geom.is_empty:
                continue
        geom = _round_geom_coords(geom, decimals=decimals)
        props = _sanitize_props({c: row[c] for c in prop_cols})
        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(json.dumps(geom.__geo_interface__, allow_nan=False)),
                "properties": props,
            }
        )
    fc = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return len(features)


def _compute_fractal_and_harmony(xs: np.ndarray, ys: np.ndarray, areas: np.ndarray, heights: np.ndarray) -> tuple[float, float]:
    n = len(xs)
    if n == 0:
        return 0.0, 0.0
    if n < 15:
        # Compact low-count fallback using density spread and building regularity
        area_cv = float(np.std(areas) / max(1.0, np.mean(areas))) if n > 2 else 0.5
        frac = min(75.0, 28.0 + math.log1p(n) * 14.0)
        harm = max(25.0, min(92.0, 82.0 - area_cv * 18.0))
        return round(frac, 1), round(harm, 1)

    scales = np.array([50.0, 100.0, 200.0, 400.0], dtype=float)
    counts = []
    for s in scales:
        ix = np.floor((xs - xs.min()) / s).astype(np.int64)
        iy = np.floor((ys - ys.min()) / s).astype(np.int64)
        uniq = len(set(zip(ix.tolist(), iy.tolist())))
        counts.append(max(1, uniq))
    counts_arr = np.array(counts, dtype=float)
    # Box-counting slope D in [0.6, 1.95] mapped onto 0..100 City Science score
    slope, _ = np.polyfit(np.log(1.0 / scales), np.log(counts_arr), 1)
    d_val = float(np.clip(slope, 0.4, 1.95))
    fractality = float(np.clip(((d_val - 0.55) / (1.85 - 0.55)) * 100.0, 8.0, 99.0))

    # Harmony: coherence across building footprint grain & vertical height balance
    area_cv = float(np.std(areas) / max(1.0, np.mean(areas)))
    height_cv = float(np.std(heights) / max(0.5, np.mean(heights)))
    # Moderate diversity (Aretian intermediate entropy sweet spot) scores highest
    area_balance = max(0.0, 1.0 - abs(area_cv - 0.75) / 1.5)
    height_balance = max(0.0, 1.0 - abs(height_cv - 0.45) / 1.2)
    harmony = float(np.clip(35.0 + 38.0 * area_balance + 27.0 * height_balance, 12.0, 98.0))
    return round(fractality, 1), round(harmony, 1)


def build_datastore() -> dict[str, Any]:
    t0 = time.perf_counter()
    if not SOURCE_ROOT.exists():
        raise FileNotFoundError(f"Source RFI directory not found: {SOURCE_ROOT}")

    OUT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUT_LAYERS_DIR.mkdir(parents=True, exist_ok=True)
    db_path = OUT_DATA_DIR / "spatial_index.sqlite"
    if db_path.exists():
        db_path.unlink()

    print(f"[1/6] Loading core geospatial layers from {SOURCE_ROOT}...")
    mun_gdf = gpd.read_file(SOURCE_ROOT / "00_base_boundaries/bcs_municipalities_2025/bcs_municipalities_2025.gpkg").to_crs(epsg=4326)
    ageb_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_05_demographics_2025_ageb/rfi_05_demographics_2025_ageb.gpkg").to_crs(epsg=4326)
    irs_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_06_irs_poverty_ageb_2020_2025/rfi_06_irs_poverty_ageb_2020_2025.gpkg")
    services_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_04_essential_services_capacity/rfi_04_essential_services_capacity.gpkg").to_crs(epsg=4326)
    stops_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_02_public_transport_stops/rfi_02_public_transport_stops.gpkg").to_crs(epsg=4326)
    lines_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_02_public_transport_lines/rfi_02_public_transport_lines.gpkg").to_crs(epsg=4326)
    zoning_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_01_urban_land_use_cities/rfi_01_urban_land_use_cities.gpkg").to_crs(epsg=4326)
    aquifers_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_26_water_supply_mix_and_aquifers/rfi_26_conagua_aquifers_2023.gpkg").to_crs(epsg=4326)
    tandeo_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_16_emergency_backup_and_tandeo/rfi_16_lapaz_tandeo_sectors.gpkg").to_crs(epsg=4326)
    power_lines_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_17_22_23_energy_grid_and_mix/rfi_17_power_transmission_lines_osm.gpkg").to_crs(epsg=4326)
    substations_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_17_22_23_energy_grid_and_mix/rfi_17_power_substations_osm.gpkg").to_crs(epsg=4326)
    plants_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_17_22_23_energy_grid_and_mix/rfi_17_power_plants_osm.gpkg").to_crs(epsg=4326)
    planned_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_24_25_planned_projects_interconnect/rfi_24_planned_energy_desal_sites.gpkg").to_crs(epsg=4326)
    interconn_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_24_25_planned_projects_interconnect/rfi_25_interconnection_corridors.gpkg").to_crs(epsg=4326)
    anp_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_08_national_parks_protected_areas/rfi_08_national_parks_protected_areas.gpkg").to_crs(epsg=4326)
    poer_gdf = gpd.read_file(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_09_regional_land_use_zones/rfi_09_regional_land_use_zones.gpkg").to_crs(epsg=4326)
    climate_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_18_climate_scenarios_vulnerability/rfi_18_climate_scenarios_municipal.gpkg")
    waste_gdf = gpd.read_file(SOURCE_ROOT / "02_part_b_environmental_engineering_gis/rfi_27_waste_facilities_and_collection/rfi_27_waste_facilities_and_planned_sites.gpkg").to_crs(epsg=4326)

    # Merge IRS 2025 into AGEB GeoDataFrame
    irs_cols = [
        "cvegeo_ageb",
        "irs_score_2020",
        "irs_degree_2020",
        "irs_score_2025_eic_calibrated",
        "irs_degree_2025_eic_calibrated",
        "pct_sin_salud_2020",
        "pct_sin_agua_2020",
        "pct_sin_drenaje_2020",
        "pct_sin_elec_2020",
    ]
    ageb_gdf = ageb_gdf.merge(irs_gdf[irs_cols], on="cvegeo_ageb", how="left")

    # Project AGEB centroids to metric UTM 12N (EPSG:32612) for 15-min city & infrastructure KDTrees
    print("[2/6] Computing metric 15-Minute City Accessibility & infrastructure distances...")
    ageb_utm = ageb_gdf.to_crs(epsg=32612)
    ageb_centroids_utm = ageb_utm.geometry.centroid
    ageb_xy = np.column_stack([ageb_centroids_utm.x.to_numpy(), ageb_centroids_utm.y.to_numpy()])

    ageb_centroids_wgs = gpd.GeoDataFrame(
        {"cvegeo_ageb": ageb_gdf["cvegeo_ageb"]},
        geometry=gpd.points_from_xy(
            ageb_gdf.geometry.representative_point().x,
            ageb_gdf.geometry.representative_point().y,
        ),
        crs="EPSG:4326",
    )
    ageb_gdf["centroid_lon"] = np.round(ageb_centroids_wgs.geometry.x.to_numpy(), 5)
    ageb_gdf["centroid_lat"] = np.round(ageb_centroids_wgs.geometry.y.to_numpy(), 5)
    ageb_gdf["area_ha"] = np.round(ageb_utm.geometry.area.to_numpy() / 10_000.0, 2)

    # Classify services into clean categories
    def _classify_service(sec: str) -> str:
        s = _ss(sec).upper()
        if "HEALTH" in s:
            return "health"
        if "EDUC" in s:
            return "education"
        return "civic"

    services_gdf["category"] = services_gdf["sector"].map(_classify_service)
    srv_utm = services_gdf.to_crs(epsg=32612)
    srv_xy_all = np.column_stack([srv_utm.geometry.x.to_numpy(), srv_utm.geometry.y.to_numpy()])
    health_xy = srv_xy_all[services_gdf["category"] == "health"]
    edu_xy = srv_xy_all[services_gdf["category"] == "education"]
    civic_xy = srv_xy_all[services_gdf["category"] == "civic"]

    stops_utm = stops_gdf.to_crs(epsg=32612)
    stops_xy = np.column_stack([stops_utm.geometry.x.to_numpy(), stops_utm.geometry.y.to_numpy()])

    subs_utm = substations_gdf.to_crs(epsg=32612)
    subs_xy = np.column_stack([subs_utm.geometry.x.to_numpy(), subs_utm.geometry.y.to_numpy()])

    def _dist_15m(target_xy: np.ndarray, detour: float = 1.28) -> tuple[np.ndarray, np.ndarray]:
        tree = cKDTree(target_xy)
        dists, _ = tree.query(ageb_xy, k=1)
        walk_m = dists * detour
        # 15-min walk threshold ~ 1,200 m (80 m/min); smooth decay past 1,200 m
        scores = np.where(walk_m <= 1200.0, 100.0 - (walk_m / 1200.0) * 28.0, 72.0 * np.exp(-(walk_m - 1200.0) / 1600.0))
        return np.round(walk_m, 1), np.round(np.clip(scores, 2.0, 100.0), 1)

    nearest_health_m, health_15m = _dist_15m(health_xy)
    nearest_edu_m, edu_15m = _dist_15m(edu_xy)
    nearest_civic_m, civic_15m = _dist_15m(civic_xy)
    nearest_transit_m, transit_15m = _dist_15m(stops_xy)

    all_srv_tree = cKDTree(srv_xy_all)
    counts_1200m = np.array([len(all_srv_tree.query_ball_point(pt, 1200.0 / 1.28)) for pt in ageb_xy], dtype=float)
    density_bonus = np.clip(np.log1p(counts_1200m) * 6.5, 0.0, 18.0)

    subs_tree = cKDTree(subs_xy)
    sub_dists, _ = subs_tree.query(ageb_xy, k=1)
    dist_substation_km = np.round(sub_dists / 1000.0, 2)

    city15_score = np.round(
        np.clip(0.30 * health_15m + 0.30 * edu_15m + 0.20 * civic_15m + 0.20 * transit_15m + density_bonus * 0.45, 3.0, 99.0),
        1,
    )

    ageb_gdf["nearest_health_m"] = nearest_health_m
    ageb_gdf["nearest_edu_m"] = nearest_edu_m
    ageb_gdf["nearest_civic_m"] = nearest_civic_m
    ageb_gdf["nearest_transit_m"] = nearest_transit_m
    ageb_gdf["health_15m"] = health_15m
    ageb_gdf["edu_15m"] = edu_15m
    ageb_gdf["civic_15m"] = civic_15m
    ageb_gdf["transit_15m"] = transit_15m
    ageb_gdf["services_within_1200m"] = counts_1200m.astype(int)
    ageb_gdf["city15_score"] = city15_score
    ageb_gdf["dist_substation_km"] = dist_substation_km

    # Spatial join AGEB centroids to Aquifers, Tandeo, POER UGAs, ANPs
    print("[3/6] Joining Aquifers, La Paz Tandeo, POER UGAs, ANPs & 79,515 Zoning Polygons...")
    aq_join = gpd.sjoin(
        ageb_centroids_wgs,
        aquifers_gdf[["aquifer_code", "aquifer_name", "dma_2023_hm3", "exploitation_ratio_pct", "veda_status", "seawater_intrusion_risk", "geometry"]],
        how="left",
        predicate="within",
    ).drop_duplicates("cvegeo_ageb")

    ageb_gdf = ageb_gdf.merge(
        aq_join[["cvegeo_ageb", "aquifer_code", "aquifer_name", "dma_2023_hm3", "exploitation_ratio_pct", "veda_status", "seawater_intrusion_risk"]],
        on="cvegeo_ageb",
        how="left",
    )

    tandeo_join = gpd.sjoin(
        ageb_centroids_wgs,
        tandeo_gdf[["nombre", "dias", "geometry"]],
        how="left",
        predicate="within",
    ).drop_duplicates("cvegeo_ageb")
    tandeo_map = dict(zip(tandeo_join["cvegeo_ageb"], tandeo_join["nombre"].notna()))
    ageb_gdf["in_tandeo"] = ageb_gdf["cvegeo_ageb"].map(lambda c: bool(tandeo_map.get(c, False)))

    poer_join = gpd.sjoin(
        ageb_centroids_wgs,
        poer_gdf[["zone_id", "macro_zone_class", "environmental_policy", "geometry"]],
        how="left",
        predicate="within",
    ).drop_duplicates("cvegeo_ageb")
    ageb_gdf = ageb_gdf.merge(
        poer_join[["cvegeo_ageb", "macro_zone_class", "environmental_policy"]],
        on="cvegeo_ageb",
        how="left",
    )

    anp_join = gpd.sjoin(
        ageb_centroids_wgs,
        anp_gdf[["area_name", "cat_manejo", "geometry"]],
        how="left",
        predicate="within",
    ).drop_duplicates("cvegeo_ageb")
    ageb_gdf = ageb_gdf.merge(
        anp_join[["cvegeo_ageb", "area_name"]].rename(columns={"area_name": "anp_name"}),
        on="cvegeo_ageb",
        how="left",
    )
    ageb_gdf["in_anp"] = ageb_gdf["anp_name"].notna()

    # Spatial join 79,515 Zoning polygons onto AGEBs (representative point -> within) for Shannon Entropy & Allowable GFA
    zoning_pts = gpd.GeoDataFrame(
        {
            "land_use_category_std": zoning_gdf["land_use_category_std"],
            "land_use_code": zoning_gdf["land_use_code"],
            "cus_max": zoning_gdf["cus_max"],
            "max_levels": zoning_gdf["max_levels"],
            "area_ha": zoning_gdf["area_ha"],
        },
        geometry=zoning_gdf.geometry.representative_point(),
        crs="EPSG:4326",
    )
    z_joined = gpd.sjoin(
        zoning_pts,
        ageb_gdf[["cvegeo_ageb", "geometry"]],
        how="inner",
        predicate="within",
    )

    entropy_by_ageb: dict[str, float] = {}
    allow_gfa_by_ageb: dict[str, float] = {}
    dom_zone_by_ageb: dict[str, str] = {}
    max_k = math.log(8.0)

    for cve, grp in z_joined.groupby("cvegeo_ageb"):
        counts = grp["land_use_category_std"].value_counts()
        tot = float(counts.sum())
        if tot > 0 and len(counts) > 1:
            probs = counts.to_numpy(dtype=float) / tot
            h = -float(np.sum(probs * np.log(probs)))
            entropy_by_ageb[str(cve)] = round(min(100.0, (h / max_k) * 100.0), 1)
        elif tot > 0:
            entropy_by_ageb[str(cve)] = 12.0
        dom_zone_by_ageb[str(cve)] = str(counts.index[0]) if len(counts) > 0 else "MIXED"

        # Allowable GFA calculation from normative CUS or max_levels fallback
        areas_m2 = grp["area_ha"].fillna(0.05).to_numpy(dtype=float) * 10_000.0
        cus_raw = grp["cus_max"].to_numpy(dtype=float)
        lv_raw = grp["max_levels"].to_numpy(dtype=float)
        eff_cus = np.where(
            np.isfinite(cus_raw) & (cus_raw > 0.05),
            np.clip(cus_raw, 0.2, 6.0),
            np.where(np.isfinite(lv_raw) & (lv_raw > 0), np.clip(lv_raw * 0.55, 0.6, 4.5), 1.4),
        )
        # Exclude conservation/green zones from buildable housing GFA
        buildable_mask = ~grp["land_use_category_std"].isin(["CONSERVATION_RISK_BUFFER", "GREEN_OPEN_SPACE"]).to_numpy()
        allow_m2 = float(np.sum(areas_m2[buildable_mask] * eff_cus[buildable_mask]))
        allow_gfa_by_ageb[str(cve)] = round(allow_m2, 1)

    ageb_gdf["landuse_entropy_score"] = ageb_gdf["cvegeo_ageb"].map(lambda c: entropy_by_ageb.get(str(c), 18.0))
    ageb_gdf["dominant_zoning"] = ageb_gdf["cvegeo_ageb"].map(lambda c: dom_zone_by_ageb.get(str(c), "UNZONED"))
    ageb_gdf["allowable_gfa_m2"] = ageb_gdf["cvegeo_ageb"].map(lambda c: allow_gfa_by_ageb.get(str(c), 0.0))

    # Connect SQLite R-Tree Database and ingest 396,823 Buildings + 79,515 Zoning Polygons
    print("[4/6] Building R-Tree SQLite database & joining 396,823 3D buildings to AGEBs...")
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.executescript(
        """
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE buildings (
            id INTEGER PRIMARY KEY,
            building_id TEXT,
            city_slug TEXT NOT NULL,
            city_name TEXT NOT NULL,
            mun_code TEXT NOT NULL,
            ageb_cvegeo TEXT,
            height_m REAL NOT NULL,
            floors INTEGER NOT NULL,
            footprint_m2 REAL NOT NULL,
            gfa_m2 REAL NOT NULL,
            ground_elev_m REAL NOT NULL,
            solar_kwp REAL NOT NULL,
            surge_risk INTEGER NOT NULL,
            centroid_lon REAL NOT NULL,
            centroid_lat REAL NOT NULL,
            ring_json TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE buildings_rtree USING rtree(id, minx, maxx, miny, maxy);

        CREATE TABLE zoning_parcels (
            id INTEGER PRIMARY KEY,
            zone_id TEXT,
            city_name TEXT NOT NULL,
            mun_code TEXT NOT NULL,
            land_use_code TEXT,
            land_use_category_std TEXT NOT NULL,
            cos_max REAL,
            cus_max REAL,
            max_levels INTEGER,
            area_ha REAL NOT NULL,
            ring_json TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE zoning_rtree USING rtree(id, minx, maxx, miny, maxy);
        """
    )

    building_files = sorted(
        glob.glob(str(SOURCE_ROOT / "01_part_a_gis_urban_demographics/rfi_03_10_buildings_3d_heights_massing/buildings_3d_*.gpkg"))
    )
    ageb_geom_lookup = ageb_gdf[["cvegeo_ageb", "geometry"]].copy()

    b_id_seq = 1
    city_stats: dict[str, dict[str, Any]] = {}
    ageb_bldg_acc: dict[str, dict[str, Any]] = {}
    total_buildings = 0

    for bf in building_files:
        slug = Path(bf).stem.replace("buildings_3d_", "")
        bgdf = gpd.read_file(bf)
        if bgdf.crs is not None and bgdf.crs.to_epsg() != 4326:
            bgdf = bgdf.to_crs(epsg=4326)

        pts = gpd.GeoDataFrame(
            {"idx": np.arange(len(bgdf))},
            geometry=gpd.points_from_xy(bgdf["centroid_lon"], bgdf["centroid_lat"]),
            crs="EPSG:4326",
        )
        pts_utm = pts.to_crs(epsg=32612)
        bgdf["utm_x"] = pts_utm.geometry.x.to_numpy()
        bgdf["utm_y"] = pts_utm.geometry.y.to_numpy()

        joined = gpd.sjoin(pts, ageb_geom_lookup, how="left", predicate="within").drop_duplicates("idx")
        idx_to_ageb = dict(zip(joined["idx"], joined["cvegeo_ageb"]))

        city_name = _ss(bgdf["city_name"].iloc[0], CITY_CAMERA_PRESETS.get(slug, {}).get("name", slug))
        mun_code = _ss(bgdf["municipality_code"].iloc[0], CITY_CAMERA_PRESETS.get(slug, {}).get("municipality_code", "03003"))

        b_rows = []
        r_rows = []
        c_heights = []
        c_fp_sum = 0.0
        c_gfa_sum = 0.0
        c_solar_mw = 0.0
        c_surge_high = 0

        b_geom_col = bgdf.geometry.name
        for idx_row, row in enumerate(bgdf.itertuples(index=False)):
            ring = _extract_primary_ring_coords(getattr(row, b_geom_col), decimals=5)
            if ring is None:
                continue
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            h_m = max(2.8, _sf(row.height_m, 4.0))
            fl = max(1, _si(row.estimated_floors, max(1, round(h_m / 3.3))))
            fp = max(12.0, _sf(row.footprint_area_m2, 85.0))
            gfa = max(fp, _sf(row.estimated_gfa_m2, fp * fl))
            elev = _sf(row.ground_elevation_m, 15.0)
            solar_kwp = round(fp * 0.55 * 0.205, 2)
            surge = 2 if elev < 6.0 else (1 if elev < 10.0 else 0)
            ageb_c = _ss(idx_to_ageb.get(idx_row), "")

            b_rows.append(
                (
                    b_id_seq,
                    _ss(row.building_id, f"{slug}-{b_id_seq}"),
                    slug,
                    city_name,
                    mun_code,
                    ageb_c,
                    round(h_m, 2),
                    fl,
                    round(fp, 1),
                    round(gfa, 1),
                    round(elev, 1),
                    solar_kwp,
                    surge,
                    round(_sf(row.centroid_lon, lons[0]), 5),
                    round(_sf(row.centroid_lat, lats[0]), 5),
                    json.dumps(ring, separators=(",", ":")),
                )
            )
            r_rows.append((b_id_seq, min(lons), max(lons), min(lats), max(lats)))

            c_heights.append(h_m)
            c_fp_sum += fp
            c_gfa_sum += gfa
            c_solar_mw += solar_kwp / 1000.0
            if surge == 2:
                c_surge_high += 1

            if ageb_c:
                acc = ageb_bldg_acc.get(ageb_c)
                if acc is None:
                    acc = {"xs": [], "ys": [], "areas": [], "heights": [], "fp": 0.0, "gfa": 0.0, "solar_mw": 0.0, "surge": 0, "count": 0}
                    ageb_bldg_acc[ageb_c] = acc
                acc["xs"].append(float(row.utm_x))
                acc["ys"].append(float(row.utm_y))
                acc["areas"].append(fp)
                acc["heights"].append(h_m)
                acc["fp"] += fp
                acc["gfa"] += gfa
                acc["solar_mw"] += solar_kwp / 1000.0
                if surge == 2:
                    acc["surge"] += 1
                acc["count"] += 1

            b_id_seq += 1
            total_buildings += 1
            if len(b_rows) >= 20_000:
                cur.executemany("INSERT INTO buildings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", b_rows)
                cur.executemany("INSERT INTO buildings_rtree VALUES (?,?,?,?,?)", r_rows)
                b_rows.clear()
                r_rows.clear()

        if b_rows:
            cur.executemany("INSERT INTO buildings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", b_rows)
            cur.executemany("INSERT INTO buildings_rtree VALUES (?,?,?,?,?)", r_rows)
        con.commit()

        cam = CITY_CAMERA_PRESETS.get(slug, {"lon": -110.31, "lat": 24.14, "zoom": 13.5, "pitch": 55, "bearing": -20})
        city_stats[slug] = {
            "slug": slug,
            "name": city_name,
            "municipality_code": mun_code,
            "buildings_count": len(c_heights),
            "mean_height_m": round(float(np.mean(c_heights)) if c_heights else 0.0, 2),
            "max_height_m": round(float(np.max(c_heights)) if c_heights else 0.0, 2),
            "footprint_ha": round(c_fp_sum / 10_000.0, 2),
            "total_gfa_m2": round(c_gfa_sum, 0),
            "rooftop_solar_mw": round(c_solar_mw, 2),
            "rooftop_solar_gwh_yr": round(c_solar_mw * 1.72, 1),
            "surge_exposed_buildings": c_surge_high,
            "surge_exposed_pct": round((c_surge_high / max(1, len(c_heights))) * 100.0, 2),
            "camera": cam,
        }
        print(f"    -> {slug}: {len(c_heights):,} buildings | Solar {c_solar_mw:.1f} MW | Surge<6m {c_surge_high:,}")

    # Insert 79,515 Zoning Polygons into SQLite R-Tree
    print(f"[5/6] Indexing {len(zoning_gdf):,} zoning parcels into SQLite R-Tree & finalizing AGEB City Science KPIs...")
    z_rows = []
    zr_rows = []
    z_id_seq = 1
    z_geom_col = zoning_gdf.geometry.name
    for row in zoning_gdf.itertuples(index=False):
        geom = getattr(row, z_geom_col).simplify(0.00003, preserve_topology=True)
        ring = _extract_primary_ring_coords(geom, decimals=5)
        if ring is None:
            continue
        lons = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        z_rows.append(
            (
                z_id_seq,
                _ss(row.zone_id, f"Z-{z_id_seq}"),
                _ss(row.city_name, "BCS"),
                _ss(row.municipality_code, "03003"),
                _ss(row.land_use_code, ""),
                _ss(row.land_use_category_std, "RESIDENTIAL"),
                round(_sf(row.cos_max, 0.6), 3) if pd.notna(row.cos_max) else None,
                round(_sf(row.cus_max, 1.5), 3) if pd.notna(row.cus_max) else None,
                _si(row.max_levels, 2) if pd.notna(row.max_levels) else None,
                round(_sf(row.area_ha, 0.05), 4),
                json.dumps(ring, separators=(",", ":")),
            )
        )
        zr_rows.append((z_id_seq, min(lons), max(lons), min(lats), max(lats)))
        z_id_seq += 1
        if len(z_rows) >= 15_000:
            cur.executemany("INSERT INTO zoning_parcels VALUES (?,?,?,?,?,?,?,?,?,?,?)", z_rows)
            cur.executemany("INSERT INTO zoning_rtree VALUES (?,?,?,?,?)", zr_rows)
            z_rows.clear()
            zr_rows.clear()
    if z_rows:
        cur.executemany("INSERT INTO zoning_parcels VALUES (?,?,?,?,?,?,?,?,?,?,?)", z_rows)
        cur.executemany("INSERT INTO zoning_rtree VALUES (?,?,?,?,?)", zr_rows)

    cur.execute("CREATE INDEX idx_buildings_city ON buildings(city_slug)")
    cur.execute("CREATE INDEX idx_buildings_ageb ON buildings(ageb_cvegeo)")
    cur.execute("CREATE INDEX idx_zoning_mun ON zoning_parcels(mun_code)")
    con.commit()
    con.close()

    # Finalize AGEB City Science KPIs using the 396k buildings
    frac_list, harm_list, bcount_list, gfa_list, solar_mw_list, solar_gwh_list, surge_cnt_list, surge_pct_list = ([] for _ in range(8))
    mean_h_list, infill_homes_list, carry_list, socio_list, csi_list = ([] for _ in range(5))

    for row in ageb_gdf.itertuples(index=False):
        cve = _ss(row.cvegeo_ageb)
        acc = ageb_bldg_acc.get(cve)
        if acc and acc["count"] > 0:
            fr, ha = _compute_fractal_and_harmony(
                np.array(acc["xs"]),
                np.array(acc["ys"]),
                np.array(acc["areas"]),
                np.array(acc["heights"]),
            )
            bc = acc["count"]
            gfa_val = round(acc["gfa"], 1)
            smw = round(acc["solar_mw"], 3)
            sgwh = round(smw * 1.72, 2)
            scnt = acc["surge"]
            spct = round((scnt / bc) * 100.0, 1)
            mh = round(float(np.mean(acc["heights"])), 2)
        else:
            fr, ha = (18.0, 40.0) if _ss(row.ambito).lower().startswith("u") else (10.0, 32.0)
            bc = _si(row.buildings_count, 0)
            gfa_val = round(_sf(row.building_gfa_m2, 0.0), 1)
            smw = round(gfa_val * 0.45 * 0.205 / 1000.0, 3)
            sgwh = round(smw * 1.72, 2)
            scnt = 0
            spct = 0.0
            mh = 4.2 if bc > 0 else 0.0

        allow_m2 = _sf(row.allowable_gfa_m2, 0.0)
        # If AGEB is urban without zoning parcel overlay, estimate conservative infill envelope (1.35 * existing footprint)
        if allow_m2 <= 0 and _ss(row.ambito).lower().startswith("u"):
            allow_m2 = gfa_val * 1.42
        residual_m2 = max(0.0, allow_m2 - gfa_val)
        # Apply 45% realistic redevelopment capture ratio and 115 m2/home; cap per AGEB to prevent single-polygon outlier skew
        infill_homes = int(min(1850, round((residual_m2 * 0.45) / 115.0)))

        # Water-Energy-Climate Carrying Resilience Score (0-100)
        exploit = _sf(row.exploitation_ratio_pct, 110.0)
        water_score = max(5.0, min(95.0, 100.0 - max(0.0, exploit - 75.0) * 0.35))
        if bool(row.in_tandeo):
            water_score = max(5.0, water_score - 18.0)
        grid_score = max(20.0, min(95.0, 95.0 - _sf(row.dist_substation_km, 5.0) * 1.6))
        climate_score = max(10.0, min(98.0, 96.0 - spct * 0.65))
        poer_pen = 18.0 if bool(row.in_anp) else 0.0
        carry = round(max(8.0, min(96.0, 0.42 * water_score + 0.28 * grid_score + 0.30 * climate_score - poer_pen)), 1)

        # Socioeconomic Vitality (inverse IRS lag + service density)
        irs_val = _sf(row.irs_score_2025_eic_calibrated, 0.0)
        # IRS typically spans -1.5 (lowest lag / highest prosperity) to +3.5 (highest lag)
        irs_norm = float(np.clip(74.0 - irs_val * 16.0, 10.0, 96.0))
        srv_pop_ratio = (_si(row.services_within_1200m, 0) / max(150.0, _sf(row.pobtot_2025_eic_calibrated, 500.0))) * 1000.0
        socio = round(float(np.clip(0.68 * irs_norm + 0.32 * min(98.0, 32.0 + srv_pop_ratio * 2.1), 12.0, 97.0)), 1)

        # Composite Aretian City Science Index (0-100)
        csi = round(
            0.28 * _sf(row.city15_score, 40.0)
            + 0.22 * (0.55 * fr + 0.45 * ha)
            + 0.18 * _sf(row.landuse_entropy_score, 20.0)
            + 0.17 * carry
            + 0.15 * socio,
            1,
        )

        frac_list.append(fr)
        harm_list.append(ha)
        bcount_list.append(bc)
        gfa_list.append(gfa_val)
        solar_mw_list.append(smw)
        solar_gwh_list.append(sgwh)
        surge_cnt_list.append(scnt)
        surge_pct_list.append(spct)
        mean_h_list.append(mh)
        infill_homes_list.append(infill_homes)
        carry_list.append(carry)
        socio_list.append(socio)
        csi_list.append(csi)

    ageb_gdf["fractality_score"] = frac_list
    ageb_gdf["harmony_score"] = harm_list
    ageb_gdf["buildings_3d_count"] = bcount_list
    ageb_gdf["built_gfa_m2"] = gfa_list
    ageb_gdf["solar_mw"] = solar_mw_list
    ageb_gdf["solar_gwh_yr"] = solar_gwh_list
    ageb_gdf["surge_exposed_buildings"] = surge_cnt_list
    ageb_gdf["surge_exposed_pct"] = surge_pct_list
    ageb_gdf["mean_height_m"] = mean_h_list
    ageb_gdf["infill_homes_potential"] = infill_homes_list
    ageb_gdf["carrying_resilience_score"] = carry_list
    ageb_gdf["socioecon_score"] = socio_list
    ageb_gdf["city_science_index"] = csi_list

    # Export all GeoJSON layers for frontend & inspection
    print("[6/6] Exporting WebGL GeoJSON layers and City Science summary rollups...")
    ageb_export_cols = [
        "cvegeo_ageb", "municipality_code", "municipality_name", "ambito",
        "pobtot_2020_censal", "pobtot_2025_eic_calibrated", "vivpar_hab_2025", "density_hab_ha_2025",
        "irs_score_2025_eic_calibrated", "irs_degree_2025_eic_calibrated",
        "city_science_index", "city15_score", "health_15m", "edu_15m", "civic_15m", "transit_15m",
        "nearest_health_m", "nearest_edu_m", "nearest_transit_m", "services_within_1200m",
        "fractality_score", "harmony_score", "landuse_entropy_score", "dominant_zoning",
        "buildings_3d_count", "mean_height_m", "built_gfa_m2", "allowable_gfa_m2", "infill_homes_potential",
        "solar_mw", "solar_gwh_yr", "surge_exposed_buildings", "surge_exposed_pct",
        "aquifer_code", "aquifer_name", "dma_2023_hm3", "exploitation_ratio_pct",
        "in_tandeo", "dist_substation_km", "macro_zone_class", "environmental_policy", "in_anp", "anp_name",
        "carrying_resilience_score", "socioecon_score", "centroid_lon", "centroid_lat", "area_ha", "geometry",
    ]
    _write_geojson(ageb_gdf[ageb_export_cols], OUT_LAYERS_DIR / "agebs_city_science.geojson", simplify_tol=0.00008)

    # Municipal aggregation
    mun_agg = ageb_gdf.groupby("municipality_code").agg(
        population_2020=("pobtot_2020_censal", "sum"),
        population_2025=("pobtot_2025_eic_calibrated", "sum"),
        dwellings_2025=("vivpar_hab_2025", "sum"),
        ageb_count=("cvegeo_ageb", "count"),
        buildings_3d_count=("buildings_3d_count", "sum"),
        built_gfa_m2=("built_gfa_m2", "sum"),
        infill_homes_potential=("infill_homes_potential", "sum"),
        solar_mw=("solar_mw", "sum"),
        solar_gwh_yr=("solar_gwh_yr", "sum"),
        surge_exposed_buildings=("surge_exposed_buildings", "sum"),
        city_science_index=("city_science_index", lambda s: round(float(np.average(s, weights=np.maximum(1, ageb_gdf.loc[s.index, "pobtot_2025_eic_calibrated"].fillna(1)))), 1)),
        city15_score=("city15_score", lambda s: round(float(np.average(s, weights=np.maximum(1, ageb_gdf.loc[s.index, "pobtot_2025_eic_calibrated"].fillna(1)))), 1)),
        fractality_score=("fractality_score", "mean"),
        harmony_score=("harmony_score", "mean"),
        landuse_entropy_score=("landuse_entropy_score", "mean"),
        carrying_resilience_score=("carrying_resilience_score", "mean"),
        socioecon_score=("socioecon_score", "mean"),
    ).reset_index()

    mun_export = mun_gdf.merge(mun_agg, on="municipality_code", how="left").merge(
        climate_gdf[
            [
                "municipality_code",
                "ipcc_ar6_slr_2050_ssp245_m",
                "ipcc_ar6_slr_2050_ssp585_m",
                "ipcc_ar6_slr_2100_ssp585_m",
                "temperature_anomaly_scenario",
                "inegi_flood_events_recorded",
                "coastal_erosion_sites",
                "mangrove_buffer_ha",
                "runoff_network_km",
            ]
        ],
        on="municipality_code",
        how="left",
    )
    _write_geojson(mun_export, OUT_LAYERS_DIR / "municipalities.geojson", simplify_tol=0.0005)
    _write_geojson(aquifers_gdf, OUT_LAYERS_DIR / "aquifers.geojson", simplify_tol=0.0006)
    _write_geojson(tandeo_gdf, OUT_LAYERS_DIR / "tandeo_lapaz.geojson", simplify_tol=0.00008)
    _write_geojson(power_lines_gdf, OUT_LAYERS_DIR / "power_lines.geojson", simplify_tol=0.0003)
    _write_geojson(substations_gdf, OUT_LAYERS_DIR / "substations.geojson")
    _write_geojson(plants_gdf, OUT_LAYERS_DIR / "power_plants.geojson")
    _write_geojson(planned_gdf, OUT_LAYERS_DIR / "planned_projects.geojson")
    _write_geojson(interconn_gdf, OUT_LAYERS_DIR / "interconnections.geojson", simplify_tol=0.001)
    _write_geojson(services_gdf, OUT_LAYERS_DIR / "services.geojson")
    _write_geojson(stops_gdf, OUT_LAYERS_DIR / "transit_stops.geojson")
    _write_geojson(lines_gdf, OUT_LAYERS_DIR / "transit_lines.geojson", simplify_tol=0.0002)
    _write_geojson(poer_gdf, OUT_LAYERS_DIR / "poer_ugas.geojson", simplify_tol=0.0006)
    _write_geojson(anp_gdf, OUT_LAYERS_DIR / "anps.geojson", simplify_tol=0.0006)
    _write_geojson(waste_gdf, OUT_LAYERS_DIR / "waste_sites.geojson")

    # Build top-level City Science summary JSON
    pop_total = int(ageb_gdf["pobtot_2025_eic_calibrated"].fillna(0).sum())
    weights_pop = np.maximum(1.0, ageb_gdf["pobtot_2025_eic_calibrated"].fillna(0).to_numpy(dtype=float))
    municipalities_summary: dict[str, Any] = {}
    for _, r in mun_export.iterrows():
        mcode = str(r["municipality_code"])
        meta = MUNICIPAL_META.get(mcode, {})
        municipalities_summary[mcode] = _sanitize_props(
            {
                "municipality_code": mcode,
                "name": meta.get("name", r["nomgeo"]),
                "corridor": meta.get("corridor", ""),
                "population_2020": _si(r["population_2020"]),
                "population_2025": _si(r["population_2025"]),
                "dwellings_2025": _si(r["dwellings_2025"]),
                "ageb_count": _si(r["ageb_count"]),
                "buildings_3d_count": _si(r["buildings_3d_count"]),
                "built_gfa_m2": round(_sf(r["built_gfa_m2"]), 0),
                "infill_homes_potential": _si(r["infill_homes_potential"]),
                "solar_mw": round(_sf(r["solar_mw"]), 2),
                "solar_gwh_yr": round(_sf(r["solar_gwh_yr"]), 1),
                "surge_exposed_buildings": _si(r["surge_exposed_buildings"]),
                "city_science_index": round(_sf(r["city_science_index"]), 1),
                "city15_score": round(_sf(r["city15_score"]), 1),
                "fractality_score": round(_sf(r["fractality_score"]), 1),
                "harmony_score": round(_sf(r["harmony_score"]), 1),
                "landuse_entropy_score": round(_sf(r["landuse_entropy_score"]), 1),
                "carrying_resilience_score": round(_sf(r["carrying_resilience_score"]), 1),
                "socioecon_score": round(_sf(r["socioecon_score"]), 1),
                "ipcc_slr_2050_ssp585_m": round(_sf(r["ipcc_ar6_slr_2050_ssp585_m"]), 3),
                "mangrove_buffer_ha": round(_sf(r["mangrove_buffer_ha"]), 1),
                "coastal_erosion_sites": _si(r["coastal_erosion_sites"]),
                "camera": {"lon": meta.get("lon", -110.31), "lat": meta.get("lat", 24.14), "zoom": meta.get("zoom", 10.0), "pitch": 45, "bearing": -15},
            }
        )

    deficit_aquifers = aquifers_gdf[aquifers_gdf["dma_2023_hm3"].fillna(0) < 0]
    summary = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "state": {
            "scope_id": "03",
            "name": "Baja California Sur",
            "population_2025": pop_total,
            "dwellings_2025": int(ageb_gdf["vivpar_hab_2025"].fillna(0).sum()),
            "agebs_count": int(len(ageb_gdf)),
            "buildings_3d_count": int(total_buildings),
            "zoning_parcels_count": int(z_id_seq - 1),
            "essential_services_count": int(len(services_gdf)),
            "transit_stops_count": int(len(stops_gdf)),
            "aquifers_count": int(len(aquifers_gdf)),
            "aquifers_in_deficit_count": int(len(deficit_aquifers)),
            "total_aquifer_dma_2023_hm3": round(float(aquifers_gdf["dma_2023_hm3"].fillna(0).sum()), 2),
            "tandeo_sectors_lapaz": int(len(tandeo_gdf)),
            "power_lines_count": int(len(power_lines_gdf)),
            "substations_count": int(len(substations_gdf)),
            "power_plants_count": int(len(plants_gdf)),
            "planned_projects_count": int(len(planned_gdf)),
            "poer_ugas_count": int(len(poer_gdf)),
            "anps_count": int(len(anp_gdf)),
            "total_built_gfa_m2": round(float(ageb_gdf["built_gfa_m2"].sum()), 0),
            "infill_homes_potential": int(ageb_gdf["infill_homes_potential"].sum()),
            "rooftop_solar_mw": round(float(ageb_gdf["solar_mw"].sum()), 1),
            "rooftop_solar_gwh_yr": round(float(ageb_gdf["solar_gwh_yr"].sum()), 1),
            "surge_exposed_buildings": int(ageb_gdf["surge_exposed_buildings"].sum()),
            "city_science_index": round(float(np.average(ageb_gdf["city_science_index"], weights=weights_pop)), 1),
            "city15_score": round(float(np.average(ageb_gdf["city15_score"], weights=weights_pop)), 1),
            "fractality_score": round(float(np.average(ageb_gdf["fractality_score"], weights=weights_pop)), 1),
            "harmony_score": round(float(np.average(ageb_gdf["harmony_score"], weights=weights_pop)), 1),
            "landuse_entropy_score": round(float(np.average(ageb_gdf["landuse_entropy_score"], weights=weights_pop)), 1),
            "carrying_resilience_score": round(float(np.average(ageb_gdf["carrying_resilience_score"], weights=weights_pop)), 1),
            "socioecon_score": round(float(np.average(ageb_gdf["socioecon_score"], weights=weights_pop)), 1),
            "camera": {"lon": -111.55, "lat": 25.15, "zoom": 6.4, "pitch": 36, "bearing": -8},
        },
        "municipalities": municipalities_summary,
        "cities": city_stats,
        "corridor_arcs": [
            {"id": "ARC-CABOS-LPZ", "name": "Corredor Sur–Centro (Los Cabos ↔ La Paz)", "source": [-109.85, 22.97], "target": [-110.31, 24.14], "flow_index": 94, "corridor": "CORR-SUR-CABOS"},
            {"id": "ARC-LPZ-TS", "name": "Eje Pacífico Sur (La Paz ↔ Todos Santos)", "source": [-110.31, 24.14], "target": [-110.23, 23.45], "flow_index": 62, "corridor": "CORR-CENTRO-LA-PAZ"},
            {"id": "ARC-LPZ-COM", "name": "Eje Valle Agrícola (La Paz ↔ Cd. Constitución)", "source": [-110.31, 24.14], "target": [-111.66, 25.03], "flow_index": 71, "corridor": "CORR-VALLE-COMONDU"},
            {"id": "ARC-COM-LOR", "name": "Eje Golfo Norte (Cd. Constitución ↔ Loreto)", "source": [-111.66, 25.03], "target": [-111.35, 26.01], "flow_index": 54, "corridor": "CORR-NORTE-LORETO-MULEGE"},
            {"id": "ARC-LOR-SRO", "name": "Corredor Mar de Cortés (Loreto ↔ Santa Rosalía)", "source": [-111.35, 26.01], "target": [-112.27, 27.34], "flow_index": 48, "corridor": "CORR-NORTE-LORETO-MULEGE"},
            {"id": "ARC-SRO-GNE", "name": "Eje Transpeninsular Norte (Santa Rosalía ↔ Guerrero Negro)", "source": [-112.27, 27.34], "target": [-114.05, 27.97], "flow_index": 42, "corridor": "CORR-NORTE-LORETO-MULEGE"},
        ],
    }

    (OUT_DATA_DIR / "city_science_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8"
    )
    elapsed = round(time.perf_counter() - t0, 2)
    print(f"DONE in {elapsed}s! Total 3D buildings indexed: {total_buildings:,} | Zoning parcels: {z_id_seq - 1:,}")
    return summary


if __name__ == "__main__":
    build_datastore()
