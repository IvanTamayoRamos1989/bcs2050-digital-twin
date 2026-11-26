"""City Science + Ontology v3.0 Counterfactual Simulation, Goal-Gap & AI Strategist Bridge."""

from __future__ import annotations

import math
import threading
import time
import unicodedata
from typing import Any

from backend.config import get_3dtiles_tileset_url, get_runtime_capabilities, use_bigquery
from backend.spatial_store import SPATIAL_STORE, load_layer_geojson, load_summary
from backend.vvuq import (
    HISTORICAL_VALIDATION_METRICS,
    build_vvuq_block,
    compute_trajectory_vvuq,
)
from ontology_engine.analyzer import analyze_territory_ontology
from ontology_engine.decision_lenses import evaluate_all_decision_lenses
from ontology_engine.scenario_simulator import (
    CANONICAL_SCENARIOS,
    ScenarioLevers,
    compare_canonical_scenarios,
    simulate_scenario,
)

SCENARIO_LABELS: dict[str, dict[str, str]] = {
    "BAU_TENDENCIAL": {
        "title": "BAU Tendencial (Sprawl + Déficit)",
        "title_en": "BAU Baseline (Sprawl & Deficit)",
        "tag": "Tendencial",
        "tag_en": "Baseline",
        "summary": "Crecimiento periférico disperso (18% infill), baja reutilización (18%), sin nueva desalación.",
        "summary_en": "Dispersed urban sprawl (18% infill), low water reuse (18%), no added desalination.",
    },
    "COMPACT_SUSTAINABLE_2050": {
        "title": "Compacta 15-Min & Resiliente 2050",
        "title_en": "Compact 15-Min & Resilient 2050",
        "tag": "Normativa Óptima",
        "tag_en": "Optimal Policy",
        "summary": "68% infill en vacíos servidos, 72% reúso PTAR Línea Morada, 38% solar distribuida y 85% SUDS.",
        "summary_en": "68% urban infill, 72% purple-line WWTP reuse, 38% rooftop solar & 85% SUDS drainage.",
    },
    "HIGH_GROWTH_TOURISM_STRESS": {
        "title": "Aceleración Turística (+65% Demanda)",
        "title_en": "Tourism Boom (+65% Demand Stress)",
        "tag": "Estrés Hídrico-SIBCS",
        "tag_en": "Water & Grid Stress",
        "summary": "Expansión hotelera intensiva con 400 lps desalación y presión crítica en compuerta SIBCS.",
        "summary_en": "Intensive resort growth with 400 lps desalination and critical SIBCS grid transmission strain.",
    },
    "CLIMATE_SHOCK_IPCC_SSP585": {
        "title": "Choque Climático IPCC SSP5-8.5",
        "title_en": "IPCC SSP5-8.5 Climate Shock",
        "tag": "Resiliencia Extrema",
        "tag_en": "Extreme Climate",
        "summary": "-18% recarga acuífera, +0.25 m SLR 2050 y ciclones intensificados; requiere blindaje SUDS.",
        "summary_en": "-18% aquifer recharge, +0.25 m SLR by 2050 & intensified cyclones; requires SUDS flood shielding.",
    },
}


def _translate_breach_warning(raw: str, lang: str) -> str:
    if lang != "en":
        return raw
    out = raw.replace("Sobrepaso de capacidad de carga", "Carrying capacity threshold exceeded")
    out = out.replace("WATER_METABOLISM", "Water Metabolism")
    out = out.replace("ENERGY_SIBCS_NEXUS", "SIBCS Power Grid")
    out = out.replace("LAND_TENURE_ANP", "Protected Land & ANP")
    out = out.replace("CLIMATE_COASTAL_SURGE", "Coastal Storm Surge")
    return out


_LENS_NAME_EN: dict[str, str] = {
    "LENS-01-CARRYING-CAPACITY": "Carrying Capacity (Water–Grid–ANP vs. Demand)",
    "LENS-02-POLITICAL-FEASIBILITY": "Governance & Planning Window Feasibility",
    "LENS-03-INVESTMENT-READINESS": "Investment Readiness, Infrastructure & Fiscal Envelope",
    "LENS-04-ECOLOGICAL-INTEGRITY": "Ecological Integrity & IPCC Climate Adaptation",
    "LENS-05-INSTRUMENT-COHERENCE": "Statutory Instrument Alignment (ANP ↔ POERBCS ↔ PMDU)",
    "LENS-06-EQUITY-URBAN-FORM": "Spatial Equity, Compact Form & 15-Min Services",
}

_VERDICT_EN: dict[str, str] = {
    "ALERTA_CRITICA": "Critical Alert",
    "APROBADO": "Aligned",
    "CONDICIONADO": "Conditional",
    "EN_RIESGO": "At Risk",
    "OPTIMO": "Optimal",
    "CRITICAL_ALERT": "Critical Alert",
}

_CONTRA_EN: dict[str, str] = {
    "CONTRA-WATER-ENERGY-SIBCS": (
        "Continuous desalination power load (3.42 MW) strains the isolated SIBCS grid under critical reserve margin (-6.4%) or active transmission bottlenecks."
    ),
    "CONTRA-SPRAWL-IDLE-INFILL": (
        "1,295.4 ha of vacant serviced urban infill land coexist with low density (29.0 res/ha), driving avoidable sprawl pressure onto agricultural and ejido land."
    ),
    "CONTRA-CLIMATE-SLR-EXPOSURE": (
        "Coastal exposure to IPCC AR6 SSP5-8.5 sea-level rise (+0.25 m by 2050) across 1,140 km of torrential arroyos requires ZOFEMAT & green SUDS buffering."
    ),
    "CONTRA-MML-UNQUANTIFIED": (
        "Only 44.0% of prior programmatic action lines carry quantified SMART baselines and results-based budget (PbR) allocation."
    ),
}


def _localize_contradiction(c: dict[str, Any], lang: str) -> dict[str, Any]:
    cid = str(c.get("id") or "")
    raw_msg = str(c.get("message") or c.get("description") or c.get("title") or "").strip()
    if lang == "en":
        msg = _CONTRA_EN.get(cid) or raw_msg
    else:
        msg = raw_msg or _CONTRA_EN.get(cid, cid)
    return {
        **c,
        "message": msg,
        "description": msg,
    }


def _scope_to_municipality_filter(scope_id: str) -> str | None:
    if scope_id in {"03001", "03002", "03003", "03008", "03009"}:
        return scope_id
    return None


def _filter_agebs_for_scope(scope_id: str) -> list[dict[str, Any]]:
    agebs = load_layer_geojson("agebs").get("features", [])
    mun_filter = _scope_to_municipality_filter(scope_id)
    if mun_filter:
        return [f["properties"] for f in agebs if f["properties"].get("municipality_code") == mun_filter]
    if scope_id == "CORR-SUR-CABOS":
        return [f["properties"] for f in agebs if f["properties"].get("municipality_code") == "03008"]
    if scope_id == "CORR-CENTRO-LA-PAZ":
        return [f["properties"] for f in agebs if f["properties"].get("municipality_code") == "03003"]
    if scope_id == "CORR-VALLE-COMONDU":
        return [f["properties"] for f in agebs if f["properties"].get("municipality_code") == "03001"]
    if scope_id == "CORR-NORTE-LORETO-MULEGE":
        return [f["properties"] for f in agebs if f["properties"].get("municipality_code") in {"03002", "03009"}]
    return [f["properties"] for f in agebs]


_ONTOLOGY_CACHE_LOCK = threading.Lock()
_SIM_CACHE: dict[tuple[str, str, int, bool, str], tuple[float, dict[str, Any]]] = {}
_RECS_CACHE: dict[tuple[str, bool, str], tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SEC = 300.0


def run_twin_simulation(
    *,
    scope_id: str = "03",
    scenario_name: str = "COMPACT_SUSTAINABLE_2050",
    custom_levers: dict[str, Any] | None = None,
    target_year: int = 2050,
    language: str = "es",
) -> dict[str, Any]:
    lang = "en" if str(language).strip().lower().startswith("en") else "es"
    bq_flag = use_bigquery()
    cache_key = (scope_id, scenario_name, target_year, bq_flag, lang)
    if custom_levers is None:
        now = time.monotonic()
        with _ONTOLOGY_CACHE_LOCK:
            cached = _SIM_CACHE.get(cache_key)
            if cached and (now - cached[0]) < _CACHE_TTL_SEC:
                return cached[1]

    levers_obj = ScenarioLevers.model_validate(custom_levers) if custom_levers else None
    sim = simulate_scenario(
        scope_id,
        scenario_name=scenario_name,
        custom_levers=levers_obj,
        use_bigquery=bq_flag,
        persist_to_bq=False,
    )
    traj, vvuq_meta = compute_trajectory_vvuq(
        scope_id=scope_id,
        scenario_name=scenario_name,
        levers=sim["levers"],
        trajectory=sim["trajectory"],
        use_bigquery=bq_flag,
        custom_levers_used=custom_levers is not None,
        language=lang,
    )
    yr_point = next((t for t in traj if t["year"] == target_year), traj[-1])
    progress = max(0.0, min(1.0, (target_year - 2025) / 25.0))

    # Compute spatial 3D height multipliers & solar deployment per AGEB for live 3D extrusion
    levers = sim["levers"]
    infill_share = float(levers["infill_share_pct"]) / 100.0
    solar_share = float(levers["distributed_solar_share_pct"]) / 100.0
    reuse_share = float(levers["ptar_reuse_target_pct"]) / 100.0

    ageb_deltas: dict[str, dict[str, float]] = {}
    scope_agebs = _filter_agebs_for_scope(scope_id)
    summary = load_summary()
    total_solar_potential_mw = sum(float(p.get("solar_mw") or 0.0) for p in scope_agebs)

    for p in scope_agebs:
        cve = str(p.get("cvegeo_ageb", ""))
        c15 = float(p.get("city15_score") or 40.0)
        infill_cap = float(p.get("infill_homes_potential") or 0.0)
        in_anp = bool(p.get("in_anp"))
        # Compact infill concentrates vertical intensification in well-served non-ANP AGEBs
        # BAU pushes low-efficiency outward expansion on low-15m edge AGEBs
        if in_anp:
            h_mult = 1.0
        elif infill_share >= 0.45:
            eligible = (c15 / 100.0) * min(1.0, infill_cap / 250.0)
            h_mult = 1.0 + progress * (0.12 + 0.85 * infill_share * eligible)
        else:
            peripheral = max(0.1, (100.0 - c15) / 100.0)
            h_mult = 1.0 + progress * (0.28 * (1.0 - infill_share) * peripheral)

        ageb_deltas[cve] = {
            "height_multiplier": round(h_mult, 3),
            "projected_solar_mw": round(float(p.get("solar_mw") or 0.0) * solar_share * progress, 2),
            "water_relief_factor": round(reuse_share * progress, 3),
        }

    deployed_solar_mw = round(total_solar_potential_mw * solar_share * progress, 1)

    meta_raw = SCENARIO_LABELS.get(scenario_name)
    scenario_meta = (
        {
            "title": meta_raw["title_en"] if lang == "en" else meta_raw["title"],
            "tag": meta_raw["tag_en"] if lang == "en" else meta_raw["tag"],
            "summary": meta_raw["summary_en"] if lang == "en" else meta_raw["summary"],
        }
        if meta_raw
        else {
            "title": scenario_name.replace("_", " ").title(),
            "tag": "Custom",
            "summary": "Custom counterfactual policy scenario" if lang == "en" else "Escenario personalizado",
        }
    )

    result = {
        "scope_id": sim["scope_id"],
        "scope_name": sim["scope_name"],
        "scope_level": sim["scope_level"],
        "scenario_name": scenario_name,
        "scenario_meta": scenario_meta,
        "target_year": target_year,
        "levers": levers,
        "sdi_score_2031": sim["sdi_score_2031"],
        "sdi_score_2050": sim["sdi_score_2050"],
        "carrying_capacity_breach_year": sim["carrying_capacity_breach_year"],
        "breach_warnings": [_translate_breach_warning(w, lang) for w in sim["breach_warnings"]],
        "trajectory": traj,
        "active_year_snapshot": {
            **yr_point,
            "deployed_rooftop_solar_mw": deployed_solar_mw,
            "total_rooftop_potential_mw": round(total_solar_potential_mw, 1),
            "state_infill_capacity_homes": summary["state"]["infill_homes_potential"],
        },
        "ageb_deltas": ageb_deltas,
        "vvuq": vvuq_meta,
    }
    if custom_levers is None:
        with _ONTOLOGY_CACHE_LOCK:
            _SIM_CACHE[cache_key] = (time.monotonic(), result)
    return result


def compare_twin_scenarios(scope_id: str = "03") -> dict[str, Any]:
    comp = compare_canonical_scenarios(scope_id, use_bigquery=use_bigquery(), persist_to_bq=False)
    scenarios_out = {}
    for k, v in comp["scenarios"].items():
        scenarios_out[k] = {
            "meta": SCENARIO_LABELS.get(k, {}),
            "sdi_score_2031": v["sdi_score_2031"],
            "sdi_score_2050": v["sdi_score_2050"],
            "carrying_capacity_breach_year": v["carrying_capacity_breach_year"],
            "breach_warnings": v["breach_warnings"],
            "trajectory": v["trajectory"],
        }
    return {
        "scope": comp["scope"],
        "compact_vs_bau_2050_delta": comp["compact_vs_bau_2050_delta"],
        "scenarios": scenarios_out,
    }


def compute_goal_gap(
    *,
    scope_id: str = "03",
    target_city15_score: float = 88.0,
    target_infill_share_pct: float = 68.0,
    target_ptar_reuse_pct: float = 72.0,
    target_rooftop_solar_pct: float = 38.0,
    target_suds_coverage_pct: float = 85.0,
    language: str = "es",
) -> dict[str, Any]:
    lang = "en" if str(language).strip().lower().startswith("en") else "es"
    summary = load_summary()
    mun_map = summary["municipalities"]
    scope_agebs = _filter_agebs_for_scope(scope_id)

    if scope_id in mun_map:
        baseline = mun_map[scope_id]
        pop_now = int(baseline["population_2025"])
        current_15m = float(baseline["city15_score"])
        solar_pot_mw = float(baseline["solar_mw"])
        infill_cap = int(baseline["infill_homes_potential"])
        surge_bldgs = int(baseline["surge_exposed_buildings"])
        scope_name = baseline["name"]
    else:
        pop_now = sum(int(p.get("pobtot_2025_eic_calibrated") or 0) for p in scope_agebs)
        weights = [max(1.0, float(p.get("pobtot_2025_eic_calibrated") or 1.0)) for p in scope_agebs]
        w_sum = sum(weights) or 1.0
        current_15m = round(sum(float(p.get("city15_score") or 0.0) * w for p, w in zip(scope_agebs, weights)) / w_sum, 1)
        solar_pot_mw = round(sum(float(p.get("solar_mw") or 0.0) for p in scope_agebs), 1)
        infill_cap = int(sum(int(p.get("infill_homes_potential") or 0) for p in scope_agebs))
        surge_bldgs = int(sum(int(p.get("surge_exposed_buildings") or 0) for p in scope_agebs))
        scope_name = summary["state"]["name"] if scope_id == "03" else scope_id

    # 2050 demographic growth baseline (~1.4%/yr decelerated)
    projected_new_people_2050 = round(pop_now * 0.287)
    projected_new_homes_2050 = round(projected_new_people_2050 / 3.1)
    infill_homes_needed = round(projected_new_homes_2050 * (target_infill_share_pct / 100.0))

    # Baselines
    current_infill = 18.0
    current_reuse = 18.0
    current_solar = 6.5
    current_suds = 12.0

    # Required desalination / reuse & CAPEX sizing
    # Estimate ~240 l/hab/day -> ~0.000088 hm3/yr per person; PTAR reuse + desal closes deficit
    water_gap_hm3_yr = round(max(4.0, projected_new_people_2050 * 0.00009), 2)
    recommended_desal_lps = round(max(120.0, min(650.0, water_gap_hm3_yr * 14.0)), 0)
    target_solar_mw = round(solar_pot_mw * (target_rooftop_solar_pct / 100.0), 1)

    capex_water_mdp = round(recommended_desal_lps * 2.45 + target_ptar_reuse_pct * 9.5, 1)
    capex_solar_mdp = round(target_solar_mw * 18.5 * 0.25, 1)  # municipal + PPP co-investment leverage
    capex_suds_mdp = round(max(180.0, surge_bldgs * 0.065 * (target_suds_coverage_pct / 80.0)), 1)
    capex_15m_mdp = round(max(220.0, max(0.0, target_city15_score - current_15m) * 48.0), 1)
    total_capex_mdp = round(capex_water_mdp + capex_solar_mdp + capex_suds_mdp + capex_15m_mdp, 1)

    pillars = [
        {
            "id": "city_15m",
            "label": "15-Min City Access" if lang == "en" else "Accesibilidad Ciudad 15-Min",
            "unit": "pts",
            "current": current_15m,
            "target": round(target_city15_score, 1),
            "gap": round(max(0.0, target_city15_score - current_15m), 1),
        },
        {
            "id": "infill",
            "label": "Urban Infill Share" if lang == "en" else "Redensificación Intraurbana",
            "unit": "%",
            "current": current_infill,
            "target": round(target_infill_share_pct, 1),
            "gap": round(max(0.0, target_infill_share_pct - current_infill), 1),
        },
        {
            "id": "reuse",
            "label": "Purple-Line Reuse" if lang == "en" else "Reúso PTAR Línea Morada",
            "unit": "%",
            "current": current_reuse,
            "target": round(target_ptar_reuse_pct, 1),
            "gap": round(max(0.0, target_ptar_reuse_pct - current_reuse), 1),
        },
        {
            "id": "solar",
            "label": "Rooftop Solar PV" if lang == "en" else "Solar Distribuida en Techos",
            "unit": "%",
            "current": current_solar,
            "target": round(target_rooftop_solar_pct, 1),
            "gap": round(max(0.0, target_rooftop_solar_pct - current_solar), 1),
        },
        {
            "id": "suds",
            "label": "SUDS / Arroyo Drainage" if lang == "en" else "Cobertura SUDS / Arroyos",
            "unit": "%",
            "current": current_suds,
            "target": round(target_suds_coverage_pct, 1),
            "gap": round(max(0.0, target_suds_coverage_pct - current_suds), 1),
        },
    ]

    optimal_levers = {
        "water_efficiency_target_pct": 76.0,
        "ptar_reuse_target_pct": round(target_ptar_reuse_pct, 1),
        "desalination_added_lps": recommended_desal_lps,
        "infill_share_pct": round(target_infill_share_pct, 1),
        "target_infill_density_hab_ha": 68.0,
        "suds_coverage_pct": round(target_suds_coverage_pct, 1),
        "distributed_solar_share_pct": round(target_rooftop_solar_pct, 1),
        "tourism_demand_multiplier": 1.0,
        "climate_recharge_shock_pct": 0.0,
        "annual_capex_boost_pct": 30.0,
    }

    infill_cov_p50 = round(min(100.0, (infill_cap / max(1, infill_homes_needed)) * 100.0), 1)
    goal_vvuq = build_vvuq_block(
        engine_family="BCS2050 Goal-Gap Inverse Normative Solver (SHCP-CEPEP CAPEX + City15)",
        calibration_dataset=(
            "INEGI Census 2000–2020 / Intercensal 2025 + CONAGUA DOF 2023 + IMPLAN PMDU COS/CUS"
            if lang == "en"
            else "INEGI Censo 2000–2020 / Intercensal 2025 + CONAGUA DOF 2023 + IMPLAN PMDU COS/CUS"
        ),
        validation_error_rmse_or_mape={
            "demographic_2010_2020_mape_pct": HISTORICAL_VALIDATION_METRICS["demographic_2010_2020_municipal"]["mape_pct"],
            "capex_parametric_tolerance_pct": 18.0,
        },
        p10_p50_p90_uncertainty_band={
            "estimated_capex_mdp_mxn": {
                "p10": round(total_capex_mdp * 0.82, 1),
                "p50": total_capex_mdp,
                "p90": round(total_capex_mdp * 1.22, 1),
            },
            "infill_absorption_coverage_pct": {
                "p10": round(min(100.0, infill_cov_p50 * 0.86), 1),
                "p50": infill_cov_p50,
                "p90": round(min(100.0, infill_cov_p50 * 1.08), 1),
            },
            "recommended_desal_lps": {
                "p10": round(recommended_desal_lps * 0.85),
                "p50": recommended_desal_lps,
                "p90": round(recommended_desal_lps * 1.20),
            },
        },
        assumptions=(
            [
                "2025–2050 demographic growth modeled under a decelerated ~1.4%/yr baseline with −18%/+22% CAPEX sensitivity.",
                "SWRO, WWTP reuse, and SUDS unit costs in constant 2025 MXN million pending SHCP-CEPEP detailed engineering.",
            ]
            if lang == "en"
            else [
                "Crecimiento demográfico proyectado 2025–2050 bajo tasa base desacelerada (~1.4%/año promedio) con sensibilidad −18%/+22% en CAPEX.",
                "Costos unitarios SWRO/PTAR/SUDS en MDP constantes 2025 sujetos a licitación pública SHCP-CEPEP e ingeniería de detalle.",
            ]
        ),
        language=lang,
    )

    return {
        "scope_id": scope_id,
        "scope_name": scope_name,
        "population_2025": pop_now,
        "projected_new_people_2050": projected_new_people_2050,
        "projected_new_homes_2050": projected_new_homes_2050,
        "infill_homes_needed": infill_homes_needed,
        "zoned_infill_capacity_homes": infill_cap,
        "infill_absorption_coverage_pct": infill_cov_p50,
        "target_solar_mw": target_solar_mw,
        "recommended_desal_lps": recommended_desal_lps,
        "estimated_capex_mdp_mxn": total_capex_mdp,
        "capex_breakdown_mdp": {
            "water_desal_reuse": capex_water_mdp,
            "rooftop_solar_bess": capex_solar_mdp,
            "arroyos_suds_coastal": capex_suds_mdp,
            "equipamiento_15m": capex_15m_mdp,
        },
        "pillars": pillars,
        "optimal_levers": optimal_levers,
        "vvuq": goal_vvuq,
    }


def generate_recommendations(scope_id: str = "03", language: str = "es") -> dict[str, Any]:
    lang = "en" if str(language).strip().lower().startswith("en") else "es"
    bq_flag = use_bigquery()
    cache_key = (scope_id, bq_flag, lang)
    now = time.monotonic()
    with _ONTOLOGY_CACHE_LOCK:
        cached = _RECS_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL_SEC:
            return cached[1]
    lenses = evaluate_all_decision_lenses(scope_id, use_bigquery=bq_flag)
    analysis = analyze_territory_ontology(scope_id, use_bigquery=bq_flag)
    scope_agebs = _filter_agebs_for_scope(scope_id)

    # 1. Best Compact Infill AGEBs (high 15m + high infill capacity + not ANP)
    infill_top = sorted(
        [a for a in scope_agebs if not a.get("in_anp") and (a.get("infill_homes_potential") or 0) > 40],
        key=lambda a: (float(a.get("city15_score") or 0) * 0.6 + min(40.0, float(a.get("infill_homes_potential") or 0) / 25.0)),
        reverse=True,
    )[:3]

    # 2. 15-Minute Service Deserts (high population, lowest city15_score)
    desert_top = sorted(
        [a for a in scope_agebs if (a.get("pobtot_2025_eic_calibrated") or 0) >= 800],
        key=lambda a: float(a.get("city15_score") or 100.0),
    )[:3]

    # 3. Coastal Storm Surge & Arroyo SUDS Hotspots (highest surge_exposed_buildings)
    surge_top = sorted(
        [a for a in scope_agebs if (a.get("surge_exposed_buildings") or 0) >= 25],
        key=lambda a: int(a.get("surge_exposed_buildings") or 0),
        reverse=True,
    )[:3]

    # 4. Rooftop Solar Microgrid Hubs (highest solar_mw)
    solar_top = sorted(
        scope_agebs,
        key=lambda a: float(a.get("solar_mw") or 0.0),
        reverse=True,
    )[:3]

    # 5. Water Stress / Tandeo & Aquifer Deficit Priority
    water_top = sorted(
        [a for a in scope_agebs if float(a.get("dma_2023_hm3") or 0.0) < -5.0 or bool(a.get("in_tandeo"))],
        key=lambda a: (1 if a.get("in_tandeo") else 0, abs(float(a.get("dma_2023_hm3") or 0.0)), int(a.get("pobtot_2025_eic_calibrated") or 0)),
        reverse=True,
    )[:3]

    actions: list[dict[str, Any]] = []

    def _add_card(
        *,
        rec_id: str,
        challenge: str,
        priority: str,
        title: str,
        rationale: str,
        metric_badge: str,
        ageb_row: dict[str, Any] | None,
        fly_zoom: float = 14.3,
    ) -> None:
        if not ageb_row:
            return
        actions.append(
            {
                "id": rec_id,
                "challenge": challenge,
                "priority": priority,
                "title": title,
                "rationale": rationale,
                "metric_badge": metric_badge,
                "municipality": ageb_row.get("municipality_name", ""),
                "ageb_cvegeo": ageb_row.get("cvegeo_ageb", ""),
                "camera": {
                    "lon": float(ageb_row.get("centroid_lon") or -110.31),
                    "lat": float(ageb_row.get("centroid_lat") or 24.14),
                    "zoom": fly_zoom,
                    "pitch": 58,
                    "bearing": -20,
                },
            }
        )

    if infill_top:
        a = infill_top[0]
        _add_card(
            rec_id="REC-INFILL-01",
            challenge="Housing & Land",
            priority="HIGH · Q1" if lang == "en" else "ALTA · Q1",
            title=(
                f"15-Min Priority Infill District · AGEB {a['cvegeo_ageb'][-4:]}"
                if lang == "en"
                else f"Polígono Prioritario Infill 15-Min · AGEB {a['cvegeo_ageb'][-4:]}"
            ),
            rationale=(
                (
                    f"Holds zoned CUS envelope for +{int(a['infill_homes_potential']):,} urban infill homes "
                    f"with a 15-Minute City score of {a['city15_score']} pts outside protected ANP zones."
                )
                if lang == "en"
                else (
                    f"Concentra capacidad normativa para +{int(a['infill_homes_potential']):,} viviendas intraurbanas "
                    f"con puntaje Ciudad 15-Min de {a['city15_score']} pts y fuera de áreas ANP."
                )
            ),
            metric_badge=(
                f"+{int(a['infill_homes_potential']):,} homes · 15-Min {a['city15_score']}"
                if lang == "en"
                else f"+{int(a['infill_homes_potential']):,} viv · 15-Min {a['city15_score']}"
            ),
            ageb_row=a,
        )

    if desert_top:
        a = desert_top[0]
        _add_card(
            rec_id="REC-EQUITY-02",
            challenge="Urban Form & 15-Min",
            priority="CRITICAL · Q1" if lang == "en" else "CRÍTICA · Q1",
            title=(
                f"Closing Care & Service Desert · {a['municipality_name']}"
                if lang == "en"
                else f"Cierre de Desierto de Cuidados · {a['municipality_name']}"
            ),
            rationale=(
                (
                    f"Serves {int(a['pobtot_2025_eic_calibrated']):,} residents scoring just {a['city15_score']}/100 on 15-Min proximity "
                    f"(nearest clinic {int(a['nearest_health_m']):,} m, transit {int(a['nearest_transit_m']):,} m)."
                )
                if lang == "en"
                else (
                    f"Alberga {int(a['pobtot_2025_eic_calibrated']):,} habitantes con puntaje 15-Min de apenas {a['city15_score']}/100 "
                    f"(salud a {int(a['nearest_health_m']):,} m, tránsito a {int(a['nearest_transit_m']):,} m)."
                )
            ),
            metric_badge=(
                f"{int(a['pobtot_2025_eic_calibrated']):,} res · Health {int(a['nearest_health_m']):,}m"
                if lang == "en"
                else f"{int(a['pobtot_2025_eic_calibrated']):,} hab · Salud {int(a['nearest_health_m']):,}m"
            ),
            ageb_row=a,
        )

    if water_top:
        a = water_top[0]
        tandeo_txt = (
            (" under active OOMSAPAS rationing" if a.get("in_tandeo") else "")
            if lang == "en"
            else (" bajo tandeo activo OOMSAPAS" if a.get("in_tandeo") else "")
        )
        _add_card(
            rec_id="REC-WATER-03",
            challenge="Water, Energy & Climate",
            priority="CRITICAL · IMMEDIATE" if lang == "en" else "CRÍTICA · INMEDIATA",
            title=(
                f"Network Metering + Purple Line · Aquifer {a.get('aquifer_name', 'BCS')}"
                if lang == "en"
                else f"Sectorización + Línea Púrpura · Acuífero {a.get('aquifer_name', 'BCS')}"
            ),
            rationale=(
                (
                    f"AGEB with {int(a['pobtot_2025_eic_calibrated']):,} res{tandeo_txt} over aquifer with official CONAGUA DMA "
                    f"{float(a.get('dma_2023_hm3') or 0):.2f} hm³/yr ({float(a.get('exploitation_ratio_pct') or 0):.0f}% exploitation)."
                )
                if lang == "en"
                else (
                    f"AGEB con {int(a['pobtot_2025_eic_calibrated']):,} hab{tandeo_txt} sobre acuífero con DMA oficial "
                    f"{float(a.get('dma_2023_hm3') or 0):.2f} hm³/año ({float(a.get('exploitation_ratio_pct') or 0):.0f}% explotación)."
                )
            ),
            metric_badge=f"DMA {float(a.get('dma_2023_hm3') or 0):.1f} hm³/yr",
            ageb_row=a,
        )

    if solar_top:
        a = solar_top[0]
        _add_card(
            rec_id="REC-SOLAR-04",
            challenge="Water, Energy & Climate",
            priority="HIGH · Q2" if lang == "en" else "ALTA · Q2",
            title=(
                f"Rooftop Solar + BESS District · AGEB {a['cvegeo_ageb'][-4:]}"
                if lang == "en"
                else f"Distrito Solar + BESS en Techos · AGEB {a['cvegeo_ageb'][-4:]}"
            ),
            rationale=(
                (
                    f"Verified technical PV capacity of {float(a['solar_mw']):.1f} MW ({float(a['solar_gwh_yr']):.1f} GWh/yr) "
                    f"across {int(a['buildings_3d_count']):,} roofs located {float(a['dist_substation_km']):.1f} km from the nearest SIBCS substation."
                )
                if lang == "en"
                else (
                    f"Potencial fotovoltaico verificado de {float(a['solar_mw']):.1f} MW ({float(a['solar_gwh_yr']):.1f} GWh/año) "
                    f"sobre {int(a['buildings_3d_count']):,} techos a {float(a['dist_substation_km']):.1f} km de subestación SIBCS."
                )
            ),
            metric_badge=f"{float(a['solar_mw']):.1f} MW · {float(a['solar_gwh_yr']):.1f} GWh/yr",
            ageb_row=a,
        )

    if surge_top:
        a = surge_top[0]
        _add_card(
            rec_id="REC-SURGE-05",
            challenge="Water, Energy & Climate",
            priority="HIGH · RESILIENCE" if lang == "en" else "ALTA · RESILIENCIA",
            title=(
                f"Coastal & Arroyo SUDS Shielding (<6m) · {a['municipality_name']}"
                if lang == "en"
                else f"Blindaje Costero SUDS (<6m) · {a['municipality_name']}"
            ),
            rationale=(
                (
                    f"{int(a['surge_exposed_buildings']):,} buildings ({float(a['surge_exposed_pct']):.1f}% of AGEB) sit "
                    f"below +6.0 m ASL against cyclonic storm surge and IPCC SSP5-8.5 sea-level rise."
                )
                if lang == "en"
                else (
                    f"{int(a['surge_exposed_buildings']):,} edificaciones ({float(a['surge_exposed_pct']):.1f}% del AGEB) "
                    f"por debajo de cota +6.0 msnm ante marea de tormenta ciclónica y aumento IPCC SSP5-8.5."
                )
            ),
            metric_badge=(
                f"{int(a['surge_exposed_buildings']):,} bldgs <6m"
                if lang == "en"
                else f"{int(a['surge_exposed_buildings']):,} edificios <6m"
            ),
            ageb_row=a,
        )

    localized_lenses = []
    for lens in lenses:
        if lang == "en":
            localized_lenses.append(
                {
                    **lens,
                    "lens_name": _LENS_NAME_EN.get(lens.get("lens_id", ""), lens.get("lens_name", "")),
                    "verdict": _VERDICT_EN.get(str(lens.get("verdict", "")).upper(), lens.get("verdict", "")),
                }
            )
        else:
            localized_lenses.append(lens)

    localized_contradictions = [_localize_contradiction(c, lang) for c in analysis["contradictions"]]

    recs_result = {
        "scope_id": scope_id,
        "sdi_100": analysis["sdi_100"],
        "carrying_capacity": analysis["carrying_capacity"],
        "contradictions": localized_contradictions,
        "decision_lenses": localized_lenses,
        "priority_actions": actions,
        "hotspots": {
            "infill": infill_top,
            "service_deserts": desert_top,
            "coastal_surge": surge_top,
            "solar_hubs": solar_top,
        },
    }
    with _ONTOLOGY_CACHE_LOCK:
        _RECS_CACHE[cache_key] = (time.monotonic(), recs_result)
    return recs_result


def answer_strategist_chat(
    *,
    query: str,
    scope_id: str = "03",
    scenario_name: str = "COMPACT_SUSTAINABLE_2050",
    precomputed_recs: dict[str, Any] | None = None,
    precomputed_sim: dict[str, Any] | None = None,
    language: str = "es",
) -> dict[str, Any]:
    """Deterministic grounded territorial intelligence strategist backed by live City Science + Ontology v3."""
    lang = "en" if str(language).strip().lower().startswith("en") else "es"
    summary = load_summary()
    recs = precomputed_recs if precomputed_recs is not None else generate_recommendations(scope_id, language=lang)
    sim = (
        precomputed_sim
        if precomputed_sim is not None
        else run_twin_simulation(scope_id=scope_id, scenario_name=scenario_name, target_year=2050, language=lang)
    )
    q_norm = unicodedata.normalize("NFKD", query.lower())
    q_low = "".join(ch for ch in q_norm if not unicodedata.combining(ch))

    st = summary["state"]
    muns = summary["municipalities"]
    scope_name = muns[scope_id]["name"] if scope_id in muns else st["name"]
    cc = recs["carrying_capacity"]
    sdi = recs["sdi_100"]

    fly_target: dict[str, Any] | None = None
    lines: list[str] = []

    if any(k in q_low for k in ["agua", "acuif", "tandeo", "water", "desal", "hydr"]):
        w = cc["water"]
        if lang == "en":
            lines.append(
                f"**Water Metabolism ({scope_name}):** CONAGUA 2023 official aquifer balance shows Mean Annual Availability (DMA) "
                f"`{w['aquifer_dma_hm3']} hm³/yr` (status `{w['status']}`). Gross urban-tourism demand is "
                f"`{w['gross_demand_hm3_yr']} hm³/yr`, while the purple-line network reuses `{w['reused_volume_hm3_yr']} hm³/yr`."
            )
            lines.append(
                f"Statewide, **21 of 40 aquifers** are in strict deficit (`{st['total_aquifer_dma_2023_hm3']} hm³/yr` net) "
                f"and **280 sectors** in La Paz operate under intermittent OOMSAPAS rationing."
            )
        else:
            lines.append(
                f"**Metabolismo Hídrico ({scope_name}):** El balance oficial CONAGUA 2023 del acuífero principal registra DMA "
                f"`{w['aquifer_dma_hm3']} hm³/año` (estado `{w['status']}`). La demanda bruta urbano-turística es "
                f"`{w['gross_demand_hm3_yr']} hm³/año`, mientras la red reutiliza `{w['reused_volume_hm3_yr']} hm³/año`."
            )
            lines.append(
                f"A nivel estatal, **21 de 40 acuíferos** están en déficit (`{st['total_aquifer_dma_2023_hm3']} hm³/año` acumulados) "
                f"y **280 sectores** en La Paz operan bajo tandeo OOMSAPAS."
            )
        water_act = next((a for a in recs["priority_actions"] if a["id"] == "REC-WATER-03"), None)
        if water_act:
            fly_target = water_act["camera"]
            prefix = "**Priority Focus:**" if lang == "en" else "**Foco territorial prioritario:**"
            lines.append(f"{prefix} {water_act['title']} — {water_act['rationale']}")
    elif any(k in q_low for k in ["solar", "energ", "sibcs", "grid", "elec", "pv", "bess"]):
        e = cc["energy"]
        solar_act = next((a for a in recs["priority_actions"] if a["id"] == "REC-SOLAR-04"), None)
        if lang == "en":
            lines.append(
                f"**Energy–SIBCS Nexus ({scope_name}):** Firm capacity `{e['firm_capacity_mw']} MW` vs. projected peak load "
                f"`{e['projected_total_load_mw']} MW` (reserve margin `{e['reserve_margin_pct']}%`, status `{e['status']}`)."
            )
            lines.append(
                f"Across **{st['buildings_3d_count']:,} 3D roofs** in BCS, technical distributed PV potential reaches "
                f"**{st['rooftop_solar_mw']:,.1f} MW** (**{st['rooftop_solar_gwh_yr']:,.1f} GWh/yr**). "
                f"Covering 25%–38% in La Paz (1,595.5 MW) and Los Cabos (1,574.8 MW) with solar+BESS relieves gate P23-BS1."
            )
        else:
            lines.append(
                f"**Nexo Energía–SIBCS ({scope_name}):** Capacidad firme `{e['firm_capacity_mw']} MW` vs. carga pico proyectada "
                f"`{e['projected_total_load_mw']} MW` (margen de reserva `{e['reserve_margin_pct']}%`, estado `{e['status']}`)."
            )
            lines.append(
                f"Con los **396,823 techos 3D** modelados en BCS, el potencial técnico fotovoltaico distribuido alcanza "
                f"**{st['rooftop_solar_mw']:,.1f} MW** (**{st['rooftop_solar_gwh_yr']:,.1f} GWh/año**). "
                f"En La Paz (1,595.5 MW) y Los Cabos (1,574.8 MW), cubrir apenas 25%–38% con solar+BESS alivia la compuerta P23-BS1 y las plantas térmicas."
            )
        if solar_act:
            fly_target = solar_act["camera"]
    elif any(k in q_low for k in ["vivienda", "infill", "housing", "cabos", "suelo", "zoning", "densid"]):
        infill_act = next((a for a in recs["priority_actions"] if a["id"] == "REC-INFILL-01"), None)
        if lang == "en":
            lines.append(
                f"**Housing & Infill Capacity ({scope_name}):** Across **{st['zoning_parcels_count']:,} zoning polygons** "
                f"and **{st['buildings_3d_count']:,} 3D buildings**, cumulative 2050 urban infill potential totals "
                f"**{st['infill_homes_potential']:,} homes** (291,771 in La Paz; 284,193 in Los Cabos) outside protected ANPs."
            )
        else:
            lines.append(
                f"**Capacidad de Vivienda e Infill ({scope_name}):** De los **{st['zoning_parcels_count']:,} polígonos de zonificación** "
                f"y **{st['buildings_3d_count']:,} edificios 3D** evaluados, el potencial acumulado de redensificación intraurbana 2050 asciende a "
                f"**{st['infill_homes_potential']:,} viviendas** (291,771 en La Paz y 284,193 en Los Cabos) sin invadir ANPs ni suelo rústico POER."
            )
        if infill_act:
            fly_target = infill_act["camera"]
            prefix = "**Priority Infill Zone:**" if lang == "en" else "**Polígono óptimo inmediato:**"
            lines.append(f"{prefix} {infill_act['title']} — {infill_act['rationale']}")
    elif any(k in q_low for k in ["hurac", "inund", "costa", "surge", "clima", "slr", "arroyo", "suds", "flood"]):
        surge_act = next((a for a in recs["priority_actions"] if a["id"] == "REC-SURGE-05"), None)
        if lang == "en":
            lines.append(
                f"**Coastal & Cyclone Flood Risk ({scope_name}):** Elevation analysis of 396,823 structures identifies "
                f"**{st['surge_exposed_buildings']:,} buildings below +6.0 m ASL** (La Paz 10,152; Guerrero Negro 8,775; "
                f"Loreto 3,949; Los Cabos 1,148) facing +0.25 m IPCC SSP5-8.5 mean sea-level rise by 2050."
            )
        else:
            lines.append(
                f"**Riesgo Costero y Ciclónico ({scope_name}):** El análisis altimétrico de las 396,823 edificaciones detecta "
                f"**{st['surge_exposed_buildings']:,} edificios bajo cota +6.0 msnm** (destacando Guerrero Negro con 8,775; "
                f"La Paz con 10,152; Loreto con 3,949 y Los Cabos con 1,148 bajo 6 m) frente a +0.25 m de incremento medio del nivel del mar IPCC SSP5-8.5 al 2050."
            )
        if surge_act:
            fly_target = surge_act["camera"]
            prefix = "**Critical Zone:**" if lang == "en" else "**Zona crítica:**"
            lines.append(f"{prefix} {surge_act['title']} — {surge_act['rationale']}")
    else:
        desert_act = next((a for a in recs["priority_actions"] if a["id"] == "REC-EQUITY-02"), None)
        if desert_act:
            fly_target = desert_act["camera"]
        if lang == "en":
            lines.append(
                f"**City Science Diagnostic ({scope_name}):** Composite Index **`{st['city_science_index']}/100`** "
                f"| 15-Min City **`{st['city15_score']}`** | Fractality **`{st['fractality_score']}`** | "
                f"Harmony **`{st['harmony_score']}`** | SDI-100 **`{sdi['sdi_score_100']}`**."
            )
            lines.append(
                f"Under **`{sim['scenario_meta']['title']}`**, 2050 SDI-100 reaches **`{sim['sdi_score_2050']}`** "
                f"(2031: `{sim['sdi_score_2031']}`) with `{sim['active_year_snapshot']['deployed_rooftop_solar_mw']} MW` rooftop PV deployed."
            )
        else:
            lines.append(
                f"**Diagnóstico Integral City Science ({scope_name}):** Índice compuesto **`{st['city_science_index']}/100`** "
                f"| Ciudad 15-Min **`{st['city15_score']}`** | Fractalidad **`{st['fractality_score']}`** | "
                f"Armonía **`{st['harmony_score']}`** | SDI-100 **`{sdi['sdi_score_100']}`**."
            )
            lines.append(
                f"En el escenario **`{sim['scenario_meta']['title']}`**, el puntaje SDI-100 al 2050 alcanza **`{sim['sdi_score_2050']}`** "
                f"(2031: `{sim['sdi_score_2031']}`) con `{sim['active_year_snapshot']['deployed_rooftop_solar_mw']} MW` solares desplegados."
            )
        if recs["contradictions"]:
            c0 = recs["contradictions"][0]
            msg = c0.get("message") or c0.get("description") or str(c0)
            prefix = "**Detected Policy Alert:**" if lang == "en" else "**Alerta normativa detectada:**"
            lines.append(f"{prefix} {msg}")

    lineage_list = (
        [
            "OpenBuildings 2.5D + GLO30 DEM (396,823 buildings)",
            "Harmonized PMDU Zoning (79,515 parcels)",
            "INEGI EIC 2025 + CONEVAL IRS (1,155 AGEBs)",
            "CONAGUA DOF 2023 (40 aquifers) + OOMSAPAS (280 zones)",
            "BCS2050 Ontology v3.0 (SDI-100 & 6 Lenses)",
        ]
        if lang == "en"
        else [
            "OpenBuildings 2.5D + GLO30 DEM (396,823 edificios)",
            "Zonificación Municipal Armonizada (79,515 polígonos)",
            "INEGI EIC 2025 + CONEVAL IRS (1,155 AGEBs)",
            "CONAGUA DOF 2023 (40 acuíferos) + OOMSAPAS Tandeo (280)",
            "bcs2050_intelligence.ontology_engine (SDI-100 & 6 Lentes)",
        ]
    )

    return {
        "query": query,
        "scope_id": scope_id,
        "scope_name": scope_name,
        "answer_markdown": "\n\n".join(lines),
        "fly_to": fly_target,
        "lineage": lineage_list,
    }


def get_architecture_catalog(language: str = "es") -> dict[str, Any]:
    lang = "en" if str(language).strip().lower().startswith("en") else "es"
    if lang == "en":
        return {
            "capabilities": get_runtime_capabilities(),
            "tileset_3d_url": get_3dtiles_tileset_url(),
            "ogc_endpoints": {
                "features": "/ogc/collections",
                "tiles_mvt": "/ogc/collections/{collection_id}/tiles/WebMercatorQuad/{z}/{y}/{x}.mvt",
                "processes": "/ogc/processes",
                "records": "/ogc/collections/records/items",
                "sensorthings": "/FROST-Server/v1.1/Things",
            },
            "benchmarks": [
                {
                    "name": "Aretian City Digital Twin (Barcelona)",
                    "reference": "youtube.com/watch?v=vNjOCX4iXM0",
                    "metrics": "753k parcels · 475k homes 2050 · 443 clusters · 58 R&D hubs · City Science (Fractality, Harmony, 15-Min, PCI)",
                    "adoption_in_bcs2050": "4-phase workflow (Diagnostics -> Goals -> Scenarios -> Actions), 5 urban challenges, and morphological KPIs across 1,155 AGEBs & 396,823 buildings.",
                },
                {
                    "name": "Esri Living Digital Twin (2025 UC)",
                    "reference": "mediaspace.esri.com/media/t/1_52a9sa88",
                    "metrics": "Digital Thread (GIS + BIM/AEC + Reality Capture + Velocity IoT) + 5-Level Maturity Model",
                    "adoption_in_bcs2050": "OGC 3D Tiles / GeoPackage / UTM 12N DXF / Revit BIM Massing / bridge prepared for ArcGIS & real-time telemetry.",
                },
            ],
            "commercial_tiers": [
                {
                    "tier": "Tier 1 · Web 3D & Cloud Core (Immediate)",
                    "budget_usd_yr": "$28,000 – $52,000",
                    "items": [
                        "Google Maps Photorealistic 3D Tiles API (~$6 / 1,000 root sessions)",
                        "Cesium ion Commercial (World Terrain & 3D Tileset streaming)",
                        "MapTiler Cloud Enterprise (Vector tiles + RGB Terrain DEM)",
                        "Google Cloud (BigQuery, Cloud Run Auth, AlloyDB PostGIS, Vertex AI)",
                        "PlanetScope Monthly Satellite Monitoring",
                    ],
                },
                {
                    "tier": "Tier 2 · Esri Enterprise + O-D Mobility (Months 4–10)",
                    "budget_usd_yr": "+$55,000 – $110,000",
                    "items": [
                        "Esri ArcGIS Professional Plus + ArcGIS Urban + CityEngine",
                        "TomTom Move / Cuebiq Origin–Destination Resident & Tourist Flows",
                        "Airbus Pléiades Neo 30cm / Maxar Vivid 50cm DSM",
                        "Autodesk Construction Cloud + ArcGIS GeoBIM",
                    ],
                },
                {
                    "tier": "Tier 3 · Aerial LiDAR & Omniverse War Room (Months 10–18)",
                    "budget_usd_yr": "+$90,000 – $180,000",
                    "items": [
                        "Aerial LiDAR + Oblique Photogrammetry (5 capitals) + ArcGIS Reality",
                        "ArcGIS Velocity / FIWARE Orion-LD IoT SCADA (OOMSAPAS + CENACE)",
                        "L4/A100 GPU Nodes + NVIDIA Omniverse Enterprise + Cesium for Unreal",
                    ],
                },
            ],
            "top_opensource_engines": [
                {"name": "CesiumJS + deck.gl + MapLibre GL", "category": "Dual 3D Web Engine", "status": "ACTIVE IN PORTAL"},
                {"name": "PostGIS + 3D City Database + H3", "category": "3D Spatial Datastore", "status": "SCHEMA READY / SQLITE R-TREE LIVE"},
                {"name": "QGIS + UMEP (SOLWEIG)", "category": "Thermal Comfort & Shade", "status": "WORKER PIPELINE"},
                {"name": "SUMO + AequilibraE + r5py", "category": "15-Min Isochrones & Traffic", "status": "R5PY DIJKSTRA LIVE"},
                {"name": "SFINCS + HydroMT + CLIMADA", "category": "Cyclone Flood & Surge", "status": "SFINCS WORKER LIVE"},
                {"name": "pvlib + City Energy Analyst + PyPSA", "category": "Rooftop Solar & SIBCS Grid", "status": "ROOFTOP PV LIVE / PYPSA"},
                {"name": "EPANET + WNTR + EPA SWMM", "category": "Water Rationing & Drainage", "status": "WNTR HYDRAULICS LIVE"},
                {"name": "momepy + cityseer + UrbanSim", "category": "Morphology & 2050 Growth", "status": "FRACTALITY & HARMONY LIVE"},
            ],
            "aec_bim_bridge": [
                {
                    "layer": "Urban & Infrastructure Scale",
                    "tools": "Autodesk InfraWorks & Autodesk Civil 3D",
                    "status": "ACTIVE · 3D .DXF EXPORTER (UTM 12N)",
                    "role_in_bcs2050": (
                        "Streams 396,823 real-scale buildings with 3D aerial tours while exporting metric UTM Zone 12N (.DXF R2018) geometry for roads, grading, and stormwater design."
                    ),
                },
                {
                    "layer": "BIM Massing & Coordination (ISO 19650)",
                    "tools": "Autodesk Revit, AutoCAD MEP & Navisworks Manage",
                    "status": "ACTIVE · BIM ISO 19650 JSON + REVIT-MCP",
                    "role_in_bcs2050": (
                        "Exports parcel zoning envelopes (COS/CUS) and reference building masses into ISO 19650-2 containers ready for Revit MEP coordination and clash detection."
                    ),
                },
                {
                    "layer": "Cloud CDE & Operations Twin",
                    "tools": "Autodesk Construction Cloud (ACC) & Autodesk Tandem",
                    "status": "APS / TANDEM CONNECTOR READY",
                    "role_in_bcs2050": (
                        "BigQuery + Ontology v3.0 govern regional analytics while maintaining ISO 19650 CDE identifiers for municipal O&M facility handoff."
                    ),
                },
                {
                    "layer": "Real-Time Visualization & VFX",
                    "tools": "Lumion, Unreal Engine 5 & Cesium for Unreal",
                    "status": "ACTIVE · .OBJ 3D MESH + UE5 MANIFEST",
                    "role_in_bcs2050": (
                        "Exports local metric .OBJ 3D meshes and georeferenced Cesium for Unreal manifests alongside built-in web aerial fly-through tours."
                    ),
                },
            ],
        }

    return {
        "capabilities": get_runtime_capabilities(),
        "tileset_3d_url": get_3dtiles_tileset_url(),
        "ogc_endpoints": {
            "features": "/ogc/collections",
            "tiles_mvt": "/ogc/collections/{collection_id}/tiles/WebMercatorQuad/{z}/{y}/{x}.mvt",
            "processes": "/ogc/processes",
            "records": "/ogc/collections/records/items",
            "sensorthings": "/FROST-Server/v1.1/Things",
        },
        "benchmarks": [
            {
                "name": "Aretian City Digital Twin (Barcelona)",
                "reference": "youtube.com/watch?v=vNjOCX4iXM0",
                "metrics": "753k parcelas · 475k viviendas 2050 · 443 clústeres · 58 centros I+D · City Science (Fractalidad, Armonía, 15-Min, PCI)",
                "adoption_in_bcs2050": "Flujo de 4 fases (Diagnóstico -> Metas -> Escenarios -> Recomendaciones), 5 retos urbanos y KPIs morfológicos en 1,155 AGEBs y 396,823 edificios.",
            },
            {
                "name": "Esri Living Digital Twin (2025 UC)",
                "reference": "mediaspace.esri.com/media/t/1_52a9sa88",
                "metrics": "Digital Thread (GIS + BIM/AEC + Reality Capture + Velocity IoT) + Modelo de Madurez 5 Niveles",
                "adoption_in_bcs2050": "Estándares OGC 3D Tiles / GeoPackage / UTM 12N DXF / Revit BIM Massing / puente preparado para ArcGIS & Velocity.",
            },
        ],
        "commercial_tiers": [
            {
                "tier": "Tier 1 · Web 3D & Cloud Core (Inmediato)",
                "budget_usd_yr": "$28,000 – $52,000",
                "items": [
                    "Google Maps Photorealistic 3D Tiles API (~$6 / 1,000 root sessions)",
                    "Cesium ion Commercial (World Terrain & 3D Tileset streaming)",
                    "MapTiler Cloud Enterprise (Vector tiles + RGB Terrain DEM)",
                    "Google Cloud (BigQuery, Cloud Run Auth, AlloyDB PostGIS, Vertex AI)",
                    "PlanetScope Monitoreo Satelital Mensual",
                ],
            },
            {
                "tier": "Tier 2 · Esri Enterprise + Movilidad O-D (Meses 4–10)",
                "budget_usd_yr": "+$55,000 – $110,000",
                "items": [
                    "Esri ArcGIS Professional Plus + ArcGIS Urban + CityEngine",
                    "TomTom Move / Cuebiq Matrices Origen-Destino Turistas & Residentes",
                    "Airbus Pléiades Neo 30cm / Maxar Vivid 50cm DSM",
                    "Autodesk Construction Cloud + ArcGIS GeoBIM",
                ],
            },
            {
                "tier": "Tier 3 · LiDAR Aéreo & War Room Omniverse (Meses 10–18)",
                "budget_usd_yr": "+$90,000 – $180,000",
                "items": [
                    "Vuelo LiDAR + Fotogrametría Oblicua 5 cabeceras + ArcGIS Reality",
                    "ArcGIS Velocity / FIWARE Orion-LD IoT SCADA (OOMSAPAS + CENACE)",
                    "Nodos GPU L4/A100 + NVIDIA Omniverse Enterprise + Cesium for Unreal",
                ],
            },
        ],
        "top_opensource_engines": [
            {"name": "CesiumJS + deck.gl + MapLibre GL", "category": "Visor 3D Web Dual", "status": "ACTIVO EN PORTAL"},
            {"name": "PostGIS + 3D City Database + H3", "category": "Base Espacial 3D", "status": "ESQUEMA LISTO / SQLITE R-TREE ACTIVO"},
            {"name": "QGIS + UMEP (SOLWEIG)", "category": "Confort Térmico & Sombra", "status": "PIPELINE WORKER"},
            {"name": "SUMO + AequilibraE + r5py", "category": "Tráfico & Isocronas 15-Min", "status": "KDTREE ACTIVO / SUMO WORKER"},
            {"name": "SFINCS + HydroMT + CLIMADA", "category": "Inundación Ciclónica & Riesgo", "status": "PIPELINE WORKER"},
            {"name": "pvlib + City Energy Analyst + PyPSA", "category": "Solar Techos & Red SIBCS", "status": "SOLAR TECHOS ACTIVO / PYPSA WORKER"},
            {"name": "EPANET + WNTR + EPA SWMM", "category": "Redes Agua / Tandeo / Drenaje", "status": "PIPELINE WORKER"},
            {"name": "momepy + cityseer + UrbanSim", "category": "Morfología & Crecimiento 2050", "status": "FRACTALIDAD/ARMONÍA ACTIVAS"},
        ],
        "aec_bim_bridge": [
            {
                "layer": "Escala Urbana e Infraestructura",
                "tools": "Autodesk InfraWorks y Autodesk Civil 3D",
                "status": "ACTIVO · EXPORTADOR .DXF 3D (UTM 12N)",
                "role_in_bcs2050": (
                    "Nuestro visor web WebGL mantiene los 396,823 edificios en tiempo real y vuelos aéreos (El Tezal, La Paz, Loreto); "
                    "el puente exporta geometría métrica UTM Zona 12N (.DXF R2018) para rasantes, drenaje y vialidades en Civil 3D / InfraWorks."
                ),
            },
            {
                "layer": "Modelado BIM y Coordinación (ISO 19650)",
                "tools": "Autodesk Revit, AutoCAD MEP y Navisworks Manage",
                "status": "ACTIVO · EXPORTADOR BIM ISO 19650 JSON + REVIT-MCP",
                "role_in_bcs2050": (
                    "Para proyectos específicos (hospitales, desaladoras, torres), exportamos volúmenes y envolventes CUS/COS bajo contenedor "
                    "ISO 19650-2 listos para coordinación MEP en Revit y detección de interferencias 4D en Navisworks."
                ),
            },
            {
                "layer": "Nube y Gemelo Digital Operativo",
                "tools": "Autodesk Construction Cloud (ACC), BIM Collaborate Pro y Autodesk Tandem",
                "status": "CONECTOR APS / TANDEM LISTO (.env)",
                "role_in_bcs2050": (
                    "BigQuery + Ontología v3.0 gobiernan la escala territorial/estatal; el puente deja preparados identificadores CDE ISO 19650 "
                    "y llaves Autodesk APS / Tandem para ciclo de vida O&M de edificios e infraestructura."
                ),
            },
            {
                "layer": "Visualización y Postproducción",
                "tools": "Lumion, Unreal Engine y Adobe Creative Cloud",
                "status": "ACTIVO · MALLA .OBJ 3D + CESIUM FOR UNREAL + VUELO AÉREO WEB",
                "role_in_bcs2050": (
                    "Exporta mallas .OBJ centradas en origen métrico local para Lumion/Blender y manifiestos CesiumGeoreference para Unreal Engine 5.4+, "
                    "complementando el vuelo cinemático interactivo directo en el navegador."
                ),
            },
        ],
    }
