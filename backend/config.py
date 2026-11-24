"""Runtime configuration and path bridging for BCS2050 Digital Twin."""

from __future__ import annotations

import os
import sys
from pathlib import Path

DIGITAL_TWIN_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = DIGITAL_TWIN_ROOT.parent
_LOCAL_INTELLIGENCE_DIR = DIGITAL_TWIN_ROOT / "bcs2050_intelligence"
INTELLIGENCE_DIR = (
    _LOCAL_INTELLIGENCE_DIR if _LOCAL_INTELLIGENCE_DIR.exists() else WORKSPACE_ROOT / "bcs2050_intelligence"
)

if INTELLIGENCE_DIR.exists() and str(INTELLIGENCE_DIR) not in sys.path:
    sys.path.insert(0, str(INTELLIGENCE_DIR))

DATA_DIR = Path(os.environ.get("BCS2050_DATA_DIR", str(DIGITAL_TWIN_ROOT / "data")))
LAYERS_DIR = DATA_DIR / "layers"
SQLITE_PATH = DATA_DIR / "spatial_index.sqlite"
SUMMARY_PATH = DATA_DIR / "city_science_summary.json"
FRONTEND_DIST_DIR = DIGITAL_TWIN_ROOT / "frontend" / "dist"


def use_bigquery() -> bool:
    return os.environ.get("BCS2050_USE_BIGQUERY", "false").strip().lower() in {"1", "true", "yes"}


def use_vertex_strategist() -> bool:
    explicit = os.environ.get("BCS2050_USE_VERTEX_STRATEGIST", "").strip().lower()
    if explicit in {"1", "true", "yes"}:
        return True
    if explicit in {"0", "false", "no"}:
        return False
    return use_bigquery()


def get_gemini_location() -> str:
    return os.environ.get("GOOGLE_CLOUD_LOCATION", "global").strip() or "global"


def get_chat_model() -> str:
    return os.environ.get("BCS2050_CHAT_MODEL", "gemini-4-hydrogen").strip() or "gemini-4-hydrogen"


def use_firestore_cache() -> bool:
    return os.environ.get("BCS2050_USE_FIRESTORE", "false").strip().lower() in {"1", "true", "yes"}


def get_firestore_database() -> str:
    return os.environ.get("BCS2050_FIRESTORE_DATABASE", "bcs-studio").strip() or "bcs-studio"


def get_telemetry_pubsub_topic() -> str:
    return os.environ.get("BCS2050_TELEMETRY_PUBSUB_TOPIC", "bcs2050-telemetry-events").strip() or "bcs2050-telemetry-events"


def get_sensor_ingest_tokens() -> set[str]:
    raw = os.environ.get("BCS2050_SENSOR_INGEST_TOKENS", "").strip()
    return {tok.strip() for tok in raw.split(",") if tok.strip()}


def get_postgis_dsn() -> str:
    return os.environ.get("BCS2050_POSTGIS_DSN", "").strip()


def use_gcs_hydration() -> bool:
    return os.environ.get("BCS2050_GCS_HYDRATE_DATA", "false").strip().lower() in {"1", "true", "yes"}


def get_gcs_data_tar_uri() -> str:
    return (
        os.environ.get(
            "BCS2050_GCS_DATA_TAR_URI",
            "gs://bcs2050-gis-curated/digital_twin_artifacts/twin_data.tar.gz",
        ).strip()
        or "gs://bcs2050-gis-curated/digital_twin_artifacts/twin_data.tar.gz"
    )


def get_3dtiles_tileset_url() -> str:
    return (
        os.environ.get(
            "BCS2050_3DTILES_URL",
            "https://storage.googleapis.com/bcs2050-3dtiles-public/bcs_buildings_v11/tileset.json",
        ).strip()
        or "https://storage.googleapis.com/bcs2050-3dtiles-public/bcs_buildings_v11/tileset.json"
    )


DEFAULT_ALLOWED_ORIGINS: list[str] = [
    "https://bcs2050.com",
    "https://www.bcs2050.com",
    "https://panel.bcs2050.com",
    "https://twin.bcs2050.com",
    "https://bcs2050-digital-twin-96586614897.northamerica-south1.run.app",
    "https://bcs2050-digital-twin-4aurr37ktq-pv.a.run.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8050",
    "http://127.0.0.1:8050",
]


def get_allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return list(DEFAULT_ALLOWED_ORIGINS)
    parsed = [o.strip() for o in raw.split(",") if o.strip()]
    return parsed or list(DEFAULT_ALLOWED_ORIGINS)


def get_rate_limits() -> tuple[int, int]:
    """Return (heavy_requests_per_min, read_requests_per_min)."""
    try:
        heavy = max(1, int(os.environ.get("BCS2050_HEAVY_RPM", "12")))
    except ValueError:
        heavy = 12
    try:
        read = max(10, int(os.environ.get("BCS2050_READ_RPM", "180")))
    except ValueError:
        read = 180
    return heavy, read


def require_auth_for_exports() -> bool:
    return os.environ.get("BCS2050_REQUIRE_AUTH_FOR_EXPORTS", "false").strip().lower() in {"1", "true", "yes"}


def get_planner_api_tokens() -> set[str]:
    raw = os.environ.get("BCS2050_PLANNER_API_TOKENS", "").strip()
    return {tok.strip() for tok in raw.split(",") if tok.strip()}


def get_runtime_capabilities() -> dict[str, bool]:
    """Report active commercial 3D/GIS API keys and cloud capabilities without leaking secrets."""
    return {
        "bigquery_live": use_bigquery(),
        "google_photorealistic_3d_tiles": bool(os.environ.get("VITE_GOOGLE_MAPS_API_KEY", "").strip()),
        "cesium_ion_terrain": bool(os.environ.get("VITE_CESIUM_ION_TOKEN", "").strip()),
        "maptiler_enterprise": bool(os.environ.get("VITE_MAPTILER_KEY", "").strip()),
        "arcgis_platform": bool(os.environ.get("VITE_ARCGIS_API_KEY", "").strip()),
        "ontology_v3_connected": INTELLIGENCE_DIR.exists(),
        "cad_bim_exporters": True,
        "autodesk_aps_acc": bool(os.environ.get("AUTODESK_APS_CLIENT_ID", "").strip()),
        "autodesk_tandem": bool(os.environ.get("AUTODESK_TANDEM_FACILITY_URN", "").strip()),
        "strict_cors_enabled": True,
        "rate_limiting_enabled": True,
        "planner_rbac_enforced": require_auth_for_exports(),
        "vertex_gemini_strategist": use_vertex_strategist(),
        "bigquery_vector_rag": use_bigquery(),
        "firestore_telemetry_cache": use_firestore_cache(),
        "ogc_sensorthings_v11": True,
        "bigquery_telemetry_history": use_bigquery(),
        "postgis_connected": bool(get_postgis_dsn()),
        "gcs_cloud_native_hydration": use_gcs_hydration(),
        "ogc_api_features": True,
        "ogc_api_tiles_mvt": True,
        "ogc_api_processes": True,
        "ogc_api_records": True,
        "ogc_3dtiles_v11": True,
    }
