"""Automated verification suite for the BCS2050 Digital Twin FastAPI backend and R-Tree datastore."""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TWIN_ROOT = Path(__file__).resolve().parents[2]
if str(TWIN_ROOT) not in sys.path:
    sys.path.insert(0, str(TWIN_ROOT))

from backend.server import app  # noqa: E402

client = TestClient(app)


def test_health_and_overview_real_counts() -> None:
    r = client.get("/api/twin/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["buildings_3d_indexed"] == 396823
    assert data["zoning_parcels_indexed"] == 79515
    assert data["agebs_enriched"] == 1155

    ov = client.get("/api/twin/overview")
    assert ov.status_code == 200
    body = ov.json()
    assert body["state"]["population_2025"] > 900000
    assert isinstance(body["municipalities"]["03003"]["camera"], dict)
    assert isinstance(body["cities"]["la_paz"]["camera"], dict)
    assert len(body["cities"]) == 9


def test_rtree_buildings_and_zoning_latency() -> None:
    t0 = time.perf_counter()
    # Downtown La Paz viewport bounding box
    r = client.get(
        "/api/twin/buildings",
        params={"minx": -110.33, "miny": 24.13, "maxx": -110.29, "maxy": 24.16, "limit": 1500},
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    assert r.status_code == 200
    payload = r.json()
    assert payload["count"] > 500
    assert elapsed_ms < 500.0
    first = payload["buildings"][0]
    assert first["height_m"] > 0
    assert len(first["polygon"]) >= 4

    zr = client.get(
        "/api/twin/zoning",
        params={"minx": -110.33, "miny": 24.13, "maxx": -110.29, "maxy": 24.16, "limit": 1000},
    )
    assert zr.status_code == 200
    assert zr.json()["count"] > 100


def test_layers_and_point_inspection() -> None:
    ageb_resp = client.get("/api/twin/layer/agebs")
    assert ageb_resp.status_code == 200
    feats = ageb_resp.json()["features"]
    assert len(feats) == 1155
    p0 = feats[0]["properties"]
    assert 0 <= p0["city_science_index"] <= 100
    assert 0 <= p0["city15_score"] <= 100

    # Inspect downtown La Paz
    insp = client.post("/api/twin/inspect", json={"lon": -110.3128, "lat": 24.1426})
    assert insp.status_code == 200
    idata = insp.json()
    assert idata["ageb"] is not None
    assert idata["aquifer"] is not None
    assert idata["nearest_substation"] is not None
    assert len(idata["nearest_services"]["health"]) >= 1


def test_simulation_goal_gap_recommendations_and_chat() -> None:
    sim = client.post(
        "/api/twin/simulate",
        json={"scope_id": "03008", "scenario_name": "COMPACT_SUSTAINABLE_2050", "target_year": 2050},
    )
    assert sim.status_code == 200
    sdata = sim.json()
    assert sdata["sdi_score_2050"] > sdata["sdi_score_2031"]
    assert len(sdata["ageb_deltas"]) > 100

    comp = client.get("/api/twin/scenarios/compare/03")
    assert comp.status_code == 200
    assert "COMPACT_SUSTAINABLE_2050" in comp.json()["scenarios"]

    gg = client.post(
        "/api/twin/goal-gap",
        json={"scope_id": "03", "target_city15_score": 88.0, "target_infill_share_pct": 70.0},
    )
    assert gg.status_code == 200
    assert gg.json()["estimated_capex_mdp_mxn"] > 0

    recs = client.get("/api/twin/recommendations/03")
    assert recs.status_code == 200
    assert len(recs.json()["priority_actions"]) >= 4

    chat = client.post(
        "/api/twin/chat",
        json={"query": "¿Dónde está el déficit de agua y potencial solar en La Paz?", "scope_id": "03003"},
    )
    assert chat.status_code == 200
    assert len(chat.json()["lineage"]) >= 3

    arch = client.get("/api/twin/architecture")
    assert arch.status_code == 200
    assert len(arch.json()["commercial_tiers"]) == 3

    live = client.get("/api/twin/live/summary")
    assert live.status_code == 200
    assert "weather" in live.json() and "aircraft" in live.json() and "marine" in live.json()


def test_cad_bim_exporters_and_aerial_tours() -> None:
    tours_resp = client.get("/api/twin/tours")
    assert tours_resp.status_code == 200
    tdata = tours_resp.json()
    assert any(t["id"] == "el_tezal" for t in tdata["tours"])
    assert "el_tezal" in tdata["corridors"]

    dxf_resp = client.get("/api/twin/export/dxf", params={"corridor": "el_tezal"})
    assert dxf_resp.status_code == 200
    dxf_text = dxf_resp.content.decode("utf-8", errors="ignore")
    assert len(dxf_resp.content) > 10_000
    assert "BCS_BUILDINGS_3D" in dxf_text
    assert "LWPOLYLINE" in dxf_text

    obj_resp = client.get("/api/twin/export/obj3d", params={"corridor": "el_tezal"})
    assert obj_resp.status_code == 200
    obj_text = obj_resp.text
    assert "EPSG:32612" in obj_text
    assert "g BCS_Buildings_3D" in obj_text
    assert "\nv " in obj_text
    assert "\nf " in obj_text

    bim_resp = client.get("/api/twin/export/bim-package", params={"corridor": "el_tezal"})
    assert bim_resp.status_code == 200
    bdata = bim_resp.json()
    assert bdata["iso_19650"]["crs"] == "EPSG:32612"
    assert len(bdata["revit_massing_elements"]) > 0

    ue_resp = client.get("/api/twin/export/unreal-manifest", params={"corridor": "el_tezal"})
    assert ue_resp.status_code == 200
    assert "CesiumGeoreference" in ue_resp.json()

    arch_resp = client.get("/api/twin/architecture")
    assert arch_resp.status_code == 200
    adata = arch_resp.json()
    assert adata["capabilities"]["cad_bim_exporters"] is True
    assert adata["capabilities"]["strict_cors_enabled"] is True
    assert adata["capabilities"]["rate_limiting_enabled"] is True
    assert len(adata["aec_bim_bridge"]) == 4


def test_security_cors_headers_rate_limit_and_optional_rbac(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.security import RATE_LIMITER

    RATE_LIMITER.reset()
    try:
        # 1. Baseline security headers & strict CORS allowlist
        ok_cors = client.get("/api/twin/health", headers={"Origin": "https://panel.bcs2050.com"})
        assert ok_cors.status_code == 200
        assert ok_cors.headers.get("access-control-allow-origin") == "https://panel.bcs2050.com"
        assert ok_cors.headers.get("x-content-type-options") == "nosniff"
        assert ok_cors.headers.get("x-frame-options") == "SAMEORIGIN"

        bad_cors = client.get("/api/twin/health", headers={"Origin": "https://evil.example.com"})
        assert bad_cors.status_code == 200
        assert "access-control-allow-origin" not in bad_cors.headers

        # 2. Sliding-window heavy-endpoint rate limit (429 + Retry-After + CORS header preserved)
        monkeypatch.setenv("BCS2050_HEAVY_RPM", "3")
        RATE_LIMITER.reset()
        for idx in range(3):
            r = client.get(
                "/api/twin/export/unreal-manifest",
                params={"corridor": "el_tezal"},
                headers={"Origin": "https://panel.bcs2050.com"},
            )
            assert r.status_code == 200, f"request {idx + 1} failed unexpectedly: {r.text}"
        blocked = client.get(
            "/api/twin/export/unreal-manifest",
            params={"corridor": "el_tezal"},
            headers={"Origin": "https://panel.bcs2050.com"},
        )
        assert blocked.status_code == 429
        assert "retry-after" in blocked.headers
        assert blocked.headers.get("access-control-allow-origin") == "https://panel.bcs2050.com"

        # 3. Optional Planner RBAC for export routes
        RATE_LIMITER.reset()
        monkeypatch.setenv("BCS2050_REQUIRE_AUTH_FOR_EXPORTS", "true")
        monkeypatch.setenv("BCS2050_PLANNER_API_TOKENS", "test-secret-token")
        unauth = client.get(
            "/api/twin/export/unreal-manifest",
            params={"corridor": "el_tezal"},
            headers={"Origin": "https://panel.bcs2050.com"},
        )
        assert unauth.status_code == 401
        assert unauth.headers.get("access-control-allow-origin") == "https://panel.bcs2050.com"

        auth_ok = client.get(
            "/api/twin/export/unreal-manifest",
            params={"corridor": "el_tezal"},
            headers={
                "Authorization": "Bearer test-secret-token",
                "Origin": "https://panel.bcs2050.com",
            },
        )
        assert auth_ok.status_code == 200
    finally:
        RATE_LIMITER.reset()


def test_canonical_kpis_and_iso19115_metadata() -> None:
    import json
    from pathlib import Path

    ov = client.get("/api/twin/overview")
    assert ov.status_code == 200
    ov_data = ov.json()
    st = ov_data["state"]
    assert st["population_inegi_2020_official"] == 798447
    assert st["aquifers_bcs_official_count"] == 39
    assert st["aquifers_bcs_no_availability_count"] == 22
    assert st["aquifers_strict_deficit_count"] == 21
    muns_sum = sum(m["population_inegi_2020_official"] for m in ov_data["municipalities"].values())
    assert muns_sum == 798447

    meta_resp = client.get("/api/twin/metadata")
    assert meta_resp.status_code == 200
    meta = meta_resp.json()
    records = meta["records"]
    assert len(records) >= 25
    required_keys = (
        "identifier",
        "title",
        "source_agency",
        "source_url",
        "reference_date",
        "last_updated_utc",
        "update_cadence",
        "crs",
        "data_nature",
        "license_spdx",
        "attribution_text",
    )
    for rec in records:
        for k in required_keys:
            assert rec.get(k), f"Record {rec.get('identifier')} missing required ISO 19115 field {k}"

    panel_cat_path = TWIN_ROOT / "data" / "panel_v2_release" / "catalog_v2_extension.json"
    panel_cat = json.loads(panel_cat_path.read_text(encoding="utf-8"))
    layers = panel_cat["layers"]
    assert len(layers) == 12
    for lyr in layers:
        for k in ("source_agency", "reference_date", "license_spdx", "data_nature", "attribution_text"):
            assert lyr.get(k), f"Panel v2 layer {lyr.get('id')} missing {k}"
