"""Non-blocking shared-cache reader for live BCS2050 telemetry (Firestore + hot RAM mirror).

Zero external HTTP requests happen inside HTTP request handlers; background ingestion runs
asynchronously via `workers.telemetry_ingestor` (Cloud Run Job + Cloud Scheduler every 5 min).
"""

from __future__ import annotations

import copy
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

from backend.config import enable_realtime_traffic, get_firestore_database, use_firestore_cache
from backend.realtime_traffic import REALTIME_TRAFFIC_HUB

logger = logging.getLogger("bcs2050.live_feeds")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "bcs2050")
FIRESTORE_COLLECTION = "twin_telemetry"
FIRESTORE_LATEST_DOC = "latest"
FIRESTORE_PILOTS_DOC = "pilot_observations"
HOT_CACHE_TTL_S = 15.0

_SNAPSHOT_LOCK = threading.Lock()
_HOT_RAW_SNAPSHOT: dict[str, Any] | None = None
_HOT_LOADED_MONO: float = 0.0
_CACHE_BACKEND_LABEL: str = "memory_seed"

_PILOT_LOCK = threading.Lock()
_PILOT_MEMORY_OBS: dict[str, list[dict[str, Any]]] = {}
_PILOT_LOADED_MONO: float = 0.0


def _iso_utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso_epoch(ts: str | None) -> float | None:
    if not ts or not isinstance(ts, str):
        return None
    cleaned = ts.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except ValueError:
        return None


def _compute_feed_freshness(
    *,
    feed_meta: dict[str, Any],
    now_epoch: float,
    has_payload: bool,
) -> dict[str, Any]:
    fetched_at = feed_meta.get("fetched_at") or feed_meta.get("updated_at")
    upstream_ok = bool(feed_meta.get("upstream_ok"))
    epoch = _parse_iso_epoch(fetched_at)
    age_s = max(0, int(now_epoch - epoch)) if epoch is not None else None

    if upstream_ok and age_s is not None and age_s < 360:
        status = "LIVE"
    elif has_payload and age_s is not None and age_s <= 1800:
        status = "CACHED"
    elif has_payload and age_s is not None and age_s > 1800:
        status = "STALE"
    else:
        status = "OFFLINE"

    if status == "OFFLINE" or age_s is None:
        freshness_es = "SIN SEÑAL"
        freshness_en = "OFFLINE"
    elif age_s < 60:
        if status == "LIVE":
            freshness_es = "EN VIVO · <1m"
            freshness_en = "LIVE · <1m"
        else:
            freshness_es = "CACHÉ <1m"
            freshness_en = "CACHED <1m ago"
    else:
        mins = max(1, round(age_s / 60))
        if status == "LIVE":
            freshness_es = f"EN VIVO · {mins}m"
            freshness_en = f"LIVE · {mins}m"
        elif status == "CACHED":
            freshness_es = f"CACHÉ hace {mins}m"
            freshness_en = f"CACHED {mins}m ago"
        else:
            freshness_es = f"DESACTUALIZADO · {mins}m"
            freshness_en = f"STALE · {mins}m"

    return {
        "status": status,
        "upstream_ok": upstream_ok,
        "fetched_at": fetched_at,
        "age_seconds": age_s,
        "freshness_es": freshness_es,
        "freshness_en": freshness_en,
        "latency_ms": feed_meta.get("latency_ms"),
        "source": feed_meta.get("source", ""),
        "notice": feed_meta.get("notice", ""),
        "count": feed_meta.get("count", 0),
    }


def _build_offline_seed_snapshot() -> dict[str, Any]:
    now_iso = _iso_utc_now()
    return {
        "ingested_at": now_iso,
        "updated_at": now_iso,
        "weather": {
            "la_paz": {
                "municipality_code": "03003",
                "name": "La Paz",
                "lat": 24.1426,
                "lon": -110.3128,
                "temp_c": 26.4,
                "humidity_pct": 52,
                "wind_kmh": 14.8,
                "time": now_iso,
            },
            "cabo_san_lucas": {
                "municipality_code": "03008",
                "name": "Los Cabos",
                "lat": 22.8905,
                "lon": -109.9167,
                "temp_c": 27.1,
                "humidity_pct": 58,
                "wind_kmh": 16.2,
                "time": now_iso,
            },
            "ciudad_constitucion": {
                "municipality_code": "03001",
                "name": "Comondú",
                "lat": 25.0322,
                "lon": -111.6703,
                "temp_c": 25.9,
                "humidity_pct": 44,
                "wind_kmh": 18.0,
                "time": now_iso,
            },
            "loreto": {
                "municipality_code": "03009",
                "name": "Loreto",
                "lat": 26.0127,
                "lon": -111.3489,
                "temp_c": 26.8,
                "humidity_pct": 54,
                "wind_kmh": 13.4,
                "time": now_iso,
            },
            "santa_rosalia": {
                "municipality_code": "03002",
                "name": "Mulegé",
                "lat": 27.3396,
                "lon": -112.2676,
                "temp_c": 24.7,
                "humidity_pct": 49,
                "wind_kmh": 19.1,
                "time": now_iso,
            },
        },
        "aircraft": {
            "count": 0,
            "aircraft": [],
            "source": "OpenSky Network",
            "stale": False,
            "notice": "Awaiting background telemetry ingestion worker.",
        },
        "marine": {
            "count": 0,
            "connected": False,
            "vessels": [],
            "source": "AIS Stream Proxy",
            "notice": "Awaiting AIS stream / background telemetry worker.",
        },
        "cyclones": {
            "count": 0,
            "active_storms": [],
            "source": "NOAA NHC",
            "notice": "No active tropical cyclones reported.",
        },
        "feeds": {
            "weather": {
                "upstream_ok": False,
                "fetched_at": now_iso,
                "source": "Open-Meteo (Cache Seed)",
                "notice": "Seed baseline active while background scheduler syncs.",
                "count": 5,
            },
            "aircraft": {
                "upstream_ok": False,
                "fetched_at": now_iso,
                "source": "OpenSky Network",
                "notice": "Awaiting background worker sync.",
                "count": 0,
            },
            "marine": {
                "upstream_ok": False,
                "fetched_at": now_iso,
                "source": "AIS Stream Proxy",
                "notice": "AIS stream offline / unconfigured.",
                "count": 0,
            },
            "cyclones": {
                "upstream_ok": False,
                "fetched_at": now_iso,
                "source": "NOAA NHC",
                "notice": "Awaiting background worker sync.",
                "count": 0,
            },
        },
    }


def seed_in_memory_snapshot(snapshot: dict[str, Any], *, backend_label: str = "memory_seed") -> None:
    """Populate the thread-safe in-process hot telemetry mirror."""
    global _HOT_RAW_SNAPSHOT, _HOT_LOADED_MONO, _CACHE_BACKEND_LABEL
    with _SNAPSHOT_LOCK:
        _HOT_RAW_SNAPSHOT = copy.deepcopy(snapshot)
        _HOT_LOADED_MONO = time.monotonic()
        _CACHE_BACKEND_LABEL = backend_label


def reset_telemetry_cache() -> None:
    """Clear in-process caches (primarily for deterministic unit tests)."""
    global _HOT_RAW_SNAPSHOT, _HOT_LOADED_MONO, _CACHE_BACKEND_LABEL, _PILOT_LOADED_MONO
    with _SNAPSHOT_LOCK:
        _HOT_RAW_SNAPSHOT = None
        _HOT_LOADED_MONO = 0.0
        _CACHE_BACKEND_LABEL = "memory_seed"
    with _PILOT_LOCK:
        _PILOT_MEMORY_OBS.clear()
        _PILOT_LOADED_MONO = 0.0


def _read_firestore_snapshot() -> dict[str, Any] | None:
    if not use_firestore_cache():
        return None
    try:
        from google.cloud import firestore

        db = firestore.Client(project=PROJECT_ID, database=get_firestore_database())
        doc = db.collection(FIRESTORE_COLLECTION).document(FIRESTORE_LATEST_DOC).get(timeout=2.5)
        if doc.exists:
            data = doc.to_dict()
            if isinstance(data, dict):
                return data
    except Exception as exc:  # noqa: BLE001
        logger.warning("Firestore telemetry cache read failed cleanly: %s", exc)
    return None


def get_cached_telemetry_snapshot() -> tuple[dict[str, Any], str]:
    """Return raw snapshot and cache backend label from hot RAM mirror or Firestore (<150ms p95)."""
    global _HOT_RAW_SNAPSHOT, _HOT_LOADED_MONO, _CACHE_BACKEND_LABEL
    now_mono = time.monotonic()
    with _SNAPSHOT_LOCK:
        if _HOT_RAW_SNAPSHOT is not None and (now_mono - _HOT_LOADED_MONO) < HOT_CACHE_TTL_S:
            return copy.deepcopy(_HOT_RAW_SNAPSHOT), _CACHE_BACKEND_LABEL

    if use_firestore_cache():
        fs_data = _read_firestore_snapshot()
        if fs_data:
            backend = f"firestore:{get_firestore_database()}"
            with _SNAPSHOT_LOCK:
                _HOT_RAW_SNAPSHOT = copy.deepcopy(fs_data)
                _HOT_LOADED_MONO = time.monotonic()
                _CACHE_BACKEND_LABEL = backend
            return copy.deepcopy(fs_data), backend

    with _SNAPSHOT_LOCK:
        if _HOT_RAW_SNAPSHOT is not None:
            return copy.deepcopy(_HOT_RAW_SNAPSHOT), _CACHE_BACKEND_LABEL
        seed = _build_offline_seed_snapshot()
        _HOT_RAW_SNAPSHOT = copy.deepcopy(seed)
        _HOT_LOADED_MONO = time.monotonic()
        _CACHE_BACKEND_LABEL = "memory_seed"
        return copy.deepcopy(seed), "memory_seed"


def get_live_telemetry_summary() -> dict[str, Any]:
    """Return live telemetry summary strictly from shared cache with per-feed freshness statuses."""
    snap, backend = get_cached_telemetry_snapshot()
    now_epoch = time.time()
    raw_feeds = snap.get("feeds") or {}

    weather = snap.get("weather") or {}
    air = snap.get("aircraft") or {"count": 0, "aircraft": [], "source": "OpenSky Network", "stale": True}
    marine = snap.get("marine") or {"count": 0, "connected": False, "vessels": []}
    cyclones = snap.get("cyclones") or {"count": 0, "active_storms": [], "source": "NOAA NHC"}

    air_feed_raw = dict(raw_feeds.get("aircraft") or {})
    marine_feed_raw = dict(raw_feeds.get("marine") or {})
    if enable_realtime_traffic():
        REALTIME_TRAFFIC_HUB.seed_vessels_if_empty(marine.get("vessels") or [])
        air_overlay = REALTIME_TRAFFIC_HUB.get_aircraft_overlay()
        if air_overlay is not None:
            live_air_payload, live_air_meta = air_overlay
            if live_air_meta.get("upstream_ok") or not (air.get("aircraft") or []):
                air = live_air_payload
                air_feed_raw = live_air_meta
        marine_overlay = REALTIME_TRAFFIC_HUB.get_marine_overlay()
        if marine_overlay is not None:
            live_mar_payload, live_mar_meta = marine_overlay
            if live_mar_payload.get("vessels") or live_mar_meta.get("upstream_ok"):
                marine = live_mar_payload
                marine_feed_raw = live_mar_meta

    weather_has_data = any(isinstance(v, dict) and v.get("temp_c") is not None for v in weather.values())
    air_has_data = len(air.get("aircraft") or []) > 0 or bool(air_feed_raw.get("upstream_ok"))
    marine_has_data = bool(marine.get("connected")) or len(marine.get("vessels") or []) > 0
    cyc_has_data = isinstance(cyclones.get("active_storms"), list)

    weather_meta = _compute_feed_freshness(
        feed_meta={
            "fetched_at": raw_feeds.get("weather", {}).get("fetched_at") or snap.get("ingested_at"),
            "upstream_ok": raw_feeds.get("weather", {}).get("upstream_ok", False),
            "latency_ms": raw_feeds.get("weather", {}).get("latency_ms"),
            "source": raw_feeds.get("weather", {}).get("source", "Open-Meteo API"),
            "notice": raw_feeds.get("weather", {}).get("notice", ""),
            "count": sum(1 for v in weather.values() if isinstance(v, dict) and v.get("temp_c") is not None),
        },
        now_epoch=now_epoch,
        has_payload=weather_has_data,
    )
    air_meta = _compute_feed_freshness(
        feed_meta={
            "fetched_at": air_feed_raw.get("fetched_at") or snap.get("ingested_at"),
            "upstream_ok": air_feed_raw.get("upstream_ok", False),
            "latency_ms": air_feed_raw.get("latency_ms"),
            "source": air.get("source", "OpenSky Network"),
            "notice": air_feed_raw.get("notice") or air.get("notice", ""),
            "count": int(air.get("count") or 0),
        },
        now_epoch=now_epoch,
        has_payload=air_has_data,
    )
    marine_meta = _compute_feed_freshness(
        feed_meta={
            "fetched_at": marine_feed_raw.get("fetched_at") or snap.get("ingested_at"),
            "upstream_ok": bool(marine.get("connected")) and bool(marine_feed_raw.get("upstream_ok", True)),
            "latency_ms": marine_feed_raw.get("latency_ms"),
            "source": marine.get("source", "AIS Stream Proxy"),
            "notice": marine_feed_raw.get("notice") or marine.get("notice", ""),
            "count": int(marine.get("count") or 0),
        },
        now_epoch=now_epoch,
        has_payload=marine_has_data,
    )
    cyc_meta = _compute_feed_freshness(
        feed_meta={
            "fetched_at": raw_feeds.get("cyclones", {}).get("fetched_at") or snap.get("ingested_at"),
            "upstream_ok": raw_feeds.get("cyclones", {}).get("upstream_ok", False),
            "latency_ms": raw_feeds.get("cyclones", {}).get("latency_ms"),
            "source": cyclones.get("source", "NOAA NHC"),
            "notice": raw_feeds.get("cyclones", {}).get("notice") or cyclones.get("notice", ""),
            "count": int(cyclones.get("count") or 0),
        },
        now_epoch=now_epoch,
        has_payload=cyc_has_data,
    )

    air["stale"] = air_meta["status"] != "LIVE"
    ingested_at = snap.get("ingested_at") or snap.get("updated_at")
    snap_epoch = _parse_iso_epoch(ingested_at)
    snap_age = max(0, int(now_epoch - snap_epoch)) if snap_epoch is not None else None

    statuses = [weather_meta["status"], air_meta["status"], marine_meta["status"], cyc_meta["status"]]
    if weather_meta["status"] == "LIVE" and cyc_meta["status"] == "LIVE":
        overall_status = "LIVE"
    elif any(s in {"LIVE", "CACHED"} for s in statuses):
        overall_status = "CACHED"
    elif any(s == "STALE" for s in statuses):
        overall_status = "STALE"
    else:
        overall_status = "OFFLINE"

    return {
        "updated_at": snap.get("updated_at") or _iso_utc_now(),
        "ingested_at": ingested_at,
        "age_seconds": snap_age,
        "cache_backend": backend,
        "overall_status": overall_status,
        "weather": weather,
        "aircraft": air,
        "marine": marine,
        "cyclones": cyclones,
        "feeds": {
            "weather": weather_meta,
            "aircraft": air_meta,
            "marine": marine_meta,
            "cyclones": cyc_meta,
        },
    }


def read_pilot_observations() -> dict[str, list[dict[str, Any]]]:
    """Read SensorThings pilot observations from hot RAM mirror / Firestore."""
    global _PILOT_LOADED_MONO
    now_mono = time.monotonic()
    with _PILOT_LOCK:
        if _PILOT_MEMORY_OBS and (now_mono - _PILOT_LOADED_MONO) < HOT_CACHE_TTL_S:
            return copy.deepcopy(_PILOT_MEMORY_OBS)

    if use_firestore_cache():
        try:
            from google.cloud import firestore

            db = firestore.Client(project=PROJECT_ID, database=get_firestore_database())
            doc = db.collection(FIRESTORE_COLLECTION).document(FIRESTORE_PILOTS_DOC).get(timeout=2.5)
            if doc.exists:
                data = doc.to_dict() or {}
                streams = data.get("streams")
                if isinstance(streams, dict):
                    with _PILOT_LOCK:
                        _PILOT_MEMORY_OBS.clear()
                        for k, v in streams.items():
                            if isinstance(v, list):
                                _PILOT_MEMORY_OBS[str(k)] = list(v)
                        _PILOT_LOADED_MONO = time.monotonic()
                    return copy.deepcopy(_PILOT_MEMORY_OBS)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Firestore pilot observations read failed cleanly: %s", exc)

    with _PILOT_LOCK:
        return copy.deepcopy(_PILOT_MEMORY_OBS)


def append_pilot_observation(datastream_id: str, observation: dict[str, Any], *, max_per_stream: int = 50) -> None:
    """Append an observation for a datastream in memory and optionally persist to Firestore."""
    global _PILOT_LOADED_MONO
    with _PILOT_LOCK:
        bucket = _PILOT_MEMORY_OBS.setdefault(datastream_id, [])
        bucket.insert(0, copy.deepcopy(observation))
        del bucket[max_per_stream:]
        _PILOT_LOADED_MONO = time.monotonic()
        snapshot_streams = copy.deepcopy(_PILOT_MEMORY_OBS)

    if use_firestore_cache():
        try:
            from google.cloud import firestore

            db = firestore.Client(project=PROJECT_ID, database=get_firestore_database())
            db.collection(FIRESTORE_COLLECTION).document(FIRESTORE_PILOTS_DOC).set(
                {"updated_at": _iso_utc_now(), "streams": snapshot_streams}
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Firestore pilot observations write failed cleanly: %s", exc)
