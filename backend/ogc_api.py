"""Native OGC API Family (/ogc/) — Features, Tiles (MVT), Processes, and Records for BCS2050.

Enables direct QGIS, ArcGIS Pro, MapLibre/deck.gl, and OGC standards interoperability
across 396,823 3D buildings, 79,515 zoning parcels, 15 vector layers, simulation jobs,
and 167 ISO 19115 metadata records.
"""

from __future__ import annotations

import math
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import mapbox_vector_tile
import mercantile
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from shapely.geometry import box as shapely_box, shape as shapely_shape
from shapely.ops import transform as shapely_transform

from backend.cad_bim_bridge import (
    export_civil3d_dxf,
    export_iso19650_bim_package,
    resolve_export_bbox,
)
from backend.metadata_catalog import build_iso19115_metadata_catalog
from backend.simulation_bridge import compute_goal_gap, run_twin_simulation
from backend.spatial_store import LAYER_FILES, SPATIAL_STORE, load_layer_geojson

PREFIX = "/ogc"
router = APIRouter(prefix=PREFIX, tags=["OGC API Family (Features / Tiles / Processes / Records)"])

BCS_BBOX: list[float] = [-115.2, 22.8, -109.2, 28.1]
WEBMERCATOR_R = 6_378_137.0

COLLECTION_META: dict[str, dict[str, Any]] = {
    "buildings": {
        "title": "BCS 3D Edificios (396,823 OpenBuildings 2.5D)",
        "description": "396,823 huellas edificadas con altura, niveles, solar_kwp y surge_risk en 9 ciudades.",
        "itemType": "feature",
    },
    "zoning_parcels": {
        "title": "Zonificación Secundaria CUS/COS (79,515 predios)",
        "description": "Polígonos normativos armonizados PMDU con COS, CUS y niveles máximos.",
        "itemType": "feature",
    },
    "agebs": {"title": "AGEBs City Science & Capacidad (1,155)", "description": "Polígonos censales calibrados 2025 con índices Aretian."},
    "municipalities": {"title": "Municipios de Baja California Sur (5)", "description": "Límites municipales INEGI Marco Geoestadístico."},
    "aquifers": {"title": "Acuíferos CONAGUA DOF 2023 (40)", "description": "Disponibilidad Media Anual oficial CONAGUA 2023."},
    "tandeo": {"title": "Sectores de Tandeo OOMSAPAS La Paz (280)", "description": "Sectores de tandeo hídrico urbano en La Paz."},
    "power_lines": {"title": "Red Eléctrica SIBCS Líneas", "description": "Líneas de transmisión eléctrica de alta/media tensión SIBCS."},
    "substations": {"title": "Subestaciones Eléctricas SIBCS", "description": "Nodos y subestaciones de transformación CFE/SIBCS."},
    "power_plants": {"title": "Plantas de Generación BCS", "description": "Centrales de generación térmica y renovable BCS."},
    "planned_projects": {"title": "Proyectos Estratégicos 2035 (Desaladoras & Energía)", "description": "Cartera estratégica de infraestructura hídrica y energética."},
    "interconnections": {"title": "Interconexiones Eléctricas Propuestas", "description": "Corredores de enlace eléctrico regional."},
    "services": {"title": "Equipamiento Urbano Esencial (3,510)", "description": "Salud, educación y equipamiento cívico INEGI DENUE."},
    "transit_stops": {"title": "Paradas de Transporte Público", "description": "Paraderos troncales de transporte urbano."},
    "transit_lines": {"title": "Rutas y Corredores de Transporte", "description": "Ejes de transporte urbano colectivo."},
    "poer_ugas": {"title": "UGAs POER BCS (1,990 polígonos)", "description": "Programa de Ordenamiento Ecológico Regional de BCS."},
    "anps": {"title": "Áreas Naturales Protegidas CONANP (76)", "description": "Polígonos de conservación ecológica federales y estatales."},
    "waste_sites": {"title": "Sitios de Disposición Final de Residuos (11)", "description": "Rellenos sanitarios y sitios registrados."},
    "records": {
        "title": "Catálogo OGC API - Records (167 registros ISO 19115 + SPDX)",
        "description": "Metadatos buscables de las capas del Gemelo Digital y panel.bcs2050.com.",
        "itemType": "record",
    },
}

PROCESSES_CATALOG: dict[str, dict[str, Any]] = {
    "bcs-scenario-simulation-2050": {
        "id": "bcs-scenario-simulation-2050",
        "title": "BCS2050 Counterfactual Trajectory Simulation (2025–2050)",
        "description": "Ejecuta trayectorias contrafactuales de morfología, SDI-100, solar e hidratación hídrica 2050.",
        "version": "2.0.0",
        "jobControlOptions": ["sync-execute", "async-execute"],
        "outputTransmission": ["value"],
        "inputs": {"scope_id": "03", "scenario_name": "COMPACT_SUSTAINABLE_2050", "target_year": 2050},
    },
    "bcs-goal-gap-analysis": {
        "id": "bcs-goal-gap-analysis",
        "title": "BCS2050 Goal-Gap Optimization Solver",
        "description": "Calcula brecha de vivienda infill, MW solares, desalación lps y CAPEX al 2050.",
        "version": "2.0.0",
        "jobControlOptions": ["sync-execute", "async-execute"],
        "outputTransmission": ["value"],
        "inputs": {"scope_id": "03", "target_city15_score": 88.0},
    },
    "bcs-cad-dxf-export": {
        "id": "bcs-cad-dxf-export",
        "title": "Civil 3D / InfraWorks Metric DXF R2018 Exporter (UTM Zone 12N)",
        "description": "Compila geometría métrica 3D UTM12N (EPSG:32612) lista para Autodesk Civil 3D.",
        "version": "2.0.0",
        "jobControlOptions": ["sync-execute", "async-execute"],
        "outputTransmission": ["value"],
        "inputs": {"corridor": "el_tezal"},
    },
    "bcs-bim-iso19650-export": {
        "id": "bcs-bim-iso19650-export",
        "title": "ISO 19650-2 Revit / Navisworks BIM Package Exporter",
        "description": "Genera envolventes COS/CUS y parámetros BIM ISO 19650 para el corredor seleccionado.",
        "version": "2.0.0",
        "jobControlOptions": ["sync-execute", "async-execute"],
        "outputTransmission": ["value"],
        "inputs": {"corridor": "el_tezal"},
    },
}

_JOBS_LOCK = threading.Lock()
_PROCESS_JOBS: dict[str, dict[str, Any]] = {}
_PROCESS_POOL = ThreadPoolExecutor(max_workers=2)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/") + PREFIX


def _parse_bbox(bbox: str | None) -> tuple[float, float, float, float] | None:
    if not bbox:
        return None
    parts = [p.strip() for p in bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="bbox must be minx,miny,maxx,maxy in EPSG:4326")
    try:
        vals = (float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid numeric values in bbox") from exc
    if vals[0] >= vals[2] or vals[1] >= vals[3]:
        raise HTTPException(status_code=400, detail="bbox min must be strictly less than max")
    return vals


def _lonlat_to_webmercator(x: float, y: float, z: float | None = None) -> tuple[float, float]:
    clamped_lat = max(-85.05112878, min(85.05112878, y))
    mx = WEBMERCATOR_R * math.radians(x)
    my = WEBMERCATOR_R * math.log(math.tan(math.pi / 4.0 + math.radians(clamped_lat) / 2.0))
    return mx, my


def _building_to_geojson(b: dict[str, Any]) -> dict[str, Any]:
    ring = list(b["polygon"])
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    props = {k: v for k, v in b.items() if k != "polygon"}
    return {
        "type": "Feature",
        "id": b.get("building_id") or str(b["id"]),
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": props,
    }


def _zoning_to_geojson(z: dict[str, Any]) -> dict[str, Any]:
    ring = list(z["polygon"])
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    props = {k: v for k, v in z.items() if k != "polygon"}
    return {
        "type": "Feature",
        "id": z.get("zone_id") or str(z["id"]),
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": props,
    }


@router.get("")
@router.get("/")
def ogc_landing(request: Request) -> dict[str, Any]:
    base = _base_url(request)
    return {
        "title": "BCS2050 Regional & Urban Digital Twin OGC API",
        "description": "OGC API - Features, Tiles (MVT), Processes, and Records for Baja California Sur.",
        "links": [
            {"href": f"{base}", "rel": "self", "type": "application/json", "title": "This document"},
            {"href": f"{base}/conformance", "rel": "conformance", "type": "application/json", "title": "OGC API conformance classes"},
            {"href": f"{base}/collections", "rel": "data", "type": "application/json", "title": "Spatial feature & record collections"},
            {"href": f"{base}/tileMatrixSets", "rel": "http://www.opengis.net/def/rel/ogc/1.0/tiling-schemes", "type": "application/json", "title": "TileMatrixSets"},
            {"href": f"{base}/processes", "rel": "http://www.opengis.net/def/rel/ogc/1.0/processes", "type": "application/json", "title": "Simulation & export processes"},
            {"href": f"{base}/collections/records/items", "rel": "catalog", "type": "application/geo+json", "title": "ISO 19115 Records catalog"},
        ],
    }


@router.get("/conformance")
def ogc_conformance() -> dict[str, Any]:
    return {
        "conformsTo": [
            "http://www.opengis.net/spec/ogcapi-common-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-common-2/1.0/conf/collections",
            "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson",
            "http://www.opengis.net/spec/ogcapi-tiles-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-tiles-1/1.0/conf/tileset",
            "http://www.opengis.net/spec/ogcapi-tiles-1/1.0/conf/mvt",
            "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-records-1/1.0/conf/core",
        ]
    }


def _collection_descriptor(cid: str, base: str) -> dict[str, Any]:
    meta = COLLECTION_META[cid]
    links = [
        {"href": f"{base}/collections/{cid}", "rel": "self", "type": "application/json"},
        {"href": f"{base}/collections/{cid}/items", "rel": "items", "type": "application/geo+json"},
    ]
    if cid != "records":
        links.append(
            {
                "href": f"{base}/collections/{cid}/tiles",
                "rel": "http://www.opengis.net/def/rel/ogc/1.0/tilesets-vector",
                "type": "application/json",
            }
        )
    return {
        "id": cid,
        "title": meta["title"],
        "description": meta["description"],
        "itemType": meta.get("itemType", "feature"),
        "crs": ["http://www.opengis.net/def/crs/OGC/1.3/CRS84"],
        "extent": {"spatial": {"bbox": [BCS_BBOX], "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"}},
        "links": links,
    }


@router.get("/collections")
def ogc_collections(request: Request) -> dict[str, Any]:
    base = _base_url(request)
    return {
        "links": [{"href": f"{base}/collections", "rel": "self", "type": "application/json"}],
        "collections": [_collection_descriptor(cid, base) for cid in COLLECTION_META],
    }


@router.get("/collections/{collection_id}")
def ogc_collection_detail(collection_id: str, request: Request) -> dict[str, Any]:
    if collection_id not in COLLECTION_META:
        raise HTTPException(status_code=404, detail=f"Unknown OGC collection '{collection_id}'")
    return _collection_descriptor(collection_id, _base_url(request))


@router.get("/collections/records/items")
def ogc_records_items(
    request: Request,
    q: str | None = Query(default=None),
    data_nature: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> JSONResponse:
    base = _base_url(request)
    cat = build_iso19115_metadata_catalog()
    recs = cat["records"]
    if q:
        q_low = q.strip().lower()
        recs = [
            r
            for r in recs
            if q_low in f"{r['identifier']} {r['title']} {r['abstract']} {r['source_agency']}".lower()
        ]
    if data_nature:
        recs = [r for r in recs if r.get("data_nature") == data_nature]

    total = len(recs)
    sliced = recs[offset : offset + limit]
    features = [
        {
            "type": "Feature",
            "id": r["identifier"],
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-115.2, 22.8], [-109.2, 22.8], [-109.2, 28.1], [-115.2, 28.1], [-115.2, 22.8]]],
            },
            "properties": r,
            "links": [
                {"href": f"{base}/collections/records/items/{r['identifier']}", "rel": "self", "type": "application/geo+json"}
            ],
        }
        for r in sliced
    ]
    return JSONResponse(
        content={
            "type": "FeatureCollection",
            "numberMatched": total,
            "numberReturned": len(features),
            "timeStamp": _utc_iso(),
            "features": features,
            "links": [{"href": str(request.url), "rel": "self", "type": "application/geo+json"}],
        },
        media_type="application/geo+json",
    )


@router.get("/collections/records/items/{record_id}")
def ogc_record_item(record_id: str, request: Request) -> JSONResponse:
    cat = build_iso19115_metadata_catalog()
    rec = next((r for r in cat["records"] if r["identifier"] == record_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Metadata record '{record_id}' not found")
    return JSONResponse(
        content={
            "type": "Feature",
            "id": rec["identifier"],
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-115.2, 22.8], [-109.2, 22.8], [-109.2, 28.1], [-115.2, 28.1], [-115.2, 22.8]]],
            },
            "properties": rec,
        },
        media_type="application/geo+json",
    )


@router.get("/collections/{collection_id}/items")
def ogc_collection_items(
    collection_id: str,
    request: Request,
    bbox: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    municipality_code: str | None = Query(default=None),
    city: str | None = Query(default=None),
) -> JSONResponse:
    if collection_id not in COLLECTION_META or collection_id == "records":
        raise HTTPException(status_code=404, detail=f"Unknown OGC feature collection '{collection_id}'")

    parsed_bbox = _parse_bbox(bbox)
    base = _base_url(request)

    if collection_id == "buildings":
        bx = parsed_bbox or (-110.33, 24.13, -110.29, 24.16)
        rows = SPATIAL_STORE.query_buildings(
            minx=bx[0], miny=bx[1], maxx=bx[2], maxy=bx[3], city=city, limit=min(5000, limit + offset)
        )
        sliced = rows[offset : offset + limit]
        feats = [_building_to_geojson(r) for r in sliced]
        matched = len(rows)
    elif collection_id == "zoning_parcels":
        bx = parsed_bbox or (-110.33, 24.13, -110.29, 24.16)
        rows = SPATIAL_STORE.query_zoning(minx=bx[0], miny=bx[1], maxx=bx[2], maxy=bx[3], limit=min(5000, limit + offset))
        sliced = rows[offset : offset + limit]
        feats = [_zoning_to_geojson(r) for r in sliced]
        matched = len(rows)
    else:
        fc = load_layer_geojson(collection_id)
        all_feats = fc.get("features") or []
        filtered: list[dict[str, Any]] = []
        bbox_poly = shapely_box(*parsed_bbox) if parsed_bbox else None
        for idx, feat in enumerate(all_feats):
            props = feat.get("properties") or {}
            if municipality_code and str(props.get("municipality_code") or props.get("mun_code") or "") != municipality_code:
                continue
            if bbox_poly is not None:
                try:
                    if not shapely_shape(feat["geometry"]).intersects(bbox_poly):
                        continue
                except Exception:
                    continue
            copy_f = dict(feat)
            if "id" not in copy_f:
                copy_f["id"] = str(props.get("cvegeo_ageb") or props.get("aquifer_code") or f"{collection_id}-{idx}")
            filtered.append(copy_f)
        matched = len(filtered)
        feats = filtered[offset : offset + limit]

    links = [{"href": str(request.url), "rel": "self", "type": "application/geo+json"}]
    if offset + len(feats) < matched:
        links.append(
            {
                "href": f"{base}/collections/{collection_id}/items?limit={limit}&offset={offset + limit}",
                "rel": "next",
                "type": "application/geo+json",
            }
        )
    return JSONResponse(
        content={
            "type": "FeatureCollection",
            "numberMatched": matched,
            "numberReturned": len(feats),
            "timeStamp": _utc_iso(),
            "features": feats,
            "links": links,
        },
        media_type="application/geo+json",
    )


@router.get("/collections/{collection_id}/items/{feature_id}")
def ogc_collection_feature_by_id(collection_id: str, feature_id: str) -> JSONResponse:
    if collection_id == "buildings":
        try:
            pk = int(feature_id)
            b = SPATIAL_STORE.get_building_by_id(pk)
            if b:
                return JSONResponse(
                    content={"type": "Feature", "id": str(b["id"]), "geometry": {"type": "Point", "coordinates": [b["lon"], b["lat"]]}, "properties": b},
                    media_type="application/geo+json",
                )
        except ValueError:
            pass
        raise HTTPException(status_code=404, detail=f"Building feature '{feature_id}' not found")

    if collection_id not in LAYER_FILES:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")
    fc = load_layer_geojson(collection_id)
    for idx, f in enumerate(fc.get("features") or []):
        props = f.get("properties") or {}
        fid = str(f.get("id") or props.get("cvegeo_ageb") or props.get("aquifer_code") or f"{collection_id}-{idx}")
        if fid == feature_id:
            return JSONResponse(content={**f, "id": fid}, media_type="application/geo+json")
    raise HTTPException(status_code=404, detail=f"Feature '{feature_id}' not found in '{collection_id}'")


@router.get("/tileMatrixSets")
def ogc_tile_matrix_sets(request: Request) -> dict[str, Any]:
    base = _base_url(request)
    return {
        "tileMatrixSets": [
            {
                "id": "WebMercatorQuad",
                "title": "Google Maps Compatible / WebMercatorQuad (EPSG:3857)",
                "uri": "http://www.opengis.net/def/tilematrixset/OGC/1.0/WebMercatorQuad",
                "links": [{"href": f"{base}/tileMatrixSets/WebMercatorQuad", "rel": "self", "type": "application/json"}],
            }
        ]
    }


@router.get("/tileMatrixSets/WebMercatorQuad")
def ogc_web_mercator_quad() -> dict[str, Any]:
    matrices = []
    initial_res = 156543.03392804097
    for z in range(19):
        dim = 1 << z
        matrices.append(
            {
                "id": str(z),
                "scaleDenominator": round(initial_res / (0.00028 * (1 << z)), 2),
                "cellSize": initial_res / (1 << z),
                "cornerOfOrigin": "topLeft",
                "pointOfOrigin": [-20037508.3427892, 20037508.3427892],
                "tileWidth": 256,
                "tileHeight": 256,
                "matrixWidth": dim,
                "matrixHeight": dim,
            }
        )
    return {
        "id": "WebMercatorQuad",
        "title": "WebMercatorQuad (EPSG:3857)",
        "crs": "http://www.opengis.net/def/crs/EPSG/0/3857",
        "tileMatrices": matrices,
    }


@router.get("/collections/{collection_id}/tiles")
def ogc_collection_tilesets(collection_id: str, request: Request) -> dict[str, Any]:
    if collection_id not in COLLECTION_META or collection_id == "records":
        raise HTTPException(status_code=404, detail=f"Unknown vector tile collection '{collection_id}'")
    base = _base_url(request)
    return {
        "tilesets": [
            {
                "title": f"{COLLECTION_META[collection_id]['title']} · Vector Tiles (MVT)",
                "tileMatrixSetURI": "http://www.opengis.net/def/tilematrixset/OGC/1.0/WebMercatorQuad",
                "dataType": "vector",
                "links": [
                    {
                        "href": f"{base}/collections/{collection_id}/tiles/WebMercatorQuad",
                        "rel": "self",
                        "type": "application/json",
                    },
                    {
                        "href": f"{base}/collections/{collection_id}/tiles/WebMercatorQuad/{{tileMatrix}}/{{tileRow}}/{{tileCol}}.mvt",
                        "rel": "item",
                        "type": "application/vnd.mapbox-vector-tile",
                        "templated": True,
                    },
                ],
            }
        ]
    }


@router.get("/collections/{collection_id}/tiles/WebMercatorQuad")
def ogc_collection_tileset_detail(collection_id: str, request: Request) -> dict[str, Any]:
    if collection_id not in COLLECTION_META or collection_id == "records":
        raise HTTPException(status_code=404, detail=f"Unknown vector tile collection '{collection_id}'")
    base = _base_url(request)
    return {
        "title": COLLECTION_META[collection_id]["title"],
        "tileMatrixSetId": "WebMercatorQuad",
        "dataType": "vector",
        "crs": "http://www.opengis.net/def/crs/EPSG/0/3857",
        "links": [
            {
                "href": f"{base}/collections/{collection_id}/tiles/WebMercatorQuad/{{tileMatrix}}/{{tileRow}}/{{tileCol}}.mvt",
                "rel": "item",
                "type": "application/vnd.mapbox-vector-tile",
                "templated": True,
            }
        ],
    }


def _to_mvt_safe_props(props: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for k, v in props.items():
        if isinstance(v, (str, int, float, bool)):
            cleaned[k] = v
    return cleaned


@router.get("/collections/{collection_id}/tiles/WebMercatorQuad/{z}/{y}/{x}.mvt")
def ogc_collection_mvt_tile(collection_id: str, z: int, y: int, x: int) -> Response:
    if collection_id not in COLLECTION_META or collection_id == "records":
        raise HTTPException(status_code=404, detail=f"Unknown vector tile collection '{collection_id}'")
    if z < 0 or z > 18:
        raise HTTPException(status_code=400, detail="Tile zoom level z must be between 0 and 18")

    ll_bounds = mercantile.bounds(x, y, z)
    xy_bounds = mercantile.xy_bounds(x, y, z)
    clip_box_ll = shapely_box(ll_bounds.west, ll_bounds.south, ll_bounds.east, ll_bounds.north)
    clip_box_xy = shapely_box(xy_bounds.left, xy_bounds.bottom, xy_bounds.right, xy_bounds.top)

    raw_features: list[dict[str, Any]] = []
    if collection_id == "buildings":
        if z >= 12:
            rows = SPATIAL_STORE.query_buildings(
                minx=ll_bounds.west, miny=ll_bounds.south, maxx=ll_bounds.east, maxy=ll_bounds.north, limit=5000
            )
            raw_features = [_building_to_geojson(r) for r in rows]
    elif collection_id == "zoning_parcels":
        if z >= 11:
            rows = SPATIAL_STORE.query_zoning(
                minx=ll_bounds.west, miny=ll_bounds.south, maxx=ll_bounds.east, maxy=ll_bounds.north, limit=4500
            )
            raw_features = [_zoning_to_geojson(r) for r in rows]
    else:
        fc = load_layer_geojson(collection_id)
        for feat in fc.get("features") or []:
            try:
                g = shapely_shape(feat["geometry"])
                if g.intersects(clip_box_ll):
                    raw_features.append(feat)
            except Exception:
                continue

    mvt_features: list[dict[str, Any]] = []
    for feat in raw_features:
        try:
            g_ll = shapely_shape(feat["geometry"])
            g_xy = shapely_transform(_lonlat_to_webmercator, g_ll)
            clipped = g_xy.intersection(clip_box_xy)
            if clipped.is_empty:
                continue
            mvt_features.append(
                {
                    "geometry": clipped,
                    "properties": _to_mvt_safe_props(feat.get("properties") or {}),
                }
            )
        except Exception:
            continue

    tile_bytes = mapbox_vector_tile.encode(
        [{"name": collection_id, "features": mvt_features}],
        default_options={"quantize_bounds": (xy_bounds.left, xy_bounds.bottom, xy_bounds.right, xy_bounds.top), "extents": 4096},
    )
    return Response(
        content=tile_bytes,
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": "public, max-age=3600"},
    )


class ProcessExecutionRequest(BaseModel):
    inputs: dict[str, Any] = Field(default_factory=dict)
    mode: str | None = None


def _execute_process_sync(process_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
    if process_id == "bcs-scenario-simulation-2050":
        return run_twin_simulation(
            scope_id=str(inputs.get("scope_id", "03")),
            scenario_name=str(inputs.get("scenario_name", "COMPACT_SUSTAINABLE_2050")),
            target_year=int(inputs.get("target_year", 2050)),
            custom_levers=inputs.get("custom_levers"),
        )
    if process_id == "bcs-goal-gap-analysis":
        return compute_goal_gap(
            scope_id=str(inputs.get("scope_id", "03")),
            target_city15_score=float(inputs.get("target_city15_score", 88.0)),
            target_infill_share_pct=float(inputs.get("target_infill_share_pct", 68.0)),
            target_ptar_reuse_pct=float(inputs.get("target_ptar_reuse_pct", 72.0)),
            target_rooftop_solar_pct=float(inputs.get("target_rooftop_solar_pct", 38.0)),
            target_suds_coverage_pct=float(inputs.get("target_suds_coverage_pct", 85.0)),
        )
    if process_id == "bcs-cad-dxf-export":
        corridor = str(inputs.get("corridor", "el_tezal"))
        x0, y0, x1, y1, slug, display_label = resolve_export_bbox(corridor, None, None, None, None, None)
        dxf_bytes = export_civil3d_dxf(minx=x0, miny=y0, maxx=x1, maxy=y1, label=display_label)
        return {
            "format": "AutoCAD DXF R2018 (EPSG:32612)",
            "slug": slug,
            "byte_length": len(dxf_bytes),
            "download_url": f"/api/twin/export/dxf?corridor={corridor}",
        }
    if process_id == "bcs-bim-iso19650-export":
        corridor = str(inputs.get("corridor", "el_tezal"))
        x0, y0, x1, y1, slug, display_label = resolve_export_bbox(corridor, None, None, None, None, None)
        return export_iso19650_bim_package(minx=x0, miny=y0, maxx=x1, maxy=y1, label=display_label)
    raise HTTPException(status_code=404, detail=f"Unknown OGC Process '{process_id}'")


@router.get("/processes")
def ogc_processes_list() -> dict[str, Any]:
    return {"processes": list(PROCESSES_CATALOG.values())}


@router.get("/processes/{process_id}")
def ogc_process_detail(process_id: str) -> dict[str, Any]:
    if process_id not in PROCESSES_CATALOG:
        raise HTTPException(status_code=404, detail=f"Unknown OGC Process '{process_id}'")
    return PROCESSES_CATALOG[process_id]


@router.post("/processes/{process_id}/execution")
def ogc_process_execute(process_id: str, body: ProcessExecutionRequest, request: Request) -> JSONResponse:
    if process_id not in PROCESSES_CATALOG:
        raise HTTPException(status_code=404, detail=f"Unknown OGC Process '{process_id}'")

    prefer = request.headers.get("prefer", "").lower()
    is_async = body.mode == "async" or "respond-async" in prefer
    base = _base_url(request)
    job_id = f"job-{uuid.uuid4().hex[:12]}"

    if not is_async:
        result = _execute_process_sync(process_id, body.inputs)
        return JSONResponse(status_code=200, content={"jobID": job_id, "status": "successful", "results": result})

    job_entry = {
        "jobID": job_id,
        "processID": process_id,
        "type": "process",
        "status": "accepted",
        "created": _utc_iso(),
        "finished": None,
        "results": None,
        "error": None,
        "links": [{"href": f"{base}/jobs/{job_id}/results", "rel": "http://www.opengis.net/def/rel/ogc/1.0/results"}],
    }
    with _JOBS_LOCK:
        _PROCESS_JOBS[job_id] = job_entry

    def _run_bg() -> None:
        with _JOBS_LOCK:
            _PROCESS_JOBS[job_id]["status"] = "running"
        try:
            res = _execute_process_sync(process_id, body.inputs)
            with _JOBS_LOCK:
                _PROCESS_JOBS[job_id]["status"] = "successful"
                _PROCESS_JOBS[job_id]["finished"] = _utc_iso()
                _PROCESS_JOBS[job_id]["results"] = res
        except Exception as exc:  # noqa: BLE001
            with _JOBS_LOCK:
                _PROCESS_JOBS[job_id]["status"] = "failed"
                _PROCESS_JOBS[job_id]["finished"] = _utc_iso()
                _PROCESS_JOBS[job_id]["error"] = str(exc)

    _PROCESS_POOL.submit(_run_bg)
    return JSONResponse(
        status_code=201,
        content={k: v for k, v in job_entry.items() if k != "results"},
        headers={"Location": f"{base}/jobs/{job_id}"},
    )


@router.get("/jobs")
def ogc_jobs_list() -> dict[str, Any]:
    with _JOBS_LOCK:
        jobs = [{k: v for k, v in j.items() if k != "results"} for j in _PROCESS_JOBS.values()]
    return {"jobs": jobs}


@router.get("/jobs/{job_id}")
def ogc_job_status(job_id: str) -> dict[str, Any]:
    with _JOBS_LOCK:
        job = _PROCESS_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        return {k: v for k, v in job.items() if k != "results"}


@router.get("/jobs/{job_id}/results")
def ogc_job_results(job_id: str) -> JSONResponse:
    with _JOBS_LOCK:
        job = _PROCESS_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        status = job["status"]
        results = job.get("results")
        error = job.get("error")
    if status in {"accepted", "running"}:
        return JSONResponse(status_code=202, content={"jobID": job_id, "status": status})
    if status == "failed":
        raise HTTPException(status_code=500, detail=f"Job '{job_id}' failed: {error}")
    return JSONResponse(status_code=200, content=results)
