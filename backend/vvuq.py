"""ISO 23247-8 & Destination Earth VVUQ (Verification, Validation & Uncertainty Quantification) Module."""

from __future__ import annotations

import threading
import time
from typing import Any

from ontology_engine.analyzer import load_territory_ontology_profile
from ontology_engine.scenario_simulator import ScenarioLevers, simulate_scenario

# Verified via `python -m workers.run_vvuq_backtest` -> `docs/VVUQ_BACKTEST_REPORT_2010_2023.md`
HISTORICAL_VALIDATION_METRICS: dict[str, Any] = {
    "demographic_2010_2020_municipal": {
        "n_municipalities": 5,
        "dataset": "INEGI Censo 2000/2010/2020 (`bcs2050.bcs_analitica.poblacion_total`)",
        "rmse_hab": 7895.2,
        "mae_hab": 7245.8,
        "mape_pct": 8.39,
    },
    "demographic_2020_2025_state": {
        "observed_2025_intercensal": 961514,
        "predicted_trend_2025": 876252,
        "ape_trend_pct": 8.87,
        "ape_snapshot_levers_pct": 9.36,
    },
    "aquifer_2020_2023_conagua": {
        "n_aquifers_all": 40,
        "dataset": "CONAGUA DOF 2020 vs. 2023 Disponibilidad Media Anual (`aquifers.geojson`)",
        "all_40_zero_drift_rmse_hm3": 2.228,
        "all_40_zero_drift_mae_hm3": 0.881,
        "primary_5_modeled_rmse_hm3": 3.417,
        "primary_5_modeled_mae_hm3": 2.790,
    },
    "backtest_report_path": "docs/VVUQ_BACKTEST_REPORT_2010_2023.md",
}

LEGAL_DISCLAIMER_TEXT = (
    "AVISO LEGAL VVUQ (ISO 23247-8): Simulación exploratoria de planeación territorial con bandas de incertidumbre P10–P90. "
    "No sustituye determinaciones oficiales del Atlas Nacional de Riesgos (CENAPRED / Protección Civil), decretos de Disponibilidad "
    "Media Anual (CONAGUA DOF), ni dictámenes de interconexión (CFE / CENACE) o manifestaciones de impacto ambiental (SEMARNAT)."
)

LEGAL_DISCLAIMER_TEXT_EN = (
    "VVUQ LEGAL NOTICE (ISO 23247-8): Exploratory territorial planning simulation with P10–P90 uncertainty bands. "
    "Does not replace official determinations from the National Risk Atlas (CENAPRED / Civil Protection), CONAGUA DOF "
    "Mean Annual Water Availability decrees, CFE / CENACE grid interconnection rulings, or SEMARNAT environmental permits."
)

_BAND_LOCK = threading.Lock()
_BAND_CACHE: dict[tuple[str, str, str, str], tuple[float, dict[str, Any]]] = {}
_BAND_TTL_SEC = 300.0


def build_vvuq_block(
    *,
    engine_family: str,
    calibration_dataset: str,
    validation_error_rmse_or_mape: dict[str, Any],
    p10_p50_p90_uncertainty_band: dict[str, Any],
    assumptions: list[str],
    legal_disclaimer: str | None = None,
    language: str = "es",
) -> dict[str, Any]:
    """Build canonical ISO 23247-8 / Destination Earth VVUQ metadata block."""
    default_disclaimer = LEGAL_DISCLAIMER_TEXT_EN if language == "en" else LEGAL_DISCLAIMER_TEXT
    return {
        "standard": "ISO 23247-8 / Destination Earth VVUQ",
        "engine_family": engine_family,
        "calibration_dataset": calibration_dataset,
        "validation_error_rmse_or_mape": validation_error_rmse_or_mape,
        "p10_p50_p90_uncertainty_band": p10_p50_p90_uncertainty_band,
        "assumptions": assumptions,
        "legal_disclaimer": legal_disclaimer or default_disclaimer,
        "backtest_report": "docs/VVUQ_BACKTEST_REPORT_2010_2023.md",
    }


def _clamp_lever(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(val)))


def compute_trajectory_vvuq(
    *,
    scope_id: str,
    scenario_name: str,
    levers: dict[str, Any],
    trajectory: list[dict[str, Any]],
    use_bigquery: bool,
    custom_levers_used: bool,
    language: str = "es",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Run parametric ensemble perturbation to enrich trajectory points with P10–P90 bands & build VVUQ metadata."""
    lang = "en" if str(language).strip().lower().startswith("en") else "es"
    cache_key = (scope_id, scenario_name, str(sorted(levers.items())), lang)
    if not custom_levers_used:
        now = time.monotonic()
        with _BAND_LOCK:
            cached = _BAND_CACHE.get(cache_key)
            if cached and (now - cached[0]) < _BAND_TTL_SEC:
                bands_by_year, vvuq_meta = cached[1]["by_year"], cached[1]["vvuq"]
                enriched = [{**pt, **bands_by_year.get(pt["year"], {})} for pt in trajectory]
                return enriched, vvuq_meta

    base_profile = load_territory_ontology_profile(scope_id, use_bigquery=use_bigquery)

    # Stress / Conservative bound (P10 outcome): +15% growth, -25% recharge / higher depletion, -15% execution
    prof_low = dict(base_profile)
    prof_low["annual_pop_growth"] = float(base_profile.get("annual_pop_growth", 1500.0)) * 1.15
    prof_low["depletion_rate_hm3_yr"] = float(base_profile.get("depletion_rate_hm3_yr", -0.45)) * 1.25
    levers_low = ScenarioLevers.model_validate(
        {
            **levers,
            "water_efficiency_target_pct": _clamp_lever(float(levers.get("water_efficiency_target_pct", 60)) * 0.88, 40.0, 90.0),
            "ptar_reuse_target_pct": _clamp_lever(float(levers.get("ptar_reuse_target_pct", 20)) * 0.85, 5.0, 90.0),
            "desalination_added_lps": _clamp_lever(float(levers.get("desalination_added_lps", 0)) * 0.85, 0.0, 800.0),
            "infill_share_pct": _clamp_lever(float(levers.get("infill_share_pct", 30)) * 0.85, 5.0, 95.0),
            "suds_coverage_pct": _clamp_lever(float(levers.get("suds_coverage_pct", 20)) * 0.85, 5.0, 98.0),
            "distributed_solar_share_pct": _clamp_lever(float(levers.get("distributed_solar_share_pct", 15)) * 0.85, 2.0, 85.0),
            "tourism_demand_multiplier": _clamp_lever(float(levers.get("tourism_demand_multiplier", 1.0)) * 1.12, 0.7, 2.2),
            "climate_recharge_shock_pct": _clamp_lever(float(levers.get("climate_recharge_shock_pct", 0.0)) - 6.0, -35.0, 10.0),
        }
    )

    # Favorable / High-Compliance bound (P90 outcome): -12% growth strain, +15% execution, gentler depletion
    prof_high = dict(base_profile)
    prof_high["annual_pop_growth"] = float(base_profile.get("annual_pop_growth", 1500.0)) * 0.88
    prof_high["depletion_rate_hm3_yr"] = float(base_profile.get("depletion_rate_hm3_yr", -0.45)) * 0.75
    levers_high = ScenarioLevers.model_validate(
        {
            **levers,
            "water_efficiency_target_pct": _clamp_lever(float(levers.get("water_efficiency_target_pct", 60)) * 1.10, 40.0, 90.0),
            "ptar_reuse_target_pct": _clamp_lever(float(levers.get("ptar_reuse_target_pct", 20)) * 1.15, 5.0, 92.0),
            "desalination_added_lps": _clamp_lever(float(levers.get("desalination_added_lps", 0)) * 1.15, 0.0, 900.0),
            "infill_share_pct": _clamp_lever(float(levers.get("infill_share_pct", 30)) * 1.12, 5.0, 95.0),
            "suds_coverage_pct": _clamp_lever(float(levers.get("suds_coverage_pct", 20)) * 1.12, 5.0, 98.0),
            "distributed_solar_share_pct": _clamp_lever(float(levers.get("distributed_solar_share_pct", 15)) * 1.15, 2.0, 85.0),
            "tourism_demand_multiplier": _clamp_lever(float(levers.get("tourism_demand_multiplier", 1.0)) * 0.90, 0.65, 2.2),
            "climate_recharge_shock_pct": _clamp_lever(float(levers.get("climate_recharge_shock_pct", 0.0)) + 4.0, -35.0, 12.0),
        }
    )

    sim_low = simulate_scenario(
        scope_id,
        scenario_name=scenario_name,
        custom_levers=levers_low,
        profile_override=prof_low,
        use_bigquery=False,
        persist_to_bq=False,
    )
    sim_high = simulate_scenario(
        scope_id,
        scenario_name=scenario_name,
        custom_levers=levers_high,
        profile_override=prof_high,
        use_bigquery=False,
        persist_to_bq=False,
    )

    low_map = {t["year"]: t for t in sim_low["trajectory"]}
    high_map = {t["year"]: t for t in sim_high["trajectory"]}

    bands_by_year: dict[int, dict[str, float]] = {}
    enriched: list[dict[str, Any]] = []
    for pt in trajectory:
        yr = pt["year"]
        lo = low_map.get(yr, pt)
        hi = high_map.get(yr, pt)

        sdi_p50 = float(pt["sdi_score_100"])
        sdi_lo = min(sdi_p50 - 0.8, float(lo["sdi_score_100"]), float(hi["sdi_score_100"]))
        sdi_hi = max(sdi_p50 + 0.8, float(lo["sdi_score_100"]), float(hi["sdi_score_100"]))
        sdi_lo = max(0.0, round(sdi_lo, 1))
        sdi_hi = min(100.0, round(sdi_hi, 1))

        aq_p50 = float(pt["aquifer_effective_balance_hm3_yr"])
        aq_spread = max(0.6, abs(aq_p50) * 0.14)
        aq_lo = round(min(aq_p50 - aq_spread, float(lo["aquifer_effective_balance_hm3_yr"]), float(hi["aquifer_effective_balance_hm3_yr"])), 2)
        aq_hi = round(max(aq_p50 + aq_spread, float(lo["aquifer_effective_balance_hm3_yr"]), float(hi["aquifer_effective_balance_hm3_yr"])), 2)

        sib_p50 = float(pt["sibcs_reserve_margin_pct"])
        sib_lo = round(min(sib_p50 - 1.5, float(lo["sibcs_reserve_margin_pct"]), float(hi["sibcs_reserve_margin_pct"])), 1)
        sib_hi = round(max(sib_p50 + 1.5, float(lo["sibcs_reserve_margin_pct"]), float(hi["sibcs_reserve_margin_pct"])), 1)

        band_fields = {
            "sdi_p10": sdi_lo,
            "sdi_p50": round(sdi_p50, 1),
            "sdi_p90": sdi_hi,
            "aquifer_p10": aq_lo,
            "aquifer_p50": round(aq_p50, 2),
            "aquifer_p90": aq_hi,
            "sibcs_margin_p10": sib_lo,
            "sibcs_margin_p50": round(sib_p50, 1),
            "sibcs_margin_p90": sib_hi,
        }
        bands_by_year[yr] = band_fields
        enriched.append({**pt, **band_fields})

    p2050 = enriched[-1]
    p10_50_90 = {
        "horizon_year": 2050,
        "sdi_score_100": {"p10": p2050["sdi_p10"], "p50": p2050["sdi_p50"], "p90": p2050["sdi_p90"]},
        "aquifer_effective_balance_hm3_yr": {
            "p10": p2050["aquifer_p10"],
            "p50": p2050["aquifer_p50"],
            "p90": p2050["aquifer_p90"],
        },
        "sibcs_reserve_margin_pct": {
            "p10": p2050["sibcs_margin_p10"],
            "p50": p2050["sibcs_margin_p50"],
            "p90": p2050["sibcs_margin_p90"],
        },
        "population_2050": {
            "p10": min(low_map.get(2050, p2050)["population"], high_map.get(2050, p2050)["population"]),
            "p50": p2050["population"],
            "p90": max(low_map.get(2050, p2050)["population"], high_map.get(2050, p2050)["population"]),
        },
    }

    vvuq_meta = build_vvuq_block(
        engine_family="BCS2050 Coupled Ontology v3 System-Dynamics Ensemble (3-member P10/P50/P90 perturbation)",
        calibration_dataset=(
            "INEGI Census 2000–2020 & Intercensal 2025 + CONAGUA DOF 2020–2023 (40 aquifers) + CENACE PRODESEN/SIBCS"
            if lang == "en"
            else "INEGI Censo 2000–2020 & Intercensal 2025 + CONAGUA DOF 2020–2023 (40 acuíferos) + CENACE PRODESEN/SIBCS"
        ),
        validation_error_rmse_or_mape={
            "demographic_2010_2020_mape_pct": HISTORICAL_VALIDATION_METRICS["demographic_2010_2020_municipal"]["mape_pct"],
            "demographic_2010_2020_rmse_hab": HISTORICAL_VALIDATION_METRICS["demographic_2010_2020_municipal"]["rmse_hab"],
            "demographic_2020_2025_ape_pct": HISTORICAL_VALIDATION_METRICS["demographic_2020_2025_state"]["ape_snapshot_levers_pct"],
            "aquifer_2020_2023_rmse_hm3": HISTORICAL_VALIDATION_METRICS["aquifer_2020_2023_conagua"]["all_40_zero_drift_rmse_hm3"],
            "aquifer_primary_5_rmse_hm3": HISTORICAL_VALIDATION_METRICS["aquifer_2020_2023_conagua"]["primary_5_modeled_rmse_hm3"],
        },
        p10_p50_p90_uncertainty_band=p10_50_90,
        assumptions=(
            [
                "2025–2050 demographics incorporate ±12%–15% parametric perturbation on tourism migration and municipal growth.",
                "Water balance propagates ±25% uncertainty on natural recharge and observed 2020–2023 CONAGUA aquifer depletion rates.",
                "Grid carrying capacity assumes phased SIBCS upgrades (+120 MW by 2031 and +120 MW by 2040) with ±15% distributed PV variance.",
            ]
            if lang == "en"
            else [
                "Demografía 2025–2050 incluye perturbación paramétrica ±12%–15% sobre migración turística y tasa de crecimiento municipal.",
                "Balance hídrico propaga incertidumbre ±25% en recarga natural y velocidad de abatimiento observada entre CONAGUA 2020 y 2023.",
                "Capacidad de carga eléctrica asume refuerzo SIBCS (+120 MW en 2031 y +120 MW adicionales en 2040) y varianza ±15% en despliegue fotovoltaico distribuido.",
            ]
        ),
        language=lang,
    )

    if not custom_levers_used:
        with _BAND_LOCK:
            _BAND_CACHE[cache_key] = (time.monotonic(), {"by_year": bands_by_year, "vvuq": vvuq_meta})
    return enriched, vvuq_meta
