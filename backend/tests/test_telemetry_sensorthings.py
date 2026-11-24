"""Tests for decoupled telemetry cache (<150ms p95), OGC SensorThings API v1.1, and ingestion worker."""

from __future__ import annotations

import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TWIN_ROOT = Path(__file__).resolve().parents[2]
if str(TWIN_ROOT) not in sys.path:
    sys.path.insert(0, str(TWIN_ROOT))

from backend.live_feeds import reset_telemetry_cache, seed_in_memory_snapshot  # noqa: E402
from backend.security import RATE_LIMITER  # noqa: E402
from backend.server import app  # noqa: E402
from workers.telemetry_ingestor import run_ingestion_cycle, snapshot_to_bigquery_rows  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_telemetry_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BCS2050_USE_FIRESTORE", "false")
    monkeypatch.setenv("BCS2050_USE_BIGQUERY", "false")
    monkeypatch.delenv("BCS2050_SENSOR_INGEST_TOKENS", raising=False)
    monkeypatch.setenv("BCS2050_REQUIRE_AUTH_FOR_EXPORTS", "false")
    reset_telemetry_cache()
    RATE_LIMITER.reset()
    yield
    reset_telemetry_cache()
    RATE_LIMITER.reset()


def _iso_ago(seconds_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def test_live_summary_sub_150ms_p95_and_no_outbound_http(monkeypatch: pytest.MonkeyPatch) -> None:
    recent = _iso_ago(45)
    seed_in_memory_snapshot(
        {
            "ingested_at": recent,
            "updated_at": recent,
            "weather": {
                "la_paz": {"temp_c": 26.5, "humidity_pct": 50, "wind_kmh": 14.0, "time": recent},
            },
            "aircraft": {
                "count": 2,
                "aircraft": [
                    {"icao24": "abc123", "callsign": "AMX201", "country": "Mexico", "lon": -110.3, "lat": 24.1, "altitude_m": 3200, "velocity_ms": 140, "heading": 120},
                    {"icao24": "def456", "callsign": "VIV402", "country": "Mexico", "lon": -109.9, "lat": 22.9, "altitude_m": 2100, "velocity_ms": 125, "heading": 150},
                ],
                "source": "OpenSky Network",
            },
            "marine": {"count": 0, "connected": False, "vessels": [], "notice": "AIS standby"},
            "cyclones": {"count": 0, "active_storms": [], "source": "NOAA NHC"},
            "feeds": {
                "weather": {"upstream_ok": True, "fetched_at": recent, "source": "Open-Meteo API", "count": 5},
                "aircraft": {"upstream_ok": True, "fetched_at": recent, "source": "OpenSky Network", "count": 2},
                "marine": {"upstream_ok": False, "fetched_at": recent, "source": "AIS Stream Proxy", "count": 0},
                "cyclones": {"upstream_ok": True, "fetched_at": recent, "source": "NOAA NHC", "count": 0},
            },
        }
    )

    def _forbid_network(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Synchronous HTTP call inside /api/twin/live/summary is forbidden")

    monkeypatch.setattr(urllib.request, "urlopen", _forbid_network)

    latencies_ms: list[float] = []
    last_body: dict = {}
    for _ in range(20):
        t0 = time.perf_counter()
        resp = client.get("/api/twin/live/summary")
        dt_ms = (time.perf_counter() - t0) * 1000.0
        assert resp.status_code == 200
        latencies_ms.append(dt_ms)
        last_body = resp.json()

    latencies_ms.sort()
    p95_ms = latencies_ms[int(len(latencies_ms) * 0.95) - 1]
    assert p95_ms < 150.0, f"p95 latency too high: {p95_ms:.2f} ms"
    assert last_body["overall_status"] == "LIVE"
    assert last_body["feeds"]["weather"]["status"] == "LIVE"
    assert last_body["feeds"]["aircraft"]["status"] == "LIVE"
    assert last_body["feeds"]["marine"]["status"] == "OFFLINE"
    assert "LIVE" in last_body["feeds"]["weather"]["freshness_en"]


def test_live_summary_freshness_tiers() -> None:
    seed_in_memory_snapshot(
        {
            "ingested_at": _iso_ago(600),
            "updated_at": _iso_ago(600),
            "weather": {"la_paz": {"temp_c": 24.0, "humidity_pct": 55, "wind_kmh": 12.0}},
            "aircraft": {
                "count": 1,
                "aircraft": [{"icao24": "cached1", "callsign": "BCS01", "country": "Mexico", "lon": -110.3, "lat": 24.1, "altitude_m": 1500, "velocity_ms": 110, "heading": 90}],
                "source": "OpenSky Network",
            },
            "marine": {"count": 0, "connected": False, "vessels": []},
            "cyclones": {"count": 0, "active_storms": [], "source": "NOAA NHC"},
            "feeds": {
                "weather": {"upstream_ok": True, "fetched_at": _iso_ago(60), "source": "Open-Meteo API", "count": 5},
                "aircraft": {"upstream_ok": False, "fetched_at": _iso_ago(600), "source": "OpenSky Network", "count": 1},
                "marine": {"upstream_ok": False, "fetched_at": _iso_ago(60), "source": "AIS Stream Proxy", "count": 0},
                "cyclones": {"upstream_ok": True, "fetched_at": _iso_ago(2400), "source": "NOAA NHC", "count": 0},
            },
        }
    )

    data = client.get("/api/twin/live/summary").json()
    assert data["feeds"]["weather"]["status"] == "LIVE"
    assert data["feeds"]["aircraft"]["status"] == "CACHED"
    assert "CACHED 10m ago" == data["feeds"]["aircraft"]["freshness_en"]
    assert data["feeds"]["marine"]["status"] == "OFFLINE"
    assert data["feeds"]["cyclones"]["status"] == "STALE"


def test_ogc_sensorthings_v11_endpoints_and_expand() -> None:
    root = client.get("/FROST-Server/v1.1")
    assert root.status_code == 200
    collections = {item["name"] for item in root.json()["value"]}
    assert {"Things", "Locations", "Datastreams", "ObservedProperties", "Sensors", "Observations", "FeaturesOfInterest"}.issubset(collections)

    things_resp = client.get("/FROST-Server/v1.1/Things?$expand=Locations,Datastreams($expand=Observations($top=1))")
    assert things_resp.status_code == 200
    body = things_resp.json()
    assert body["@iot.count"] == 14
    assert len(body["value"]) == 14

    first_thing = body["value"][0]
    assert "@iot.id" in first_thing and "@iot.selfLink" in first_thing
    assert len(first_thing["Locations"]) == 1
    assert first_thing["Locations"][0]["location"]["type"] == "Point"
    assert len(first_thing["Datastreams"]) >= 1
    assert "unitOfMeasurement" in first_thing["Datastreams"][0]

    filtered = client.get("/FROST-Server/v1.1/Things?$filter=properties/category eq 'conagua_aquifer'")
    assert filtered.status_code == 200
    assert filtered.json()["@iot.count"] == 5

    for ep in ["/FROST-Server/v1.1/Datastreams", "/FROST-Server/v1.1/ObservedProperties", "/FROST-Server/v1.1/Sensors", "/FROST-Server/v1.1/Locations", "/FROST-Server/v1.1/Observations", "/FROST-Server/v1.1/FeaturesOfInterest"]:
        r = client.get(ep)
        assert r.status_code == 200
        assert isinstance(r.json()["value"], list) and len(r.json()["value"]) >= 1


def test_ogc_sensorthings_pilot_webhook_ingest_and_token_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    # 1. Open sandbox ingest for Pilot A, B, C
    for ds_id, val in [
        ("ds-pilot-a-oomsapas-tank-level", 74.5),
        ("ds-pilot-b-arroyo-stage", 1.35),
        ("ds-pilot-c-sibcs-pml", 2480.2),
    ]:
        r = client.post(
            "/FROST-Server/v1.1/Observations",
            json={
                "Datastream": {"@iot.id": ds_id},
                "phenomenonTime": "2026-11-24T12:10:00Z",
                "result": val,
                "resultQuality": "PILOT_TEST_VERIFIED",
            },
        )
        assert r.status_code == 201
        created = r.json()
        assert created["result"] == val
        assert "@iot.id" in created and "@iot.selfLink" in created

    obs_a = client.get("/FROST-Server/v1.1/Datastreams('ds-pilot-a-oomsapas-tank-level')/Observations").json()
    assert obs_a["value"][0]["result"] == 74.5

    # 2. Strict token authentication when BCS2050_SENSOR_INGEST_TOKENS is configured
    monkeypatch.setenv("BCS2050_SENSOR_INGEST_TOKENS", "sensor-secret-abc")
    unauth = client.post(
        "/FROST-Server/v1.1/Observations",
        json={"Datastream": {"@iot.id": "ds-pilot-a-oomsapas-tank-level"}, "result": 75.0},
    )
    assert unauth.status_code == 401

    auth_ok = client.post(
        "/FROST-Server/v1.1/Observations",
        headers={"Authorization": "Bearer sensor-secret-abc"},
        json={"Datastream": {"@iot.id": "ds-pilot-a-oomsapas-tank-level"}, "result": 75.5},
    )
    assert auth_ok.status_code == 201

    schemas = client.get("/api/twin/sensorthings/schemas").json()
    assert len(schemas["pilots"]) == 3


def test_telemetry_ingestor_worker_cycle_and_resilience() -> None:
    def _mock_fetcher(url: str, timeout: float = 8.0):
        if "open-meteo.com" in url:
            return {"current": {"temperature_2m": 28.4, "relative_humidity_2m": 46, "wind_speed_10m": 15.2, "weather_code": 0, "precipitation": 0.0, "time": "2026-11-24T12:15"}}
        if "opensky-network.org" in url:
            return {
                "states": [
                    ["4ba100", "AMX210 ", "Mexico", 0, 0, -110.31, 24.14, 4100.0, False, 195.0, 140.0],
                    ["4ba200", "VIV108 ", "Mexico", 0, 0, -109.91, 22.90, 2900.0, False, 175.0, 110.0],
                ]
            }
        if "/api/marine-traffic" in url:
            return {"connected": True, "vessels": [{"mmsi": "345001122", "name": "B/M COROMUEL", "type": "Ferry", "lon": -110.32, "lat": 24.22}]}
        if "nhc.noaa.gov" in url:
            return {"activeStorms": []}
        raise RuntimeError(f"Unexpected URL: {url}")

    summary = run_ingestion_cycle(
        write_firestore=False,
        write_bigquery=False,
        publish_pubsub=False,
        fetcher=_mock_fetcher,
    )
    assert summary["status"] == "ok"
    assert summary["feeds"]["weather"]["count"] == 5
    assert summary["feeds"]["aircraft"]["count"] == 2
    assert summary["feeds"]["marine"]["count"] == 1
    assert summary["rows_prepared"] == 18

    live = client.get("/api/twin/live/summary").json()
    assert len(live["weather"]) == 5
    assert live["aircraft"]["count"] == 2
    assert live["marine"]["count"] == 1
    assert live["feeds"]["marine"]["status"] == "LIVE"

    rows = snapshot_to_bigquery_rows(
        {
            "ingested_at": summary["ingested_at"],
            "weather": live["weather"],
            "aircraft": live["aircraft"],
            "marine": live["marine"],
            "cyclones": live["cyclones"],
            "feeds": summary["feeds"],
        }
    )
    assert len(rows) == 18
    assert any(r["feed_name"] == "weather" and r["municipality_code"] == "03008" for r in rows)
