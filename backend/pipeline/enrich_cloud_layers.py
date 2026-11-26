"""Reproducible Google Cloud BigQuery -> GeoJSON enrichment ETL for BCS2050 Digital Twin.

Ingests verified curated spatial datasets from `bcs2050.silver_geo` and `bcs2050.bcs2050_gis`
(excluding cimp116_alcantarillado per coordinate audit) into WebGL-ready GeoJSON files
in `data/layers/`, and idempotently enriches `transit_lines.geojson` / `transit_stops.geojson`
with IMPLAN Los Cabos v3 public transit coverage.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from google.cloud import bigquery
import shapely
from shapely import wkt as shapely_wkt
from shapely.geometry import mapping, shape
from shapely.validation import make_valid

DATA_LAYERS_DIR = Path(__file__).resolve().parents[2] / "data" / "layers"

# Baja California Sur geographic bounding envelope (with coastal/offshore island buffer)
MIN_LON, MAX_LON = -116.0, -108.5
MIN_LAT, MAX_LAT = 22.0, 28.6


def _to_2d_and_round(geom: Any, decimals: int = 5) -> Any:
    geom_2d = shapely.force_2d(geom)
    return shapely.transform(geom_2d, lambda coords: coords.round(decimals))


def _in_bcs_bounds(geom: Any) -> bool:
    if geom is None or geom.is_empty:
        return False
    minx, miny, maxx, maxy = geom.bounds
    if not all(math.isfinite(v) for v in (minx, miny, maxx, maxy)):
        return False
    # Check centroid or bbox intersection against BCS bounds
    cx, cy = (minx + maxx) * 0.5, (miny + maxy) * 0.5
    return (MIN_LON <= cx <= MAX_LON and MIN_LAT <= cy <= MAX_LAT) or (
        maxx >= MIN_LON and minx <= MAX_LON and maxy >= MIN_LAT and miny <= MAX_LAT
    )


def _clean_val(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (int, bool)):
        return val
    if isinstance(val, float):
        return round(val, 4) if math.isfinite(val) else None
    s = str(val).strip()
    if s.lower() in {"nan", "none", "null", "<na>"}:
        return None
    return s


def _parse_geom(row: Any, geom_col: str = "geom_wkt", is_geojson: bool = False) -> Any | None:
    raw = getattr(row, geom_col, None)
    if not raw:
        return None
    try:
        geom = shape(json.loads(raw)) if is_geojson else shapely_wkt.loads(raw)
        if geom.is_empty:
            return None
        if not geom.is_valid:
            geom = make_valid(geom)
        if geom.is_empty:
            return None
        return geom
    except Exception:
        return None


def _build_feature(
    geom: Any,
    props: dict[str, Any],
    *,
    simplify_tol: float | None = None,
    as_centroid: bool = False,
) -> dict[str, Any] | None:
    if not _in_bcs_bounds(geom):
        return None
    work = geom
    if as_centroid and work.geom_type != "Point":
        work = work.centroid
    elif simplify_tol and simplify_tol > 0 and work.geom_type != "Point":
        simplified = work.simplify(simplify_tol, preserve_topology=True)
        if not simplified.is_empty:
            work = simplified
    work = _to_2d_and_round(work, decimals=5)
    if work.is_empty or not _in_bcs_bounds(work):
        return None
    clean_props = {k: _clean_val(v) for k, v in props.items() if _clean_val(v) is not None}
    return {
        "type": "Feature",
        "geometry": mapping(work),
        "properties": clean_props,
    }


def _write_fc(filename: str, features: list[dict[str, Any]]) -> tuple[int, float]:
    out_path = DATA_LAYERS_DIR / filename
    fc = {"type": "FeatureCollection", "features": features}
    raw = json.dumps(fc, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    out_path.write_text(raw, encoding="utf-8")
    size_mb = out_path.stat().st_size / (1024.0 * 1024.0)
    assert len(features) > 0, f"{filename} produced 0 features!"
    assert size_mb < 3.5, f"{filename} exceeded 3.5 MB ({size_mb:.2f} MB)!"
    print(f"WROTE {filename:30s} | features={len(features):5d} | size={size_mb:.3f} MB")
    return len(features), size_mb


def run_enrichment() -> dict[str, tuple[int, float]]:
    DATA_LAYERS_DIR.mkdir(parents=True, exist_ok=True)
    bq = bigquery.Client(project="bcs2050")
    loc = "northamerica-south1"
    results: dict[str, tuple[int, float]] = {}

    # 1. Los Cabos Water & Purple-Line Network (excludes cimp116_alcantarillado per coordinate audit)
    water_specs = [
        ("silver_geo.03_008__agua__acueductos__implan_lc__20261123__v01", "aqueduct", "Aqueduct", None),
        ("silver_geo.03_008__agua__red_agua_tratada__implan_lc__20261123__v01", "purple_line", "Purple-Line Treated Water", None),
        ("silver_geo.03_008__agua__red_distribucion_agua__implan_lc__20261123__v01", "distribution_pipe", "Water Distribution Main", 0.00008),
        ("silver_geo.03_008__agua__tanques_agua__implan_lc__20261123__v01", "tank", "Storage Tank", None),
        ("silver_geo.03_008__agua__pozos_extraccion__implan_lc__20261123__v01", "well", "Extraction Well", None),
        ("silver_geo.03_008__agua__carcamos_bombeo__implan_lc__20261123__v01", "pump_station", "Pump Station", None),
    ]
    water_feats: list[dict[str, Any]] = []
    for table_ref, subtype, fallback_label, simp in water_specs:
        cols = {f.name for f in bq.get_table(f"bcs2050.{table_ref}").schema}
        label_expr = "COALESCE(" + ", ".join([c for c in ("nombre", "name", "etiqueta_mapa") if c in cols] or ["CAST(NULL AS STRING)"]) + ")"
        sql = f"""
        SELECT ST_AsText(geometry) AS geom_wkt, {label_expr} AS label_val, municipio
        FROM `bcs2050.{table_ref}`
        WHERE geometry IS NOT NULL
        """
        for r in bq.query(sql, location=loc).result():
            g = _parse_geom(r)
            if not g:
                continue
            feat = _build_feature(
                g,
                {
                    "subtype": subtype,
                    "name": getattr(r, "label_val", None) or fallback_label,
                    "municipality": getattr(r, "municipio", None) or "Los Cabos",
                    "source": "IMPLAN Los Cabos v3",
                },
                simplify_tol=simp,
                as_centroid=subtype in {"tank", "well", "pump_station"},
            )
            if feat:
                water_feats.append(feat)
    results["water_network_lc.geojson"] = _write_fc("water_network_lc.geojson", water_feats)

    # 2. Arroyos & Rivers (Los Cabos hydrography)
    arroyo_feats: list[dict[str, Any]] = []
    sql_arroyos = """
    SELECT ST_AsText(geometry) AS geom_wkt, name, municipio
    FROM `bcs2050.silver_geo.03_008__agua__rios__implan_lc__20261123__v01`
    WHERE geometry IS NOT NULL
    """
    for r in bq.query(sql_arroyos, location=loc).result():
        g = _parse_geom(r)
        if not g:
            continue
        feat = _build_feature(
            g,
            {
                "name": getattr(r, "name", None) or "Arroyo / Hydrologic Channel",
                "municipality": getattr(r, "municipio", None) or "Los Cabos",
                "source": "IMPLAN Los Cabos v3",
            },
            simplify_tol=0.00012,
        )
        if feat:
            arroyo_feats.append(feat)
    results["arroyos_rivers.geojson"] = _write_fc("arroyos_rivers.geojson", arroyo_feats)

    # 3. Multi-Hazard Flood (Tr=100), Storm Surge, Heatwave, Cyclone Basins & Coastal Erosion
    hazard_feats: list[dict[str, Any]] = []
    # Flood Tr=100
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, gridcode, Velocidad FROM `bcs2050.silver_geo.03_008__riesgo__inundaciones_tr100__implan_lc_atlas__20261124__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "hazard_type": "flood_tr100",
                    "name": "Flood Hazard Tr=100",
                    "severity": f"Class {r.gridcode}" if r.gridcode is not None else "Tr=100",
                    "velocity": r.Velocidad,
                    "source": "IMPLAN Los Cabos Risk Atlas",
                },
                simplify_tol=0.00015,
            )
            if f:
                hazard_feats.append(f)
    # Storm surge
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, Colonia, SupHa FROM `bcs2050.silver_geo.03_008__riesgo__marea_tormenta_vulnerabilidad__implan_lc_atlas__20261124__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "hazard_type": "storm_surge",
                    "name": f"Storm Surge Vulnerability · {r.Colonia or 'Coast'}",
                    "area_ha": r.SupHa,
                    "source": "IMPLAN Los Cabos Risk Atlas",
                },
                simplify_tol=0.00015,
            )
            if f:
                hazard_feats.append(f)
    # Heatwave
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, NOM_MUN, FENOMENO, INTENSIDAD, Detalles FROM `bcs2050.silver_geo.03_008__riesgo__ondas_calor_peligro__implan_lc_atlas__20210813__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "hazard_type": "heatwave",
                    "name": r.FENOMENO or "Heatwave Hazard",
                    "severity": r.INTENSIDAD,
                    "municipality": r.NOM_MUN,
                    "details": r.Detalles,
                    "source": "IMPLAN Risk Atlas",
                },
                simplify_tol=0.00025,
            )
            if f:
                hazard_feats.append(f)
    # Cyclone basins
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, nombre_cuen, nivel_amen FROM `bcs2050.bcs2050_gis.bcs_mc__amenaza_ciclones_cuencas_costeras__f1909a5cd69bd693` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "hazard_type": "cyclone_basin",
                    "name": r.nombre_cuen or "Coastal Cyclone Basin",
                    "severity": r.nivel_amen,
                    "source": "CENAPRED / CONAGUA / BCS-MC",
                },
                simplify_tol=0.0012,
            )
            if f:
                hazard_feats.append(f)
    # Coastal erosion field points
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, ecr, desgaste, causa FROM `bcs2050.bcs2050_gis.bcs_mc__erosion_costera_inegi_2020_verificacion_campo__f89a36d12c35fd6a` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "hazard_type": "coastal_erosion",
                    "name": f"Coastal Erosion · {r.ecr or 'Field Site'}",
                    "severity": r.desgaste,
                    "details": r.causa,
                    "source": "INEGI Coastal Erosion Field Verification",
                },
            )
            if f:
                hazard_feats.append(f)
    results["hazard_atlas.geojson"] = _write_fc("hazard_atlas.geojson", hazard_feats)

    # 4. Parks, Public Spaces & Public Beach Access (La Paz + Los Cabos)
    parks_feats: list[dict[str, Any]] = []
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, bcs_source_layer FROM `bcs2050.silver_geo.03_003__equipamiento__parques__lapaz_visor__20261030__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"space_type": "park_lapaz", "name": "Urban Park / Green Space", "municipality": "La Paz", "source": "Visor Urbano La Paz"},
                simplify_tol=0.00008,
            )
            if f:
                parks_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, name, municipio FROM `bcs2050.silver_geo.03_008__equipamiento__parques__implan_lc__20261123__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"space_type": "park_loscabos", "name": r.name or "Park", "municipality": r.municipio or "Los Cabos", "source": "IMPLAN Los Cabos v3"},
                simplify_tol=0.00008,
            )
            if f:
                parks_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, name, municipio FROM `bcs2050.silver_geo.03_008__equipamiento__espacios_publicos_poligonos__implan_lc__20261123__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"space_type": "public_space", "name": r.name or "Public Space / Plaza", "municipality": r.municipio or "Los Cabos", "source": "IMPLAN Los Cabos v3"},
                simplify_tol=0.00008,
            )
            if f:
                parks_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, COALESCE(etiqueta_mapa, nombre) AS label_val, municipio FROM `bcs2050.silver_geo.03_008__equipamiento__acceso_playas__implan_lc__20261123__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"space_type": "beach_access", "name": r.label_val or "Public Beach Access", "municipality": r.municipio or "Los Cabos", "source": "IMPLAN Los Cabos v3"},
                as_centroid=True,
            )
            if f:
                parks_feats.append(f)
    results["parks_public_space.geojson"] = _write_fc("parks_public_space.geojson", parks_feats)

    # 5. Land Tenure: Agrarian Ejidos (RAN) & Urban Territorial Reserves (IMPLAN Los Cabos)
    tenure_feats: list[dict[str, Any]] = []
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, nom_nuc, municipio, tipo FROM `bcs2050.bcs2050_gis.ran_bcs_nucleos_agrarios` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "tenure_type": "ejido",
                    "name": r.nom_nuc or "Agrarian Nucleus",
                    "municipality": r.municipio,
                    "legal_regime": r.tipo or "Ejido / Comunidad",
                    "source": "RAN Padrón Agrario",
                },
                simplify_tol=0.0004,
            )
            if f:
                tenure_feats.append(f)
    for r in bq.query(
        "SELECT geom_geojson, nombre, municipio, hectareas FROM `bcs2050.bcs2050_gis.implan_los_cabos_cimp108_reservas_territoriales` WHERE geom_geojson IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r, geom_col="geom_geojson", is_geojson=True)
        if g:
            f = _build_feature(
                g,
                {
                    "tenure_type": "territorial_reserve",
                    "name": r.nombre or "Territorial Reserve",
                    "municipality": r.municipio or "Los Cabos",
                    "area_ha": r.hectareas,
                    "source": "IMPLAN Los Cabos v3",
                },
                simplify_tol=0.00015,
            )
            if f:
                tenure_feats.append(f)
    results["land_tenure.geojson"] = _write_fc("land_tenure.geojson", tenure_feats)

    # 6. Mobility Arterials & Bikeways (Los Cabos)
    mob_feats: list[dict[str, Any]] = []
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, name, municipio FROM `bcs2050.silver_geo.03_008__movilidad__jerarquia_vial__implan_lc__20261123__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"road_type": "arterial", "name": r.name or "Primary Arterial", "municipality": r.municipio or "Los Cabos", "source": "IMPLAN Los Cabos v3"},
                simplify_tol=0.0001,
            )
            if f:
                mob_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, name, municipio FROM `bcs2050.silver_geo.03_008__movilidad__ciclovias__implan_lc__20261123__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"road_type": "bikeway", "name": r.name or "Dedicated Bikeway", "municipality": r.municipio or "Los Cabos", "source": "IMPLAN Los Cabos v3"},
            )
            if f:
                mob_feats.append(f)
    results["mobility_arterials.geojson"] = _write_fc("mobility_arterials.geojson", mob_feats)

    # 7. Airports, Airfields, Ports & Marinas
    hub_feats: list[dict[str, Any]] = []
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, iata_code, gps_code, elevation_ft, scope_description FROM `bcs2050.bcs2050_gis.bcs_mc__aeropuertos_aerodromos_referencia__c5924ec004738503` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            code = r.iata_code or r.gps_code or "Aerodrome"
            f = _build_feature(
                g,
                {
                    "hub_type": "airport",
                    "name": f"{code} Airfield",
                    "iata_code": r.iata_code,
                    "elevation_ft": r.elevation_ft,
                    "source": "OurAirports / BCS-MC",
                },
                as_centroid=True,
            )
            if f:
                hub_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, name, comment FROM `bcs2050.bcs2050_gis.bcs_mc__puertos_desembarques_tnc__9acb8d7eb8c7bb29` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"hub_type": "port", "name": r.name or "Port / Landing Site", "notes": r.comment, "source": "TNC Coastal Atlas"},
                as_centroid=True,
            )
            if f:
                hub_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, osm_id, scope_description FROM `bcs2050.bcs2050_gis.bcs_mc__marinas_osm__4df551169af23136` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"hub_type": "marina", "name": f"Marina OSM #{r.osm_id or ''}".strip(), "source": "OpenStreetMap"},
                as_centroid=True,
            )
            if f:
                hub_feats.append(f)
    results["airports_ports_marinas.geojson"] = _write_fc("airports_ports_marinas.geojson", hub_feats)

    # 8. Coastal Ecosystems: Mangroves (SEMARNAT), Ramsar Wetlands, Coral Reefs & Desert Oases
    eco_feats: list[dict[str, Any]] = []
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, descrip, ha FROM `bcs2050.bcs2050_gis.bcs_mc__manglares_2020_semarnat__f8229f7dba1feedd` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"eco_type": "mangrove", "name": r.descrip or "Mangrove Wetland", "area_ha": r.ha, "source": "SEMARNAT / CONABIO 2020"},
                simplify_tol=0.00035,
            )
            if f:
                eco_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, municipios, fecha FROM `bcs2050.bcs2050_gis.bcs_mc__sitios_ramsar__8f9544cbae1938bf` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"eco_type": "ramsar", "name": f"Ramsar Wetland ({r.municipios or 'BCS'})", "designation_date": r.fecha, "source": "Ramsar / CONANP"},
                simplify_tol=0.0004,
            )
            if f:
                eco_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, habitat FROM `bcs2050.bcs2050_gis.bcs_mc__arrecifes_coral_sitios_tnc__1d258349478fed03` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"eco_type": "coral_reef", "name": f"Coral Reef · {r.habitat or 'BCS Coast'}", "source": "TNC Marine Atlas"},
                as_centroid=True,
            )
            if f:
                eco_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, cenot_oasi FROM `bcs2050.bcs2050_gis.bcs_mc__oasis_inventario_humedales__b1c93ac41c189065` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"eco_type": "oasis", "name": r.cenot_oasi or "BCS Desert Oasis", "source": "National Wetlands Inventory"},
                as_centroid=True,
            )
            if f:
                eco_feats.append(f)
    results["coastal_ecosystems.geojson"] = _write_fc("coastal_ecosystems.geojson", eco_feats)

    # 9. Cultural Heritage: Jesuit Missions, UNESCO World Heritage & Archaeological Sites
    cult_feats: list[dict[str, Any]] = []
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, name, description FROM `bcs2050.bcs2050_gis.bcs_mc__misiones_ruta_setues__f056a7767cf2967f` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"heritage_type": "mission", "name": r.name or "Jesuit Mission", "description": r.description, "source": "SETUES Baja California Sur"},
                as_centroid=True,
            )
            if f:
                cult_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, estado_id, link_sic FROM `bcs2050.bcs2050_gis.bcs_mc__patrimonio_mundial_sic__339c1a10ae6822b2` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"heritage_type": "unesco", "name": "UNESCO World Heritage Site", "source_url": r.link_sic, "source": "SIC / INAH"},
                as_centroid=True,
            )
            if f:
                cult_feats.append(f)
    for r in bq.query(
        "SELECT ST_AsText(geom) AS geom_wkt, osm_id FROM `bcs2050.bcs2050_gis.bcs_mc__sitios_arqueologicos_osm__153434a873615857` WHERE geom IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {"heritage_type": "archaeological", "name": f"Archaeological Site #{r.osm_id or ''}".strip(), "source": "OpenStreetMap / INAH"},
                as_centroid=True,
            )
            if f:
                cult_feats.append(f)
    results["cultural_heritage.geojson"] = _write_fc("cultural_heritage.geojson", cult_feats)

    # 10. La Paz Municipal Waste Collection Routes/Zones
    waste_feats: list[dict[str, Any]] = []
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, name, `desc` AS zone_desc, layer FROM `bcs2050.silver_geo.03_003__residuos__rutas_recoleccion__lapaz_visor__20261030__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "name": r.name or r.layer or "La Paz Collection Zone",
                    "description": getattr(r, "zone_desc", None),
                    "municipality": "La Paz",
                    "source": "Visor Urbano La Paz",
                },
                simplify_tol=0.00015,
            )
            if f:
                waste_feats.append(f)
    results["waste_routes_lpz.geojson"] = _write_fc("waste_routes_lpz.geojson", waste_feats)

    # 11. Idempotently enrich transit_lines.geojson & transit_stops.geojson with IMPLAN Los Cabos v3
    tl_path = DATA_LAYERS_DIR / "transit_lines.geojson"
    existing_lines = [
        ft
        for ft in json.loads(tl_path.read_text(encoding="utf-8")).get("features", [])
        if (ft.get("properties") or {}).get("data_source") != "implan_los_cabos_v3"
    ]
    for idx, r in enumerate(
        bq.query(
            "SELECT ST_AsText(geometry) AS geom_wkt, COALESCE(name, etiqueta_mapa) AS route_label FROM `bcs2050.silver_geo.03_008__movilidad__rutas_transporte__implan_lc__20261123__v01` WHERE geometry IS NOT NULL",
            location=loc,
        ).result(),
        start=1,
    ):
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "line_id": f"lc_{idx}",
                    "route_name": r.route_label or f"Los Cabos Route {idx}",
                    "route_ref": str(idx),
                    "city_name": "Los Cabos",
                    "municipality_code": "03008",
                    "mode": "bus",
                    "operator": "Public Transit Los Cabos",
                    "data_source": "implan_los_cabos_v3",
                },
                simplify_tol=0.0001,
            )
            if f:
                existing_lines.append(f)
    results["transit_lines.geojson"] = _write_fc("transit_lines.geojson", existing_lines)

    ts_path = DATA_LAYERS_DIR / "transit_stops.geojson"
    existing_stops = [
        ft
        for ft in json.loads(ts_path.read_text(encoding="utf-8")).get("features", [])
        if (ft.get("properties") or {}).get("data_source") != "implan_los_cabos_v3"
    ]
    for r in bq.query(
        "SELECT ST_AsText(geometry) AS geom_wkt, COALESCE(nombre, etiqueta_mapa) AS stop_label, record_id FROM `bcs2050.silver_geo.03_008__movilidad__paradas_transporte__implan_lc__20261123__v01` WHERE geometry IS NOT NULL",
        location=loc,
    ).result():
        g = _parse_geom(r)
        if g:
            f = _build_feature(
                g,
                {
                    "stop_id": f"lc_stop_{r.record_id or len(existing_stops)}",
                    "name": r.stop_label or "Los Cabos Bus Stop",
                    "city_name": "Los Cabos",
                    "municipality_code": "03008",
                    "stop_type": "bus_stop",
                    "mode": "bus",
                    "operator": "Public Transit Los Cabos",
                    "data_source": "implan_los_cabos_v3",
                },
                as_centroid=True,
            )
            if f:
                existing_stops.append(f)
    results["transit_stops.geojson"] = _write_fc("transit_stops.geojson", existing_stops)

    # 12. Topography Elevation Contours (10m urban + 200m regional from Copernicus DEM / Foster RFI)
    sql_contours = """
    SELECT ST_AsText(geom) AS geom_wkt, scope, city_zone, elevation_m, interval_m, source_dem
    FROM `bcs2050.bcs2050_gis.foster_rfi__topography_contours`
    WHERE geom IS NOT NULL
      AND (
        scope = 'URBAN_10M'
        OR (scope = 'REGIONAL_50M' AND MOD(CAST(ROUND(elevation_m) AS INT64), 200) = 0)
      )
    """
    contour_rows = list(bq.query(sql_contours, location=loc).result())

    def _build_contours(reg_tol: float, urb_tol: float, decimals: int) -> list[dict[str, Any]]:
        built: list[dict[str, Any]] = []
        for r in contour_rows:
            g = _parse_geom(r)
            if not g or not _in_bcs_bounds(g):
                continue
            sc = str(r.scope or "REGIONAL_50M")
            elev = round(float(r.elevation_m or 0.0), 1)
            if elev.is_integer():
                elev = int(elev)
            tol = urb_tol if sc == "URBAN_10M" else reg_tol
            work = g.simplify(tol, preserve_topology=True) if tol > 0 else g
            if work.is_empty:
                work = g
            work = _to_2d_and_round(work, decimals=decimals)
            if work.is_empty or not _in_bcs_bounds(work):
                continue
            intv = int(r.interval_m or (10 if sc == "URBAN_10M" else 50))
            is_index = (int(round(float(elev))) % (50 if sc == "URBAN_10M" else 400)) == 0
            props = {
                "elevation_m": elev,
                "interval_m": intv,
                "scope": sc,
                "city_zone": _clean_val(r.city_zone) or "Baja California Sur",
                "is_index": is_index,
            }
            built.append({"type": "Feature", "geometry": mapping(work), "properties": props})
        return built

    contour_feats: list[dict[str, Any]] = []
    for reg_tol, urb_tol, decimals in (
        (0.0005, 0.00018, 4),
        (0.0008, 0.00022, 4),
    ):
        contour_feats = _build_contours(reg_tol=reg_tol, urb_tol=urb_tol, decimals=decimals)
        size_bytes = len(
            json.dumps({"type": "FeatureCollection", "features": contour_feats}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        )
        if size_bytes <= int(3.2 * 1024 * 1024):
            break
    results["topography_contours.geojson"] = _write_fc("topography_contours.geojson", contour_feats)

    return results


if __name__ == "__main__":
    summary = run_enrichment()
    total_feats = sum(cnt for cnt, _ in summary.values())
    total_mb = sum(mb for _, mb in summary.values())
    print(f"ENRICHMENT_DONE | files={len(summary)} | total_features={total_feats} | total_mb={total_mb:.3f}")
