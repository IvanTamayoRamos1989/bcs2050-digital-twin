"""Automated verification suite for OGC API Family, MVT Tiles, 3D Tiles 1.1 GLB, and PostGIS ETL."""

from __future__ import annotations

import json
import struct
import sys
import time
from pathlib import Path

import mapbox_vector_tile
import mercantile
from fastapi.testclient import TestClient

TWIN_ROOT = Path(__file__).resolve().parents[2]
if str(TWIN_ROOT) not in sys.path:
    sys.path.insert(0, str(TWIN_ROOT))

from backend.server import app  # noqa: E402
from workers.build_3dtiles_v11 import build_tile_glb  # noqa: E402
from workers.etl_bigquery_to_postgis import run_postgis_etl  # noqa: E402

client = TestClient(app)


def test_ogc_landing_conformance_and_collections() -> None:
    landing = client.get("/ogc")
    assert landing.status_code == 200
    body = landing.json()
    rels = {lnk["rel"] for lnk in body["links"]}
    assert "conformance" in rels
    assert "data" in rels
    assert "catalog" in rels
    assert any("processes" in r for r in rels)

    conf = client.get("/ogc/conformance")
    assert conf.status_code == 200
    conforms = " ".join(conf.json()["conformsTo"])
    assert "ogcapi-features-1" in conforms
    assert "ogcapi-tiles-1" in conforms
    assert "ogcapi-processes-1" in conforms
    assert "ogcapi-records-1" in conforms

    cols = client.get("/ogc/collections")
    assert cols.status_code == 200
    c_ids = {c["id"] for c in cols.json()["collections"]}
    assert len(c_ids) >= 18
    for expected in ("buildings", "zoning_parcels", "agebs", "aquifers", "records"):
        assert expected in c_ids


def test_ogc_features_agebs_and_buildings() -> None:
    r_ageb = client.get("/ogc/collections/agebs/items", params={"limit": 10})
    assert r_ageb.status_code == 200
    d_ageb = r_ageb.json()
    assert d_ageb["type"] == "FeatureCollection"
    assert d_ageb["numberMatched"] == 1155
    assert d_ageb["numberReturned"] == 10
    assert len(d_ageb["features"]) == 10

    r_bldg = client.get(
        "/ogc/collections/buildings/items",
        params={"bbox": "-110.33,24.13,-110.29,24.16", "limit": 25},
    )
    assert r_bldg.status_code == 200
    d_bldg = r_bldg.json()
    assert d_bldg["type"] == "FeatureCollection"
    assert d_bldg["numberReturned"] > 0
    assert d_bldg["features"][0]["geometry"]["type"] == "Polygon"


def test_ogc_vector_tiles_mvt_la_paz() -> None:
    t = mercantile.tile(-110.3128, 24.1426, 11)
    r_mvt = client.get(f"/ogc/collections/agebs/tiles/WebMercatorQuad/{t.z}/{t.y}/{t.x}.mvt")
    assert r_mvt.status_code == 200
    assert r_mvt.headers["content-type"].startswith("application/vnd.mapbox-vector-tile")
    assert len(r_mvt.content) > 50

    decoded = mapbox_vector_tile.decode(r_mvt.content)
    assert "agebs" in decoded
    assert len(decoded["agebs"]["features"]) >= 1


def test_ogc_processes_sync_and_async() -> None:
    plist = client.get("/ogc/processes")
    assert plist.status_code == 200
    pids = {p["id"] for p in plist.json()["processes"]}
    assert "bcs-scenario-simulation-2050" in pids

    sync_res = client.post(
        "/ogc/processes/bcs-scenario-simulation-2050/execution",
        json={"inputs": {"scope_id": "03", "scenario_name": "COMPACT_SUSTAINABLE_2050", "target_year": 2050}},
    )
    assert sync_res.status_code == 200
    s_data = sync_res.json()
    assert s_data["status"] == "successful"
    assert s_data["results"]["sdi_score_2050"] > 0

    async_res = client.post(
        "/ogc/processes/bcs-scenario-simulation-2050/execution",
        headers={"Prefer": "respond-async"},
        json={"inputs": {"scope_id": "03003", "scenario_name": "BAU_TENDENCIAL", "target_year": 2050}},
    )
    assert async_res.status_code == 201
    assert "location" in async_res.headers
    job_id = async_res.json()["jobID"]

    final_payload = None
    for _ in range(30):
        res_poll = client.get(f"/ogc/jobs/{job_id}/results")
        if res_poll.status_code == 200:
            final_payload = res_poll.json()
            break
        assert res_poll.status_code == 202
        time.sleep(0.05)

    assert final_payload is not None
    assert final_payload["scope_id"] == "03003"
    assert final_payload["sdi_score_2050"] > 0


def test_ogc_records_iso19115_and_3dtiles_info() -> None:
    r_rec = client.get("/ogc/collections/records/items", params={"q": "CONAGUA"})
    assert r_rec.status_code == 200
    rec_fc = r_rec.json()
    assert rec_fc["numberMatched"] >= 1
    first = rec_fc["features"][0]
    assert first["id"] == first["properties"]["identifier"]

    r_single = client.get(f"/ogc/collections/records/items/{first['id']}")
    assert r_single.status_code == 200
    assert r_single.json()["id"] == first["id"]

    r_3d = client.get("/api/twin/3dtiles/info")
    assert r_3d.status_code == 200
    info = r_3d.json()
    assert info["buildings_count"] == 396823
    assert info["cities_count"] == 9
    assert info["tileset_url"].endswith("tileset.json")


def test_3dtiles_glb_builder_and_postgis_etl_dry_run() -> None:
    sample_buildings = [
        {
            "id": 101,
            "building_id": "bldg_test_101",
            "height_m": 12.5,
            "floors": 4,
            "solar_kwp": 18.4,
            "surge_risk": 2,
            "ageb_cvegeo": "030030001001A",
            "ring": [
                [-110.3130, 24.1425],
                [-110.3128, 24.1425],
                [-110.3128, 24.1427],
                [-110.3130, 24.1427],
                [-110.3130, 24.1425],
            ],
        },
        {
            "id": 102,
            "building_id": "bldg_test_102",
            "height_m": 6.0,
            "floors": 2,
            "solar_kwp": 6.2,
            "surge_risk": 0,
            "ageb_cvegeo": "030030001001A",
            "ring": [
                [-110.3126, 24.1425],
                [-110.3125, 24.1425],
                [-110.3125, 24.1426],
                [-110.3126, 24.1426],
            ],
        },
    ]
    glb_bytes, meta = build_tile_glb(sample_buildings, lon0=-110.3128, lat0=24.1426)
    assert meta["feature_count"] == 2
    assert len(glb_bytes) % 4 == 0
    magic, version, total_len = struct.unpack("<4sII", glb_bytes[:12])
    assert magic == b"glTF"
    assert version == 2
    assert total_len == len(glb_bytes)

    json_len, chunk_type = struct.unpack("<II", glb_bytes[12:20])
    assert chunk_type == 0x4E4F534A
    gltf = json.loads(glb_bytes[20 : 20 + json_len].decode("utf-8"))
    assert "EXT_mesh_features" in gltf["extensionsUsed"]
    assert "EXT_structural_metadata" in gltf["extensionsUsed"]

    etl_out = run_postgis_etl(dry_run=True)
    assert etl_out["status"] == "dry_run"
    tables = {t["table"]: t for t in etl_out["plan"]["tables"]}
    assert tables["buildings"]["rows"] == 396823
    assert tables["zoning_parcels"]["rows"] == 79515
    assert tables["spatial_layer_features"]["layers_count"] >= 15
