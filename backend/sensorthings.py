"""OGC SensorThings API v1.1 gateway (/FROST-Server/v1.1) for BCS2050 Digital Twin.

Implements Things, Locations, Datastreams, ObservedProperties, Sensors, Observations,
FeaturesOfInterest, and authenticated POST /Observations webhook ingestion backed by
Firestore (`bcs-studio`) + partitioned BigQuery telemetry history.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.config import (
    get_sensor_ingest_tokens,
    require_auth_for_exports,
    use_bigquery,
)
from backend.live_feeds import (
    append_pilot_observation,
    get_live_telemetry_summary,
    read_pilot_observations,
)
from backend.spatial_store import load_layer_geojson

logger = logging.getLogger("bcs2050.sensorthings")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "bcs2050")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "northamerica-south1")
BQ_TELEMETRY_TABLE = f"{PROJECT_ID}.bcs2050_gis.telemetry_observations"

PREFIX = "/FROST-Server/v1.1"
router = APIRouter(prefix=PREFIX, tags=["OGC SensorThings API v1.1"])


OBSERVED_PROPERTIES: dict[str, dict[str, Any]] = {
    "air-temperature": {
        "@iot.id": "air-temperature",
        "name": "Air Temperature (2m)",
        "definition": "http://vocab.nerc.ac.uk/collection/P07/current/CFSN0023/",
        "description": "Ambient dry-bulb air temperature at 2 meters above ground.",
    },
    "relative-humidity": {
        "@iot.id": "relative-humidity",
        "name": "Relative Humidity (2m)",
        "definition": "http://vocab.nerc.ac.uk/collection/P07/current/CFSN0410/",
        "description": "Atmospheric relative humidity percentage.",
    },
    "wind-speed": {
        "@iot.id": "wind-speed",
        "name": "Wind Speed (10m)",
        "definition": "http://vocab.nerc.ac.uk/collection/P07/current/CFSN0038/",
        "description": "Horizontal wind speed at 10 meters elevation.",
    },
    "active-cyclones": {
        "@iot.id": "active-cyclones",
        "name": "Active Tropical Cyclones Count",
        "definition": "https://www.nhc.noaa.gov/aboutgloss.shtml#tc",
        "description": "Count of active tropical disturbances / cyclones tracked by NOAA NHC.",
    },
    "aquifer-dma": {
        "@iot.id": "aquifer-dma",
        "name": "CONAGUA Aquifer Mean Annual Availability (DMA)",
        "definition": "https://www.gob.mx/conagua/acciones-y-programas/disponibilidad-de-acuiferos",
        "description": "Official DOF 2023 aquifer water balance (hm3/year); negative values indicate deficit.",
    },
    "tank-level-pct": {
        "@iot.id": "tank-level-pct",
        "name": "Municipal Potable Tank Storage Level & Tandeo Status",
        "definition": "https://panel.bcs2050.com/vocab/oomsapas-tank-level",
        "description": "SCADA storage fill ratio (%) and active tandeo sector valve indicator.",
    },
    "arroyo-stage-m": {
        "@iot.id": "arroyo-stage-m",
        "name": "Arroyo Flash-Flood & Tide Water Level",
        "definition": "https://panel.bcs2050.com/vocab/arroyo-water-stage",
        "description": "Hydrometric water elevation in urban arroyos or storm-surge tide stations.",
    },
    "grid-pml-mxn": {
        "@iot.id": "grid-pml-mxn",
        "name": "SIBCS Hourly Load & Locational Marginal Price (PML)",
        "definition": "https://panel.bcs2050.com/vocab/cenace-sibcs-pml",
        "description": "Baja California Sur isolated grid (SIBCS) wholesale node price in MXN/MWh.",
    },
}

SENSORS: dict[str, dict[str, Any]] = {
    "sensor-open-meteo-forecast": {
        "@iot.id": "sensor-open-meteo-forecast",
        "name": "Open-Meteo High-Resolution NWP Station Assimilation",
        "description": "Gridded synoptic weather station assimilation synchronized every 5 minutes.",
        "encodingType": "application/pdf",
        "metadata": "https://open-meteo.com/en/docs",
    },
    "sensor-noaa-nhc-feed": {
        "@iot.id": "sensor-noaa-nhc-feed",
        "name": "NOAA National Hurricane Center Eastern Pacific Tracker",
        "description": "Official NHC tropical cyclone bulletin and track feed.",
        "encodingType": "application/json",
        "metadata": "https://www.nhc.noaa.gov/CurrentStorms.json",
    },
    "sensor-conagua-sigmas": {
        "@iot.id": "sensor-conagua-sigmas",
        "name": "CONAGUA DOF 2023 Groundwater Availability Registry",
        "description": "Official hydrometric & piezometric groundwater balance published in DOF.",
        "encodingType": "application/pdf",
        "metadata": "https://sigaims.conagua.gob.mx/",
    },
    "sensor-oomsapas-scada-pilot": {
        "@iot.id": "sensor-oomsapas-scada-pilot",
        "name": "OOMSAPAS Municipal Tank Level RTU (Phase-2 Pilot)",
        "description": "Ultrasonic level + Modbus/MQTT RTU for municipal water tanks and tandeo sectors.",
        "encodingType": "application/json",
        "metadata": "https://panel.bcs2050.com/docs/sensorthings-pilots#pilot-a",
    },
    "sensor-pc-radar-gauge-pilot": {
        "@iot.id": "sensor-pc-radar-gauge-pilot",
        "name": "Protección Civil Radar Arroyo & Tide Gauge (Phase-2 Pilot)",
        "description": "Non-contact radar level gauge for cyclone runoff corridors and coastal surge zones.",
        "encodingType": "application/json",
        "metadata": "https://panel.bcs2050.com/docs/sensorthings-pilots#pilot-b",
    },
    "sensor-cenace-sibcs-telemetry-pilot": {
        "@iot.id": "sensor-cenace-sibcs-telemetry-pilot",
        "name": "CENACE / SIBCS Node Telemetry & PML Feed (Phase-2 Pilot)",
        "description": "Hourly regional load and Locational Marginal Price (MXN/MWh) across SIBCS nodes.",
        "encodingType": "application/json",
        "metadata": "https://panel.bcs2050.com/docs/sensorthings-pilots#pilot-c",
    },
}

WEATHER_STATIONS_META: list[dict[str, Any]] = [
    {"id": "weather-03003", "slug": "la_paz", "muni": "03003", "name": "SMN / Open-Meteo La Paz", "lat": 24.1426, "lon": -110.3128},
    {"id": "weather-03008", "slug": "cabo_san_lucas", "muni": "03008", "name": "SMN / Open-Meteo Los Cabos", "lat": 22.8905, "lon": -109.9167},
    {"id": "weather-03001", "slug": "ciudad_constitucion", "muni": "03001", "name": "SMN / Open-Meteo Comondú", "lat": 25.0322, "lon": -111.6703},
    {"id": "weather-03009", "slug": "loreto", "muni": "03009", "name": "SMN / Open-Meteo Loreto", "lat": 26.0127, "lon": -111.3489},
    {"id": "weather-03002", "slug": "santa_rosalia", "muni": "03002", "name": "SMN / Open-Meteo Mulegé", "lat": 27.3396, "lon": -112.2676},
]

AQUIFER_STATION_STUBS: list[dict[str, Any]] = [
    {"id": "conagua-0324", "code": "0324", "muni": "03003", "fallback_name": "La Paz", "fallback_dma": -13.488, "lat": 24.11, "lon": -110.33},
    {"id": "conagua-0317", "code": "0317", "muni": "03008", "fallback_name": "Cabo San Lucas", "fallback_dma": -24.07, "lat": 22.90, "lon": -109.93},
    {"id": "conagua-0319", "code": "0319", "muni": "03008", "fallback_name": "San José del Cabo", "fallback_dma": -12.494, "lat": 23.06, "lon": -109.70},
    {"id": "conagua-0306", "code": "0306", "muni": "03001", "fallback_name": "Valle de Santo Domingo", "fallback_dma": -30.281, "lat": 25.02, "lon": -111.68},
    {"id": "conagua-0308", "code": "0308", "muni": "03009", "fallback_name": "San Juan Bautista Londó", "fallback_dma": 4.157, "lat": 26.22, "lon": -111.46},
]


@lru_cache(maxsize=1)
def _load_aquifer_lookup() -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    try:
        fc = load_layer_geojson("aquifers")
        for feat in fc.get("features") or []:
            props = feat.get("properties") or {}
            code = str(props.get("aquifer_code") or "").strip()
            if code:
                lookup[code] = props
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load aquifers GeoJSON lookup: %s", exc)
    return lookup


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/") + PREFIX


def _iso_utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _geojson_point(lon: float, lat: float, title: str) -> dict[str, Any]:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"name": title},
    }


def _build_registry(base_url: str) -> dict[str, Any]:
    """Assemble live SensorThings catalog backed by cached telemetry, CONAGUA GIS, and Pilot observations."""
    summary = get_live_telemetry_summary()
    weather_data = summary.get("weather") or {}
    cyclones_data = summary.get("cyclones") or {}
    feeds_meta = summary.get("feeds") or {}
    pilot_obs_map = read_pilot_observations()
    aquifers = _load_aquifer_lookup()

    default_time = summary.get("ingested_at") or summary.get("updated_at") or _iso_utc_now()
    things: list[dict[str, Any]] = []
    locations: list[dict[str, Any]] = []
    datastreams: list[dict[str, Any]] = []
    observations: list[dict[str, Any]] = []
    features_of_interest: list[dict[str, Any]] = []

    def _register_entity_links(
        *,
        thing_id: str,
        loc_id: str,
        lon: float,
        lat: float,
        title: str,
        description: str,
        properties: dict[str, Any],
    ) -> None:
        things.append(
            {
                "@iot.id": thing_id,
                "@iot.selfLink": f"{base_url}/Things('{thing_id}')",
                "Locations@iot.navigationLink": f"{base_url}/Things('{thing_id}')/Locations",
                "Datastreams@iot.navigationLink": f"{base_url}/Things('{thing_id}')/Datastreams",
                "name": title,
                "description": description,
                "properties": properties,
                "_location_ids": [loc_id],
            }
        )
        locations.append(
            {
                "@iot.id": loc_id,
                "@iot.selfLink": f"{base_url}/Locations('{loc_id}')",
                "name": f"Ubicación · {title}",
                "description": f"Estación georreferenciada WGS84 ({lat:.4f}, {lon:.4f})",
                "encodingType": "application/vnd.geo+json",
                "location": {"type": "Point", "coordinates": [lon, lat]},
            }
        )
        features_of_interest.append(
            {
                "@iot.id": f"foi-{thing_id}",
                "@iot.selfLink": f"{base_url}/FeaturesOfInterest('foi-{thing_id}')",
                "name": title,
                "description": description,
                "encodingType": "application/vnd.geo+json",
                "feature": _geojson_point(lon, lat, title),
            }
        )

    def _add_datastream(
        *,
        ds_id: str,
        thing_id: str,
        sensor_id: str,
        obs_prop_id: str,
        name: str,
        description: str,
        unit_name: str,
        unit_symbol: str,
        unit_def: str,
        lon: float,
        lat: float,
        obs_list: list[dict[str, Any]],
    ) -> None:
        datastreams.append(
            {
                "@iot.id": ds_id,
                "@iot.selfLink": f"{base_url}/Datastreams('{ds_id}')",
                "Observations@iot.navigationLink": f"{base_url}/Datastreams('{ds_id}')/Observations",
                "ObservedProperty@iot.navigationLink": f"{base_url}/ObservedProperties('{obs_prop_id}')",
                "Sensor@iot.navigationLink": f"{base_url}/Sensors('{sensor_id}')",
                "Thing@iot.navigationLink": f"{base_url}/Things('{thing_id}')",
                "name": name,
                "description": description,
                "observationType": "http://www.opengis.net/def/observationType/OGC-OM/2.0/OM_Measurement",
                "unitOfMeasurement": {
                    "name": unit_name,
                    "symbol": unit_symbol,
                    "definition": unit_def,
                },
                "observedArea": {"type": "Point", "coordinates": [lon, lat]},
                "_thing_id": thing_id,
                "_sensor_id": sensor_id,
                "_obs_prop_id": obs_prop_id,
            }
        )
        observations.extend(obs_list)

    # 1. Five Municipal Weather Things (live cached Open-Meteo feeds)
    w_feed_status = (feeds_meta.get("weather") or {}).get("status", "CACHED")
    for st in WEATHER_STATIONS_META:
        tid = st["id"]
        lid = f"loc-{tid}"
        entry = weather_data.get(st["slug"]) or {}
        obs_time = entry.get("time") or default_time
        if isinstance(obs_time, str) and len(obs_time) == 16:
            obs_time = f"{obs_time}:00Z"
        _register_entity_links(
            thing_id=tid,
            loc_id=lid,
            lon=st["lon"],
            lat=st["lat"],
            title=st["name"],
            description=f"Estación sinóptica municipal para {st['name']} ({st['muni']}).",
            properties={
                "category": "weather",
                "municipality_code": st["muni"],
                "feed_status": w_feed_status,
                "origin": "OFICIAL / LIVE CACHE",
                "source": "Open-Meteo API",
            },
        )
        for suffix, prop_id, label, uname, usym, udef, val_key in [
            ("temp", "air-temperature", "Temperatura del Aire (2m)", "degree Celsius", "Cel", "http://unitsofmeasure.org/ucum.html#para-30", "temp_c"),
            ("humidity", "relative-humidity", "Humedad Relativa (2m)", "percent", "%", "http://unitsofmeasure.org/ucum.html#para-29", "humidity_pct"),
            ("wind", "wind-speed", "Velocidad del Viento (10m)", "km/h", "km/h", "http://unitsofmeasure.org/ucum.html#para-31", "wind_kmh"),
        ]:
            ds_id = f"ds-{tid}-{suffix}"
            val = entry.get(val_key)
            obs_items = []
            if val is not None:
                oid = f"obs-{ds_id}-latest"
                obs_items.append(
                    {
                        "@iot.id": oid,
                        "@iot.selfLink": f"{base_url}/Observations('{oid}')",
                        "phenomenonTime": obs_time,
                        "resultTime": default_time,
                        "result": float(val),
                        "resultQuality": w_feed_status,
                        "_datastream_id": ds_id,
                    }
                )
            _add_datastream(
                ds_id=ds_id,
                thing_id=tid,
                sensor_id="sensor-open-meteo-forecast",
                obs_prop_id=prop_id,
                name=f"{st['name']} · {label}",
                description=f"{label} monitoreada vía cache asíncrono BCS2050.",
                unit_name=uname,
                unit_symbol=usym,
                unit_def=udef,
                lon=st["lon"],
                lat=st["lat"],
                obs_list=obs_items,
            )

    # 2. NOAA NHC Pacific Cyclone Tracker Thing
    cyc_status = (feeds_meta.get("cyclones") or {}).get("status", "CACHED")
    cyc_id = "nhc-pacific-cyclones"
    _register_entity_links(
        thing_id=cyc_id,
        loc_id=f"loc-{cyc_id}",
        lon=-109.9167,
        lat=22.8905,
        title="NOAA NHC Pacific Cyclone Tracker",
        description="Rastreador oficial de ciclones tropicales en el Pacífico Nororiental para alerta temprana BCS.",
        properties={
            "category": "cyclones",
            "municipality_code": "03",
            "feed_status": cyc_status,
            "origin": "OFICIAL / LIVE CACHE",
            "source": "NOAA NHC",
        },
    )
    ds_cyc_id = f"ds-{cyc_id}-count"
    _add_datastream(
        ds_id=ds_cyc_id,
        thing_id=cyc_id,
        sensor_id="sensor-noaa-nhc-feed",
        obs_prop_id="active-cyclones",
        name="Ciclones Tropicales Activos (Pacífico)",
        description="Número de sistemas ciclónicos activos emitidos por NOAA NHC.",
        unit_name="storms",
        unit_symbol="{storms}",
        unit_def="https://www.nhc.noaa.gov/",
        lon=-109.9167,
        lat=22.8905,
        obs_list=[
            {
                "@iot.id": f"obs-{ds_cyc_id}-latest",
                "@iot.selfLink": f"{base_url}/Observations('obs-{ds_cyc_id}-latest')",
                "phenomenonTime": (feeds_meta.get("cyclones") or {}).get("fetched_at") or default_time,
                "resultTime": default_time,
                "result": int(cyclones_data.get("count") or 0),
                "resultQuality": cyc_status,
                "_datastream_id": ds_cyc_id,
            }
        ],
    )

    # 3. Five CONAGUA Hydrometric & Deficit Aquifer Things (DOF 2023)
    for aq in AQUIFER_STATION_STUBS:
        aq_props = aquifers.get(aq["code"], {})
        aq_name = str(aq_props.get("aquifer_name") or aq["fallback_name"])
        dma_val = float(aq_props.get("dma_2023_hm3") if aq_props.get("dma_2023_hm3") is not None else aq["fallback_dma"])
        exp_pct = aq_props.get("exploitation_ratio_pct")
        tid = aq["id"]
        _register_entity_links(
            thing_id=tid,
            loc_id=f"loc-{tid}",
            lon=aq["lon"],
            lat=aq["lat"],
            title=f"CONAGUA Acuífero {aq['code']} · {aq_name}",
            description=f"Punto de control piezométrico e hídrico oficial DOF 2023 para acuífero {aq_name}.",
            properties={
                "category": "conagua_aquifer",
                "aquifer_code": aq["code"],
                "municipality_code": aq["muni"],
                "exploitation_ratio_pct": exp_pct,
                "feed_status": "LIVE",
                "origin": "OFICIAL (CONAGUA DOF 2023)",
                "source": "CONAGUA DOF 2023",
            },
        )
        ds_aq = f"ds-{tid}-dma"
        _add_datastream(
            ds_id=ds_aq,
            thing_id=tid,
            sensor_id="sensor-conagua-sigmas",
            obs_prop_id="aquifer-dma",
            name=f"DMA Acuífero {aq_name} (hm³/año)",
            description="Disponibilidad Media Anual oficial CONAGUA DOF 2023.",
            unit_name="cubic hectometers per year",
            unit_symbol="hm3/yr",
            unit_def="https://www.gob.mx/conagua",
            lon=aq["lon"],
            lat=aq["lat"],
            obs_list=[
                {
                    "@iot.id": f"obs-{ds_aq}-dof2023",
                    "@iot.selfLink": f"{base_url}/Observations('obs-{ds_aq}-dof2023')",
                    "phenomenonTime": "2023-11-09T00:00:00Z",
                    "resultTime": default_time,
                    "result": round(dma_val, 3),
                    "resultQuality": "OFFICIAL_DOF_2023",
                    "_datastream_id": ds_aq,
                }
            ],
        )

    # 4. Three Phase-2 Municipal SCADA / IoT Pilots (live-updatable via POST /Observations)
    pilots_spec = [
        {
            "id": "pilot-a-oomsapas-tandeo",
            "ds_id": "ds-pilot-a-oomsapas-tank-level",
            "sensor_id": "sensor-oomsapas-scada-pilot",
            "obs_prop_id": "tank-level-pct",
            "title": "Piloto A · OOMSAPAS Tanques & Sectorización Tandeo (La Paz / Los Cabos)",
            "description": "Esquema listo para telemetría SCADA de nivel de tanques y estado de válvulas tandeo OOMSAPAS.",
            "muni": "03003",
            "lat": 24.132,
            "lon": -110.295,
            "ds_name": "Nivel de Tanque Regulador (%)",
            "unit_name": "percent",
            "unit_symbol": "%",
            "unit_def": "http://unitsofmeasure.org/ucum.html#para-29",
        },
        {
            "id": "pilot-b-pc-arroyo-gauge",
            "ds_id": "ds-pilot-b-arroyo-stage",
            "sensor_id": "sensor-pc-radar-gauge-pilot",
            "obs_prop_id": "arroyo-stage-m",
            "title": "Piloto B · Protección Civil Escala Hidrométrica Arroyo El Cajoncito / Marea",
            "description": "Radar de tirante hidráulico ante escurrimientos ciclónicos en arroyos urbanos.",
            "muni": "03008",
            "lat": 23.048,
            "lon": -109.708,
            "ds_name": "Tirante Hidráulico en Arroyo (m)",
            "unit_name": "meter",
            "unit_symbol": "m",
            "unit_def": "http://unitsofmeasure.org/ucum.html#para-28",
        },
        {
            "id": "pilot-c-cenace-sibcs-pml",
            "ds_id": "ds-pilot-c-sibcs-pml",
            "sensor_id": "sensor-cenace-sibcs-telemetry-pilot",
            "obs_prop_id": "grid-pml-mxn",
            "title": "Piloto C · CENACE / SIBCS Carga Horaria & PML Regional",
            "description": "Integración horaria de Precio Marginal Local (MXN/MWh) y demanda pico de red aislada SIBCS.",
            "muni": "03003",
            "lat": 24.165,
            "lon": -110.341,
            "ds_name": "PML Nodo La Paz SIBCS (MXN/MWh)",
            "unit_name": "MXN per megawatt-hour",
            "unit_symbol": "MXN/MWh",
            "unit_def": "https://www.cenace.gob.mx/",
        },
    ]
    for p in pilots_spec:
        ds_id = p["ds_id"]
        custom_obs = pilot_obs_map.get(ds_id) or []
        live_pilot_status = "LIVE" if custom_obs else "awaiting_scada_pilot"
        _register_entity_links(
            thing_id=p["id"],
            loc_id=f"loc-{p['id']}",
            lon=p["lon"],
            lat=p["lat"],
            title=p["title"],
            description=p["description"],
            properties={
                "category": "scada_pilot",
                "municipality_code": p["muni"],
                "feed_status": live_pilot_status,
                "webhook_endpoint": f"{base_url}/Observations",
                "origin": "PILOT SCHEMA / SCADA WEBHOOK",
                "source": "BCS2050 Municipal SCADA Schema",
            },
        )
        obs_items: list[dict[str, Any]] = []
        for idx, raw_o in enumerate(custom_obs):
            oid = str(raw_o.get("@iot.id") or f"obs-{ds_id}-{idx}")
            obs_items.append(
                {
                    "@iot.id": oid,
                    "@iot.selfLink": f"{base_url}/Observations('{oid}')",
                    "phenomenonTime": raw_o.get("phenomenonTime", default_time),
                    "resultTime": raw_o.get("resultTime", default_time),
                    "result": raw_o.get("result"),
                    "resultQuality": raw_o.get("resultQuality", "PILOT_INGESTED"),
                    "_datastream_id": ds_id,
                }
            )
        if not obs_items:
            obs_items.append(
                {
                    "@iot.id": f"obs-{ds_id}-seed",
                    "@iot.selfLink": f"{base_url}/Observations('obs-{ds_id}-seed')",
                    "phenomenonTime": default_time,
                    "resultTime": default_time,
                    "result": None,
                    "resultQuality": "AWAITING_SCADA_PILOT",
                    "parameters": {"status": "awaiting_scada_pilot", "datastream_id": ds_id},
                    "_datastream_id": ds_id,
                }
            )
        _add_datastream(
            ds_id=ds_id,
            thing_id=p["id"],
            sensor_id=p["sensor_id"],
            obs_prop_id=p["obs_prop_id"],
            name=p["ds_name"],
            description=p["description"],
            unit_name=p["unit_name"],
            unit_symbol=p["unit_symbol"],
            unit_def=p["unit_def"],
            lon=p["lon"],
            lat=p["lat"],
            obs_list=obs_items,
        )

    return {
        "things": things,
        "locations": locations,
        "datastreams": datastreams,
        "observed_properties": [
            {**v, "@iot.selfLink": f"{base_url}/ObservedProperties('{k}')"} for k, v in OBSERVED_PROPERTIES.items()
        ],
        "sensors": [{**v, "@iot.selfLink": f"{base_url}/Sensors('{k}')"} for k, v in SENSORS.items()],
        "observations": observations,
        "features_of_interest": features_of_interest,
    }


def _parse_expand_directives(expand: str | None) -> dict[str, dict[str, Any]]:
    """Parse OGC $expand clauses including nested $expand / $top directives cleanly."""
    if not expand:
        return {}
    parts: list[str] = []
    depth = 0
    buf: list[str] = []
    for ch in expand:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append("".join(buf).strip())

    parsed: dict[str, dict[str, Any]] = {}
    for part in parts:
        if not part:
            continue
        if "(" in part and part.endswith(")"):
            name, inner = part.split("(", 1)
            inner = inner[:-1]
            top_m = re.search(r"\$top\s*=\s*(\d+)", inner)
            nested_m = re.search(r"\$expand\s*=\s*([^;]+)", inner)
            parsed[name.strip()] = {
                "top": int(top_m.group(1)) if top_m else None,
                "expand": nested_m.group(1).strip() if nested_m else None,
            }
        else:
            parsed[part.strip()] = {"top": None, "expand": None}
    return parsed


def _apply_filter(items: list[dict[str, Any]], filter_expr: str | None) -> list[dict[str, Any]]:
    if not filter_expr:
        return items
    m = re.match(r"^\s*([A-Za-z0-9_/@\.]+)\s+eq\s+'([^']+)'\s*$", filter_expr)
    if not m:
        return items
    field_path, expected = m.group(1), m.group(2)
    if field_path in {"properties/municipality_code", "municipality_code"}:
        return [x for x in items if str((x.get("properties") or {}).get("municipality_code", "")) == expected]
    if field_path in {"properties/category", "category"}:
        return [x for x in items if str((x.get("properties") or {}).get("category", "")) == expected]
    if field_path in {"@iot.id", "id"}:
        return [x for x in items if str(x.get("@iot.id", "")) == expected]
    if field_path == "Datastream/@iot.id":
        return [x for x in items if str(x.get("_datastream_id", "")) == expected]
    return items


def _clean_entity(ent: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in ent.items() if not k.startswith("_")}


def _hydrate_datastream(
    ds: dict[str, Any],
    reg: dict[str, Any],
    expand_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    out = _clean_entity(ds)
    if "ObservedProperty" in expand_map:
        op_map = {o["@iot.id"]: o for o in reg["observed_properties"]}
        if ds["_obs_prop_id"] in op_map:
            out["ObservedProperty"] = op_map[ds["_obs_prop_id"]]
    if "Sensor" in expand_map:
        s_map = {s["@iot.id"]: s for s in reg["sensors"]}
        if ds["_sensor_id"] in s_map:
            out["Sensor"] = s_map[ds["_sensor_id"]]
    if "Observations" in expand_map:
        ds_obs = [o for o in reg["observations"] if o.get("_datastream_id") == ds["@iot.id"]]
        ds_obs.sort(key=lambda o: str(o.get("phenomenonTime", "")), reverse=True)
        top_n = expand_map["Observations"].get("top")
        if isinstance(top_n, int):
            ds_obs = ds_obs[:top_n]
        out["Observations"] = [_clean_entity(o) for o in ds_obs]
    return out


def _hydrate_thing(
    thing: dict[str, Any],
    reg: dict[str, Any],
    expand_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    out = _clean_entity(thing)
    if "Locations" in expand_map:
        loc_map = {l["@iot.id"]: l for l in reg["locations"]}
        out["Locations"] = [_clean_entity(loc_map[lid]) for lid in thing.get("_location_ids", []) if lid in loc_map]
    if "Datastreams" in expand_map:
        sub_expand = _parse_expand_directives(expand_map["Datastreams"].get("expand"))
        ds_list = [ds for ds in reg["datastreams"] if ds.get("_thing_id") == thing["@iot.id"]]
        top_n = expand_map["Datastreams"].get("top")
        if isinstance(top_n, int):
            ds_list = ds_list[:top_n]
        out["Datastreams"] = [_hydrate_datastream(ds, reg, sub_expand) for ds in ds_list]
    return out


def _paginate_response(
    items: list[dict[str, Any]],
    *,
    top: int,
    skip: int,
    include_count: bool,
) -> dict[str, Any]:
    total = len(items)
    sliced = items[skip : skip + top]
    payload: dict[str, Any] = {"value": sliced}
    if include_count:
        payload["@iot.count"] = total
    return payload


@router.get("")
@router.get("/")
def sensorthings_root(request: Request) -> dict[str, Any]:
    base = _base_url(request)
    names = ["Things", "Locations", "Datastreams", "ObservedProperties", "Sensors", "Observations", "FeaturesOfInterest"]
    return {
        "value": [{"name": n, "url": f"{base}/{n}"} for n in names],
        "serverSettings": {
            "conformance": [
                "http://www.opengis.net/spec/iot_sensing/1.1/req/datamodel",
                "http://www.opengis.net/spec/iot_sensing/1.1/req/resource-path/resource-path-to-entities",
                "http://www.opengis.net/spec/iot_sensing/1.1/req/request-data/expand",
                "http://www.opengis.net/spec/iot_sensing/1.1/req/create-observations-via-http",
            ]
        },
    }


@router.get("/Things")
def list_things(
    request: Request,
    top: int = Query(default=100, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
    expand: str | None = Query(default=None, alias="$expand"),
    filter_expr: str | None = Query(default=None, alias="$filter"),
) -> dict[str, Any]:
    reg = _build_registry(_base_url(request))
    expand_map = _parse_expand_directives(expand)
    filtered = _apply_filter(reg["things"], filter_expr)
    hydrated = [_hydrate_thing(t, reg, expand_map) for t in filtered]
    return _paginate_response(hydrated, top=top, skip=skip, include_count=count)


@router.get("/Things({thing_id})")
def get_thing(
    thing_id: str,
    request: Request,
    expand: str | None = Query(default=None, alias="$expand"),
) -> dict[str, Any]:
    clean_id = thing_id.strip("'\"")
    reg = _build_registry(_base_url(request))
    expand_map = _parse_expand_directives(expand)
    match = next((t for t in reg["things"] if t["@iot.id"] == clean_id), None)
    if not match:
        raise HTTPException(status_code=404, detail=f"Thing '{clean_id}' not found")
    return _hydrate_thing(match, reg, expand_map)


@router.get("/Things({thing_id})/Locations")
def get_thing_locations(thing_id: str, request: Request) -> dict[str, Any]:
    clean_id = thing_id.strip("'\"")
    reg = _build_registry(_base_url(request))
    match = next((t for t in reg["things"] if t["@iot.id"] == clean_id), None)
    if not match:
        raise HTTPException(status_code=404, detail=f"Thing '{clean_id}' not found")
    loc_map = {l["@iot.id"]: _clean_entity(l) for l in reg["locations"]}
    locs = [loc_map[lid] for lid in match.get("_location_ids", []) if lid in loc_map]
    return {"@iot.count": len(locs), "value": locs}


@router.get("/Things({thing_id})/Datastreams")
def get_thing_datastreams(
    thing_id: str,
    request: Request,
    expand: str | None = Query(default=None, alias="$expand"),
) -> dict[str, Any]:
    clean_id = thing_id.strip("'\"")
    reg = _build_registry(_base_url(request))
    if not any(t["@iot.id"] == clean_id for t in reg["things"]):
        raise HTTPException(status_code=404, detail=f"Thing '{clean_id}' not found")
    expand_map = _parse_expand_directives(expand)
    ds_list = [_hydrate_datastream(d, reg, expand_map) for d in reg["datastreams"] if d.get("_thing_id") == clean_id]
    return {"@iot.count": len(ds_list), "value": ds_list}


@router.get("/Locations")
def list_locations(
    request: Request,
    top: int = Query(default=100, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
) -> dict[str, Any]:
    reg = _build_registry(_base_url(request))
    items = [_clean_entity(l) for l in reg["locations"]]
    return _paginate_response(items, top=top, skip=skip, include_count=count)


@router.get("/Datastreams")
def list_datastreams(
    request: Request,
    top: int = Query(default=100, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
    expand: str | None = Query(default=None, alias="$expand"),
) -> dict[str, Any]:
    reg = _build_registry(_base_url(request))
    expand_map = _parse_expand_directives(expand)
    hydrated = [_hydrate_datastream(ds, reg, expand_map) for ds in reg["datastreams"]]
    return _paginate_response(hydrated, top=top, skip=skip, include_count=count)


@router.get("/Datastreams({ds_id})/Observations")
def list_datastream_observations(
    ds_id: str,
    request: Request,
    top: int = Query(default=50, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
) -> dict[str, Any]:
    clean_id = ds_id.strip("'\"")
    reg = _build_registry(_base_url(request))
    if not any(d["@iot.id"] == clean_id for d in reg["datastreams"]):
        raise HTTPException(status_code=404, detail=f"Datastream '{clean_id}' not found")
    obs = [o for o in reg["observations"] if o.get("_datastream_id") == clean_id]
    obs.sort(key=lambda o: str(o.get("phenomenonTime", "")), reverse=True)
    return _paginate_response([_clean_entity(o) for o in obs], top=top, skip=skip, include_count=count)


@router.get("/ObservedProperties")
def list_observed_properties(
    request: Request,
    top: int = Query(default=100, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
) -> dict[str, Any]:
    reg = _build_registry(_base_url(request))
    return _paginate_response(reg["observed_properties"], top=top, skip=skip, include_count=count)


@router.get("/Sensors")
def list_sensors(
    request: Request,
    top: int = Query(default=100, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
) -> dict[str, Any]:
    reg = _build_registry(_base_url(request))
    return _paginate_response(reg["sensors"], top=top, skip=skip, include_count=count)


@router.get("/Observations")
def list_observations(
    request: Request,
    top: int = Query(default=100, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
    filter_expr: str | None = Query(default=None, alias="$filter"),
) -> dict[str, Any]:
    reg = _build_registry(_base_url(request))
    filtered = _apply_filter(reg["observations"], filter_expr)
    filtered.sort(key=lambda o: str(o.get("phenomenonTime", "")), reverse=True)
    return _paginate_response([_clean_entity(o) for o in filtered], top=top, skip=skip, include_count=count)


@router.get("/FeaturesOfInterest")
def list_features_of_interest(
    request: Request,
    top: int = Query(default=100, alias="$top", ge=1, le=500),
    skip: int = Query(default=0, alias="$skip", ge=0),
    count: bool = Query(default=True, alias="$count"),
) -> dict[str, Any]:
    reg = _build_registry(_base_url(request))
    return _paginate_response(reg["features_of_interest"], top=top, skip=skip, include_count=count)


class SensorObservationCreateRequest(BaseModel):
    Datastream: dict[str, Any]
    result: float | int | str | bool
    phenomenonTime: str | None = None
    resultTime: str | None = None
    resultQuality: str = "VERIFIED"
    parameters: dict[str, Any] = Field(default_factory=dict)


def _check_ingest_token(request: Request) -> None:
    tokens = get_sensor_ingest_tokens()
    if not tokens and not require_auth_for_exports():
        return
    if not tokens:
        raise HTTPException(
            status_code=401,
            detail="Sensor ingest tokens required (set BCS2050_SENSOR_INGEST_TOKENS or disable strict export auth).",
        )
    auth_hdr = request.headers.get("authorization", "").strip()
    candidate = auth_hdr[7:].strip() if auth_hdr.lower().startswith("bearer ") else ""
    if not candidate:
        candidate = request.headers.get("x-bcs-sensor-token", "").strip() or request.headers.get("x-bcs-planner-token", "").strip()
    if not candidate or not any(hmac.compare_digest(candidate, tok) for tok in tokens):
        raise HTTPException(status_code=401, detail="Invalid or missing sensor ingestion token.")


@router.post("/Observations", status_code=201)
def create_observation(body: SensorObservationCreateRequest, request: Request) -> dict[str, Any]:
    """Ingest a SCADA/IoT observation for a registered OGC SensorThings Datastream."""
    _check_ingest_token(request)
    ds_id = str(body.Datastream.get("@iot.id") or "").strip("'\" ")
    if not ds_id:
        raise HTTPException(status_code=422, detail="Datastream['@iot.id'] is required.")

    base = _base_url(request)
    reg = _build_registry(base)
    ds_match = next((d for d in reg["datastreams"] if d["@iot.id"] == ds_id), None)
    if not ds_match:
        raise HTTPException(status_code=404, detail=f"Datastream '{ds_id}' not found.")

    thing_match = next((t for t in reg["things"] if t["@iot.id"] == ds_match["_thing_id"]), {})
    loc_coords = (ds_match.get("observedArea") or {}).get("coordinates") or [-110.3128, 24.1426]
    now_iso = _iso_utc_now()
    phenom = body.phenomenonTime or now_iso
    obs_id = f"obs-{ds_id}-{uuid.uuid4().hex[:10]}"

    record = {
        "@iot.id": obs_id,
        "@iot.selfLink": f"{base}/Observations('{obs_id}')",
        "phenomenonTime": phenom,
        "resultTime": body.resultTime or now_iso,
        "result": body.result,
        "resultQuality": body.resultQuality,
        "parameters": body.parameters,
    }
    append_pilot_observation(ds_id, record)

    if use_bigquery():
        try:
            from google.cloud import bigquery

            bq = bigquery.Client(project=PROJECT_ID, location=BQ_LOCATION)
            is_num = isinstance(body.result, (int, float)) and not isinstance(body.result, bool)
            row = {
                "observed_at": phenom,
                "ingested_at": now_iso,
                "feed_name": "sensorthings_pilot",
                "thing_id": ds_match["_thing_id"],
                "municipality_code": str((thing_match.get("properties") or {}).get("municipality_code") or "03"),
                "metric_name": ds_id,
                "numeric_value": float(body.result) if is_num else None,
                "string_value": None if is_num else str(body.result),
                "unit": str((ds_match.get("unitOfMeasurement") or {}).get("symbol") or ""),
                "status": "LIVE",
                "source": "OGC SensorThings v1.1 Webhook",
                "lat": float(loc_coords[1]),
                "lon": float(loc_coords[0]),
                "payload_json": json.dumps(record, ensure_ascii=False),
            }
            bq.insert_rows_json(BQ_TELEMETRY_TABLE, [row])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed persisting webhook observation to BigQuery: %s", exc)

    return record


def get_pilot_schemas_catalog() -> dict[str, Any]:
    """Publish standardized webhook & MQTT payload schemas for Phase-2 BCS municipal pilots."""
    return {
        "standard": "OGC SensorThings API v1.1 (ISO/OGC 18-088)",
        "base_path": PREFIX,
        "ingest_endpoint": f"{PREFIX}/Observations",
        "pilots": [
            {
                "pilot_id": "PILOT-A-OOMSAPAS",
                "title": "Pilot A · OOMSAPAS La Paz & Los Cabos Tank Levels / Tandeo Sector Status",
                "thing_id": "pilot-a-oomsapas-tandeo",
                "datastream_id": "ds-pilot-a-oomsapas-tank-level",
                "mqtt_topic": "bcs2050/oomsapas/{municipality_code}/tanks/{tank_id}/observation",
                "cadence": "Every 5 minutes via SCADA RTU -> Cloud Pub/Sub or HTTPS POST",
                "unit": "%",
                "sample_payload": {
                    "Datastream": {"@iot.id": "ds-pilot-a-oomsapas-tank-level"},
                    "phenomenonTime": "2026-11-24T12:00:00Z",
                    "result": 68.4,
                    "resultQuality": "SCADA_VERIFIED",
                    "parameters": {"tank_id": "TQ-LPZ-04", "tandeo_sector": "SEC-112", "valve_open": True},
                },
            },
            {
                "pilot_id": "PILOT-B-PROTECCION-CIVIL",
                "title": "Pilot B · Protección Civil Arroyo Flash-Flood & Tide Level Gauges",
                "thing_id": "pilot-b-pc-arroyo-gauge",
                "datastream_id": "ds-pilot-b-arroyo-stage",
                "mqtt_topic": "bcs2050/proteccion-civil/{municipality_code}/arroyos/{gauge_id}/observation",
                "cadence": "Every 1 minute during cyclone alert / 5 minutes nominal",
                "unit": "m",
                "sample_payload": {
                    "Datastream": {"@iot.id": "ds-pilot-b-arroyo-stage"},
                    "phenomenonTime": "2026-11-24T12:00:00Z",
                    "result": 0.42,
                    "resultQuality": "RADAR_VERIFIED",
                    "parameters": {"gauge_id": "ARR-SJC-01", "alert_level": "NOMINAL", "threshold_yellow_m": 1.8},
                },
            },
            {
                "pilot_id": "PILOT-C-CENACE-SIBCS",
                "title": "Pilot C · CENACE / SIBCS Hourly Regional Load & Marginal Price (PML)",
                "thing_id": "pilot-c-cenace-sibcs-pml",
                "datastream_id": "ds-pilot-c-sibcs-pml",
                "mqtt_topic": "bcs2050/cenace/sibcs/nodes/{node_id}/pml",
                "cadence": "Hourly market settlement + 5-min dispatch telemetry",
                "unit": "MXN/MWh",
                "sample_payload": {
                    "Datastream": {"@iot.id": "ds-pilot-c-sibcs-pml"},
                    "phenomenonTime": "2026-11-24T12:00:00Z",
                    "result": 2340.5,
                    "resultQuality": "CENACE_SETTLED",
                    "parameters": {"node_id": "03LPA-115", "regional_load_mw": 482.3, "reserve_margin_pct": 8.2},
                },
            },
        ],
    }
