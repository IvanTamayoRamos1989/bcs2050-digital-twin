"""FastAPI Enterprise Gateway for the BCS2050 State-of-the-Art Digital Twin."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.cad_bim_bridge import (
    CORRIDOR_PRESETS,
    export_civil3d_dxf,
    export_iso19650_bim_package,
    export_unreal_cesium_manifest,
    export_wavefront_obj3d,
    get_cinematic_flythrough_tours,
    resolve_export_bbox,
)
from backend.config import (
    FRONTEND_DIST_DIR,
    get_3dtiles_tileset_url,
    get_allowed_origins,
    get_runtime_capabilities,
)
from backend.live_feeds import get_live_telemetry_summary
from backend.metadata_catalog import (
    CANONICAL_KPI_RECONCILIATION,
    build_iso19115_metadata_catalog,
)
from backend.ogc_api import router as ogc_router
from backend.ai_strategist import answer_strategist_chat_grounded
from backend.security import SecurityAndRateLimitMiddleware
from backend.sensorthings import get_pilot_schemas_catalog, router as sensorthings_router
from backend.simulation_bridge import (
    compare_twin_scenarios,
    compute_goal_gap,
    generate_recommendations,
    get_architecture_catalog,
    run_twin_simulation,
)
from backend.spatial_store import (
    LAYER_FILES,
    SPATIAL_STORE,
    ensure_spatial_data_ready,
    load_layer_geojson,
    load_summary,
)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    ensure_spatial_data_ready()
    yield


app = FastAPI(
    title="BCS2050 Regional & Urban Digital Twin API",
    version="2.0.0",
    description="Aretian-grade City Science & Esri-aligned Living Digital Twin API for Baja California Sur",
    lifespan=_lifespan,
)

# Register security/rate-limit middleware before CORSMiddleware so CORSMiddleware wraps outermost (401/429 keep CORS headers)
app.add_middleware(SecurityAndRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Prefer", "X-BCS-Planner-Token"],
)


class InspectRequest(BaseModel):
    lon: float
    lat: float
    building_pk: int | None = None
    ageb_cvegeo: str | None = None


class SimulateRequest(BaseModel):
    scope_id: str = "03"
    scenario_name: str = "COMPACT_SUSTAINABLE_2050"
    target_year: int = Field(default=2050, ge=2025, le=2050)
    custom_levers: dict[str, Any] | None = None


class GoalGapRequest(BaseModel):
    scope_id: str = "03"
    target_city15_score: float = Field(default=88.0, ge=40.0, le=99.0)
    target_infill_share_pct: float = Field(default=68.0, ge=10.0, le=95.0)
    target_ptar_reuse_pct: float = Field(default=72.0, ge=10.0, le=95.0)
    target_rooftop_solar_pct: float = Field(default=38.0, ge=5.0, le=90.0)
    target_suds_coverage_pct: float = Field(default=85.0, ge=10.0, le=100.0)


class ChatRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    scope_id: str = "03"
    scenario_name: str = "COMPACT_SUSTAINABLE_2050"
    language: str = Field(default="es", pattern="^(es|en)$")


@app.get("/api/twin/health")
def twin_health() -> dict[str, Any]:
    summary = load_summary()
    return {
        "status": "ok",
        "service": "bcs2050-digital-twin",
        "buildings_3d_indexed": summary["state"]["buildings_3d_count"],
        "zoning_parcels_indexed": summary["state"]["zoning_parcels_count"],
        "agebs_enriched": summary["state"]["agebs_count"],
        "capabilities": get_runtime_capabilities(),
    }


@app.get("/api/twin/overview")
def twin_overview() -> dict[str, Any]:
    summary = load_summary()
    state = {
        **summary["state"],
        "population_inegi_2020_official": CANONICAL_KPI_RECONCILIATION["state"]["population_inegi_2020_official"],
        "population_2020_urban_agebs": CANONICAL_KPI_RECONCILIATION["state"]["population_2020_urban_agebs"],
        "aquifers_bcs_official_count": CANONICAL_KPI_RECONCILIATION["state"]["aquifers_bcs_official_count"],
        "aquifers_bcs_no_availability_count": CANONICAL_KPI_RECONCILIATION["state"]["aquifers_bcs_no_availability_count"],
        "aquifers_strict_deficit_count": CANONICAL_KPI_RECONCILIATION["state"]["aquifers_strict_deficit_count"],
    }
    muns_out: dict[str, Any] = {}
    mun_reconcile = CANONICAL_KPI_RECONCILIATION["municipalities"]
    for code, mdata in summary.get("municipalities", {}).items():
        rec = mun_reconcile.get(code) or {}
        muns_out[code] = {
            **mdata,
            "population_inegi_2020_official": rec.get("population_inegi_2020_official", mdata.get("population_2020")),
        }
    return {
        **summary,
        "state": state,
        "municipalities": muns_out,
        "canonical_kpis": CANONICAL_KPI_RECONCILIATION,
        "capabilities": get_runtime_capabilities(),
        "layers_available": sorted(LAYER_FILES.keys()),
    }


@app.get("/api/twin/metadata")
def twin_metadata() -> dict[str, Any]:
    return build_iso19115_metadata_catalog()


@app.get("/api/twin/layer/{layer_id}")
def twin_layer(layer_id: str) -> JSONResponse:
    try:
        data = load_layer_geojson(layer_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return JSONResponse(content=data)


@app.get("/api/twin/buildings")
def twin_buildings(
    minx: float = Query(..., ge=-116.5, le=-108.5),
    miny: float = Query(..., ge=22.0, le=28.8),
    maxx: float = Query(..., ge=-116.5, le=-108.5),
    maxy: float = Query(..., ge=22.0, le=28.8),
    city: str | None = Query(default=None),
    limit: int = Query(default=7500, ge=50, le=20000),
    min_height: float = Query(default=0.0, ge=0.0, le=200.0),
) -> dict[str, Any]:
    items = SPATIAL_STORE.query_buildings(
        minx=minx,
        miny=miny,
        maxx=maxx,
        maxy=maxy,
        city=city,
        limit=limit,
        min_height=min_height,
    )
    return {"count": len(items), "buildings": items}


@app.get("/api/twin/buildings/city/{city_slug}")
def twin_city_buildings_cesium(
    city_slug: str,
    limit: int = Query(default=2800, ge=100, le=6000),
) -> dict[str, Any]:
    items = SPATIAL_STORE.query_city_buildings_cesium(city_slug, limit=limit)
    return {"city_slug": city_slug, "count": len(items), "buildings": items}


@app.get("/api/twin/zoning")
def twin_zoning(
    minx: float = Query(..., ge=-116.5, le=-108.5),
    miny: float = Query(..., ge=22.0, le=28.8),
    maxx: float = Query(..., ge=-116.5, le=-108.5),
    maxy: float = Query(..., ge=22.0, le=28.8),
    limit: int = Query(default=4000, ge=50, le=10000),
) -> dict[str, Any]:
    items = SPATIAL_STORE.query_zoning(minx=minx, miny=miny, maxx=maxx, maxy=maxy, limit=limit)
    return {"count": len(items), "parcels": items}


@app.post("/api/twin/inspect")
def twin_inspect(req: InspectRequest) -> dict[str, Any]:
    return SPATIAL_STORE.inspect_location(
        lon=req.lon,
        lat=req.lat,
        building_pk=req.building_pk,
        ageb_cvegeo=req.ageb_cvegeo,
    )


@app.post("/api/twin/simulate")
def twin_simulate(req: SimulateRequest) -> dict[str, Any]:
    try:
        return run_twin_simulation(
            scope_id=req.scope_id,
            scenario_name=req.scenario_name,
            custom_levers=req.custom_levers,
            target_year=req.target_year,
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/twin/scenarios/compare/{scope_id}")
def twin_compare(scope_id: str) -> dict[str, Any]:
    try:
        return compare_twin_scenarios(scope_id=scope_id)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/twin/goal-gap")
def twin_goal_gap(req: GoalGapRequest) -> dict[str, Any]:
    return compute_goal_gap(
        scope_id=req.scope_id,
        target_city15_score=req.target_city15_score,
        target_infill_share_pct=req.target_infill_share_pct,
        target_ptar_reuse_pct=req.target_ptar_reuse_pct,
        target_rooftop_solar_pct=req.target_rooftop_solar_pct,
        target_suds_coverage_pct=req.target_suds_coverage_pct,
    )


@app.get("/api/twin/recommendations/{scope_id}")
def twin_recommendations(scope_id: str) -> dict[str, Any]:
    try:
        return generate_recommendations(scope_id=scope_id)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/twin/chat")
def twin_chat(req: ChatRequest) -> dict[str, Any]:
    return answer_strategist_chat_grounded(
        query=req.query,
        scope_id=req.scope_id,
        scenario_name=req.scenario_name,
        language=req.language,
    )


@app.get("/api/twin/architecture")
def twin_architecture() -> dict[str, Any]:
    return get_architecture_catalog()


@app.get("/api/twin/live/summary")
def twin_live_summary() -> dict[str, Any]:
    return get_live_telemetry_summary()


@app.get("/api/twin/sensorthings/schemas")
def twin_sensorthings_schemas() -> dict[str, Any]:
    return get_pilot_schemas_catalog()


@app.get("/api/twin/3dtiles/info")
def twin_3dtiles_info() -> dict[str, Any]:
    return {
        "standard": "OGC 3D Tiles 1.1 (glTF 2.0 + EXT_mesh_features + EXT_structural_metadata)",
        "tileset_url": get_3dtiles_tileset_url(),
        "buildings_count": 396823,
        "cities_count": 9,
        "cache_control": "public, max-age=86400",
        "ogc_endpoints": {
            "landing": "/ogc",
            "features": "/ogc/collections",
            "tiles_mvt": "/ogc/collections/{collection_id}/tiles/WebMercatorQuad/{z}/{y}/{x}.mvt",
            "processes": "/ogc/processes",
            "records": "/ogc/collections/records/items",
            "sensorthings": "/FROST-Server/v1.1/Things",
        },
    }


app.include_router(sensorthings_router)
app.include_router(ogc_router)


@app.get("/api/twin/tours")
def twin_tours() -> dict[str, Any]:
    return {
        "tours": get_cinematic_flythrough_tours(),
        "corridors": CORRIDOR_PRESETS,
    }


@app.get("/api/twin/export/dxf")
def twin_export_dxf(
    corridor: str | None = Query(default=None),
    minx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    miny: float | None = Query(default=None, ge=22.0, le=28.8),
    maxx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    maxy: float | None = Query(default=None, ge=22.0, le=28.8),
    label: str | None = Query(default=None),
) -> Response:
    x0, y0, x1, y1, slug, display_label = resolve_export_bbox(corridor, minx, miny, maxx, maxy, label)
    dxf_bytes = export_civil3d_dxf(minx=x0, miny=y0, maxx=x1, maxy=y1, label=display_label)
    return Response(
        content=dxf_bytes,
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{slug}_utm12n_3d.dxf"'},
    )


@app.get("/api/twin/export/obj3d")
def twin_export_obj3d(
    corridor: str | None = Query(default=None),
    minx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    miny: float | None = Query(default=None, ge=22.0, le=28.8),
    maxx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    maxy: float | None = Query(default=None, ge=22.0, le=28.8),
    label: str | None = Query(default=None),
) -> Response:
    x0, y0, x1, y1, slug, display_label = resolve_export_bbox(corridor, minx, miny, maxx, maxy, label)
    obj_bytes = export_wavefront_obj3d(minx=x0, miny=y0, maxx=x1, maxy=y1, label=display_label)
    return Response(
        content=obj_bytes,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}_lumion_unreal_3d.obj"'},
    )


@app.get("/api/twin/export/bim-package")
def twin_export_bim_package(
    corridor: str | None = Query(default=None),
    minx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    miny: float | None = Query(default=None, ge=22.0, le=28.8),
    maxx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    maxy: float | None = Query(default=None, ge=22.0, le=28.8),
    label: str | None = Query(default=None),
) -> JSONResponse:
    x0, y0, x1, y1, slug, display_label = resolve_export_bbox(corridor, minx, miny, maxx, maxy, label)
    pkg = export_iso19650_bim_package(minx=x0, miny=y0, maxx=x1, maxy=y1, label=display_label)
    return JSONResponse(
        content=pkg,
        headers={"Content-Disposition": f'attachment; filename="{slug}_iso19650_bim.json"'},
    )


@app.get("/api/twin/export/unreal-manifest")
def twin_export_unreal_manifest(
    corridor: str | None = Query(default=None),
    minx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    miny: float | None = Query(default=None, ge=22.0, le=28.8),
    maxx: float | None = Query(default=None, ge=-116.5, le=-108.5),
    maxy: float | None = Query(default=None, ge=22.0, le=28.8),
    label: str | None = Query(default=None),
) -> JSONResponse:
    x0, y0, x1, y1, slug, display_label = resolve_export_bbox(corridor, minx, miny, maxx, maxy, label)
    manifest = export_unreal_cesium_manifest(
        corridor_id=corridor,
        minx=x0,
        miny=y0,
        maxx=x1,
        maxy=y1,
        label=display_label,
    )
    return JSONResponse(
        content=manifest,
        headers={"Content-Disposition": f'attachment; filename="{slug}_cesium_unreal.json"'},
    )


# Serve compiled React/Cesium frontend when `frontend/dist` exists
if FRONTEND_DIST_DIR.exists():
    assets_dir = FRONTEND_DIST_DIR / "assets"
    cesium_dir = FRONTEND_DIST_DIR / "cesium"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    if cesium_dir.exists():
        app.mount("/cesium", StaticFiles(directory=str(cesium_dir)), name="cesium")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str) -> FileResponse:
        if (
            full_path.startswith("api/")
            or full_path.startswith("FROST-Server/")
            or full_path == "ogc"
            or full_path.startswith("ogc/")
        ):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        candidate: Path = FRONTEND_DIST_DIR / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST_DIR / "index.html"))
