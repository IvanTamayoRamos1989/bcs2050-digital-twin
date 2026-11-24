"""Interoperability Bridge: Civil 3D / InfraWorks (.DXF UTM 12N), Revit ISO 19650 BIM, ACC/Tandem, and Lumion / Unreal (.OBJ + Cesium)."""

from __future__ import annotations

import io
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import ezdxf
from pyproj import Transformer

from backend.spatial_store import SPATIAL_STORE, load_layer_geojson

MAX_EXPORT_SPAN_DEG = 0.07

CORRIDOR_PRESETS: dict[str, dict[str, Any]] = {
    "el_tezal": {
        "id": "el_tezal",
        "label": "Corredor El Tezal · Los Cabos",
        "scope_id": "03008",
        "bbox": [-109.895, 22.885, -109.830, 22.930],
    },
    "la_paz_malecon": {
        "id": "la_paz_malecon",
        "label": "Malecón & Centro · La Paz",
        "scope_id": "03003",
        "bbox": [-110.335, 24.138, -110.295, 24.172],
    },
    "cabo_san_lucas_centro": {
        "id": "cabo_san_lucas_centro",
        "label": "Cabo San Lucas & Marina",
        "scope_id": "03008",
        "bbox": [-109.928, 22.874, -109.890, 22.906],
    },
    "san_jose_del_cabo": {
        "id": "san_jose_del_cabo",
        "label": "San José del Cabo & Estero",
        "scope_id": "03008",
        "bbox": [-109.715, 23.040, -109.675, 23.072],
    },
    "loreto_centro": {
        "id": "loreto_centro",
        "label": "Centro Histórico · Loreto",
        "scope_id": "03009",
        "bbox": [-111.358, 25.995, -111.328, 26.022],
    },
}

CINEMATIC_FLYTHROUGH_TOURS: list[dict[str, Any]] = [
    {
        "id": "el_tezal",
        "name": "Vuelo Aéreo · Corredor El Tezal (Los Cabos)",
        "short_label": "Vuelo El Tezal",
        "scope_id": "03008",
        "corridor_id": "el_tezal",
        "description": "Recorrido tipo InfraWorks/Lumion desde Marina Cabo San Lucas por Carretera Transpeninsular hasta polos infill de El Tezal.",
        "waypoints": [
            {
                "title": "01 · Marina & Arco CSL",
                "lon": -109.908,
                "lat": 22.883,
                "zoom": 13.4,
                "pitch": 58,
                "bearing": 35,
                "duration_ms": 2800,
            },
            {
                "title": "02 · Puerta El Tezal / Transpeninsular",
                "lon": -109.878,
                "lat": 22.898,
                "zoom": 14.2,
                "pitch": 62,
                "bearing": 52,
                "duration_ms": 5000,
            },
            {
                "title": "03 · Corredor Residencial & Infill 15-Min",
                "lon": -109.858,
                "lat": 22.907,
                "zoom": 14.5,
                "pitch": 65,
                "bearing": 18,
                "duration_ms": 5200,
            },
            {
                "title": "04 · Panorámica Corredor Turístico",
                "lon": -109.842,
                "lat": 22.912,
                "zoom": 13.7,
                "pitch": 59,
                "bearing": -40,
                "duration_ms": 5000,
            },
        ],
    },
    {
        "id": "la_paz_malecon",
        "name": "Vuelo Aéreo · Malecón & Centro (La Paz)",
        "short_label": "Vuelo Malecón LPZ",
        "scope_id": "03003",
        "corridor_id": "la_paz_malecon",
        "description": "Sobre-vuelo por Bahía de La Paz, Malecón Costero (<6m resiliencia), Centro Histórico y polígonos prioritarios de densificación.",
        "waypoints": [
            {
                "title": "01 · Bahía & Malecón Sur",
                "lon": -110.324,
                "lat": 24.152,
                "zoom": 13.6,
                "pitch": 60,
                "bearing": 42,
                "duration_ms": 2800,
            },
            {
                "title": "02 · Centro Histórico & Red Urbana",
                "lon": -110.312,
                "lat": 24.159,
                "zoom": 14.4,
                "pitch": 64,
                "bearing": 15,
                "duration_ms": 5000,
            },
            {
                "title": "03 · Distrito Solar & Tandeo Oriente",
                "lon": -110.303,
                "lat": 24.148,
                "zoom": 14.1,
                "pitch": 61,
                "bearing": -35,
                "duration_ms": 5000,
            },
            {
                "title": "04 · Ensenada & Frente Portuario",
                "lon": -110.318,
                "lat": 24.165,
                "zoom": 13.7,
                "pitch": 58,
                "bearing": -75,
                "duration_ms": 5000,
            },
        ],
    },
    {
        "id": "loreto_bahia",
        "name": "Vuelo Aéreo · Frente Costero (Loreto)",
        "short_label": "Vuelo Loreto",
        "scope_id": "03009",
        "corridor_id": "loreto_centro",
        "description": "Recorrido 3D sobre el núcleo patrimonial de Loreto, línea de costa e infraestructura hídrica del Parque Nacional Bahía de Loreto.",
        "waypoints": [
            {
                "title": "01 · Malecón & Mar de Cortés",
                "lon": -111.339,
                "lat": 26.011,
                "zoom": 13.8,
                "pitch": 60,
                "bearing": -45,
                "duration_ms": 2800,
            },
            {
                "title": "02 · Centro Misional Loreto",
                "lon": -111.345,
                "lat": 26.009,
                "zoom": 14.5,
                "pitch": 64,
                "bearing": -10,
                "duration_ms": 5000,
            },
            {
                "title": "03 · Borde Sierra La Giganta",
                "lon": -111.351,
                "lat": 26.005,
                "zoom": 13.9,
                "pitch": 58,
                "bearing": 40,
                "duration_ms": 5000,
            },
        ],
    },
]


@lru_cache(maxsize=1)
def _utm12n_transformer() -> Transformer:
    return Transformer.from_crs("EPSG:4326", "EPSG:32612", always_xy=True)


def _to_utm12n(lon: float, lat: float) -> tuple[float, float]:
    e, n = _utm12n_transformer().transform(float(lon), float(lat))
    return float(e), float(n)


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", text.strip()).strip("_").lower()
    return cleaned or "bcs2050_corredor"


def resolve_export_bbox(
    corridor: str | None = None,
    minx: float | None = None,
    miny: float | None = None,
    maxx: float | None = None,
    maxy: float | None = None,
    label: str | None = None,
) -> tuple[float, float, float, float, str, str]:
    """Resolve and clamp the export bounding box to max 0.07 deg span for sub-2s cloud generation."""
    if corridor and corridor in CORRIDOR_PRESETS:
        preset = CORRIDOR_PRESETS[corridor]
        bx0, by0, bx1, by1 = [float(v) for v in preset["bbox"]]
        display_label = label or str(preset["label"])
        return bx0, by0, bx1, by1, _slugify(preset["id"]), display_label

    if None not in (minx, miny, maxx, maxy):
        x0, x1 = sorted((float(minx), float(maxx)))  # type: ignore[arg-type]
        y0, y1 = sorted((float(miny), float(maxy)))  # type: ignore[arg-type]
        if (x1 - x0) > MAX_EXPORT_SPAN_DEG:
            cx = (x0 + x1) / 2.0
            x0, x1 = cx - MAX_EXPORT_SPAN_DEG / 2.0, cx + MAX_EXPORT_SPAN_DEG / 2.0
        if (y1 - y0) > MAX_EXPORT_SPAN_DEG:
            cy = (y0 + y1) / 2.0
            y0, y1 = cy - MAX_EXPORT_SPAN_DEG / 2.0, cy + MAX_EXPORT_SPAN_DEG / 2.0
        # Clamp strictly within BCS geographic bounds
        x0 = max(-116.5, min(-108.5, x0))
        x1 = max(-116.5, min(-108.5, x1))
        y0 = max(22.0, min(28.8, y0))
        y1 = max(22.0, min(28.8, y1))
        display_label = label or "Vista Personalizada BCS2050"
        return x0, y0, x1, y1, _slugify(display_label), display_label

    preset = CORRIDOR_PRESETS["el_tezal"]
    bx0, by0, bx1, by1 = [float(v) for v in preset["bbox"]]
    display_label = label or str(preset["label"])
    return bx0, by0, bx1, by1, "el_tezal", display_label


def _clean_ring(ring: list[list[float]]) -> list[tuple[float, float]]:
    pts = [(float(pt[0]), float(pt[1])) for pt in ring if isinstance(pt, (list, tuple)) and len(pt) >= 2]
    if len(pts) >= 2 and abs(pts[0][0] - pts[-1][0]) < 1e-9 and abs(pts[0][1] - pts[-1][1]) < 1e-9:
        pts = pts[:-1]
    return pts


def _project_ring_utm12n(ring: list[list[float]]) -> list[tuple[float, float]]:
    return [_to_utm12n(lon, lat) for lon, lat in _clean_ring(ring)]


def _in_bbox(lon: float, lat: float, minx: float, miny: float, maxx: float, maxy: float) -> bool:
    return minx <= lon <= maxx and miny <= lat <= maxy


def _line_intersects_bbox(coords: list[Any], minx: float, miny: float, maxx: float, maxy: float) -> bool:
    return any(isinstance(c, (list, tuple)) and len(c) >= 2 and _in_bbox(float(c[0]), float(c[1]), minx, miny, maxx, maxy) for c in coords)


def get_cinematic_flythrough_tours() -> list[dict[str, Any]]:
    return CINEMATIC_FLYTHROUGH_TOURS


def export_civil3d_dxf(
    *,
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
    label: str,
    max_buildings: int = 1500,
    max_zoning: int = 1000,
) -> bytes:
    """Generate a true-scale metric Autodesk AutoCAD/Civil 3D/InfraWorks DXF (R2018, EPSG:32612 UTM 12N)."""
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = 6  # Meters

    layers = doc.layers
    for layer_name, color in (
        ("BCS_BUILDINGS_3D", 4),
        ("BCS_ZONING_CUS_COS", 2),
        ("BCS_TRANSIT_STOPS", 3),
        ("BCS_POWER_SIBCS", 1),
        ("BCS_META_UTM12N", 7),
    ):
        if layer_name not in layers:
            layers.add(layer_name, color=color)

    msp = doc.modelspace()

    buildings = SPATIAL_STORE.query_buildings(minx=minx, miny=miny, maxx=maxx, maxy=maxy, limit=max_buildings)
    bldg_count = 0
    for b in buildings:
        ring_utm = _project_ring_utm12n(b.get("polygon") or [])
        if len(ring_utm) < 3:
            continue
        ground_elev = float(b.get("ground_elev_m") or 0.0)
        height_m = max(3.0, float(b.get("height_m") or 3.5))
        msp.add_lwpolyline(
            ring_utm,
            close=True,
            dxfattribs={
                "layer": "BCS_BUILDINGS_3D",
                "elevation": round(ground_elev, 2),
                "thickness": round(height_m, 2),
            },
        )
        bldg_count += 1

    parcels = SPATIAL_STORE.query_zoning(minx=minx, miny=miny, maxx=maxx, maxy=maxy, limit=max_zoning)
    zoning_count = 0
    for p in parcels:
        ring_utm = _project_ring_utm12n(p.get("polygon") or [])
        if len(ring_utm) < 3:
            continue
        msp.add_lwpolyline(
            ring_utm,
            close=True,
            dxfattribs={"layer": "BCS_ZONING_CUS_COS", "elevation": 0.0},
        )
        zoning_count += 1

    # Transit stops
    try:
        transit_fc = load_layer_geojson("transit_stops")
        for feat in transit_fc.get("features", []):
            geom = feat.get("geometry") or {}
            coords = geom.get("coordinates") or []
            if geom.get("type") == "Point" and len(coords) >= 2:
                lon, lat = float(coords[0]), float(coords[1])
                if _in_bbox(lon, lat, minx, miny, maxx, maxy):
                    e, n = _to_utm12n(lon, lat)
                    msp.add_circle((e, n, 0.0), radius=12.0, dxfattribs={"layer": "BCS_TRANSIT_STOPS"})
    except FileNotFoundError:
        pass

    # SIBCS power lines
    try:
        power_fc = load_layer_geojson("power_lines")
        for feat in power_fc.get("features", []):
            geom = feat.get("geometry") or {}
            gtype = geom.get("type")
            lines = (
                [geom.get("coordinates") or []]
                if gtype == "LineString"
                else (geom.get("coordinates") or [] if gtype == "MultiLineString" else [])
            )
            for line_coords in lines:
                if _line_intersects_bbox(line_coords, minx, miny, maxx, maxy):
                    pts_utm = [_to_utm12n(float(c[0]), float(c[1])) for c in line_coords if len(c) >= 2]
                    if len(pts_utm) >= 2:
                        msp.add_lwpolyline(pts_utm, close=False, dxfattribs={"layer": "BCS_POWER_SIBCS", "elevation": 12.0})
    except FileNotFoundError:
        pass

    # Origin metadata annotation in UTM 12N
    e_min, n_min = _to_utm12n(minx, miny)
    msp.add_text(
        f"BCS2050 DIGITAL TWIN | {label} | EPSG:32612 (UTM 12N METERS) | BLDG={bldg_count} ZONING={zoning_count}",
        height=18.0,
        dxfattribs={"layer": "BCS_META_UTM12N", "insert": (e_min, n_min - 30.0)},
    )

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


def export_wavefront_obj3d(
    *,
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
    label: str,
    max_buildings: int = 1200,
) -> bytes:
    """Export centered metric 3D Wavefront OBJ mesh ready for Lumion, Unreal Engine, and Blender."""
    cx = (minx + maxx) / 2.0
    cy = (miny + maxy) / 2.0
    e0, n0 = _to_utm12n(cx, cy)

    buildings = SPATIAL_STORE.query_buildings(minx=minx, miny=miny, maxx=maxx, maxy=maxy, limit=max_buildings)

    min_ground = min((float(b.get("ground_elev_m") or 0.0) for b in buildings), default=0.0)
    e_sw, n_sw = _to_utm12n(minx, miny)
    e_ne, n_ne = _to_utm12n(maxx, maxy)

    lines: list[str] = [
        "# BCS2050 City Digital Twin - Wavefront 3D Export (Lumion / Unreal Engine)",
        f"# Region: {label}",
        "# CRS: EPSG:32612 (WGS 84 / UTM Zone 12N, Local Metric Origin, Y-Up)",
        f"# ORIGIN_E: {e0:.3f}",
        f"# ORIGIN_N: {n0:.3f}",
        f"# ORIGIN_LON: {cx:.6f}",
        f"# ORIGIN_LAT: {cy:.6f}",
        f"# BUILDINGS_REQUESTED: {len(buildings)}",
        "",
        "g BCS_Terrain_Base",
        f"v {e_sw - e0:.3f} {min_ground:.3f} {-(n_sw - n0):.3f}",
        f"v {e_ne - e0:.3f} {min_ground:.3f} {-(n_sw - n0):.3f}",
        f"v {e_ne - e0:.3f} {min_ground:.3f} {-(n_ne - n0):.3f}",
        f"v {e_sw - e0:.3f} {min_ground:.3f} {-(n_ne - n0):.3f}",
        "f 1 2 3 4",
        "",
        "g BCS_Buildings_3D",
    ]

    v_cursor = 5
    exported = 0
    for b in buildings:
        ring_utm = _project_ring_utm12n(b.get("polygon") or [])
        if len(ring_utm) < 3:
            continue
        base_y = float(b.get("ground_elev_m") or 0.0)
        height_m = max(3.0, float(b.get("height_m") or 3.5))
        top_y = base_y + height_m

        n_pts = len(ring_utm)
        base_indices: list[int] = []
        top_indices: list[int] = []

        for e, n in ring_utm:
            lx = e - e0
            lz = -(n - n0)
            lines.append(f"v {lx:.3f} {base_y:.3f} {lz:.3f}")
            base_indices.append(v_cursor)
            v_cursor += 1

        for e, n in ring_utm:
            lx = e - e0
            lz = -(n - n0)
            lines.append(f"v {lx:.3f} {top_y:.3f} {lz:.3f}")
            top_indices.append(v_cursor)
            v_cursor += 1

        # Vertical wall quads
        for i in range(n_pts):
            j = (i + 1) % n_pts
            lines.append(f"f {base_indices[i]} {base_indices[j]} {top_indices[j]} {top_indices[i]}")

        # Roof fan triangles
        t0 = top_indices[0]
        for k in range(1, n_pts - 1):
            lines.append(f"f {t0} {top_indices[k]} {top_indices[k + 1]}")

        exported += 1

    lines.insert(8, f"# BUILDINGS_EXPORTED: {exported}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def export_iso19650_bim_package(
    *,
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
    label: str,
    max_buildings: int = 600,
    max_zoning: int = 400,
) -> dict[str, Any]:
    """Generate an ISO 19650-2 BIM / Revit / ACC / Autodesk Tandem interoperability package."""
    buildings = SPATIAL_STORE.query_buildings(minx=minx, miny=miny, maxx=maxx, maxy=maxy, limit=max_buildings)
    parcels = SPATIAL_STORE.query_zoning(minx=minx, miny=miny, maxx=maxx, maxy=maxy, limit=max_zoning)

    revit_elements: list[dict[str, Any]] = []
    total_gfa = 0.0
    total_solar = 0.0
    surge_exposed = 0
    pre_clash_warnings = 0

    for b in buildings:
        ring_utm = _project_ring_utm12n(b.get("polygon") or [])
        if len(ring_utm) < 3:
            continue
        ce, cn = _to_utm12n(float(b["lon"]), float(b["lat"]))
        gfa = float(b.get("gfa_m2") or 0.0)
        solar = float(b.get("solar_kwp") or 0.0)
        surge = bool(b.get("surge_risk"))
        total_gfa += gfa
        total_solar += solar
        if surge:
            surge_exposed += 1
            pre_clash_warnings += 1

        revit_elements.append(
            {
                "building_id": b.get("building_id") or str(b["id"]),
                "city_name": b.get("city_name"),
                "ageb_cvegeo": b.get("ageb_cvegeo"),
                "centroid_utm12n_m": [round(ce, 2), round(cn, 2)],
                "footprint_utm12n_m": [[round(e, 2), round(n, 2)] for e, n in ring_utm],
                "base_elevation_m": round(float(b.get("ground_elev_m") or 0.0), 2),
                "height_m": round(float(b.get("height_m") or 3.5), 2),
                "levels": int(b.get("floors") or 1),
                "footprint_m2": round(float(b.get("footprint_m2") or 0.0), 2),
                "gfa_m2": round(gfa, 2),
                "solar_kwp": round(solar, 2),
                "surge_risk": surge,
                "revit_mcp_hint": "create_surface_based_element / Generic Massing in EPSG:32612",
            }
        )

    zoning_envelopes: list[dict[str, Any]] = []
    for p in parcels:
        ring_utm = _project_ring_utm12n(p.get("polygon") or [])
        if len(ring_utm) < 3:
            continue
        zoning_envelopes.append(
            {
                "zone_id": p.get("zone_id") or str(p["id"]),
                "land_use_code": p.get("land_use_code"),
                "category": p.get("category"),
                "cos_max": p.get("cos_max"),
                "cus_max": p.get("cus_max"),
                "max_levels": p.get("max_levels"),
                "area_ha": p.get("area_ha"),
                "vertices_utm12n_m": [[round(e, 2), round(n, 2)] for e, n in ring_utm],
            }
        )

    slug_upper = re.sub(r"[^A-Z0-9]+", "-", _slugify(label).upper()).strip("-")[:14] or "CORREDOR"
    return {
        "iso_19650": {
            "container_id": f"BCS2050-IMPLAN-{slug_upper}-ZZ-00-M3-UR-0001",
            "standard": "ISO 19650-2:2018",
            "suitability_code": "S2",
            "suitability_label": "Suitable for Information / BIM Coordination",
            "crs": "EPSG:32612",
            "units": "meters",
            "region_label": label,
            "bbox_wgs84": [round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)],
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "autodesk_cde": {
            "platform": "Autodesk Construction Cloud (ACC) / BIM Collaborate Pro / Autodesk Tandem",
            "aps_configured": bool(os.environ.get("AUTODESK_APS_CLIENT_ID", "").strip()),
            "tandem_facility_urn": os.environ.get("AUTODESK_TANDEM_FACILITY_URN", "").strip() or None,
            "supported_workflows": [
                "Revit Massing (revit-mcp / Dynamo)",
                "AutoCAD Civil 3D / InfraWorks (.dxf)",
                "Navisworks 4D / Clash Screening",
                "Autodesk Tandem Asset Lifecycle",
            ],
        },
        "summary": {
            "buildings_exported": len(revit_elements),
            "zoning_parcels_exported": len(zoning_envelopes),
            "total_gfa_m2": round(total_gfa, 1),
            "total_solar_kwp": round(total_solar, 1),
            "surge_exposed_count": surge_exposed,
            "pre_clash_warnings": pre_clash_warnings,
        },
        "revit_massing_elements": revit_elements,
        "zoning_envelopes": zoning_envelopes,
    }


def export_unreal_cesium_manifest(
    *,
    corridor_id: str | None,
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
    label: str,
) -> dict[str, Any]:
    """Generate a Cesium for Unreal Engine 5.4+ and Lumion LiveSync scene manifest."""
    cx = (minx + maxx) / 2.0
    cy = (miny + maxy) / 2.0
    e0, n0 = _to_utm12n(cx, cy)

    matching_tour = next((t for t in CINEMATIC_FLYTHROUGH_TOURS if t.get("corridor_id") == corridor_id), None)
    keyframes = matching_tour["waypoints"] if matching_tour else [
        {"title": label, "lon": round(cx, 6), "lat": round(cy, 6), "zoom": 14.0, "pitch": 62, "bearing": 25, "duration_ms": 5000}
    ]

    qs_bbox = f"minx={minx:.6f}&miny={miny:.6f}&maxx={maxx:.6f}&maxy={maxy:.6f}"
    qs_ref = f"corridor={corridor_id}" if corridor_id and corridor_id in CORRIDOR_PRESETS else qs_bbox

    return {
        "schema": "bcs2050.cesium_unreal.v1",
        "engine_targets": ["Unreal Engine 5.4+ (Cesium for Unreal)", "Lumion 2024+ LiveSync (.OBJ)", "Blender GIS"],
        "region_label": label,
        "CesiumGeoreference": {
            "OriginPlacement": "TrueOrigin",
            "OriginLatitude": round(cy, 6),
            "OriginLongitude": round(cx, 6),
            "OriginHeight": 0.0,
            "EPSG32612_Origin_Meters": [round(e0, 2), round(n0, 2)],
        },
        "tilesets": [
            {
                "id": "google_photorealistic_3d_tiles",
                "type": "Cesium3DTileset",
                "url": "https://tile.googleapis.com/v1/3dtiles/root.json",
                "requires_key": "GOOGLE_MAPS_API_KEY",
            },
            {
                "id": "cesium_world_terrain",
                "type": "CesiumIonAsset",
                "ion_asset_id": 1,
                "requires_key": "CESIUM_ION_TOKEN",
            },
            {
                "id": "bcs_buildings_mesh_obj",
                "type": "WavefrontOBJ",
                "url_path": f"/api/twin/export/obj3d?{qs_ref}",
                "crs": "EPSG:32612 Local Y-Up",
            },
            {
                "id": "bcs_civil3d_cad_dxf",
                "type": "AutoCAD_DXF_R2018",
                "url_path": f"/api/twin/export/dxf?{qs_ref}",
                "crs": "EPSG:32612 Meters",
            },
            {
                "id": "bcs_agebs_city_science",
                "type": "GeoJSON",
                "url_path": "/api/twin/layer/agebs",
            },
        ],
        "camera_sequence_keyframes": keyframes,
    }
