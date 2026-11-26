"""Grounded AI Territorial Strategist for BCS2050 powered by Vertex AI Gemini + BigQuery VECTOR_SEARCH RAG."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from backend.config import get_chat_model, get_gemini_location, use_bigquery, use_vertex_strategist
from backend.metadata_catalog import CANONICAL_KPI_RECONCILIATION
from backend.spatial_chat_engine import resolve_spatial_map_action
from backend.simulation_bridge import (
    answer_strategist_chat,
    compute_goal_gap,
    generate_recommendations,
    load_summary,
    run_twin_simulation,
)

logger = logging.getLogger("bcs2050.ai_strategist")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "bcs2050")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "northamerica-south1")
BQ_DATASET = os.environ.get("BQ_DATASET", "bcs2050_intelligence_sandbox")
EMBED_LOCATION = os.environ.get("BCS2050_EMBED_LOCATION", "us-central1")
EMBED_MODEL = os.environ.get("BCS2050_EMBED_MODEL", "text-multilingual-embedding-002")

_IMPLAN_CACHE_LOCK = threading.Lock()
_IMPLAN_CACHE: dict[tuple[str, bool], tuple[float, dict[str, Any]]] = {}
_IMPLAN_CACHE_TTL_SEC = 300.0

DEFAULT_SYSTEM_CITATIONS: list[dict[str, Any]] = [
    {
        "doc_id": "CONAGUA-DOF-2023",
        "doc_type": "OFFICIAL_WATER_BALANCE",
        "municipality_code": "03",
        "source_uri": "https://www.dof.gob.mx/CONAGUA_Acuiferos_2023",
        "page_or_section": "Disponibilidad Media Anual (40 acuíferos BCS)",
        "distance": None,
        "excerpt": "Balance oficial CONAGUA 2023: 21 de 40 acuíferos de BCS en déficit hídrico.",
    },
    {
        "doc_id": "INEGI-EIC-2025-CENSO-2020",
        "doc_type": "OFFICIAL_DEMOGRAPHY",
        "municipality_code": "03",
        "source_uri": "https://www.inegi.org.mx/",
        "page_or_section": "Marco Geoestadístico AGEB + Encuesta Intercensal 2025",
        "distance": None,
        "excerpt": "Población base 903,389 habitantes en 1,155 AGEBs urbanos y rurales.",
    },
    {
        "doc_id": "OPENBUILDINGS-2.5D-GLO30",
        "doc_type": "REMOTE_SENSING_3D",
        "municipality_code": "03",
        "source_uri": "https://sites.research.google/open-buildings/",
        "page_or_section": "Edificaciones 2.5D + Copernicus GLO-30 DEM",
        "distance": None,
        "excerpt": "396,823 huellas y alturas 3D modeladas para estimación solar, cota costera +6m y morfología.",
    },
]


def _scope_to_municipality(scope_id: str) -> str | None:
    if scope_id in {"03001", "03002", "03003", "03008", "03009"}:
        return scope_id
    corridor_map = {
        "CORR-VALLE-COMONDU": "03001",
        "CORR-MULEGE": "03002",
        "CORR-CENTRO-LA-PAZ": "03003",
        "CORR-SUR-CABOS": "03008",
        "CORR-NORTE-LORETO-MULEGE": "03009",
    }
    return corridor_map.get(scope_id)


def _extract_gemini_text(response: Any) -> str:
    txt = getattr(response, "text", None)
    if isinstance(txt, str) and txt.strip():
        return txt.strip()
    candidates = getattr(response, "candidates", None) or []
    parts_out: list[str] = []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            if getattr(part, "thought", False):
                continue
            ptxt = getattr(part, "text", None)
            if isinstance(ptxt, str) and ptxt.strip():
                parts_out.append(ptxt.strip())
    return "\n".join(parts_out).strip()


def retrieve_bigquery_rag_chunks(
    query: str,
    *,
    municipality_code: str | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Retrieve semantically grounded chunks via text-multilingual-embedding-002 + BigQuery VECTOR_SEARCH."""
    if not use_bigquery():
        return []
    try:
        from google import genai
        from google.cloud import bigquery
    except Exception as exc:
        logger.warning("BigQuery/GenAI libraries unavailable for RAG: %s", exc)
        return []

    try:
        emb_client = genai.Client(vertexai=True, project=PROJECT_ID, location=EMBED_LOCATION)
        emb_resp = emb_client.models.embed_content(model=EMBED_MODEL, contents=query)
        embeddings = getattr(emb_resp, "embeddings", None) or []
        if not embeddings or not getattr(embeddings[0], "values", None):
            return []
        query_vec = [float(x) for x in embeddings[0].values]

        bq = bigquery.Client(project=PROJECT_ID, location=BQ_LOCATION)
        sql = f"""
        SELECT
          base.chunk_id,
          base.doc_id,
          base.doc_type,
          base.municipality_code,
          CAST(base.effective_date AS STRING) AS effective_date,
          base.status,
          base.source_uri,
          base.page_or_section,
          base.chunk_text,
          distance
        FROM VECTOR_SEARCH(
          TABLE {PROJECT_ID}.{BQ_DATASET}.document_chunks,
          'embedding',
          (SELECT @qvec AS embedding),
          top_k => @fetch_k,
          distance_type => 'COSINE'
        )
        """
        job_cfg = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("qvec", "FLOAT64", query_vec),
                bigquery.ScalarQueryParameter("fetch_k", "INT64", max(top_k * 2, 10)),
            ]
        )
        rows = list(bq.query(sql, job_config=job_cfg).result(timeout=12.0))
        chunks: list[dict[str, Any]] = []
        for r in rows:
            dist = float(getattr(r, "distance", 1.0) or 1.0)
            muni = getattr(r, "municipality_code", None)
            sort_score = dist - (0.04 if municipality_code and muni == municipality_code else 0.0)
            chunks.append(
                {
                    "chunk_id": getattr(r, "chunk_id", ""),
                    "doc_id": getattr(r, "doc_id", "UNKNOWN"),
                    "doc_type": getattr(r, "doc_type", "DOCUMENT"),
                    "municipality_code": muni,
                    "effective_date": getattr(r, "effective_date", None),
                    "status": getattr(r, "status", None),
                    "source_uri": getattr(r, "source_uri", None),
                    "page_or_section": getattr(r, "page_or_section", None),
                    "distance": round(dist, 4),
                    "chunk_text": (getattr(r, "chunk_text", "") or "").strip(),
                    "_sort_score": sort_score,
                }
            )
        chunks.sort(key=lambda item: item["_sort_score"])
        trimmed = chunks[:top_k]
        for item in trimmed:
            item.pop("_sort_score", None)
        return trimmed
    except Exception as exc:
        logger.warning("BigQuery VECTOR_SEARCH RAG failed cleanly: %s", exc)
        return []


def retrieve_implan_loscabos_context(*, query: str = "", scope_id: str = "03") -> dict[str, Any]:
    """Query official IMPLAN Los Cabos v3 GIS summary from BigQuery when scope or query touches 03008."""
    q_low = query.lower()
    muni = _scope_to_municipality(scope_id)
    implan_keywords = (
        "cabos",
        "implan",
        "san lucas",
        "san jose",
        "san josé",
        "tezal",
        "morada",
        "pozo",
        "uso de suelo",
        "alcantarillado",
        "playa",
        "reserva",
        "cimp",
        "03008",
    )
    relevant = muni == "03008" or any(k in q_low for k in implan_keywords)
    if not relevant or not use_bigquery():
        return {"connected": False, "relevant": relevant}

    cache_key = ("03008", True)
    now = time.monotonic()
    with _IMPLAN_CACHE_LOCK:
        cached = _IMPLAN_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _IMPLAN_CACHE_TTL_SEC:
            return cached[1]

    try:
        from google.cloud import bigquery

        bq = bigquery.Client(project=PROJECT_ID, location=BQ_LOCATION)
        tables_sql = f"""
        SELECT table_id, row_count
        FROM `{PROJECT_ID}.bcs2050_gis.__TABLES__`
        WHERE table_id LIKE 'implan_los_cabos_%'
        ORDER BY table_id
        """
        table_rows = list(bq.query(tables_sql).result(timeout=10.0))
        counts = {r.table_id: int(r.row_count) for r in table_rows}

        top_uses: list[dict[str, Any]] = []
        try:
            uso_sql = f"""
            SELECT grupo_uso_suelo, COUNT(*) AS predios
            FROM `{PROJECT_ID}.bcs2050_gis.implan_los_cabos_cimp100_uso_de_suelo`
            GROUP BY grupo_uso_suelo
            ORDER BY predios DESC
            LIMIT 6
            """
            top_uses = [
                {"grupo_uso_suelo": str(r.grupo_uso_suelo or "N/D"), "predios": int(r.predios)}
                for r in bq.query(uso_sql).result(timeout=10.0)
            ]
        except Exception:
            top_uses = []

        reservas_ha = None
        try:
            res_sql = f"""
            SELECT ROUND(SUM(CAST(hectareas AS FLOAT64)), 2) AS total_ha
            FROM `{PROJECT_ID}.bcs2050_gis.implan_los_cabos_cimp108_reservas_territoriales`
            """
            res_rows = list(bq.query(res_sql).result(timeout=8.0))
            if res_rows and res_rows[0].total_ha is not None:
                reservas_ha = float(res_rows[0].total_ha)
        except Exception:
            reservas_ha = None

        implan_payload = {
            "connected": True,
            "relevant": True,
            "municipality_code": "03008",
            "tables_count": len(counts),
            "key_layer_counts": {
                "cimp100_uso_de_suelo": counts.get("implan_los_cabos_cimp100_uso_de_suelo", 0),
                "cimp106_condicionantes_urbanisticas": counts.get("implan_los_cabos_cimp106_condicionantes_urbanisticas", 0),
                "cimp108_reservas_territoriales": counts.get("implan_los_cabos_cimp108_reservas_territoriales", 0),
                "cimp112_pozos_extraccion": counts.get("implan_los_cabos_cimp112_pozos_extraccion", 0),
                "cimp115_red_distribucion_agua": counts.get("implan_los_cabos_cimp115_red_distribucion_agua", 0),
                "cimp116_alcantarillado": counts.get("implan_los_cabos_cimp116_alcantarillado", 0),
                "cimp117_red_morada_agua_tratada": counts.get("implan_los_cabos_cimp117_red_morada_agua_tratada", 0),
                "cimp102_acceso_playas": counts.get("implan_los_cabos_cimp102_acceso_playas", 0),
            },
            "top_uso_de_suelo_groups": top_uses,
            "reservas_territoriales_ha": reservas_ha,
            "source_doc_id": "DOC-IMPLAN-LCB-V3-COMPENDIO",
        }
        with _IMPLAN_CACHE_LOCK:
            _IMPLAN_CACHE[cache_key] = (time.monotonic(), implan_payload)
        return implan_payload
    except Exception as exc:
        logger.warning("IMPLAN Los Cabos BigQuery context query failed cleanly: %s", exc)
        return {"connected": False, "relevant": True}


def _build_uncertainty_note(
    *,
    language: str,
    engine_mode: str,
    rag_count: int,
    implan_connected: bool,
) -> str:
    if language == "en":
        if engine_mode == "vertex_gemini_grounded":
            rag_desc = f"{rag_count} BigQuery vector chunks" if rag_count > 0 else "core telemetry only (0 vector hits)"
            implan_desc = " + live IMPLAN Los Cabos v3 tables" if implan_connected else ""
            return (
                f"Grounded on official baselines (INEGI EIC 2025, CONAGUA DOF 2023, OpenBuildings 2.5D) "
                f"and {rag_desc}{implan_desc}. 2050 trajectories, SDI-100 scores, and infill/solar gaps are "
                f"modeled counterfactual estimates subject to zoning enactment and CAPEX execution."
            )
        return (
            "Deterministic local fallback active (Vertex AI/BigQuery live RAG disabled or unavailable). "
            "Figures reflect curated INEGI/CONAGUA baselines and Ontology v3.0 counterfactual simulations."
        )
    if engine_mode == "vertex_gemini_grounded":
        rag_desc = f"{rag_count} fragmentos vectoriales en BigQuery" if rag_count > 0 else "telemetría base sin aciertos vectoriales"
        implan_desc = " + tablas vivas IMPLAN Los Cabos v3" if implan_connected else ""
        return (
            f"Respuesta fundamentada en línea base oficial (INEGI EIC 2025, CONAGUA DOF 2023, OpenBuildings 2.5D) "
            f"y {rag_desc}{implan_desc}. Las trayectorias 2050, SDI-100 y metas de infill/solar son estimaciones "
            f"modeladas sujetas a aprobación normativa y ejecución de CAPEX."
        )
    return (
        "Modo determinístico local activo (Vertex AI / BigQuery RAG en vivo desactivado o no disponible). "
        "Cifras basadas en línea base curada INEGI/CONAGUA y simulaciones contrafactuales de Ontología v3.0."
    )


def _format_citations(rag_chunks: list[dict[str, Any]], implan_ctx: dict[str, Any]) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    seen_chunks: set[str] = set()
    for ch in rag_chunks:
        cid = str(ch.get("chunk_id") or ch.get("doc_id") or "")
        if cid in seen_chunks:
            continue
        seen_chunks.add(cid)
        excerpt = str(ch.get("chunk_text") or "").replace("\n", " ").strip()
        if len(excerpt) > 220:
            excerpt = excerpt[:217] + "..."
        citations.append(
            {
                "doc_id": ch.get("doc_id", "DOC-BCS2050"),
                "chunk_id": ch.get("chunk_id"),
                "doc_type": ch.get("doc_type"),
                "municipality_code": ch.get("municipality_code"),
                "source_uri": ch.get("source_uri"),
                "page_or_section": ch.get("page_or_section"),
                "distance": ch.get("distance"),
                "excerpt": excerpt,
            }
        )

    if implan_ctx.get("connected") and not any(c.get("doc_id") == "DOC-IMPLAN-LCB-V3-COMPENDIO" for c in citations):
        citations.append(
            {
                "doc_id": "IMPLAN-LCB-V3-GIS",
                "chunk_id": "bcs2050_gis.implan_los_cabos_cimp*",
                "doc_type": "OFFICIAL_MUNICIPAL_GIS",
                "municipality_code": "03008",
                "source_uri": "gs://bcs2050-intelligence-sandbox/docs/implan_los_cabos_v3/IMPLAN_Los_Cabos_v3_Compendio_Territorial.md",
                "page_or_section": f"{implan_ctx.get('tables_count', 26)} capas CIMP",
                "distance": None,
                "excerpt": (
                    f"Uso de suelo CIMP100 ({implan_ctx.get('key_layer_counts', {}).get('cimp100_uso_de_suelo', 0):,} predios), "
                    f"condicionantes CIMP106 ({implan_ctx.get('key_layer_counts', {}).get('cimp106_condicionantes_urbanisticas', 0)}), "
                    f"pozos CIMP112 ({implan_ctx.get('key_layer_counts', {}).get('cimp112_pozos_extraccion', 0)}) y línea morada CIMP117 "
                    f"({implan_ctx.get('key_layer_counts', {}).get('cimp117_red_morada_agua_tratada', 0)})."
                ),
            }
        )

    if not citations:
        citations.extend(DEFAULT_SYSTEM_CITATIONS)
    return citations


def answer_strategist_chat_grounded(
    *,
    query: str,
    scope_id: str = "03",
    scenario_name: str = "COMPACT_SUSTAINABLE_2050",
    language: str = "es",
) -> dict[str, Any]:
    """Grounded executive AI Strategist with Vertex AI Gemini + BigQuery RAG + deterministic fallback."""
    lang = "en" if str(language).strip().lower().startswith("en") else "es"

    # Precompute independent telemetry, BigQuery RAG, and IMPLAN Los Cabos calls concurrently.
    muni_filter = _scope_to_municipality(scope_id)
    summary = load_summary()
    with ThreadPoolExecutor(max_workers=4) as pool:
        f_sim = pool.submit(
            run_twin_simulation,
            scope_id=scope_id,
            scenario_name=scenario_name,
            target_year=2050,
        )
        f_recs = pool.submit(generate_recommendations, scope_id)
        f_rag = pool.submit(
            retrieve_bigquery_rag_chunks,
            query,
            municipality_code=muni_filter,
            top_k=5,
        )
        f_implan = pool.submit(
            retrieve_implan_loscabos_context,
            query=query,
            scope_id=scope_id,
        )
        sim = f_sim.result()
        recs = f_recs.result()
        rag_chunks = f_rag.result()
        implan_ctx = f_implan.result()

    goal_gap = compute_goal_gap(scope_id=scope_id)
    baseline = answer_strategist_chat(
        query=query,
        scope_id=scope_id,
        scenario_name=scenario_name,
        precomputed_recs=recs,
        precomputed_sim=sim,
    )
    map_action = resolve_spatial_map_action(query=query, scope_id=scope_id, language=lang)

    tools_used = [
        "ontology_engine.scenario_simulator",
        "ontology_engine.decision_lenses",
        "spatial_store.sqlite_rtree",
        "metadata_catalog.kpi_reconciliation",
    ]
    if map_action:
        tools_used.append("spatial_engine.aino_prompt_to_map")
    if rag_chunks:
        tools_used.append("bigquery.vector_search_rag")
    if implan_ctx.get("connected"):
        tools_used.append("bigquery.implan_los_cabos_v3")

    citations = _format_citations(rag_chunks, implan_ctx)
    lineage = list(baseline.get("lineage") or [])
    if map_action:
        lineage.append(f"Spatial Filter: {map_action['title']} ({map_action['matched_count']} features)")
    if rag_chunks:
        lineage.append(f"BigQuery VECTOR_SEARCH ({len(rag_chunks)} chunks · text-multilingual-embedding-002)")
    if implan_ctx.get("connected"):
        lineage.append(f"IMPLAN Los Cabos v3 BigQuery GIS ({implan_ctx.get('tables_count', 26)} capas oficiales 03008)")

    engine_mode = "deterministic_fallback"
    model_used: str | None = None
    answer_markdown = baseline["answer_markdown"]

    if use_vertex_strategist():
        try:
            from google import genai
            from google.genai import types as genai_types

            chat_model = get_chat_model()
            gemini_location = get_gemini_location()

            st = summary["state"]
            muns = summary.get("municipalities", {})
            active_scope_meta = muns.get(scope_id, muns.get(muni_filter or "", {}))

            context_payload = {
                "scope": {
                    "scope_id": scope_id,
                    "scope_name": baseline["scope_name"],
                    "municipality_metrics": active_scope_meta,
                },
                "spatial_map_visualization": (
                    {
                        "title": map_action["title"],
                        "matched_count": map_action["matched_count"],
                        "layers_activated": map_action.get("layers_to_enable", []),
                        "details": map_action.get("analysis_context", {}),
                    }
                    if map_action
                    else None
                ),
                "official_state_baseline": {
                    "population_2025": st.get("population_2025"),
                    "buildings_3d_count": st.get("buildings_3d_count"),
                    "zoning_parcels_count": st.get("zoning_parcels_count"),
                    "agebs_count": st.get("agebs_count"),
                    "total_aquifer_dma_2023_hm3": st.get("total_aquifer_dma_2023_hm3"),
                    "aquifers_in_deficit": "21 of 40",
                    "tandeo_sectors_la_paz": 280,
                    "rooftop_solar_mw": st.get("rooftop_solar_mw"),
                    "rooftop_solar_gwh_yr": st.get("rooftop_solar_gwh_yr"),
                    "surge_exposed_buildings_under_6m": st.get("surge_exposed_buildings"),
                },
                "modeled_indicators": {
                    "scenario_name": scenario_name,
                    "scenario_title": sim["scenario_meta"]["title"],
                    "city_science_index": st.get("city_science_index"),
                    "city15_score": st.get("city15_score"),
                    "sdi_score_2031": sim.get("sdi_score_2031"),
                    "sdi_score_2050": sim.get("sdi_score_2050"),
                    "carrying_capacity_status": recs.get("carrying_capacity", {}).get("overall_status"),
                    "carrying_capacity_water": recs.get("carrying_capacity", {}).get("water"),
                    "carrying_capacity_energy": recs.get("carrying_capacity", {}).get("energy"),
                    "contradictions": [
                        {
                            "id": c.get("id"),
                            "severity": c.get("severity"),
                            "description": c.get("description") or c.get("message"),
                        }
                        for c in (recs.get("contradictions") or [])[:3]
                    ],
                    "goal_gap_2050": {
                        "projected_new_homes_2050": goal_gap.get("projected_new_homes_2050"),
                        "infill_homes_needed": goal_gap.get("infill_homes_needed"),
                        "zoned_infill_capacity_homes": goal_gap.get("zoned_infill_capacity_homes"),
                        "recommended_desal_lps": goal_gap.get("recommended_desal_lps"),
                        "estimated_capex_mdp_mxn": goal_gap.get("estimated_capex_mdp_mxn"),
                    },
                    "top_priority_actions": [
                        {
                            "id": act.get("id"),
                            "title": act.get("title"),
                            "municipality": act.get("municipality"),
                            "metric_badge": act.get("metric_badge"),
                        }
                        for act in (recs.get("priority_actions") or [])[:3]
                    ],
                },
                "kpi_reconciliation": CANONICAL_KPI_RECONCILIATION.get("canonical_official_baseline", CANONICAL_KPI_RECONCILIATION),
                "implan_los_cabos_v3": implan_ctx,
                "rag_document_chunks": [
                    {
                        "doc_id": c["doc_id"],
                        "doc_type": c.get("doc_type"),
                        "municipality_code": c.get("municipality_code"),
                        "page_or_section": c.get("page_or_section"),
                        "cosine_distance": c.get("distance"),
                        "excerpt": c["chunk_text"][:500],
                    }
                    for c in rag_chunks[:4]
                ],
            }

            system_instruction = (
                "You are Estratega IA for the BCS2050 Regional & Urban Digital Twin (Baja California Sur, Mexico). "
                + ("Respond strictly in English. " if lang == "en" else "Responde estrictamente en Español. ")
                + "GROUNDING RULES: "
                "1. Base every number, place, and factual claim strictly on the JSON context provided. NEVER invent figures, aquifer values, CAPEX amounts, or doc IDs. "
                "2. Clearly label empirical official baselines as [OFICIAL] (or [OFFICIAL] in English) vs counterfactual 2050 projections as [MODELADO] (or [MODELED] in English). "
                "3. When spatial_map_visualization is present in context, tell the user briefly what has been visualized on the 3D map right now and summarize the specific matched areas/numbers from spatial_map_visualization.details. "
                "4. Cite retrieved evidence inline in square brackets using exact doc_id values, e.g. [DOC-IMPLAN-LCB-V3-COMPENDIO] or [CONAGUA-DOF-2023]. "
                "5. If the user asks about data not contained in the JSON context, explicitly state the data gap instead of extrapolating. "
                "6. Keep the structure executive, scannable markdown (3 concise paragraphs or bullet synthesis + one short line on data lineage/limitations)."
            )

            prompt = (
                f"USER QUESTION ({lang.upper()}): {query}\n\n"
                f"TERRITORIAL CONTEXT JSON:\n{json.dumps(context_payload, ensure_ascii=False, default=str)}"
            )

            gen_cfg_kwargs: dict[str, Any] = {
                "system_instruction": system_instruction,
                "temperature": 0.15,
                "max_output_tokens": 4096,
            }
            if hasattr(genai_types, "ThinkingConfig"):
                gen_cfg_kwargs["thinking_config"] = genai_types.ThinkingConfig(thinking_level="LOW")

            client = genai.Client(vertexai=True, project=PROJECT_ID, location=gemini_location)
            resp = client.models.generate_content(
                model=chat_model,
                contents=prompt,
                config=genai_types.GenerateContentConfig(**gen_cfg_kwargs),
            )
            generated_text = _extract_gemini_text(resp)
            if generated_text:
                answer_markdown = generated_text
                engine_mode = "vertex_gemini_grounded"
                model_used = f"{chat_model}@{gemini_location}"
                tools_used.append(f"vertex_ai.{chat_model}")
            else:
                candidates = getattr(resp, "candidates", None) or []
                finish_reason = getattr(candidates[0], "finish_reason", None) if candidates else None
                logger.warning("Vertex AI Gemini returned empty text (finish_reason=%s)", finish_reason)
        except Exception as exc:
            logger.warning("Vertex AI Gemini generation failed, using deterministic fallback: %s", exc)
            engine_mode = "deterministic_fallback"

    if engine_mode == "deterministic_fallback":
        spatial_prefix = ""
        if map_action and map_action.get("subtitle"):
            if lang == "en":
                spatial_prefix = f"**Map View Activated · {map_action['title']}** ({map_action['subtitle']}).\n\n"
            else:
                spatial_prefix = f"**Vista 3D Activada · {map_action['title']}** ({map_action['subtitle']}).\n\n"
        if lang == "en":
            answer_markdown = (
                f"**[Deterministic Fallback · {baseline['scope_name']}]** "
                f"(Live Vertex AI synthesis unavailable in this offline/CI context; showing verified telemetry & Ontology v3.0 summary.)\n\n"
                + spatial_prefix
                + answer_markdown
            )
        elif spatial_prefix:
            answer_markdown = spatial_prefix + answer_markdown

    uncertainty_note = _build_uncertainty_note(
        language=lang,
        engine_mode=engine_mode,
        rag_count=len(rag_chunks),
        implan_connected=bool(implan_ctx.get("connected")),
    )

    public_map_action = None
    if map_action:
        public_map_action = {k: v for k, v in map_action.items() if k != "analysis_context"}

    return {
        "query": query,
        "scope_id": scope_id,
        "scope_name": baseline["scope_name"],
        "language": lang,
        "engine_mode": engine_mode,
        "model_used": model_used,
        "tools_used": tools_used,
        "citations": citations,
        "uncertainty_note": uncertainty_note,
        "implan_context_used": bool(implan_ctx.get("connected")),
        "answer_markdown": answer_markdown,
        "fly_to": (map_action or {}).get("fly_to") or baseline["fly_to"],
        "map_action": public_map_action,
        "lineage": lineage,
    }
