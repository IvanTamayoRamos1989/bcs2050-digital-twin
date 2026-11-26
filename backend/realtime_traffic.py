"""Real-Time Non-Blocking Air Traffic (ADS-B) & Marine Traffic (AISStream WebSocket) Engine.

Used both by:
1. FastAPI background daemon threads (`REALTIME_TRAFFIC_HUB`) when `BCS2050_ENABLE_REALTIME_TRAFFIC=true`
   so `/api/twin/live/summary` serves sub-millisecond RAM snapshots updated every ~15s (air) and continuously
   over WebSocket (marine) without performing blocking HTTP inside request handlers.
2. `workers.telemetry_ingestor` for 5-minute Firestore + BigQuery persistent historical logging.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import socket
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable

from backend.config import enable_realtime_traffic, get_aisstream_api_key

logger = logging.getLogger("bcs2050.realtime_traffic")

AIR_SECTORS: tuple[tuple[float, float, int], ...] = (
    (23.2, -109.9, 250),  # Los Cabos / Southern Sea of Cortez
    (25.8, -111.5, 250),  # Central BCS / La Paz / Loreto
    (28.4, -113.0, 250),  # Northern BCS / Mulege / Mid-Gulf
)
OPENSKY_URL = "https://opensky-network.org/api/states/all?lamin=21.0&lomin=-117.5&lamax=31.5&lomax=-106.5"

# Covers Baja Peninsula Pacific Coast, Sea of Cortez, and Southern California / Mazatlan maritime approach corridor
AIS_BOUNDING_BOX = [[18.5, -120.0], [33.5, -104.0]]
VESSEL_RETENTION_S = 3600.0
MAX_AIRCRAFT = 160
MAX_VESSELS = 250


def _utc_now_iso() -> str:
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


def _default_http_json(url: str, timeout: float = 7.0) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _in_corridor(lat: float, lon: float) -> bool:
    return 21.0 <= lat <= 31.5 and -117.5 <= lon <= -106.5


def _in_bcs_waters(lat: float, lon: float) -> bool:
    return 21.5 <= lat <= 28.8 and -116.5 <= lon <= -108.0


def _normalize_v2_aircraft(ac: dict[str, Any], provider: str) -> dict[str, Any] | None:
    lat = ac.get("lat")
    lon = ac.get("lon")
    if lat is None or lon is None:
        return None
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return None
    if not _in_corridor(lat_f, lon_f):
        return None

    icao = str(ac.get("hex") or "").strip().lower()
    if not icao:
        return None

    raw_alt = ac.get("alt_baro", ac.get("alt_geom"))
    on_ground = raw_alt == "ground"
    try:
        alt_ft = 0.0 if on_ground else float(raw_alt or 0.0)
    except (TypeError, ValueError):
        alt_ft = 0.0
    alt_m = round(max(0.0, alt_ft) * 0.3048, 1)

    try:
        gs_kt = float(ac.get("gs") or 0.0)
    except (TypeError, ValueError):
        gs_kt = 0.0
    vel_ms = round(max(0.0, gs_kt) * 0.514444, 1)

    try:
        heading = round(float(ac.get("track") or ac.get("true_heading") or 0.0) % 360.0, 1)
    except (TypeError, ValueError):
        heading = 0.0

    try:
        vrate = int(round(float(ac.get("geom_rate") or ac.get("baro_rate") or 0)))
    except (TypeError, ValueError):
        vrate = 0

    reg = str(ac.get("r") or "").strip()
    callsign = str(ac.get("flight") or reg or icao).strip()
    atype = str(ac.get("t") or "").strip()
    adesc = str(ac.get("desc") or "").strip()
    squawk = str(ac.get("squawk") or "").strip()
    country = "Mexico" if (reg.startswith(("XA", "XB", "XC")) or icao.startswith("0d")) else ""

    return {
        "icao24": icao,
        "callsign": callsign,
        "registration": reg,
        "aircraft_type": atype,
        "aircraft_desc": adesc,
        "country": country,
        "lon": round(lon_f, 5),
        "lat": round(lat_f, 5),
        "altitude_m": alt_m,
        "altitude_ft": int(round(max(0.0, alt_ft))),
        "velocity_ms": vel_ms,
        "speed_kt": int(round(max(0.0, gs_kt))),
        "heading": heading,
        "vertical_rate_fpm": vrate,
        "squawk": squawk,
        "on_ground": on_ground,
        "provider": provider,
    }


def _fetch_v2_provider(
    *,
    base_url: str,
    provider_label: str,
    fetcher: Callable[[str, float], Any],
) -> tuple[list[dict[str, Any]], bool]:
    urls = [f"{base_url}/lat/{lat}/lon/{lon}/dist/{dist}" for lat, lon, dist in AIR_SECTORS]

    def _get(u: str) -> Any:
        return fetcher(u, 9.0)

    dedup: dict[str, dict[str, Any]] = {}
    any_ok = False
    with ThreadPoolExecutor(max_workers=len(urls)) as pool:
        results = list(pool.map(lambda u: _safe_fetch(_get, u), urls))

    for ok, data in results:
        if not ok or not isinstance(data, dict):
            continue
        any_ok = True
        for raw in data.get("ac") or data.get("aircraft") or []:
            if not isinstance(raw, dict):
                continue
            item = _normalize_v2_aircraft(raw, provider_label)
            if item:
                dedup[item["icao24"]] = item

    items = sorted(dedup.values(), key=lambda x: (-x["altitude_m"], x["callsign"]))[:MAX_AIRCRAFT]
    return items, any_ok


def _safe_fetch(fn: Callable[[str], Any], url: str) -> tuple[bool, Any]:
    try:
        return True, fn(url)
    except Exception:  # noqa: BLE001
        return False, None


def fetch_realtime_aircraft(
    fetcher: Callable[[str, float], Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fetch live ADS-B air traffic over Baja California Sur using multi-provider redundancy."""
    http_get = fetcher or _default_http_json
    t0 = time.perf_counter()
    now_iso = _utc_now_iso()

    # 1. Primary: adsb.fi (free community ADS-B v2 API, provides type/reg/desc)
    items, ok = _fetch_v2_provider(
        base_url="https://opendata.adsb.fi/api/v2",
        provider_label="adsb.fi",
        fetcher=http_get,
    )
    source = "adsb.fi ADS-B"

    # 2. Secondary: adsb.lol (redundant ADS-B v2 feed)
    if not ok or len(items) == 0:
        lol_items, lol_ok = _fetch_v2_provider(
            base_url="https://api.adsb.lol/v2",
            provider_label="adsb.lol",
            fetcher=http_get,
        )
        if lol_ok and (len(lol_items) > len(items) or not ok):
            items = lol_items
            ok = True
            source = "adsb.lol ADS-B"

    # 3. Fallback: OpenSky Network
    last_err = ""
    if not ok:
        try:
            data = http_get(OPENSKY_URL, 8.0)
            states = data.get("states") or []
            os_items: list[dict[str, Any]] = []
            for s in states[:MAX_AIRCRAFT]:
                if len(s) < 11 or s[5] is None or s[6] is None:
                    continue
                alt_m = float(s[7] or (s[13] if len(s) > 13 else 0.0) or 0.0)
                vel_ms = float(s[9] or 0.0)
                os_items.append(
                    {
                        "icao24": str(s[0] or "").strip().lower(),
                        "callsign": str(s[1] or s[0] or "").strip(),
                        "registration": "",
                        "aircraft_type": "",
                        "aircraft_desc": "",
                        "country": str(s[2] or ""),
                        "lon": round(float(s[5]), 5),
                        "lat": round(float(s[6]), 5),
                        "altitude_m": round(max(0.0, alt_m), 1),
                        "altitude_ft": int(round(max(0.0, alt_m) / 0.3048)),
                        "velocity_ms": round(max(0.0, vel_ms), 1),
                        "speed_kt": int(round(max(0.0, vel_ms) / 0.514444)),
                        "heading": round(float(s[10] or 0.0) % 360.0, 1),
                        "vertical_rate_fpm": 0,
                        "squawk": "",
                        "on_ground": bool(s[8]) if len(s) > 8 else False,
                        "provider": "OpenSky Network",
                    }
                )
            items = os_items
            ok = True
            source = "OpenSky Network"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)

    latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    if ok:
        notice = f"{len(items)} tracked aircraft ({source})"
        payload = {
            "count": len(items),
            "aircraft": items,
            "source": source,
            "stale": False,
            "notice": notice,
        }
        meta = {
            "upstream_ok": True,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": source,
            "notice": notice,
            "count": len(items),
        }
        return payload, meta

    notice = last_err or "ADS-B upstream feeds temporarily unavailable"
    payload = {"count": 0, "aircraft": [], "source": "ADS-B / OpenSky", "stale": True, "notice": notice}
    meta = {
        "upstream_ok": False,
        "fetched_at": now_iso,
        "latency_ms": latency_ms,
        "source": "ADS-B / OpenSky",
        "notice": notice,
        "count": 0,
    }
    return payload, meta


def map_ais_ship_type(code: Any) -> str:
    try:
        n = int(code)
    except (TypeError, ValueError):
        return "Vessel"
    if 70 <= n <= 79:
        return "Cargo"
    if 60 <= n <= 69:
        return "Passenger / Ferry"
    if 80 <= n <= 89:
        return "Tanker"
    if n == 30:
        return "Fishing"
    if n in {36, 37}:
        return "Yacht / Pleasure"
    if n in {31, 32, 50, 51, 52, 53, 55}:
        return "Tug / Service"
    return "Vessel"


def parse_ais_message(msg: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Normalize an AISStream WebSocket message into a flat BCS2050 vessel dictionary."""
    if not isinstance(msg, dict) or msg.get("MessageType") == "SubscriptionConfirmation" or "error" in msg:
        return None
    meta = msg.get("MetaData") or {}
    body = msg.get("Message") or {}
    pos = body.get("PositionReport") or body.get("StandardClassBPositionReport")
    stat = body.get("ShipStaticData")
    srep = body.get("StaticDataReport")

    mmsi = str(meta.get("MMSI") or (pos or {}).get("UserID") or (srep or {}).get("UserID") or "").strip()
    if not mmsi:
        return None

    vessel: dict[str, Any] = dict(existing or {})
    vessel["mmsi"] = mmsi
    ship_name = str(meta.get("ShipName") or (srep or {}).get("ReportA", {}).get("Name") or (stat or {}).get("Name") or "").strip()
    if ship_name:
        vessel["name"] = ship_name
    elif not vessel.get("name"):
        vessel["name"] = f"MMSI {mmsi}"

    if stat and stat.get("Type") is not None:
        vessel["type"] = map_ais_ship_type(stat.get("Type"))
    elif srep and isinstance(srep.get("ReportB"), dict) and srep["ReportB"].get("ShipType") is not None:
        vessel["type"] = map_ais_ship_type(srep["ReportB"].get("ShipType"))
    elif not vessel.get("type"):
        vessel["type"] = "Vessel"

    if stat and stat.get("Destination"):
        dest = str(stat.get("Destination")).strip()
        if dest:
            vessel["destination"] = dest

    lat = (pos or {}).get("Latitude") if pos else meta.get("latitude")
    lon = (pos or {}).get("Longitude") if pos else meta.get("longitude")
    if lat is None or lon is None:
        lat = meta.get("latitude")
        lon = meta.get("longitude")
    try:
        lat_f = float(lat) if lat is not None else float(vessel.get("lat"))
        lon_f = float(lon) if lon is not None else float(vessel.get("lon"))
    except (TypeError, ValueError):
        return None
    if abs(lat_f) > 90.0 or abs(lon_f) > 180.0:
        return None

    cog = float((pos or {}).get("Cog") if pos and pos.get("Cog") is not None else vessel.get("cog") or 0.0)
    raw_hdg = (pos or {}).get("TrueHeading") if pos else None
    heading = float(raw_hdg) if raw_hdg is not None and 0 <= float(raw_hdg) < 360 else cog
    sog = float((pos or {}).get("Sog") if pos and pos.get("Sog") is not None else vessel.get("sog") or 0.0)

    vessel["lat"] = round(lat_f, 5)
    vessel["lon"] = round(lon_f, 5)
    vessel["cog"] = round(cog % 360.0, 1)
    vessel["heading"] = round(heading % 360.0, 1)
    vessel["sog"] = round(max(0.0, sog), 1)
    vessel["corridor_zone"] = "bcs_waters" if _in_bcs_waters(lat_f, lon_f) else "baja_pacific_approach"
    vessel["last_seen_at"] = _utc_now_iso()
    vessel["source"] = "AISStream.io"
    return vessel


def sort_and_cap_vessels(vessels_map: dict[str, dict[str, Any]], *, now_epoch: float | None = None) -> list[dict[str, Any]]:
    now = now_epoch or time.time()
    fresh: list[dict[str, Any]] = []
    stale_keys: list[str] = []
    for k, v in vessels_map.items():
        ep = _parse_iso_epoch(v.get("last_seen_at"))
        if ep is not None and (now - ep) > VESSEL_RETENTION_S:
            stale_keys.append(k)
        else:
            fresh.append(v)
    for k in stale_keys:
        vessels_map.pop(k, None)
    fresh.sort(key=lambda v: (0 if v.get("corridor_zone") == "bcs_waters" else 1, -float(v.get("sog") or 0.0), str(v.get("name") or "")))
    return fresh[:MAX_VESSELS]


async def harvest_aisstream_batch(
    api_key: str,
    *,
    duration_s: float = 18.0,
    prev_vessels: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Collect real-time AIS messages over a short WebSocket session (for 5-min Cloud Run Jobs)."""
    import websockets

    t0 = time.perf_counter()
    now_iso = _utc_now_iso()
    vessels_map: dict[str, dict[str, Any]] = {}
    for pv in prev_vessels or []:
        if isinstance(pv, dict) and pv.get("mmsi"):
            ep = _parse_iso_epoch(pv.get("last_seen_at"))
            if ep is None or (time.time() - ep) <= VESSEL_RETENTION_S:
                vessels_map[str(pv["mmsi"])] = dict(pv)

    sub = {
        "APIKey": api_key,
        "BoundingBoxes": [AIS_BOUNDING_BOX],
        "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ShipStaticData", "StaticDataReport"],
    }

    received_new = 0
    try:
        async with websockets.connect(
            "wss://stream.aisstream.io/v0/stream",
            family=socket.AF_INET,
            open_timeout=45,
        ) as ws:
            await ws.send(json.dumps(sub))
            deadline = time.monotonic() + duration_s
            while time.monotonic() < deadline:
                remaining = max(0.5, min(2.5, deadline - time.monotonic()))
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    continue
                msg = json.loads(raw)
                if "error" in msg:
                    raise RuntimeError(str(msg["error"]))
                mmsi = str((msg.get("MetaData") or {}).get("MMSI") or "").strip()
                parsed = parse_ais_message(msg, vessels_map.get(mmsi))
                if parsed:
                    vessels_map[parsed["mmsi"]] = parsed
                    received_new += 1
        capped = sort_and_cap_vessels(vessels_map)
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        bcs_cnt = sum(1 for v in capped if v.get("corridor_zone") == "bcs_waters")
        notice = (
            f"AISStream WebSocket live ({len(capped)} vessels across Baja approach · {bcs_cnt} in BCS coastal AIS range)"
            if capped
            else "AISStream connected (terrestrial coastal stations awaiting in-range AIS transponders)"
        )
        payload = {
            "count": len(capped),
            "connected": True,
            "vessels": capped,
            "source": "AISStream.io WebSocket",
            "notice": notice,
            "new_messages": received_new,
        }
        meta = {
            "upstream_ok": True,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "AISStream.io WebSocket",
            "notice": notice,
            "count": len(capped),
        }
        return payload, meta
    except Exception as exc:  # noqa: BLE001
        capped = sort_and_cap_vessels(vessels_map)
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        payload = {
            "count": len(capped),
            "connected": False,
            "vessels": capped,
            "source": "AISStream.io WebSocket",
            "notice": str(exc),
        }
        meta = {
            "upstream_ok": len(capped) > 0,
            "fetched_at": now_iso,
            "latency_ms": latency_ms,
            "source": "AISStream.io WebSocket",
            "notice": str(exc),
            "count": len(capped),
        }
        return payload, meta


class RealtimeTrafficHub:
    """In-process background daemon maintaining real-time ADS-B air + AISStream marine overlays."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._started = False
        self._air_payload: dict[str, Any] | None = None
        self._air_meta: dict[str, Any] | None = None
        self._air_good_mono: float = 0.0
        self._vessels_map: dict[str, dict[str, Any]] = {}
        self._marine_connected: bool = False
        self._marine_notice: str = "Connecting to AISStream.io real-time maritime stream..."
        self._marine_last_msg_iso: str | None = None

    def seed_vessels_if_empty(self, vessels: list[dict[str, Any]]) -> None:
        with self._lock:
            if self._vessels_map:
                return
            for v in vessels:
                if isinstance(v, dict) and v.get("mmsi"):
                    self._vessels_map[str(v["mmsi"])] = dict(v)

    def start(self) -> None:
        if not enable_realtime_traffic():
            return
        with self._lock:
            if self._started:
                return
            self._started = True
            self._stop.clear()

        threading.Thread(target=self._run_air_loop, name="bcs-adsb-poller", daemon=True).start()
        if get_aisstream_api_key():
            threading.Thread(target=self._run_ais_loop, name="bcs-aisstream-ws", daemon=True).start()
        logger.info("RealtimeTrafficHub started (ADS-B=15s, AISStream=%s)", bool(get_aisstream_api_key()))

    def stop(self) -> None:
        self._stop.set()
        with self._lock:
            self._started = False

    def _run_air_loop(self) -> None:
        while not self._stop.is_set():
            try:
                payload, meta = fetch_realtime_aircraft()
                now_mono = time.monotonic()
                with self._lock:
                    if meta.get("upstream_ok"):
                        self._air_payload = payload
                        self._air_meta = meta
                        self._air_good_mono = now_mono
                    elif self._air_payload and (now_mono - self._air_good_mono) < 900.0:
                        preserved = copy.deepcopy(self._air_payload)
                        preserved["stale"] = True
                        preserved["notice"] = f"Retaining recent tracks ({meta.get('notice')})"
                        self._air_payload = preserved
                    else:
                        self._air_payload = payload
                        self._air_meta = meta
            except Exception as exc:  # noqa: BLE001
                logger.warning("Air traffic loop iteration failed cleanly: %s", exc)
            self._stop.wait(15.0)

    def _run_ais_loop(self) -> None:
        asyncio.run(self._ais_ws_forever())

    async def _ais_ws_forever(self) -> None:
        try:
            import websockets
        except ImportError:
            with self._lock:
                self._marine_notice = "websockets package missing in runtime"
            return

        backoff = 5.0
        while not self._stop.is_set():
            api_key = get_aisstream_api_key()
            if not api_key:
                await asyncio.sleep(15.0)
                continue
            sub = {
                "APIKey": api_key,
                "BoundingBoxes": [AIS_BOUNDING_BOX],
                "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ShipStaticData", "StaticDataReport"],
            }
            try:
                async with websockets.connect(
                    "wss://stream.aisstream.io/v0/stream",
                    family=socket.AF_INET,
                    open_timeout=45,
                    ping_interval=25,
                    ping_timeout=15,
                ) as ws:
                    await ws.send(json.dumps(sub))
                    with self._lock:
                        self._marine_connected = True
                        self._marine_notice = "AISStream.io WebSocket connected (real-time terrestrial coastal AIS)"
                    backoff = 5.0
                    while not self._stop.is_set():
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
                        except asyncio.TimeoutError:
                            with self._lock:
                                sort_and_cap_vessels(self._vessels_map)
                            continue
                        msg = json.loads(raw)
                        if "error" in msg:
                            with self._lock:
                                self._marine_connected = False
                                self._marine_notice = str(msg["error"])
                            break
                        mmsi = str((msg.get("MetaData") or {}).get("MMSI") or "").strip()
                        with self._lock:
                            parsed = parse_ais_message(msg, self._vessels_map.get(mmsi))
                            if parsed:
                                self._vessels_map[parsed["mmsi"]] = parsed
                                self._marine_last_msg_iso = parsed["last_seen_at"]
                                sort_and_cap_vessels(self._vessels_map)
            except Exception as exc:  # noqa: BLE001
                with self._lock:
                    self._marine_connected = False
                    self._marine_notice = f"AISStream reconnecting ({exc})"
                await asyncio.sleep(backoff)
                backoff = min(60.0, backoff * 1.6)

    def get_aircraft_overlay(self) -> tuple[dict[str, Any], dict[str, Any]] | None:
        with self._lock:
            if not self._air_payload or not self._air_meta:
                return None
            return copy.deepcopy(self._air_payload), copy.deepcopy(self._air_meta)

    def get_marine_overlay(self) -> tuple[dict[str, Any], dict[str, Any]] | None:
        with self._lock:
            if not get_aisstream_api_key() and not self._vessels_map:
                return None
            capped = sort_and_cap_vessels(self._vessels_map)
            bcs_cnt = sum(1 for v in capped if v.get("corridor_zone") == "bcs_waters")
            notice = (
                f"{len(capped)} live vessels ({bcs_cnt} inside BCS waters · AISStream coastal network)"
                if capped
                else self._marine_notice
            )
            payload = {
                "count": len(capped),
                "connected": self._marine_connected,
                "vessels": capped,
                "source": "AISStream.io WebSocket",
                "notice": notice,
            }
            meta = {
                "upstream_ok": self._marine_connected or len(capped) > 0,
                "fetched_at": self._marine_last_msg_iso or _utc_now_iso(),
                "latency_ms": 0.0,
                "source": "AISStream.io WebSocket",
                "notice": notice,
                "count": len(capped),
            }
            return payload, meta


REALTIME_TRAFFIC_HUB = RealtimeTrafficHub()
