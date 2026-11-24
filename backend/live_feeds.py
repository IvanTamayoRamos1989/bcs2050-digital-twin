"""Live real-time telemetry aggregator for BCS2050 Digital Twin (Open-Meteo, OpenSky, NOAA NHC, AIS)."""

from __future__ import annotations

import json
import os
import time
import urllib.request
from typing import Any

_CACHE: dict[str, tuple[float, Any]] = {}


def _fetch_json(url: str, timeout: float = 6.0) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "BCS2050-DigitalTwin/2.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _cached(key: str, ttl_s: float, loader: Any) -> Any:
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and (now - hit[0]) < ttl_s:
        return hit[1]
    val = loader()
    _CACHE[key] = (now, val)
    return val


def get_weather_summary() -> dict[str, Any]:
    def _load() -> dict[str, Any]:
        # La Paz & Cabo San Lucas concurrent Open-Meteo current conditions
        lpz_url = (
            "https://api.open-meteo.com/v1/forecast?latitude=24.1426&longitude=-110.3128"
            "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=America%2FMazatlan"
        )
        csl_url = (
            "https://api.open-meteo.com/v1/forecast?latitude=22.8905&longitude=-109.9167"
            "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=America%2FMazatlan"
        )
        out: dict[str, Any] = {}
        for key, url in [("la_paz", lpz_url), ("cabo_san_lucas", csl_url)]:
            try:
                data = _fetch_json(url, timeout=5.0)
                cur = data.get("current") or {}
                out[key] = {
                    "temp_c": cur.get("temperature_2m"),
                    "humidity_pct": cur.get("relative_humidity_2m"),
                    "wind_kmh": cur.get("wind_speed_10m"),
                    "time": cur.get("time"),
                }
            except Exception as exc:  # noqa: BLE001
                out[key] = {"error": str(exc)}
        return out

    return _cached("weather", 180.0, _load)


def get_opensky_aircraft() -> dict[str, Any]:
    def _load() -> dict[str, Any]:
        url = "https://opensky-network.org/api/states/all?lamin=22.0&lomin=-116.0&lamax=28.5&lomax=-108.5"
        try:
            data = _fetch_json(url, timeout=6.0)
            states = data.get("states") or []
            items = []
            for s in states[:120]:
                if s[5] is None or s[6] is None:
                    continue
                items.append(
                    {
                        "icao24": s[0],
                        "callsign": str(s[1] or s[0] or "").strip(),
                        "country": s[2] or "",
                        "lon": float(s[5]),
                        "lat": float(s[6]),
                        "altitude_m": float(s[7] or s[13] or 0.0),
                        "velocity_ms": float(s[9] or 0.0),
                        "heading": float(s[10] or 0.0),
                    }
                )
            return {"count": len(items), "aircraft": items, "source": "OpenSky Network", "stale": False}
        except Exception as exc:  # noqa: BLE001
            return {"count": 0, "aircraft": [], "source": "OpenSky Network", "stale": True, "notice": str(exc)}

    return _cached("aircraft", 30.0, _load)


def get_marine_ais_proxy() -> dict[str, Any]:
    def _load() -> dict[str, Any]:
        base = os.environ.get(
            "TERRITORIAL_IA_URL",
            "https://bcs2050-territorial-ia-96586614897.northamerica-south1.run.app",
        ).rstrip("/")
        try:
            data = _fetch_json(f"{base}/api/marine-traffic", timeout=5.0)
            vessels = data.get("vessels") or []
            return {
                "count": len(vessels),
                "connected": bool(data.get("connected")),
                "vessels": vessels[:250],
                "notice": data.get("notice", ""),
            }
        except Exception as exc:  # noqa: BLE001
            return {"count": 0, "connected": False, "vessels": [], "notice": str(exc)}

    return _cached("marine", 20.0, _load)


def get_nhc_cyclones() -> dict[str, Any]:
    def _load() -> dict[str, Any]:
        try:
            data = _fetch_json("https://www.nhc.noaa.gov/CurrentStorms.json", timeout=5.0)
            storms = data.get("activeStorms") or []
            return {"count": len(storms), "active_storms": storms, "source": "NOAA NHC"}
        except Exception as exc:  # noqa: BLE001
            return {"count": 0, "active_storms": [], "source": "NOAA NHC", "notice": str(exc)}

    return _cached("nhc", 300.0, _load)


def get_live_telemetry_summary() -> dict[str, Any]:
    weather = get_weather_summary()
    air = get_opensky_aircraft()
    marine = get_marine_ais_proxy()
    nhc = get_nhc_cyclones()
    return {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "weather": weather,
        "aircraft": air,
        "marine": marine,
        "cyclones": nhc,
    }
