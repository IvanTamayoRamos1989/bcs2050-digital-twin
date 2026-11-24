"""Automated VVUQ & Coupled Physics Simulation Tests (SFINCS Flood, Network Isochrone, WNTR, Backtest Report)."""

from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

import rasterio
from fastapi.testclient import TestClient

TWIN_ROOT = Path(__file__).resolve().parents[2]
if str(TWIN_ROOT) not in sys.path:
    sys.path.insert(0, str(TWIN_ROOT))

from backend.server import app  # noqa: E402
from workers.physics_engines import run_physics_process  # noqa: E402

client = TestClient(app)


def _assert_vvuq_block(vvuq: dict) -> None:
    for key in (
        "standard",
        "engine_family",
        "calibration_dataset",
        "validation_error_rmse_or_mape",
        "p10_p50_p90_uncertainty_band",
        "assumptions",
        "legal_disclaimer",
    ):
        assert key in vvuq and vvuq[key], f"Missing VVUQ field: {key}"
    assert "CENAPRED" in vvuq["legal_disclaimer"]
    assert "CONAGUA" in vvuq["legal_disclaimer"]


def test_simulation_and_goal_gap_include_vvuq_and_p10_p90_bands() -> None:
    sim = client.post(
        "/api/twin/simulate",
        json={"scope_id": "03003", "scenario_name": "COMPACT_SUSTAINABLE_2050", "target_year": 2050},
    )
    assert sim.status_code == 200
    sdata = sim.json()
    _assert_vvuq_block(sdata["vvuq"])
    for pt in sdata["trajectory"]:
        assert pt["sdi_p10"] <= pt["sdi_p50"] <= pt["sdi_p90"]
        assert pt["aquifer_p10"] <= pt["aquifer_p50"] <= pt["aquifer_p90"]

    gg = client.post(
        "/api/twin/goal-gap",
        json={"scope_id": "03", "target_city15_score": 88.0, "target_infill_share_pct": 68.0},
    )
    assert gg.status_code == 200
    gdata = gg.json()
    _assert_vvuq_block(gdata["vvuq"])
    capex_band = gdata["vvuq"]["p10_p50_p90_uncertainty_band"]["estimated_capex_mdp_mxn"]
    assert capex_band["p10"] <= capex_band["p50"] <= capex_band["p90"]

    ogc_sim = client.post(
        "/ogc/processes/bcs-scenario-simulation-2050/execution",
        json={"inputs": {"scope_id": "03", "scenario_name": "BAU_TENDENCIAL", "target_year": 2050}},
    )
    assert ogc_sim.status_code == 200
    _assert_vvuq_block(ogc_sim.json()["results"]["vvuq"])


def test_arroyo_flood_sfincs_cog_and_vvuq() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        res = run_physics_process(
            "arroyo_flood_sfincs",
            {"city_slug": "cabo_san_lucas", "return_period_yr": 100, "suds_coverage_pct": 25.0},
            out_dir=Path(tmp),
        )
        assert res["process_id"] == "arroyo_flood_sfincs"
        assert res["summary"]["buildings_evaluated"] == 99951
        assert res["summary"]["buildings_exposed_gt_03m"] > 0
        assert len(res["overlay_geojson"]["features"]) > 20
        _assert_vvuq_block(res["vvuq"])

        cog_path = Path(res["cog_local_path"])
        assert cog_path.exists()
        with rasterio.open(cog_path) as ds:
            assert ds.crs.to_string() == "EPSG:32612"
            assert ds.is_tiled
            assert ds.overviews(1)


def _run_ogc_async_process(process_id: str, inputs: dict) -> dict:
    r = client.post(
        f"/ogc/processes/{process_id}/execution",
        headers={"Prefer": "respond-async"},
        json={"inputs": inputs},
    )
    assert r.status_code == 201
    job_id = r.json()["jobID"]
    for _ in range(80):
        st = client.get(f"/ogc/jobs/{job_id}")
        assert st.status_code == 200
        status = st.json()["status"]
        if status == "successful":
            res = client.get(f"/ogc/jobs/{job_id}/results")
            assert res.status_code == 200
            return res.json()
        assert status in {"accepted", "running"}, f"Unexpected job status: {st.json()}"
        time.sleep(0.1)
    raise AssertionError(f"OGC async job {job_id} ({process_id}) timed out")


def test_async_ogc_physics_processes_flood_network_wntr() -> None:
    flood_res = _run_ogc_async_process(
        "arroyo_flood_sfincs",
        {"city_slug": "la_paz", "return_period_yr": 100, "suds_coverage_pct": 30.0},
    )
    assert flood_res["process_id"] == "arroyo_flood_sfincs"
    assert flood_res["summary"]["buildings_evaluated"] == 151975
    _assert_vvuq_block(flood_res["vvuq"])

    net_res = _run_ogc_async_process(
        "network_isochrone_r5py",
        {"city_slug": "la_paz", "walk_speed_kmh": 4.5, "max_minutes": 15.0},
    )
    assert net_res["process_id"] == "network_isochrone_r5py"
    assert net_res["summary"]["area_15m_ha"] > net_res["summary"]["area_10m_ha"] > net_res["summary"]["area_5m_ha"] > 0
    assert (net_res["summary"]["reachable_health_pois"] + net_res["summary"]["reachable_education_pois"]) > 0
    iso_feats = [f for f in net_res["overlay_geojson"]["features"] if f["properties"].get("kind") == "isochrone_band"]
    assert len(iso_feats) == 3
    _assert_vvuq_block(net_res["vvuq"])

    wntr_res = _run_ogc_async_process(
        "water_network_wntr",
        {"pilot_id": "la_paz_tandeo", "ptar_reuse_pct": 68.0, "desal_added_lps": 150.0},
    )
    assert wntr_res["process_id"] == "water_network_wntr"
    assert wntr_res["summary"]["mean_pressure_gain_m"] > 0
    assert wntr_res["summary"]["scenario_unmet_demand_pct"] < wntr_res["summary"]["baseline_unmet_demand_pct"]
    assert len(wntr_res["tank_depletion_series"]) >= 24
    _assert_vvuq_block(wntr_res["vvuq"])


def test_vvuq_historical_backtest_report_committed() -> None:
    report_path = TWIN_ROOT / "docs" / "VVUQ_BACKTEST_REPORT_2010_2023.md"
    assert report_path.exists()
    content = report_path.read_text(encoding="utf-8")
    assert "INEGI" in content
    assert "CONAGUA" in content
    assert "8.39%" in content
    assert "2.228 hm3" in content
