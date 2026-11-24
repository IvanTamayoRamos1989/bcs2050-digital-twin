"""Reproducible BigQuery -> Cloud SQL PostgreSQL / PostGIS ETL worker for BCS2050 Digital Twin.

Loads canonical BigQuery / curated spatial datasets (`396,823` buildings, `79,515` zoning parcels,
`1,155` AGEBs, aquifers, SIBCS grid, POER, ANPs) into PostGIS tables with GiST spatial indexes.
Supports `--dry-run` for schema & row-count validation without requiring a live Postgres server.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config import DATA_DIR, LAYERS_DIR, SQLITE_PATH, get_postgis_dsn  # noqa: E402
from backend.spatial_store import LAYER_FILES, ensure_spatial_data_ready  # noqa: E402

logger = logging.getLogger("bcs2050.workers.postgis_etl")

POSTGIS_DDL = """
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS buildings (
    id BIGINT PRIMARY KEY,
    building_id TEXT NOT NULL,
    city_slug TEXT NOT NULL,
    city_name TEXT NOT NULL,
    mun_code TEXT NOT NULL,
    ageb_cvegeo TEXT,
    height_m DOUBLE PRECISION NOT NULL,
    floors INTEGER NOT NULL,
    footprint_m2 DOUBLE PRECISION,
    gfa_m2 DOUBLE PRECISION,
    ground_elev_m DOUBLE PRECISION,
    solar_kwp DOUBLE PRECISION,
    surge_risk SMALLINT,
    centroid_lon DOUBLE PRECISION NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    ring_json JSONB NOT NULL,
    geom geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buildings_geom_gist ON buildings USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_buildings_city_slug ON buildings (city_slug);

CREATE TABLE IF NOT EXISTS zoning_parcels (
    id BIGINT PRIMARY KEY,
    zone_id TEXT NOT NULL,
    city_name TEXT NOT NULL,
    mun_code TEXT NOT NULL,
    land_use_code TEXT,
    land_use_category_std TEXT,
    cos_max DOUBLE PRECISION,
    cus_max DOUBLE PRECISION,
    max_levels INTEGER,
    area_ha DOUBLE PRECISION,
    ring_json JSONB NOT NULL,
    geom geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_zoning_parcels_geom_gist ON zoning_parcels USING GIST (geom);

CREATE TABLE IF NOT EXISTS spatial_layer_features (
    layer_id TEXT NOT NULL,
    feature_idx INTEGER NOT NULL,
    municipality_code TEXT,
    properties JSONB NOT NULL,
    geom geometry(Geometry, 4326) NOT NULL,
    PRIMARY KEY (layer_id, feature_idx)
);
CREATE INDEX IF NOT EXISTS idx_spatial_layer_features_gist ON spatial_layer_features USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_spatial_layer_features_layer ON spatial_layer_features (layer_id, municipality_code);
"""


def build_etl_plan() -> dict[str, Any]:
    """Validate source datasets and compute target PostGIS table load manifest."""
    ensure_spatial_data_ready()
    summary: dict[str, Any] = {
        "postgis_dsn_configured": bool(get_postgis_dsn()),
        "tables": [],
        "ddl_statements": len([s for s in POSTGIS_DDL.split(";") if s.strip()]),
    }
    sqlite_path = Path(os.environ.get("BCS2050_ETL_SQLITE_PATH", str(SQLITE_PATH)))
    if sqlite_path.exists():
        con = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
        try:
            b_count = con.execute("SELECT COUNT(*) FROM buildings").fetchone()[0]
            z_count = con.execute("SELECT COUNT(*) FROM zoning_parcels").fetchone()[0]
        finally:
            con.close()
    else:
        b_count = 0
        z_count = 0
    summary["tables"].append({"table": "buildings", "rows": b_count, "index": "GIST(geom)"})
    summary["tables"].append({"table": "zoning_parcels", "rows": z_count, "index": "GIST(geom)"})

    layer_counts: dict[str, int] = {}
    layers_root = LAYERS_DIR if LAYERS_DIR.exists() else DATA_DIR / "layers"
    for lid, fname in LAYER_FILES.items():
        fpath = layers_root / fname
        if fpath.exists():
            fc = json.loads(fpath.read_text(encoding="utf-8"))
            layer_counts[lid] = len(fc.get("features") or [])
    summary["tables"].append(
        {
            "table": "spatial_layer_features",
            "layers_count": len(layer_counts),
            "rows": sum(layer_counts.values()),
            "layers": layer_counts,
            "index": "GIST(geom)",
        }
    )
    return summary


def run_postgis_etl(*, dsn: str | None = None, dry_run: bool = False, batch_size: int = 2500) -> dict[str, Any]:
    """Execute idempotent upsert of all BCS spatial layers and 3D buildings into PostGIS."""
    plan = build_etl_plan()
    target_dsn = (dsn or get_postgis_dsn()).strip()
    if dry_run or not target_dsn:
        return {
            "status": "dry_run" if dry_run else "skipped_no_dsn",
            "plan": plan,
        }

    import psycopg2
    import psycopg2.extras

    con_pg = psycopg2.connect(target_dsn)
    con_sq = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    buildings_loaded = 0
    zoning_loaded = 0
    layers_loaded = 0
    try:
        with con_pg:
            with con_pg.cursor() as cur:
                cur.execute(POSTGIS_DDL)

            # 1. Load 396,823 Buildings in batches with valid Polygon WKT
            cur_sq = con_sq.execute(
                "SELECT id, building_id, city_slug, city_name, mun_code, ageb_cvegeo, "
                "height_m, floors, footprint_m2, gfa_m2, ground_elev_m, solar_kwp, "
                "surge_risk, centroid_lon, centroid_lat, ring_json FROM buildings ORDER BY id"
            )
            while True:
                batch = cur_sq.fetchmany(batch_size)
                if not batch:
                    break
                values = []
                for r in batch:
                    ring = json.loads(r[15])
                    if ring[0] != ring[-1]:
                        ring.append(ring[0])
                    coords_wkt = ", ".join(f"{pt[0]} {pt[1]}" for pt in ring)
                    wkt = f"POLYGON(({coords_wkt}))"
                    values.append((*r[:15], r[15], wkt))
                with con_pg.cursor() as cur:
                    psycopg2.extras.execute_values(
                        cur,
                        """
                        INSERT INTO buildings (
                            id, building_id, city_slug, city_name, mun_code, ageb_cvegeo,
                            height_m, floors, footprint_m2, gfa_m2, ground_elev_m, solar_kwp,
                            surge_risk, centroid_lon, centroid_lat, ring_json, geom
                        ) VALUES %s
                        ON CONFLICT (id) DO UPDATE SET
                            height_m = EXCLUDED.height_m,
                            solar_kwp = EXCLUDED.solar_kwp,
                            surge_risk = EXCLUDED.surge_risk,
                            geom = EXCLUDED.geom
                        """,
                        values,
                        template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,ST_GeomFromText(%s,4326))",
                    )
                buildings_loaded += len(values)

            # 2. Load 79,515 Zoning Parcels
            cur_sq = con_sq.execute(
                "SELECT id, zone_id, city_name, mun_code, land_use_code, land_use_category_std, "
                "cos_max, cus_max, max_levels, area_ha, ring_json FROM zoning_parcels ORDER BY id"
            )
            while True:
                batch = cur_sq.fetchmany(batch_size)
                if not batch:
                    break
                values = []
                for r in batch:
                    ring = json.loads(r[10])
                    if ring[0] != ring[-1]:
                        ring.append(ring[0])
                    coords_wkt = ", ".join(f"{pt[0]} {pt[1]}" for pt in ring)
                    values.append((*r[:10], r[10], f"POLYGON(({coords_wkt}))"))
                with con_pg.cursor() as cur:
                    psycopg2.extras.execute_values(
                        cur,
                        """
                        INSERT INTO zoning_parcels (
                            id, zone_id, city_name, mun_code, land_use_code, land_use_category_std,
                            cos_max, cus_max, max_levels, area_ha, ring_json, geom
                        ) VALUES %s
                        ON CONFLICT (id) DO UPDATE SET
                            cos_max = EXCLUDED.cos_max,
                            cus_max = EXCLUDED.cus_max,
                            geom = EXCLUDED.geom
                        """,
                        values,
                        template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,ST_GeomFromText(%s,4326))",
                    )
                zoning_loaded += len(values)

            # 3. Load Vector Layers (AGEBs, Aquifers, POER, ANPs, SIBCS, Tandeo, Services, Transit)
            for lid, fname in LAYER_FILES.items():
                fpath = LAYERS_DIR / fname
                if not fpath.exists():
                    continue
                fc = json.loads(fpath.read_text(encoding="utf-8"))
                feats = fc.get("features") or []
                values = []
                for idx, f in enumerate(feats):
                    props = f.get("properties") or {}
                    muni = str(props.get("municipality_code") or props.get("mun_code") or "")
                    values.append((lid, idx, muni, json.dumps(props, ensure_ascii=False), json.dumps(f.get("geometry"))))
                if values:
                    with con_pg.cursor() as cur:
                        psycopg2.extras.execute_values(
                            cur,
                            """
                            INSERT INTO spatial_layer_features (layer_id, feature_idx, municipality_code, properties, geom)
                            VALUES %s
                            ON CONFLICT (layer_id, feature_idx) DO UPDATE SET
                                properties = EXCLUDED.properties,
                                geom = EXCLUDED.geom
                            """,
                            values,
                            template="(%s,%s,%s,%s::jsonb,ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))",
                        )
                    layers_loaded += len(values)
    finally:
        con_sq.close()
        con_pg.close()

    return {
        "status": "completed",
        "buildings_loaded": buildings_loaded,
        "zoning_loaded": zoning_loaded,
        "layers_loaded": layers_loaded,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="BCS2050 BigQuery/Curated -> PostGIS ETL worker")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--dsn", default="")
    args = parser.parse_args()
    out = run_postgis_etl(dsn=args.dsn or None, dry_run=args.dry_run)
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
