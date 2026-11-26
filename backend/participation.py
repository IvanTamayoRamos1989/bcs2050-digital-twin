"""Moderated Citizen Participation (PMDU Pin & Comment) and Institutional Governance Service for BCS2050."""

from __future__ import annotations

import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import (
    DIGITAL_TWIN_ROOT,
    get_firestore_database,
    get_planner_api_tokens,
    use_firestore_cache,
)

LOGGER = logging.getLogger("bcs2050.participation")

COLLECTION_NAME = "bcs2050_citizen_pins"

BCS_BBOX = {
    "min_lon": -115.2,
    "max_lon": -109.2,
    "min_lat": 22.8,
    "max_lat": 28.1,
}

PMDU_CONSULTATION_PERIODS: list[dict[str, str]] = [
    {
        "id": "PMDU-LPZ-2026",
        "municipality_code": "03003",
        "label_es": "Actualización PMDU La Paz 2026 (Consulta Abierta)",
        "label_en": "La Paz PMDU 2026 Update (Open Consultation)",
        "window": "2026-Q3 / Q4",
        "status": "OPEN",
    },
    {
        "id": "PMDU-LCB-2026",
        "municipality_code": "03008",
        "label_es": "PMDU Los Cabos 2040 · Corredor El Tezal / SJC",
        "label_en": "Los Cabos PMDU 2040 · El Tezal / SJC Corridor",
        "window": "2026-Q3 / Q4",
        "status": "OPEN",
    },
    {
        "id": "PMDU-LOR-2026",
        "municipality_code": "03009",
        "label_es": "PMDU Loreto & Nopoló Resiliente 2026",
        "label_en": "Loreto & Nopoló Resilient PMDU 2026",
        "window": "2026-Q4",
        "status": "OPEN",
    },
    {
        "id": "POER-BCS-2026",
        "municipality_code": "03",
        "label_es": "Ordenamiento Ecológico Regional POERBCS & Clima",
        "label_en": "POERBCS Regional Ecological & Climate Plan",
        "window": "2026-Q4",
        "status": "OPEN",
    },
]

PARTICIPATION_CATEGORIES: list[dict[str, str]] = [
    {"id": "water", "label_es": "Agua y Tandeo", "label_en": "Water & Supply"},
    {"id": "flood_heat", "label_es": "Arroyos, Inundación y Calor", "label_en": "Arroyos, Flood & Heat"},
    {"id": "mobility", "label_es": "Movilidad, Banquetas y Camión", "label_en": "Mobility, Sidewalks & Transit"},
    {"id": "housing", "label_es": "Vivienda y Uso de Suelo", "label_en": "Housing & Zoning"},
    {"id": "public_space", "label_es": "Parques, Sombra y Equipamiento", "label_en": "Parks, Shade & Facilities"},
    {"id": "solar_energy", "label_es": "Energía Solar y Red Eléctrica", "label_en": "Solar Energy & Grid"},
]

VALID_PERIOD_IDS = {p["id"] for p in PMDU_CONSULTATION_PERIODS}
VALID_CATEGORIES = {c["id"] for c in PARTICIPATION_CATEGORIES}

# Strictly flat scalar fields — Firestore rejects nested arrays!
SEEDED_PARTICIPATION_PINS: list[dict[str, Any]] = [
    {
        "pin_id": "seed-lpz-malecon-suds",
        "lon": -110.3128,
        "lat": 24.1564,
        "municipality_code": "03003",
        "pmdu_period": "PMDU-LPZ-2026",
        "category": "flood_heat",
        "title": "Drenaje pluvial y sombra urbana en Malecón / Zona Centro",
        "title_en": "Stormwater drainage & urban shade on Malecón / Downtown",
        "comment": "Se proponen jardines de lluvia (SUDS) y pérgolas con paneles solares en cruces peatonales rumbo al Malecón para reducir islas de calor y encharcamientos ciclónicos.",
        "comment_en": "Proposing rain gardens (SUDS) and solar-shaded pergolas along pedestrian crossings toward the Malecón to reduce urban heat islands and cyclone runoff flooding.",
        "author_alias": "Ejemplo Ilustrativo · Mesa Vecinal LPZ",
        "author_alias_en": "Reference Example · La Paz Neighborhood Desk",
        "status": "approved",
        "created_at": "2026-10-01T16:00:00Z",
        "moderated_at": "2026-10-02T10:00:00Z",
        "moderator_note": "Registro semilla de referencia PMDU La Paz.",
        "seeded_example": True,
        "pii_redacted": False,
    },
    {
        "pin_id": "seed-lcb-tezal-transit",
        "lon": -109.8975,
        "lat": 22.9052,
        "municipality_code": "03008",
        "pmdu_period": "PMDU-LCB-2026",
        "category": "mobility",
        "title": "Paraderos sombreados y cruce seguro en El Tezal",
        "title_en": "Shaded transit stops & safe crossings in El Tezal",
        "comment": "La vivienda densa al norte de la Transpeninsular requiere pasos peatonales elevados, alumbrado solar y bahías para transporte público conectadas a la red 15-min.",
        "comment_en": "High-density housing north of the Transpeninsular Highway needs raised pedestrian crosswalks, solar lighting, and bus bays linked to the 15-minute network.",
        "author_alias": "Ejemplo Ilustrativo · Observatorio Cabos",
        "author_alias_en": "Reference Example · Los Cabos Observatory",
        "status": "approved",
        "created_at": "2026-10-03T18:30:00Z",
        "moderated_at": "2026-10-04T09:15:00Z",
        "moderator_note": "Registro semilla de referencia PMDU Los Cabos.",
        "seeded_example": True,
        "pii_redacted": False,
    },
    {
        "pin_id": "seed-sjc-estero-buffer",
        "lon": -109.6895,
        "lat": 23.0582,
        "municipality_code": "03008",
        "pmdu_period": "POER-BCS-2026",
        "category": "water",
        "title": "Reúso PTAR línea morada y amortiguamiento del Estero SJC",
        "title_en": "Purple-line reclaimed water reuse & SJC Estuary buffer",
        "comment": "Priorizar riego exclusivo con agua tratada de línea morada en áreas verdes hoteleras para proteger el nivel freático del Estero de San José del Cabo.",
        "comment_en": "Prioritize exclusive purple-line reclaimed water irrigation across resort landscaping to protect the groundwater table of the San José del Cabo Estuary.",
        "author_alias": "Ejemplo Ilustrativo · Red Hídrica Sur",
        "author_alias_en": "Reference Example · South Water Network",
        "status": "approved",
        "created_at": "2026-10-05T14:20:00Z",
        "moderated_at": "2026-10-06T11:00:00Z",
        "moderator_note": "Registro semilla de referencia POERBCS.",
        "seeded_example": True,
        "pii_redacted": False,
    },
    {
        "pin_id": "seed-lor-arroyo-shade",
        "lon": -111.3452,
        "lat": 26.0116,
        "municipality_code": "03009",
        "pmdu_period": "PMDU-LOR-2026",
        "category": "public_space",
        "title": "Corredor verde peatonal en borde del arroyo Las Parras",
        "title_en": "Pedestrian greenway along Las Parras arroyo edge",
        "comment": "Consolidar parque lineal con flora nativa de baja demanda hídrica que funcione como cauce seguro durante lluvias de septiembre sin pavimentar el lecho.",
        "comment_en": "Establish a linear park with low-water native desert flora serving as an unpaved cyclone drainage buffer during September storm runoff.",
        "author_alias": "Ejemplo Ilustrativo · Taller Loreto",
        "author_alias_en": "Reference Example · Loreto Workshop",
        "status": "approved",
        "created_at": "2026-10-07T17:10:00Z",
        "moderated_at": "2026-10-08T12:00:00Z",
        "moderator_note": "Registro semilla de referencia PMDU Loreto.",
        "seeded_example": True,
        "pii_redacted": False,
    },
]

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_URL_RE = re.compile(r"(https?://|www\.)", re.IGNORECASE)
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?:\+?52[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?)\d{3}[\s\-.]?\d{4}\b")
_CURP_RFC_RE = re.compile(
    r"\b(?:[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d|[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b",
    re.IGNORECASE,
)

_LOCK = threading.Lock()
_LOCAL_PINS: dict[str, dict[str, Any]] = {p["pin_id"]: dict(p) for p in SEEDED_PARTICIPATION_PINS}
_FIRESTORE_CLIENT: Any = None
_FIRESTORE_INIT_FAILED = False


def reset_local_participation_store() -> None:
    """Restore in-memory pin store to curated seed records (used by automated tests)."""
    with _LOCK:
        _LOCAL_PINS.clear()
        for pin in SEEDED_PARTICIPATION_PINS:
            _LOCAL_PINS[pin["pin_id"]] = dict(pin)


def _get_firestore_client():
    global _FIRESTORE_CLIENT, _FIRESTORE_INIT_FAILED
    if not use_firestore_cache() or _FIRESTORE_INIT_FAILED:
        return None
    if _FIRESTORE_CLIENT is not None:
        return _FIRESTORE_CLIENT
    try:
        from google.cloud import firestore  # type: ignore

        _FIRESTORE_CLIENT = firestore.Client(database=get_firestore_database())
        return _FIRESTORE_CLIENT
    except Exception as exc:  # pragma: no cover - optional cloud SDK
        LOGGER.warning("Firestore unavailable for participation store, using memory fallback: %s", exc)
        _FIRESTORE_INIT_FAILED = True
        return None


def infer_municipality_code(lon: float, lat: float) -> str:
    """Heuristically assign BCS municipality code from WGS84 point coordinates."""
    if lat < 23.62:
        return "03008"  # Los Cabos
    if lat < 24.92:
        return "03003"  # La Paz
    if lat < 26.35 and lon > -111.75:
        return "03009"  # Loreto
    if lat < 26.6:
        return "03001"  # Comondu
    return "03002"  # Mulege


def sanitize_and_redact_text(raw: str) -> tuple[str, bool]:
    """Strip HTML, block external spam URLs, and redact incidental personal PII (LGPDPPSO)."""
    cleaned = _HTML_TAG_RE.sub("", raw or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if _URL_RE.search(cleaned):
        raise ValueError("External URLs are not permitted in PMDU citizen comments.")

    redacted = False
    after_email = _EMAIL_RE.sub("[email-protegido]", cleaned)
    if after_email != cleaned:
        redacted = True
        cleaned = after_email

    after_phone = _PHONE_RE.sub("[tel-protegido]", cleaned)
    if after_phone != cleaned:
        redacted = True
        cleaned = after_phone

    after_id = _CURP_RFC_RE.sub("[id-protegido]", cleaned)
    if after_id != cleaned:
        redacted = True
        cleaned = after_id

    return cleaned, redacted


_SEEDED_PIN_EN_FALLBACKS: dict[str, dict[str, str]] = {
    p["pin_id"]: {
        "title_en": str(p.get("title_en") or ""),
        "comment_en": str(p.get("comment_en") or ""),
        "author_alias_en": str(p.get("author_alias_en") or ""),
    }
    for p in SEEDED_PARTICIPATION_PINS
}


def _normalize_pin_record(doc: dict[str, Any]) -> dict[str, Any]:
    pid = str(doc["pin_id"])
    fb = _SEEDED_PIN_EN_FALLBACKS.get(pid, {})
    return {
        "pin_id": pid,
        "lon": round(float(doc["lon"]), 6),
        "lat": round(float(doc["lat"]), 6),
        "municipality_code": str(doc.get("municipality_code") or "03"),
        "pmdu_period": str(doc.get("pmdu_period") or "PMDU-LPZ-2026"),
        "category": str(doc.get("category") or "public_space"),
        "title": str(doc.get("title") or ""),
        "title_en": str(doc.get("title_en") or fb.get("title_en") or ""),
        "comment": str(doc.get("comment") or ""),
        "comment_en": str(doc.get("comment_en") or fb.get("comment_en") or ""),
        "author_alias": str(doc.get("author_alias") or "Participación Ciudadana"),
        "author_alias_en": str(doc.get("author_alias_en") or fb.get("author_alias_en") or ""),
        "status": str(doc.get("status") or "pending_moderation"),
        "created_at": str(doc.get("created_at") or ""),
        "moderated_at": str(doc.get("moderated_at") or ""),
        "moderator_note": str(doc.get("moderator_note") or ""),
        "seeded_example": bool(doc.get("seeded_example", False)),
        "pii_redacted": bool(doc.get("pii_redacted", False)),
    }


def _load_all_pins() -> tuple[list[dict[str, Any]], str]:
    db = _get_firestore_client()
    if db is not None:
        try:
            docs = list(db.collection(COLLECTION_NAME).stream())
            by_id: dict[str, dict[str, Any]] = {p["pin_id"]: dict(p) for p in SEEDED_PARTICIPATION_PINS}
            for snap in docs:
                raw = snap.to_dict() or {}
                if raw.get("pin_id"):
                    by_id[str(raw["pin_id"])] = _normalize_pin_record(raw)
            return list(by_id.values()), f"firestore:{get_firestore_database()}"
        except Exception as exc:  # pragma: no cover - runtime resilience
            LOGGER.warning("Firestore read failed for citizen pins: %s", exc)

    with _LOCK:
        items = [_normalize_pin_record(p) for p in _LOCAL_PINS.values()]
    return items, "memory_fallback"


def _persist_pin(record: dict[str, Any]) -> str:
    flat = _normalize_pin_record(record)
    db = _get_firestore_client()
    if db is not None:
        try:
            db.collection(COLLECTION_NAME).document(flat["pin_id"]).set(flat)
            with _LOCK:
                _LOCAL_PINS[flat["pin_id"]] = dict(flat)
            return f"firestore:{get_firestore_database()}"
        except Exception as exc:  # pragma: no cover - runtime resilience
            LOGGER.warning("Firestore write failed for citizen pin %s: %s", flat["pin_id"], exc)

    with _LOCK:
        _LOCAL_PINS[flat["pin_id"]] = dict(flat)
    return "memory_fallback"


def list_citizen_pins(
    pmdu_period: str | None = None,
    category: str | None = None,
    include_pending: bool = False,
) -> dict[str, Any]:
    """Return moderated (or moderator-scoped) PMDU consultation pins and lookup catalogs."""
    all_pins, backend = _load_all_pins()
    filtered: list[dict[str, Any]] = []
    pending_count = 0
    approved_count = 0

    for pin in all_pins:
        if pin["status"] == "approved":
            approved_count += 1
        elif pin["status"] == "pending_moderation":
            pending_count += 1

        if not include_pending and pin["status"] != "approved":
            continue
        if include_pending and pin["status"] == "rejected":
            continue
        if pmdu_period and pin["pmdu_period"] != pmdu_period:
            continue
        if category and pin["category"] != category:
            continue
        filtered.append(pin)

    filtered.sort(key=lambda item: (item.get("seeded_example", False), item.get("created_at", "")), reverse=True)
    # Keep newest citizen submissions first, seeded examples right after
    live_pins = [p for p in filtered if not p.get("seeded_example")]
    live_pins.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    seed_pins = [p for p in filtered if p.get("seeded_example")]
    ordered = live_pins + seed_pins

    return {
        "count": len(ordered),
        "approved_count": approved_count,
        "pending_count": pending_count,
        "include_pending": include_pending,
        "persistence_backend": backend,
        "moderation_rbac_mode": "enforced_token_rbac" if get_planner_api_tokens() else "open_demo_mode",
        "pmdu_periods": PMDU_CONSULTATION_PERIODS,
        "categories": PARTICIPATION_CATEGORIES,
        "privacy_notice_es": "Sin datos personales (LGPDPPSO): correos, teléfonos y CURP/RFC se redactan automáticamente; cada aporte entra en cola de moderación PMDU.",
        "privacy_notice_en": "Privacy by design (LGPDPPSO): emails, phones, and tax/national IDs are auto-redacted; new submissions await PMDU moderation before public display.",
        "pins": ordered,
    }


def create_citizen_pin(
    lon: float,
    lat: float,
    category: str,
    title: str,
    comment: str,
    pmdu_period: str = "PMDU-LPZ-2026",
    author_alias: str | None = None,
) -> dict[str, Any]:
    """Validate, redact PII, and persist a new moderated PMDU citizen pin."""
    if not (BCS_BBOX["min_lon"] <= float(lon) <= BCS_BBOX["max_lon"]) or not (
        BCS_BBOX["min_lat"] <= float(lat) <= BCS_BBOX["max_lat"]
    ):
        raise ValueError(
            "Coordinates fall outside Baja California Sur bounding box (-115.2..-109.2 lon, 22.8..28.1 lat)."
        )

    if category not in VALID_CATEGORIES:
        raise ValueError(f"Unsupported category '{category}'. Expected one of: {sorted(VALID_CATEGORIES)}")
    if pmdu_period not in VALID_PERIOD_IDS:
        raise ValueError(f"Unsupported PMDU period '{pmdu_period}'. Expected one of: {sorted(VALID_PERIOD_IDS)}")

    clean_title, red_title = sanitize_and_redact_text(title)
    clean_comment, red_comment = sanitize_and_redact_text(comment)
    clean_alias, red_alias = sanitize_and_redact_text(author_alias or "Ciudadano BCS")

    if len(clean_title) < 3 or len(clean_title) > 120:
        raise ValueError("Title must contain between 3 and 120 characters after sanitization.")
    if len(clean_comment) < 10 or len(clean_comment) > 600:
        raise ValueError("Comment must contain between 10 and 600 characters after sanitization.")

    clean_alias = clean_alias[:48] or "Ciudadano BCS"
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pin_id = f"pin-{uuid.uuid4().hex[:12]}"

    record = {
        "pin_id": pin_id,
        "lon": round(float(lon), 6),
        "lat": round(float(lat), 6),
        "municipality_code": infer_municipality_code(float(lon), float(lat)),
        "pmdu_period": pmdu_period,
        "category": category,
        "title": clean_title,
        "comment": clean_comment,
        "author_alias": clean_alias,
        "status": "pending_moderation",
        "created_at": now_iso,
        "moderated_at": "",
        "moderator_note": "",
        "seeded_example": False,
        "pii_redacted": bool(red_title or red_comment or red_alias),
    }
    backend = _persist_pin(record)
    return {
        "pin": record,
        "persistence_backend": backend,
        "message_es": "Aporte registrado en cola de moderación PMDU (protección LGPDPPSO activa).",
        "message_en": "Submission recorded in PMDU moderation queue (LGPDPPSO privacy filter active).",
    }


def moderate_citizen_pin(pin_id: str, action: str, moderator_note: str = "") -> dict[str, Any]:
    """Approve or reject a pending citizen participation pin."""
    if action not in {"approve", "reject"}:
        raise ValueError("Moderation action must be 'approve' or 'reject'.")

    all_pins, _ = _load_all_pins()
    target = next((p for p in all_pins if p["pin_id"] == pin_id), None)
    if target is None:
        raise KeyError(f"Citizen participation pin '{pin_id}' not found.")

    clean_note, _ = sanitize_and_redact_text(moderator_note) if moderator_note else ("", False)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    updated = {
        **target,
        "status": "approved" if action == "approve" else "rejected",
        "moderated_at": now_iso,
        "moderator_note": clean_note[:200],
    }
    backend = _persist_pin(updated)
    return {
        "pin": updated,
        "persistence_backend": backend,
    }


GOVERNANCE_DOCUMENT_SPECS: list[dict[str, str]] = [
    {
        "id": "charter_gemini",
        "category": "governance",
        "path": "docs/governance/BCS2050_GOVERNANCE_CHARTER_GEMINI_PRINCIPLES.md",
        "title_es": "Carta de Gobernanza Institucional (Principios Gemini)",
        "title_en": "Institutional Governance Charter (Gemini Principles)",
        "summary_es": "Comité Directivo SEPUIMM/IMPLAN/UABCS-CIBNOR, Custodios de Dominio y protocolo de transferencia cloud/DNS.",
        "summary_en": "SEPUIMM/IMPLAN/UABCS-CIBNOR Steering Committee, Domain Data Stewards & cloud/DNS transfer protocol.",
    },
    {
        "id": "convenios_interagencia",
        "category": "governance",
        "path": "docs/governance/CONVENIO_COLABORACION_DATOS_TEMPLATES.md",
        "title_es": "Plantillas Convenio de Datos (OOMSAPAS, CONAGUA, CFE, PC, Catastro)",
        "title_en": "Inter-Agency Data Sharing Convenio Templates",
        "summary_es": "SLAs de actualización, clasificación en 3 niveles (Abierto/Restringido/PII) y deslindes legales.",
        "summary_en": "Update SLAs, 3-tier classification (Open/Restricted/PII), and statutory liability disclaimers.",
    },
    {
        "id": "dpia_privacy",
        "category": "governance",
        "path": "docs/governance/DPIA_PRIVACY_CRITICAL_INFRASTRUCTURE_BCS2050.md",
        "title_es": "DPIA Privacidad e Infraestructura Crítica (LGPDPPSO / LFPDPPP / LFTAIP)",
        "title_en": "Privacy & Critical Infrastructure Impact Assessment (DPIA)",
        "summary_es": "Agregación AGEB/H3, redacción automática de PII, reserva Art. 110 LGTAIP y protocolo ante incidentes 72h.",
        "summary_en": "AGEB/H3 aggregation, auto PII redaction, critical-infra RBAC, and 72h breach response.",
    },
    {
        "id": "rfp_lidar_citygml3",
        "category": "rfp",
        "path": "docs/rfp/RFP_AERIAL_LIDAR_TOPOBATHY_CITYGML3_LOD2.md",
        "title_es": "RFP LiDAR Aéreo, Topo-Batimetría Costera y CityGML 3.0 LoD2.2",
        "title_en": "Aerial LiDAR, Coastal Topo-Bathy & CityGML 3.0 LoD2.2 RFP",
        "summary_es": "Especificación ≥12 pts/m², ortofoto 5 cm, batimetría 532nm y modelo 3DCityDB + UtilityNetwork ADE en 5 cabeceras.",
        "summary_en": "Spec ≥12 pts/m², 5 cm true ortho, 532nm bathy, and 3DCityDB LoD2.2 + UtilityNetwork ADE across 5 capitals.",
    },
    {
        "id": "ordinance_bim_ifc",
        "category": "rfp",
        "path": "docs/rfp/REGULATORY_ORDINANCE_DIGITAL_PERMITTING_BIM_IFC.md",
        "title_es": "Lineamiento Municipal Ventanilla Digital 3D (IFC 4.3 / ISO 19650)",
        "title_en": "Municipal Digital Permitting & Water Feasibility Ordinance (IFC / ISO 19650)",
        "summary_es": "Reglas graduadas GeoJSON/IFC/ACC-Tandem vinculadas a COS/CUS PMDU, factibilidad hídrica WNTR y SUDS SFINCS.",
        "summary_en": "Tiered GeoJSON/IFC/ACC-Tandem permitting linked to PMDU COS/CUS, WNTR water checks & SFINCS SUDS.",
    },
    {
        "id": "vvuq_backtest_report",
        "category": "verification",
        "path": "docs/VVUQ_BACKTEST_REPORT_2010_2023.md",
        "title_es": "Informe de Calibración Histórica VVUQ ISO 23247-8 (2010–2023)",
        "title_en": "ISO 23247-8 VVUQ Historical Backtest Report (2010–2023)",
        "summary_es": "Validación Odile 2014, Kay 2022, Norma 2023, expansión 2010–2020 y márgenes SIBCS.",
        "summary_en": "Odile 2014, Kay 2022, Norma 2023 flood backtests, 2010–2020 urban expansion, and SIBCS grid reserve.",
    },
]


def get_governance_summary(language: str = "es") -> dict[str, Any]:
    """Return live institutional governance, data classification tiers, and RFP document inventory."""
    is_en = str(language).strip().lower().startswith("en")
    docs_out: list[dict[str, Any]] = []
    for spec in GOVERNANCE_DOCUMENT_SPECS:
        file_path = Path(DIGITAL_TWIN_ROOT) / spec["path"]
        exists = file_path.exists() and file_path.is_file()
        size_bytes = file_path.stat().st_size if exists else 0
        docs_out.append(
            {
                **spec,
                "exists": exists,
                "size_bytes": size_bytes,
            }
        )

    steering_committee = (
        [
            {"entity": "SEPUIMM", "role": "Chair & Technical Secretariat / Cloud Stewardship"},
            {"entity": "IMPLAN La Paz", "role": "Central Metropolitan Seat"},
            {"entity": "IMPLAN Los Cabos", "role": "South Corridor Seat"},
            {"entity": "Comondú · Loreto · Mulegé", "role": "Rotating Regional Seat"},
            {"entity": "UABCS / CIBNOR", "role": "Scientific Validation & VVUQ Chair"},
            {"entity": "BCS Civic & Professional Council", "role": "Citizen Observatory & Professional Guilds"},
        ]
        if is_en
        else [
            {"entity": "SEPUIMM", "role": "Presidencia y Secretaría Técnica / Custodia Cloud"},
            {"entity": "IMPLAN La Paz", "role": "Vocalía Metropolitana Centro"},
            {"entity": "IMPLAN Los Cabos", "role": "Vocalía Corredor Sur"},
            {"entity": "Comondú · Loreto · Mulegé", "role": "Vocalía Regional Rotativa"},
            {"entity": "UABCS / CIBNOR", "role": "Presidencia de Validación Científica y VVUQ"},
            {"entity": "Consejo Cívico y Gremial BCS", "role": "Observatorio Ciudadano y Colegios"},
        ]
    )

    tiers = (
        [
            {
                "tier": "Tier 1 — Public Open Data",
                "license": "CC-BY-4.0 / MX Open Data",
                "scope": "Aggregated AGEB (1,155) & H3 KPIs, 3D OpenBuildings, PMDU zoning, ambient telemetry, and moderated citizen pins.",
            },
            {
                "tier": "Tier 2 — Technical Restricted",
                "license": "RBAC Municipal / SEPUIMM / IMPLAN",
                "scope": "CAD/DXF/BIM exports, WNTR hydraulic pipe topology, UtilityNetwork ADE layers, and PMDU moderation queue.",
            },
            {
                "tier": "Tier 3 — Confidential / PII",
                "license": "Prohibited on Public Web (LGPDPPSO)",
                "scope": "Property owner names, tax IDs (RFC/CURP), utility customer billing records, and SCADA operational control credentials.",
            },
        ]
        if is_en
        else [
            {
                "tier": "Nivel 1 — Abierto Público",
                "license": "CC-BY-4.0 / Datos Abiertos MX",
                "scope": "KPIs agregados por AGEB (1,155) / H3, OpenBuildings 3D, zonificación PMDU, telemetría ambiental, pines ciudadanos moderados.",
            },
            {
                "tier": "Nivel 2 — Restringido Técnico",
                "license": "RBAC Municipal / SEPUIMM / IMPLAN",
                "scope": "Exportables CAD/DXF/BIM, topología hidráulica WNTR, redes UtilityNetwork ADE, cola de moderación PMDU.",
            },
            {
                "tier": "Nivel 3 — Confidencial / PII",
                "license": "Prohibido en Web Pública (LGPDPPSO)",
                "scope": "Nombres de propietarios, RFC, CURP, recibos domiciliarios y credenciales SCADA de control operativo.",
            },
        ]
    )

    return {
        "framework": "Gemini Principles (CDBB) · ISO 19115 · ISO 23247-8 VVUQ",
        "legal_frameworks": ["LGPDPPSO", "LFPDPPP", "LFTAIP / LGTAIP", "LGAHOTDU"],
        "steering_committee": steering_committee,
        "data_classification_tiers": tiers,
        "technical_controls": {
            "planner_rbac_tokens_configured": bool(get_planner_api_tokens()),
            "ageb_h3_public_aggregation": True,
            "participation_pii_auto_redaction": True,
            "participation_pre_moderation": True,
            "wcag_21_aa_accessible_ui": True,
        },
        "documents": docs_out,
    }
