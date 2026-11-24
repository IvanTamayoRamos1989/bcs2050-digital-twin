"""Instruction 7 tests: institutional governance docs, DPIA/RBAC, LiDAR/CityGML 3.0 RFP & moderated participation API."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.config import DIGITAL_TWIN_ROOT
from backend.participation import reset_local_participation_store
from backend.security import RATE_LIMITER
from backend.server import app

client = TestClient(app)


def test_governance_and_rfp_documents_exist_and_cover_requirements() -> None:
    expected = {
        "docs/governance/BCS2050_GOVERNANCE_CHARTER_GEMINI_PRINCIPLES.md": [
            "Gemini",
            "SEPUIMM",
            "IMPLAN La Paz",
            "IMPLAN Los Cabos",
            "UABCS",
            "CIBNOR",
            "bcs2050.com",
        ],
        "docs/governance/CONVENIO_COLABORACION_DATOS_TEMPLATES.md": [
            "OOMSAPAS",
            "CONAGUA",
            "CFE",
            "Protección Civil",
            "Catastro Municipal",
            "Nivel 1",
            "Nivel 2",
            "Nivel 3",
        ],
        "docs/governance/DPIA_PRIVACY_CRITICAL_INFRASTRUCTURE_BCS2050.md": [
            "LGPDPPSO",
            "LFPDPPP",
            "LFTAIP",
            "AGEB",
            "ARCO",
        ],
        "docs/rfp/RFP_AERIAL_LIDAR_TOPOBATHY_CITYGML3_LOD2.md": [
            "CityGML 3.0",
            "3DCityDB",
            "LoD2.2",
            "UtilityNetwork ADE",
            "EPSG:32612",
            "532 nm",
        ],
        "docs/rfp/REGULATORY_ORDINANCE_DIGITAL_PERMITTING_BIM_IFC.md": [
            "IFC 4.3",
            "ISO 19650",
            "GeoJSON",
            "factibilidad hídrica",
            "Autodesk",
            "WNTR",
        ],
    }

    root = Path(DIGITAL_TWIN_ROOT)
    for rel_path, keywords in expected.items():
        fp = root / rel_path
        assert fp.exists() and fp.is_file(), f"Missing deliverable document: {rel_path}"
        content = fp.read_text(encoding="utf-8")
        assert len(content) > 2500, f"Document too short: {rel_path}"
        for kw in keywords:
            assert kw.lower() in content.lower(), f"Missing keyword '{kw}' in {rel_path}"


def test_governance_summary_endpoint() -> None:
    res = client.get("/api/twin/governance/summary")
    assert res.status_code == 200
    body = res.json()
    assert "Gemini Principles" in body["framework"]
    assert len(body["steering_committee"]) >= 5
    assert len(body["data_classification_tiers"]) == 3
    docs = {d["path"]: d for d in body["documents"]}
    assert docs["docs/governance/BCS2050_GOVERNANCE_CHARTER_GEMINI_PRINCIPLES.md"]["exists"] is True
    assert docs["docs/rfp/RFP_AERIAL_LIDAR_TOPOBATHY_CITYGML3_LOD2.md"]["exists"] is True
    assert body["technical_controls"]["participation_pii_auto_redaction"] is True


def test_citizen_participation_validation_pii_redaction_and_moderation(monkeypatch) -> None:
    monkeypatch.setenv("BCS2050_USE_FIRESTORE", "false")
    monkeypatch.delenv("BCS2050_PLANNER_API_TOKENS", raising=False)
    RATE_LIMITER.reset()
    reset_local_participation_store()

    try:
        # 1. Public list includes seeded approved pins and 4 PMDU periods
        pub = client.get("/api/twin/participation")
        assert pub.status_code == 200
        pub_data = pub.json()
        assert pub_data["count"] >= 4
        assert len(pub_data["pmdu_periods"]) == 4
        assert all(p["status"] == "approved" for p in pub_data["pins"])

        # 2. Coordinates outside BCS rejected with 422
        bad_bbox = client.post(
            "/api/twin/participation",
            json={
                "lon": -99.1332,
                "lat": 19.4326,
                "category": "water",
                "title": "Mexico City outside BCS",
                "comment": "Should fail geographic validation outside BCS bounds.",
                "pmdu_period": "PMDU-LPZ-2026",
            },
        )
        assert bad_bbox.status_code == 422

        # 3. Valid BCS submission with incidental PII & HTML gets sanitized, redacted & enters pending_moderation
        created = client.post(
            "/api/twin/participation",
            json={
                "lon": -110.3125,
                "lat": 24.1422,
                "category": "water",
                "pmdu_period": "PMDU-LPZ-2026",
                "title": "<b>Fuga y falta de tandeo</b> en Centro La Paz",
                "comment": "Contacto vecino@example.com o al 612-123-4567 para revisar válvula en esquina.",
                "author_alias": "Vecino Centro",
            },
        )
        assert created.status_code == 201
        pin = created.json()["pin"]
        assert pin["status"] == "pending_moderation"
        assert pin["pii_redacted"] is True
        assert "<b>" not in pin["title"]
        assert "vecino@example.com" not in pin["comment"]
        assert "612-123-4567" not in pin["comment"]
        assert "[email-protegido]" in pin["comment"]
        assert "[tel-protegido]" in pin["comment"]
        pin_id = pin["pin_id"]

        # Not visible in public GET until approved
        pub_before = client.get("/api/twin/participation").json()
        assert pin_id not in {p["pin_id"] for p in pub_before["pins"]}

        # 4. Moderation endpoint enforces RBAC when planner tokens are configured
        monkeypatch.setenv("BCS2050_PLANNER_API_TOKENS", "implan-mod-token")
        unauth_mod = client.post(
            f"/api/twin/participation/{pin_id}/moderate",
            json={"action": "approve", "moderator_note": "Validado"},
        )
        assert unauth_mod.status_code == 401

        auth_mod = client.post(
            f"/api/twin/participation/{pin_id}/moderate",
            headers={"X-BCS-Planner-Token": "implan-mod-token"},
            json={"action": "approve", "moderator_note": "Validado en mesa PMDU La Paz"},
        )
        assert auth_mod.status_code == 200
        assert auth_mod.json()["pin"]["status"] == "approved"

        # Now visible in public GET
        pub_after = client.get("/api/twin/participation").json()
        assert pin_id in {p["pin_id"] for p in pub_after["pins"]}
    finally:
        RATE_LIMITER.reset()
        reset_local_participation_store()
