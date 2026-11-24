"""Resilient background telemetry ingestion worker for BCS2050 Digital Twin.

Executes outside HTTP request serving (Cloud Run Job via Cloud Scheduler every 5 minutes),
writes shared cache snapshots to Firestore (`bcs-studio`), persists partitioned time-series rows
to BigQuery (`bcs2050_gis.telemetry_observations`), and publishes snapshot notifications to Pub/Sub.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config import get_firestore_database, get_telemetry_pubsub_topic, use_bigquery, use_firestore_cache  # noqa: E402
from backend.live_feeds import (  # noqa: E402
    FIRESTORE_COLLECTION,
    FIRESTORE_LATEST_DOC,
    seed_in_memory_snapshot,
)

logger = logging.getLogger("bcs2050.workers.telemetry_ingestor")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "bcs2050")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "northamerica-south1")
BQ_TELEMETRY_TABLE = f"{PROJECT_ID}.bcs2050_gis.telemetry_observations"

WEATHER_STATIONS: list[dict[str, Any]] = [
    {"slug": "la_paz", "municipality_code": "03003", "name": "La Paz", "lat": 24.1426, "lon": -110.3128},
    {"slug": "cabo_san_lucas", "municipality_code": "03008", "name": "Los Cabos", "lat": 22.8905, "lon": -109.9167},
    {"slug": "ciudad_constitucion", "municipality_code": "03001", "name": "Comondú", "lat": 25.0322, "lon": -111.6703},
    {"slug": "loreto", "municipality_code": "03009", "name": "Loreto", "lat": 26.0127, "lon": -111.3489},
    {"slug": "santa_rosalia", "municipality_code": "03002", "name": "Mulegé", "lat": 27.3396, "lon": -112.2676},
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _default_fetch_json(url: str, timeout: float = 8.0) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "BCS2050-TelemetryWorker/2.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _is_recent_iso(ts: str | None, max_age_s: int = 1800) -> bool:
    if not ts or not isinstance(ts, str):
        return False
    cleaned = ts[:-1] + "+00:00" if ts.endswith("Z") else ts
    try:
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() <= max_age_s
    except ValueError:
        return False


def _fetch_weather_all(fetcher: Callable[[str, float], Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    t0 = time.perf_counter()
    now_iso = _utc_now_iso()

    def _one(st: dict[str, Any]) -> tuple[str, dict[str, Any], bool]:
        url = (
            f"https://api.open-meteo.com/v1/forecast?latitude={st['lat']}&longitude={st['lon']}"
            "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation"
            "&timezone=America%2FMazatlan"
        )
        try:
            data = fetcher(url, 7.0)
            cur = data.get("current") or {}
            return (
                st["slug"],
                {
                    "municipality_code": st["municipality_code"],
                    "name": st["name"],
                    "lat": st["lat"],
                    "lon": st["lon"],
                    "temp_c": cur.get("temperature_2m"),
                    "humidity_pct": cur.get("relative_humidity_2m"),
                    "wind_kmh": cur.get("wind_speed_10m"),
                    "precipitation_mm": cur.get("precipitation", 0.0),
                    "weather_code": cur.get("weather_code"),
                    "time": cur.get("time") or now_iso,
                },
                cur.get("temperature_2m") is not None,
            )
        except Exception as exc:  # noqa: BLE001
            return st["slug"], {"municipality_code": st["municipality_code"], "name": st["name"], "error": str(exc)}, False

    out: dict[str, Any] = {}
    ok_count = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        for slug, payload, ok in pool.map(_one, WEATHER_STATIONS):
            out[slug] = payload
            if ok:
                ok_count += 1

    latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    meta = {
        "upstream_ok": ok_count >= 1,
        "fetched_at": now_iso,
        "latency_ms": latency_ms,
        "source": "Open-Meteo API",
        "notice": "" if ok_count == len(WEATHER_STATIONS) else f"{ok_count}/{len(WEATHER_STATIONS)} stations updated",
        "count": ok_count,
    }
    return out, meta


def _fetch_opensky(
    fetcher: Callable[[str, float], Any],
    prev_snapshot: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    t0 = time.perf_counter()
    now_iso = _utc_now_iso()
    url = "https://opensky-network.org/api/states/all?lamin=22.0&lomin=-116.0&lamax=28.5&lomax=-108.5"
    try:
        data = fetcher(url, 8.0)
        states = data.get("states") or []
        items: list[dict[str, Any]] = []
        for s in states[:120]:
            if len(s) < 11 or s[5] is None or s[6] is None:
                continue
            items.append(
                {
                    "icao24": s[0],
                    "callsign": str(s[1] or s[0] or "").strip(),
                    "country": s[2] or "",
                    "lon": float(s[5]),
                    "lat": float(s[6]),
                    "altitude_m": float(s[7] or (s[13] if len(s) > 13 else 0.0) or 0.0),
                    "velocity_ms": float(s[9] or 0.0),
                    "heading": float(s[10] or 0.0),
                }
            )
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        payload = {"count": len(items), "aircraft": items, "source": "OpenSky Network", "stale": False, "notice": ""}
        meta = {
            "upstream_ok": True,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "OpenSky Network",
            "notice": "",
            "count": len(items),
        }
        return payload, meta
    except Exception as exc:  # noqa: BLE001
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        prev_air = (prev_snapshot or {}).get("aircraft") or {}
        prev_meta = ((prev_snapshot or {}).get("feeds") or {}).get("aircraft") or {}
        prev_fetched = prev_meta.get("fetched_at") or (prev_snapshot or {}).get("ingested_at")
        if prev_air.get("aircraft") and _is_recent_iso(prev_fetched, 1800):
            preserved = dict(prev_air)
            preserved["stale"] = True
            preserved["notice"] = f"Upstream error ({exc}); serving cached aircraft."
            meta = {
                "upstream_ok": False,
                "fetched_at": prev_fetched,
                "latency_ms": latency_ms,
                "source": "OpenSky Network",
                "notice": f"Fallback to prior snapshot ({exc})",
                "count": int(preserved.get("count") or len(preserved.get("aircraft") or [])),
            }
            return preserved, meta

        payload = {"count": 0, "aircraft": [], "source": "OpenSky Network", "stale": True, "notice": str(exc)}
        meta = {
            "upstream_ok": False,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "OpenSky Network",
            "notice": str(exc),
            "count": 0,
        }
        return payload, meta


def _fetch_marine_ais(
    fetcher: Callable[[str, float], Any],
    prev_snapshot: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    t0 = time.perf_counter()
    now_iso = _utc_now_iso()
    base = os.environ.get(
        "TERRITORIAL_IA_URL",
        "https://bcs2050-territorial-ia-96586614897.northamerica-south1.run.app",
    ).rstrip("/")
    try:
        data = fetcher(f"{base}/api/marine-traffic", 6.0)
        vessels = data.get("vessels") or []
        connected = bool(data.get("connected"))
        notice = str(data.get("notice") or "")
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        if connected:
            payload = {
                "count": len(vessels),
                "connected": True,
                "vessels": vessels[:250],
                "source": "AIS Stream Proxy",
                "notice": notice,
            }
            meta = {
                "upstream_ok": True,
                "fetched_at": now_iso,
                "latency_ms": latency_ms,
                "source": "AIS Stream Proxy",
                "notice": notice,
                "count": len(vessels),
            }
            return payload, meta

        prev_marine = (prev_snapshot or {}).get("marine") or {}
        prev_meta = ((prev_snapshot or {}).get("feeds") or {}).get("marine") or {}
        prev_fetched = prev_meta.get("fetched_at") or (prev_snapshot or {}).get("ingested_at")
        if prev_marine.get("vessels") and _is_recent_iso(prev_fetched, 1800):
            preserved = dict(prev_marine)
            preserved["connected"] = False
            preserved["notice"] = notice or "AIS stream paused; serving recent vessel cache."
            meta = {
                "upstream_ok": False,
                "fetched_at": prev_fetched,
                "latency_ms": latency_ms,
                "source": "AIS Stream Proxy",
                "notice": preserved["notice"],
                "count": int(preserved.get("count") or len(preserved.get("vessels") or [])),
            }
            return preserved, meta

        payload = {
            "count": 0,
            "connected": False,
            "vessels": [],
            "source": "AIS Stream Proxy",
            "notice": notice or "AIS websocket feed offline or awaiting vessels.",
        }
        meta = {
            "upstream_ok": False,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "AIS Stream Proxy",
            "notice": payload["notice"],
            "count": 0,
        }
        return payload, meta
    except Exception as exc:  # noqa: BLE001
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        payload = {"count": 0, "connected": False, "vessels": [], "source": "AIS Stream Proxy", "notice": str(exc)}
        meta = {
            "upstream_ok": False,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "AIS Stream Proxy",
            "notice": str(exc),
            "count": 0,
        }
        return payload, meta


def _fetch_nhc_cyclones(fetcher: Callable[[str, float], Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    t0 = time.perf_counter()
    now_iso = _utc_now_iso()
    try:
        data = fetcher("https://www.nhc.noaa.gov/CurrentStorms.json", 6.0)
        storms = data.get("activeStorms") or []
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        payload = {"count": len(storms), "active_storms": storms, "source": "NOAA NHC", "notice": ""}
        meta = {
            "upstream_ok": True,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "NOAA NHC",
            "notice": "" if storms else "0 active tropical storms",
            "count": len(storms),
        }
        return payload, meta
    except Exception as exc:  # noqa: BLE001
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        payload = {"count": 0, "active_storms": [], "source": "NOAA NHC", "notice": str(exc)}
        meta = {
            "upstream_ok": False,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "NOAA NHC",
            "notice": str(exc),
            "count": 0,
        }
        return payload, meta


def snapshot_to_bigquery_rows(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten telemetry snapshot into partitioned BigQuery observation rows."""
    ingested_at = str(snapshot.get("ingested_at") or _utc_now_iso())
    feeds = snapshot.get("feeds") or {}
    rows: list[dict[str, Any]] = []

    weather = snapshot.get("weather") or {}
    w_status = "LIVE" if (feeds.get("weather") or {}).get("upstream_ok") else "OFFLINE"
    for st in WEATHER_STATIONS:
        slug = st["slug"]
        entry = weather.get(slug) or {}
        if not isinstance(entry, dict) or entry.get("temp_c") is None:
            continue
        obs_at = ingested_at
        thing_id = f"weather-{st['municipality_code']}"
        for metric_name, key, unit in [
            ("temperature_2m_c", "temp_c", "Cel"),
            ("relative_humidity_pct", "humidity_pct", "%"),
            ("wind_speed_kmh", "wind_kmh", "km/h"),
        ]:
            val = entry.get(key)
            if val is None:
                continue
            rows.append(
                {
                    "observed_at": obs_at,
                    "ingested_at": ingested_at,
                    "feed_name": "weather",
                    "thing_id": thing_id,
                    "municipality_code": st["municipality_code"],
                    "metric_name": metric_name,
                    "numeric_value": float(val),
                    "string_value": None,
                    "unit": unit,
                    "status": w_status,
                    "source": "Open-Meteo API",
                    "lat": float(st["lat"]),
                    "lon": float(st["lon"]),
                    "payload_json": json.dumps(entry, ensure_ascii=False),
                }
            )

    air = snapshot.get("aircraft") or {}
    rows.append(
        {
            "observed_at": ingested_at,
            "ingested_at": ingested_at,
            "feed_name": "aircraft",
            "thing_id": "opensky-bcs-corridor",
            "municipality_code": "03",
            "metric_name": "aircraft_active_count",
            "numeric_value": float(air.get("count") or 0),
            "string_value": None,
            "unit": "aircraft",
            "status": "LIVE" if (feeds.get("aircraft") or {}).get("upstream_ok") else "OFFLINE",
            "source": "OpenSky Network",
            "lat": 24.5,
            "lon": -111.0,
            "payload_json": json.dumps({"count": air.get("count", 0), "notice": air.get("notice", "")}),
        }
    )

    marine = snapshot.get("marine") or {}
    rows.append(
        {
            "observed_at": ingested_at,
            "ingested_at": ingested_at,
            "feed_name": "marine",
            "thing_id": "ais-sea-of-cortez",
            "municipality_code": "03",
            "metric_name": "marine_ais_vessels_count",
            "numeric_value": float(marine.get("count") or 0),
            "string_value": "connected" if marine.get("connected") else "offline",
            "unit": "vessels",
            "status": "LIVE" if marine.get("connected") else "OFFLINE",
            "source": "AIS Stream Proxy",
            "lat": 24.16,
            "lon": -110.30,
            "payload_json": json.dumps({"count": marine.get("count", 0), "connected": bool(marine.get("connected"))}),
        }
    )

    cyc = snapshot.get("cyclones") or {}
    rows.append(
        {
            "observed_at": ingested_at,
            "ingested_at": ingested_at,
            "feed_name": "cyclones",
            "thing_id": "nhc-pacific-cyclones",
            "municipality_code": "03",
            "metric_name": "nhc_active_cyclones_count",
            "numeric_value": float(cyc.get("count") or 0),
            "string_value": None,
            "unit": "storms",
            "status": "LIVE" if (feeds.get("cyclones") or {}).get("upstream_ok") else "OFFLINE",
            "source": "NOAA NHC",
            "lat": 22.89,
            "lon": -109.92,
            "payload_json": json.dumps({"count": cyc.get("count", 0)}),
        }
    )
    return rows


def run_ingestion_cycle(
    *,
    write_firestore: bool | None = None,
    write_bigquery: bool | None = None,
    publish_pubsub: bool | None = None,
    fetcher: Callable[[str, float], Any] | None = None,
) -> dict[str, Any]:
    """Execute one resilient async ingestion pass and fan out to Firestore, BigQuery, and Pub/Sub."""
    do_fs = use_firestore_cache() if write_firestore is None else write_firestore
    do_bq = use_bigquery() if write_bigquery is None else write_bigquery
    do_ps = bool(get_telemetry_pubsub_topic()) if publish_pubsub is None else publish_pubsub
    http_get = fetcher or _default_fetch_json

    prev_snapshot: dict[str, Any] | None = None
    fs_client = None
    if do_fs:
        try:
            from google.cloud import firestore

            fs_client = firestore.Client(project=PROJECT_ID, database=get_firestore_database())
            prev_doc = fs_client.collection(FIRESTORE_COLLECTION).document(FIRESTORE_LATEST_DOC).get(timeout=4.0)
            if prev_doc.exists:
                prev_snapshot = prev_doc.to_dict()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed reading previous Firestore snapshot: %s", exc)

    now_iso = _utc_now_iso()
    with ThreadPoolExecutor(max_workers=4) as pool:
        f_w = pool.submit(_fetch_weather_all, http_get)
        f_a = pool.submit(_fetch_opensky, http_get, prev_snapshot)
        f_m = pool.submit(_fetch_marine_ais, http_get, prev_snapshot)
        f_c = pool.submit(_fetch_nhc_cyclones, http_get)
        weather, w_meta = f_w.result()
        aircraft, a_meta = f_a.result()
        marine, m_meta = f_m.result()
        cyclones, c_meta = f_c.result()

    snapshot: dict[str, Any] = {
        "ingested_at": now_iso,
        "updated_at": now_iso,
        "weather": weather,
        "aircraft": aircraft,
        "marine": marine,
        "cyclones": cyclones,
        "feeds": {
            "weather": w_meta,
            "aircraft": a_meta,
            "marine": m_meta,
            "cyclones": c_meta,
        },
    }

    seed_in_memory_snapshot(
        snapshot,
        backend_label=f"firestore:{get_firestore_database()}" if do_fs else "memory_seed",
    )

    fs_ok = False
    if fs_client is not None:
        try:
            fs_client.collection(FIRESTORE_COLLECTION).document(FIRESTORE_LATEST_DOC).set(snapshot)
            fs_ok = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed writing Firestore telemetry snapshot: %s", exc)

    rows = snapshot_to_bigquery_rows(snapshot)
    bq_inserted = 0
    if do_bq and rows:
        try:
            from google.cloud import bigquery

            bq = bigquery.Client(project=PROJECT_ID, location=BQ_LOCATION)
            errors = bq.insert_rows_json(BQ_TELEMETRY_TABLE, rows)
            if errors:
                logger.warning("BigQuery telemetry insert errors: %s", errors)
            else:
                bq_inserted = len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed writing BigQuery telemetry rows: %s", exc)

    ps_message_id: str | None = None
    if do_ps:
        try:
            from google.cloud import pubsub_v1

            publisher = pubsub_v1.PublisherClient()
            topic_path = publisher.topic_path(PROJECT_ID, get_telemetry_pubsub_topic())
            event_payload = json.dumps(
                {
                    "ingested_at": now_iso,
                    "weather_stations": w_meta["count"],
                    "aircraft_count": a_meta["count"],
                    "marine_count": m_meta["count"],
                    "cyclones_count": c_meta["count"],
                    "firestore_written": fs_ok,
                    "bq_rows_written": bq_inserted,
                }
            ).encode("utf-8")
            ps_message_id = publisher.publish(topic_path, event_payload).result(timeout=8.0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed publishing telemetry event to Pub/Sub: %s", exc)

    return {
        "status": "ok",
        "ingested_at": now_iso,
        "firestore_written": fs_ok,
        "bq_rows_written": bq_inserted,
        "pubsub_message_id": ps_message_id,
        "feeds": snapshot["feeds"],
        "rows_prepared": len(rows),
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    summary = run_ingestion_cycle()
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
