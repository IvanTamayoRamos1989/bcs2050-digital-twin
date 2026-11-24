"""High-speed R-Tree Spatial Store & Point/AGEB Diagnostic Inspector for BCS2050."""

from __future__ import annotations

import json
import math
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from backend.config import LAYERS_DIR, SQLITE_PATH, SUMMARY_PATH

LAYER_FILES: dict[str, str] = {
    "agebs": "agebs_city_science.geojson",
    "municipalities": "municipalities.geojson",
    "aquifers": "aquifers.geojson",
    "tandeo": "tandeo_lapaz.geojson",
    "power_lines": "power_lines.geojson",
    "substations": "substations.geojson",
    "power_plants": "power_plants.geojson",
    "planned_projects": "planned_projects.geojson",
    "interconnections": "interconnections.geojson",
    "services": "services.geojson",
    "transit_stops": "transit_stops.geojson",
    "transit_lines": "transit_lines.geojson",
    "poer_ugas": "poer_ugas.geojson",
    "anps": "anps.geojson",
    "waste_sites": "waste_sites.geojson",
}


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return round(2.0 * r * math.asin(min(1.0, math.sqrt(a))), 1)


@lru_cache(maxsize=1)
def load_summary() -> dict[str, Any]:
    if not SUMMARY_PATH.exists():
        raise FileNotFoundError(f"Summary JSON not found at {SUMMARY_PATH}. Run build_city_science_datastore.py first.")
    return json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=24)
def load_layer_geojson(layer_id: str) -> dict[str, Any]:
    fname = LAYER_FILES.get(layer_id)
    if not fname:
        raise KeyError(f"Unknown layer '{layer_id}'. Valid layers: {sorted(LAYER_FILES)}")
    fpath: Path = LAYERS_DIR / fname
    if not fpath.exists():
        raise FileNotFoundError(f"Layer GeoJSON missing: {fpath}")
    return json.loads(fpath.read_text(encoding="utf-8"))


class SpatialIndexManager:
    """Builds in-memory Shapely STRtrees for polygon intersections and queries SQLite R-Tree."""

    def __init__(self) -> None:
        self._trees: dict[str, tuple[STRtree, list[Any], list[dict[str, Any]]]] = {}
        self._ageb_by_id: dict[str, dict[str, Any]] = {}
        self._points_cache: dict[str, list[dict[str, Any]]] = {}

    def _ensure_polygon_index(self, layer_id: str) -> tuple[STRtree, list[Any], list[dict[str, Any]]]:
        if layer_id not in self._trees:
            fc = load_layer_geojson(layer_id)
            geoms = []
            props_list = []
            for feat in fc.get("features", []):
                g = shape(feat["geometry"])
                geoms.append(g)
                p = dict(feat.get("properties") or {})
                props_list.append(p)
                if layer_id == "agebs" and p.get("cvegeo_ageb"):
                    self._ageb_by_id[str(p["cvegeo_ageb"])] = p
            self._trees[layer_id] = (STRtree(geoms), geoms, props_list)
        return self._trees[layer_id]

    def _ensure_points(self, layer_id: str) -> list[dict[str, Any]]:
        if layer_id not in self._points_cache:
            fc = load_layer_geojson(layer_id)
            pts: list[dict[str, Any]] = []
            for feat in fc.get("features", []):
                geom = feat.get("geometry") or {}
                coords = geom.get("coordinates") or []
                if geom.get("type") == "Point" and len(coords) >= 2:
                    pts.append({"lon": float(coords[0]), "lat": float(coords[1]), "props": dict(feat.get("properties") or {})})
            self._points_cache[layer_id] = pts
        return self._points_cache[layer_id]

    def _find_containing_feature(self, layer_id: str, lon: float, lat: float) -> dict[str, Any] | None:
        tree, geoms, props_list = self._ensure_polygon_index(layer_id)
        pt = Point(lon, lat)
        for idx in tree.query(pt):
            if geoms[idx].contains(pt) or geoms[idx].intersects(pt):
                return props_list[idx]
        return None

    def query_buildings(
        self,
        *,
        minx: float,
        miny: float,
        maxx: float,
        maxy: float,
        city: str | None = None,
        limit: int = 8000,
        min_height: float = 0.0,
    ) -> list[dict[str, Any]]:
        if not SQLITE_PATH.exists():
            return []
        safe_limit = max(1, min(20_000, int(limit)))
        con = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
        try:
            sql = (
                "SELECT b.id, b.building_id, b.city_slug, b.city_name, b.mun_code, b.ageb_cvegeo, "
                "b.height_m, b.floors, b.footprint_m2, b.gfa_m2, b.ground_elev_m, b.solar_kwp, "
                "b.surge_risk, b.centroid_lon, b.centroid_lat, b.ring_json "
                "FROM buildings b "
                "JOIN buildings_rtree r ON b.id = r.id "
                "WHERE r.maxx >= ? AND r.minx <= ? AND r.maxy >= ? AND r.miny <= ? "
                "AND b.height_m >= ? "
            )
            params: list[Any] = [minx, maxx, miny, maxy, float(min_height)]
            if city:
                sql += "AND b.city_slug = ? "
                params.append(city)
            sql += "ORDER BY b.height_m DESC, b.footprint_m2 DESC LIMIT ?"
            params.append(safe_limit)
            rows = con.execute(sql, params).fetchall()
        finally:
            con.close()

        return [
            {
                "id": r[0],
                "building_id": r[1],
                "city_slug": r[2],
                "city_name": r[3],
                "mun_code": r[4],
                "ageb_cvegeo": r[5],
                "height_m": r[6],
                "floors": r[7],
                "footprint_m2": r[8],
                "gfa_m2": r[9],
                "ground_elev_m": r[10],
                "solar_kwp": r[11],
                "surge_risk": r[12],
                "lon": r[13],
                "lat": r[14],
                "polygon": json.loads(r[15]),
            }
            for r in rows
        ]

    def query_city_buildings_cesium(self, city_slug: str, limit: int = 3000) -> list[dict[str, Any]]:
        if not SQLITE_PATH.exists():
            return []
        safe_limit = max(100, min(6000, int(limit)))
        con = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
        try:
            rows = con.execute(
                "SELECT id, building_id, city_name, height_m, floors, footprint_m2, gfa_m2, "
                "ground_elev_m, solar_kwp, surge_risk, centroid_lon, centroid_lat, ring_json "
                "FROM buildings WHERE city_slug = ? ORDER BY footprint_m2 * height_m DESC LIMIT ?",
                (city_slug, safe_limit),
            ).fetchall()
        finally:
            con.close()
        return [
            {
                "id": r[0],
                "building_id": r[1],
                "city_name": r[2],
                "height_m": r[3],
                "floors": r[4],
                "footprint_m2": r[5],
                "gfa_m2": r[6],
                "ground_elev_m": r[7],
                "solar_kwp": r[8],
                "surge_risk": r[9],
                "lon": r[10],
                "lat": r[11],
                "polygon": json.loads(r[12]),
            }
            for r in rows
        ]

    def query_zoning(
        self,
        *,
        minx: float,
        miny: float,
        maxx: float,
        maxy: float,
        limit: int = 4500,
    ) -> list[dict[str, Any]]:
        if not SQLITE_PATH.exists():
            return []
        safe_limit = max(1, min(10_000, int(limit)))
        con = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
        try:
            rows = con.execute(
                "SELECT z.id, z.zone_id, z.city_name, z.mun_code, z.land_use_code, "
                "z.land_use_category_std, z.cos_max, z.cus_max, z.max_levels, z.area_ha, z.ring_json "
                "FROM zoning_parcels z "
                "JOIN zoning_rtree r ON z.id = r.id "
                "WHERE r.maxx >= ? AND r.minx <= ? AND r.maxy >= ? AND r.miny <= ? "
                "ORDER BY z.area_ha DESC LIMIT ?",
                (minx, maxx, miny, maxy, safe_limit),
            ).fetchall()
        finally:
            con.close()
        return [
            {
                "id": r[0],
                "zone_id": r[1],
                "city_name": r[2],
                "mun_code": r[3],
                "land_use_code": r[4],
                "category": r[5],
                "cos_max": r[6],
                "cus_max": r[7],
                "max_levels": r[8],
                "area_ha": r[9],
                "polygon": json.loads(r[10]),
            }
            for r in rows
        ]

    def get_building_by_id(self, building_pk: int) -> dict[str, Any] | None:
        if not SQLITE_PATH.exists():
            return None
        con = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
        try:
            r = con.execute(
                "SELECT id, building_id, city_slug, city_name, mun_code, ageb_cvegeo, height_m, floors, "
                "footprint_m2, gfa_m2, ground_elev_m, solar_kwp, surge_risk, centroid_lon, centroid_lat "
                "FROM buildings WHERE id = ?",
                (building_pk,),
            ).fetchone()
        finally:
            con.close()
        if not r:
            return None
        return {
            "id": r[0],
            "building_id": r[1],
            "city_slug": r[2],
            "city_name": r[3],
            "mun_code": r[4],
            "ageb_cvegeo": r[5],
            "height_m": r[6],
            "floors": r[7],
            "footprint_m2": r[8],
            "gfa_m2": r[9],
            "ground_elev_m": r[10],
            "solar_kwp": r[11],
            "surge_risk": r[12],
            "lon": r[13],
            "lat": r[14],
        }

    def inspect_location(
        self,
        *,
        lon: float,
        lat: float,
        building_pk: int | None = None,
        ageb_cvegeo: str | None = None,
    ) -> dict[str, Any]:
        self._ensure_polygon_index("agebs")
        building_info = self.get_building_by_id(building_pk) if building_pk is not None else None
        if building_info and not ageb_cvegeo and building_info.get("ageb_cvegeo"):
            ageb_cvegeo = str(building_info["ageb_cvegeo"])

        ageb_info = self._ageb_by_id.get(ageb_cvegeo) if ageb_cvegeo else None
        if ageb_info is None:
            ageb_info = self._find_containing_feature("agebs", lon, lat)

        aquifer_info = self._find_containing_feature("aquifers", lon, lat)
        tandeo_info = self._find_containing_feature("tandeo", lon, lat)
        poer_info = self._find_containing_feature("poer_ugas", lon, lat)
        anp_info = self._find_containing_feature("anps", lon, lat)

        # Zoning parcel lookup via tiny R-tree bbox
        zoning_hits = self.query_zoning(minx=lon - 0.0005, miny=lat - 0.0005, maxx=lon + 0.0005, maxy=lat + 0.0005, limit=5)
        zoning_info = None
        if zoning_hits:
            pt = Point(lon, lat)
            for zh in zoning_hits:
                poly = shape({"type": "Polygon", "coordinates": [zh["polygon"]]})
                if poly.contains(pt):
                    zoning_info = {k: v for k, v in zh.items() if k != "polygon"}
                    break
            if zoning_info is None:
                zoning_info = {k: v for k, v in zoning_hits[0].items() if k != "polygon"}

        # Nearest services (health, education) & transit stops with 1.28 walk detour
        services = self._ensure_points("services")
        nearest_by_cat: dict[str, list[dict[str, Any]]] = {"health": [], "education": [], "civic": []}
        for s in services:
            cat = str(s["props"].get("category", "civic"))
            d_m = round(_haversine_m(lon, lat, s["lon"], s["lat"]) * 1.28, 0)
            if d_m <= 12000:
                nearest_by_cat.setdefault(cat, []).append(
                    {
                        "name": s["props"].get("facility_name", "Equipamiento"),
                        "sector": s["props"].get("sector", cat),
                        "walk_m": d_m,
                        "walk_min": round(d_m / 80.0, 1),
                    }
                )
        for cat in nearest_by_cat:
            nearest_by_cat[cat] = sorted(nearest_by_cat[cat], key=lambda x: x["walk_m"])[:3]

        stops = self._ensure_points("transit_stops")
        nearest_stops = sorted(
            [
                {
                    "name": st["props"].get("name") or st["props"].get("stop_type", "Parada"),
                    "mode": st["props"].get("mode", "bus"),
                    "walk_m": round(_haversine_m(lon, lat, st["lon"], st["lat"]) * 1.28, 0),
                }
                for st in stops
            ],
            key=lambda x: x["walk_m"],
        )[:2]

        substations = self._ensure_points("substations")
        nearest_sub = min(
            [
                {
                    "name": sb["props"].get("name", "Subestación SIBCS"),
                    "voltage": sb["props"].get("voltage", ""),
                    "distance_km": round(_haversine_m(lon, lat, sb["lon"], sb["lat"]) / 1000.0, 2),
                }
                for sb in substations
            ],
            key=lambda x: x["distance_km"],
            default=None,
        )

        return {
            "coordinates": {"lon": round(lon, 5), "lat": round(lat, 5)},
            "building": building_info,
            "ageb": ageb_info,
            "zoning": zoning_info,
            "aquifer": aquifer_info,
            "tandeo_lapaz": tandeo_info,
            "poer_uga": poer_info,
            "protected_area": anp_info,
            "nearest_services": nearest_by_cat,
            "nearest_transit": nearest_stops,
            "nearest_substation": nearest_sub,
        }


SPATIAL_STORE = SpatialIndexManager()
