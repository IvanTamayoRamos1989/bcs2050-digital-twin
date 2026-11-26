"""Groundedness, fallback, IMPLAN v3 context, and Vertex AI RAG tests for /api/twin/chat."""

from __future__ import annotations

import os
import sys
import types
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

TWIN_ROOT = Path(__file__).resolve().parents[2]
if str(TWIN_ROOT) not in sys.path:
    sys.path.insert(0, str(TWIN_ROOT))

from backend import ai_strategist  # noqa: E402
from backend.security import RATE_LIMITER  # noqa: E402
from backend.server import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limiter_per_test() -> None:
    RATE_LIMITER.reset()
    yield
    RATE_LIMITER.reset()

REPRESENTATIVE_QUERIES: list[tuple[str, str, str, str]] = [
    ("03", "COMPACT_SUSTAINABLE_2050", "es", "¿Dónde absorber vivienda infill 2050 sin romper agua o POER?"),
    ("03003", "BAU_TENDENCIAL", "es", "Evalúa el déficit hídrico CONAGUA y tandeo OOMSAPAS en La Paz"),
    ("03008", "COMPACT_SUSTAINABLE_2050", "es", "¿Qué muestran las capas IMPLAN Los Cabos v3 de pozos y línea morada?"),
    ("03", "COMPACT_SUSTAINABLE_2050", "es", "¿Qué potencial solar fotovoltaico en techos tienen La Paz y Los Cabos?"),
    ("03002", "CLIMATE_SHOCK_IPCC_SSP585", "es", "¿Cuántos edificios 3D están bajo cota +6m frente a huracanes y SLR?"),
    ("03001", "COMPACT_SUSTAINABLE_2050", "es", "Diagnóstico de acuífero y agricultura en Comondú"),
    ("03009", "HIGH_GROWTH_TOURISM_STRESS", "es", "Capacidad de carga urbana y agua en Loreto turístico"),
    ("03", "COMPACT_SUSTAINABLE_2050", "es", "Compara City 15-min y SDI-100 en BCS"),
    ("03008", "COMPACT_SUSTAINABLE_2050", "en", "Where can Los Cabos absorb infill housing without breaking water limits?"),
    ("03", "COMPACT_SUSTAINABLE_2050", "es", "¿Cuál es el presupuesto en Bitcoin de El Vizcaíno para 2042?"),
]


@pytest.mark.parametrize("scope_id,scenario_name,language,query", REPRESENTATIVE_QUERIES)
def test_chat_10_queries_deterministic_contract(
    monkeypatch: pytest.MonkeyPatch,
    scope_id: str,
    scenario_name: str,
    language: str,
    query: str,
) -> None:
    monkeypatch.setenv("BCS2050_USE_BIGQUERY", "false")
    monkeypatch.setenv("BCS2050_USE_VERTEX_STRATEGIST", "false")

    resp = client.post(
        "/api/twin/chat",
        json={
            "query": query,
            "scope_id": scope_id,
            "scenario_name": scenario_name,
            "language": language,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["scope_id"] == scope_id
    assert data["language"] == language
    assert data["engine_mode"] == "deterministic_fallback"
    assert isinstance(data["answer_markdown"], str) and len(data["answer_markdown"]) > 40
    assert isinstance(data["citations"], list) and len(data["citations"]) >= 1
    assert isinstance(data["tools_used"], list) and len(data["tools_used"]) >= 3
    assert isinstance(data["uncertainty_note"], str) and len(data["uncertainty_note"]) > 20
    if language == "en":
        assert "Deterministic Fallback" in data["answer_markdown"]


def test_chat_rejects_unsupported_language() -> None:
    resp = client.post(
        "/api/twin/chat",
        json={"query": "Agua en La Paz", "scope_id": "03003", "language": "fr"},
    )
    assert resp.status_code == 422


def test_chat_mocked_vertex_rag_and_implan_grounding(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BCS2050_USE_BIGQUERY", "false")
    monkeypatch.setenv("BCS2050_USE_VERTEX_STRATEGIST", "true")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "global")
    monkeypatch.setenv("BCS2050_CHAT_MODEL", "gemini-4-hydrogen")

    fake_chunks = [
        {
            "chunk_id": "DOC-IMPLAN-LCB-V3-COMPENDIO_0000",
            "doc_id": "DOC-IMPLAN-LCB-V3-COMPENDIO",
            "doc_type": "TERRITORIAL_FICHA",
            "municipality_code": "03008",
            "effective_date": "2026-11-24",
            "status": "VIGENTE",
            "source_uri": "gs://bcs2050-intelligence-sandbox/docs/implan_los_cabos_v3/IMPLAN_Los_Cabos_v3_Compendio_Territorial.md",
            "page_or_section": "chunk_1",
            "distance": 0.2412,
            "chunk_text": "IMPLAN Los Cabos v3 incluye 86,384 polígonos de uso de suelo CIMP100, 30 pozos CIMP112 y 17 tramos de línea morada CIMP117.",
        }
    ]
    fake_implan = {
        "connected": True,
        "relevant": True,
        "municipality_code": "03008",
        "tables_count": 26,
        "key_layer_counts": {
            "cimp100_uso_de_suelo": 86384,
            "cimp106_condicionantes_urbanisticas": 715,
            "cimp108_reservas_territoriales": 10,
            "cimp112_pozos_extraccion": 30,
            "cimp117_red_morada_agua_tratada": 17,
        },
        "source_doc_id": "DOC-IMPLAN-LCB-V3-COMPENDIO",
    }

    class _FakeModels:
        def generate_content(self, **kwargs):  # type: ignore[no-untyped-def]
            return types.SimpleNamespace(
                text=(
                    "[OFICIAL] En Los Cabos (03008), IMPLAN v3 indexa 86,384 polígonos de uso de suelo (CIMP100), "
                    "30 pozos CIMP112 y 17 tramos de línea morada CIMP117 [DOC-IMPLAN-LCB-V3-COMPENDIO].\n\n"
                    "[MODELADO] Con 72% de reúso PTAR en el escenario Compacto 2050 se atenúa el déficit CONAGUA.\n\n"
                    "Limitaciones: proyección sujeta a ejecución de CAPEX."
                )
            )

    class _FakeGenAIClient:
        def __init__(self, **kwargs):  # type: ignore[no-untyped-def]
            self.models = _FakeModels()

    import google.genai  # type: ignore[import-untyped]

    monkeypatch.setattr(google.genai, "Client", _FakeGenAIClient)

    with (
        patch.object(ai_strategist, "retrieve_bigquery_rag_chunks", return_value=fake_chunks),
        patch.object(ai_strategist, "retrieve_implan_loscabos_context", return_value=fake_implan),
    ):
        resp = client.post(
            "/api/twin/chat",
            json={
                "query": "Analiza uso de suelo IMPLAN Los Cabos y línea morada",
                "scope_id": "03008",
                "scenario_name": "COMPACT_SUSTAINABLE_2050",
                "language": "es",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["engine_mode"] == "vertex_gemini_grounded"
    assert body["model_used"] == "gemini-4-hydrogen@global"
    assert body["implan_context_used"] is True
    assert "bigquery.vector_search_rag" in body["tools_used"]
    assert "bigquery.implan_los_cabos_v3" in body["tools_used"]
    assert "vertex_ai.gemini-4-hydrogen" in body["tools_used"]
    assert any(c["doc_id"] == "DOC-IMPLAN-LCB-V3-COMPENDIO" and c["distance"] == 0.2412 for c in body["citations"])
    assert "DOC-IMPLAN-LCB-V3-COMPENDIO" in body["answer_markdown"]


def test_chat_vertex_failure_gracefully_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BCS2050_USE_BIGQUERY", "false")
    monkeypatch.setenv("BCS2050_USE_VERTEX_STRATEGIST", "true")

    class _FailingClient:
        def __init__(self, **kwargs):  # type: ignore[no-untyped-def]
            raise RuntimeError("Simulated Vertex quota exhaustion")

    import google.genai  # type: ignore[import-untyped]

    monkeypatch.setattr(google.genai, "Client", _FailingClient)

    with (
        patch.object(ai_strategist, "retrieve_bigquery_rag_chunks", return_value=[]),
        patch.object(ai_strategist, "retrieve_implan_loscabos_context", return_value={"connected": False}),
    ):
        res = ai_strategist.answer_strategist_chat_grounded(
            query="Déficit de acuíferos en BCS",
            scope_id="03003",
            language="es",
        )

    assert res["engine_mode"] == "deterministic_fallback"
    assert "Metabolismo Hídrico" in res["answer_markdown"]


@pytest.mark.skipif(
    os.environ.get("BCS2050_RUN_LIVE_VERTEX_TEST") != "1",
    reason="Set BCS2050_RUN_LIVE_VERTEX_TEST=1 to exercise live GCP Vertex AI + BigQuery RAG.",
)
def test_live_vertex_and_bigquery_rag_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BCS2050_USE_BIGQUERY", "true")
    monkeypatch.setenv("BCS2050_USE_VERTEX_STRATEGIST", "true")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "global")
    monkeypatch.setenv("BCS2050_CHAT_MODEL", "gemini-4-hydrogen")

    res = ai_strategist.answer_strategist_chat_grounded(
        query="¿Qué muestran las capas IMPLAN Los Cabos v3 sobre pozos, línea morada y reservas territoriales?",
        scope_id="03008",
        scenario_name="COMPACT_SUSTAINABLE_2050",
        language="es",
    )
    assert res["engine_mode"] == "vertex_gemini_grounded"
    assert res["implan_context_used"] is True
    assert len(res["citations"]) >= 1
    assert any(c.get("distance") is not None for c in res["citations"])
    assert len(res["answer_markdown"]) > 120


def test_aino_prompt_to_map_spatial_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BCS2050_USE_BIGQUERY", "false")
    monkeypatch.setenv("BCS2050_USE_VERTEX_STRATEGIST", "false")

    r_water = client.post(
        "/api/twin/chat",
        json={"query": "Show me the water stressed areas", "scope_id": "03", "language": "en"},
    )
    assert r_water.status_code == 200
    d_water = r_water.json()
    ma_w = d_water.get("map_action")
    assert ma_w is not None
    assert ma_w["intent"] == "water_stress"
    assert ma_w["matched_count"] >= 21
    assert "aquifers" in ma_w["layers_to_enable"]
    assert len(ma_w["highlight_geojson"]["features"]) >= 21
    assert len(ma_w["legend"]) >= 2
    assert ma_w["fly_to"] is not None

    r_prot = client.post(
        "/api/twin/chat",
        json={"query": "Where is the land protected?", "scope_id": "03", "language": "en"},
    )
    assert r_prot.status_code == 200
    ma_p = r_prot.json().get("map_action")
    assert ma_p is not None
    assert ma_p["intent"] == "protected_land"
    assert ma_p["matched_count"] == 76
    assert "anps" in ma_p["layers_to_enable"]
    assert len(ma_p["highlight_geojson"]["features"]) == 76

    r_inf = client.post(
        "/api/twin/chat",
        json={"query": "Show top 2050 infill housing in La Paz", "scope_id": "03", "language": "en"},
    )
    assert r_inf.status_code == 200
    ma_i = r_inf.json().get("map_action")
    assert ma_i is not None
    assert ma_i["intent"] == "infill_housing"
    assert ma_i["active_metric"] == "infill_homes_potential"
    assert ma_i["matched_count"] <= 30
    assert abs(ma_i["fly_to"]["lat"] - 24.1426) < 0.35
