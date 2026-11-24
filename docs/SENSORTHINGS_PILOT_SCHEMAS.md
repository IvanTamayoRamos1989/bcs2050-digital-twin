# BCS2050 OGC SensorThings API v1.1 & Municipal Telemetry Schemas

**Conformance:** OGC SensorThings API Part 1: Sensing v1.1 (`http://www.opengis.net/doc/IS/sensorthings/1.1`)  
**Base Endpoint:** `https://bcs2050-digital-twin-96586614897.northamerica-south1.run.app/FROST-Server/v1.1`

---

## 1. Event-Driven Ingestion Backbone

1. **Cloud Scheduler (`bcs2050-telemetry-every-5m`, `us-central1`)** triggers Cloud Run Job **`bcs2050-telemetry-ingestor` (`northamerica-south1`)** every 5 minutes (`*/5 * * * * America/Mexico_City`).
2. `workers/telemetry_ingestor.py` concurrently polls:
   - **Open-Meteo NWP**: 5 BCS municipalities (`03003` La Paz, `03008` Los Cabos, `03001` Comondú, `03009` Loreto, `03002` Mulegé).
   - **OpenSky Network**: BCS airspace bounding box (`22.0,-116.0` to `28.5,-108.5`) with 30-minute cached retention if upstream rate-limits.
   - **AIS Stream Proxy**: `TERRITORIAL_IA_URL/api/marine-traffic`.
   - **NOAA NHC**: `CurrentStorms.json` active tropical cyclones.
3. Snapshot is persisted atomically to:
   - **Firestore Native (`bcs-studio`)** -> `twin_telemetry/latest` (15s hot RAM mirror on Cloud Run guarantees `<150 ms` p95 on `GET /api/twin/live/summary`).
   - **BigQuery (`bcs2050.bcs2050_gis.telemetry_observations`)** -> daily `DATE(observed_at)` partitioned & clustered time-series archive.
   - **Pub/Sub (`bcs2050-telemetry-events`)** -> asynchronous snapshot notification event.

---

## 2. Registered Public `Things` (11 Core + 3 Municipal Pilots = 14)

- **5 Municipal Weather Stations:** `weather-03003`, `weather-03008`, `weather-03001`, `weather-03009`, `weather-03002` (`air-temperature`, `relative-humidity`, `wind-speed`)
- **1 Cyclone Tracker:** `nhc-pacific-cyclones` (`active-cyclones`)
- **5 CONAGUA DOF 2023 Aquifers:** `conagua-0324`, `conagua-0317`, `conagua-0319`, `conagua-0306`, `conagua-0308` (`aquifer-dma`)
- **3 Phase-2 SCADA / IoT Pilots:** `pilot-a-oomsapas-tandeo`, `pilot-b-pc-arroyo-gauge`, `pilot-c-cenace-sibcs-pml`

---

## 3. Phase-2 Municipal Pilot Webhook & MQTT Schemas

### Authentication
When `BCS2050_SENSOR_INGEST_TOKENS` is set on Cloud Run, `POST /FROST-Server/v1.1/Observations` requires:
```http
Authorization: Bearer <SENSOR_INGEST_TOKEN>
```
(or `X-BCS-Sensor-Token: <SENSOR_INGEST_TOKEN>`).

### Pilot A — OOMSAPAS Tank Levels & Tandeo Status
- **Thing `@iot.id`:** `pilot-a-oomsapas-tandeo`
- **Datastream `@iot.id`:** `ds-pilot-a-oomsapas-tank-level`
- **MQTT Topic:** `bcs2050/oomsapas/{municipality_code}/tanks/{tank_id}/observation`
```json
{
  "Datastream": { "@iot.id": "ds-pilot-a-oomsapas-tank-level" },
  "phenomenonTime": "2026-11-24T12:00:00Z",
  "result": 68.4,
  "resultQuality": "SCADA_VERIFIED",
  "parameters": {
    "tank_id": "TQ-LPZ-04",
    "tandeo_sector": "SEC-112",
    "valve_open": true
  }
}
```

### Pilot B — Protección Civil Arroyo Flash-Flood & Tide Gauges
- **Thing `@iot.id`:** `pilot-b-pc-arroyo-gauge`
- **Datastream `@iot.id`:** `ds-pilot-b-arroyo-stage`
- **MQTT Topic:** `bcs2050/proteccion-civil/{municipality_code}/arroyos/{gauge_id}/observation`
```json
{
  "Datastream": { "@iot.id": "ds-pilot-b-arroyo-stage" },
  "phenomenonTime": "2026-11-24T12:00:00Z",
  "result": 0.42,
  "resultQuality": "RADAR_VERIFIED",
  "parameters": {
    "gauge_id": "ARR-SJC-01",
    "alert_level": "NOMINAL",
    "threshold_yellow_m": 1.8
  }
}
```

### Pilot C — CENACE / SIBCS Regional Load & Marginal Price (PML)
- **Thing `@iot.id`:** `pilot-c-cenace-sibcs-pml`
- **Datastream `@iot.id`:** `ds-pilot-c-sibcs-pml`
- **MQTT Topic:** `bcs2050/cenace/sibcs/nodes/{node_id}/pml`
```json
{
  "Datastream": { "@iot.id": "ds-pilot-c-sibcs-pml" },
  "phenomenonTime": "2026-11-24T12:00:00Z",
  "result": 2340.5,
  "resultQuality": "CENACE_SETTLED",
  "parameters": {
    "node_id": "03LPA-115",
    "regional_load_mw": 482.3,
    "reserve_margin_pct": 8.2
  }
}
```
