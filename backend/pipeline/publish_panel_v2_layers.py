"""Generate 12 City Science, Foster RFI 2025 & Ontology v3.0 GeoJSON layers for panel.bcs2050.com.

Writes clean, popup-friendly GeoJSON files + `catalog_v2_extension.json` to
`bcs2050_digital_twin/data/panel_v2_release/` ready to upload to:
`gs://bcs2050-gis-published/baja_california_sur/digital_twin_v2/`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

TWIN_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = TWIN_ROOT.parent
if str(TWIN_ROOT) not in sys.path:
    sys.path.insert(0, str(TWIN_ROOT))
if str(WORKSPACE_ROOT / "bcs2050_intelligence") not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT / "bcs2050_intelligence"))

from backend.spatial_store import load_layer_geojson, load_summary  # noqa: E402
from ontology_engine.analyzer import analyze_territory_ontology  # noqa: E402
from ontology_engine.scenario_simulator import compare_canonical_scenarios  # noqa: E402

OUT_DIR = TWIN_ROOT / "data" / "panel_v2_release"
GCS_PREFIX = "gs://bcs2050-gis-published/baja_california_sur/digital_twin_v2"


def _write_fc(filename: str, features: list[dict[str, Any]]) -> int:
    fc = {"type": "FeatureCollection", "features": features}
    (OUT_DIR / filename).write_text(
        json.dumps(fc, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )
    return len(features)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary = load_summary()
    agebs_fc = load_layer_geojson("agebs")
    muns_fc = load_layer_geojson("municipalities")
    services_fc = load_layer_geojson("services")
    planned_fc = load_layer_geojson("planned_projects")
    subs_fc = load_layer_geojson("substations")
    plants_fc = load_layer_geojson("power_plants")
    stops_fc = load_layer_geojson("transit_stops")
    lines_fc = load_layer_geojson("transit_lines")
    waste_fc = load_layer_geojson("waste_sites")
    aquifers_fc = load_layer_geojson("aquifers")

    layers_meta: list[dict[str, Any]] = []

    def add_layer(
        *,
        layer_id: str,
        filename: str,
        title: str,
        category: str,
        subcategory: str,
        source_id: str,
        period: str,
        data_nature: str,
        description: str,
        color: str,
        popup_fields: list[str],
        feature_count: int,
        style_hint: dict[str, Any] | None = None,
    ) -> None:
        gcs_uri = f"{GCS_PREFIX}/{filename}"
        layers_meta.append(
            {
                "id": layer_id,
                "title": title,
                "category": category,
                "group": category,
                "subcategory": subcategory,
                "kind": "geojson",
                "url": gcs_uri,
                "path": gcs_uri,
                "sourceId": source_id,
                "reference_date": period,
                "period": period,
                "data_nature": data_nature,
                "description": description,
                "featureCount": feature_count,
                "popupFields": popup_fields,
                "color": color,
                "style_hint": style_hint or {"color": color},
                "defaultVisible": False,
                "license": "BCS2050 / INEGI / CONAGUA / SENER Datos Abiertos",
            }
        )

    # 1. City Science AGEBs 2025
    cs_feats = []
    for f in agebs_fc["features"]:
        p = f["properties"]
        cs_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "AGEB": p.get("cvegeo_ageb"),
                    "Municipio": p.get("municipality_name"),
                    "Índice City Science": p.get("city_science_index"),
                    "Ciudad 15-Min": p.get("city15_score"),
                    "Fractalidad": p.get("fractality_score"),
                    "Armonía": p.get("harmony_score"),
                    "Entropía Usos": p.get("landuse_entropy_score"),
                    "Población EIC 2025": round(float(p.get("pobtot_2025_eic_calibrated") or 0), 0),
                    "Edificios 3D": p.get("buildings_3d_count"),
                    "Infill 2050 (viv)": p.get("infill_homes_potential"),
                    "Solar Techos (MW)": p.get("solar_mw"),
                },
            }
        )
    cnt1 = _write_fc("bcs_city_science_agebs_2025.geojson", cs_feats)
    add_layer(
        layer_id="bcs_city_science_agebs_2025",
        filename="bcs_city_science_agebs_2025.geojson",
        title="Índice City Science & Ciudad 15-Min (AGEB 2025)",
        category="urban",
        subcategory="City Science (Benchmark Aretian)",
        source_id="bcs2050_city_science",
        period="EIC 2025 + OpenBuildings 2.5D",
        data_nature="official_inventory",
        description="1,155 AGEBs evaluadas con metodología Aretian: Ciudad 15-Min, Fractalidad morfológica, Armonía, Entropía y capacidad infill sobre 396,823 edificios 3D.",
        color="#10b981",
        popup_fields=["AGEB", "Municipio", "Índice City Science", "Ciudad 15-Min", "Fractalidad", "Población EIC 2025", "Edificios 3D", "Infill 2050 (viv)"],
        feature_count=cnt1,
    )

    # 2. Infill Housing 2050
    infill_feats = []
    for f in agebs_fc["features"]:
        p = f["properties"]
        if (p.get("infill_homes_potential") or 0) > 0:
            infill_feats.append(
                {
                    "type": "Feature",
                    "geometry": f["geometry"],
                    "properties": {
                        "AGEB": p.get("cvegeo_ageb"),
                        "Municipio": p.get("municipality_name"),
                        "Zonificación Dominante": p.get("dominant_zoning"),
                        "Capacidad Infill 2050 (viv)": p.get("infill_homes_potential"),
                        "GFA Construida (m2)": p.get("built_gfa_m2"),
                        "GFA Normativa (m2)": p.get("allowable_gfa_m2"),
                        "Ciudad 15-Min": p.get("city15_score"),
                        "En ANP": "Sí" if p.get("in_anp") else "No",
                    },
                }
            )
    cnt2 = _write_fc("bcs_infill_housing_2050.geojson", infill_feats)
    add_layer(
        layer_id="bcs_infill_housing_2050",
        filename="bcs_infill_housing_2050.geojson",
        title="Capacidad Vivienda Intraurbana Infill 2050 (5 Municipios)",
        category="housing",
        subcategory="Suelo y Vivienda 2050",
        source_id="bcs2050_zoning_79k",
        period="PDU / PMDU 2024–2031 + EIC 2025",
        data_nature="official_projection",
        description="Potencial de redensificación (+776,913 viviendas estatales) calculado sobre 79,515 polígonos de zonificación CUS/COS en los 5 municipios.",
        color="#38bdf8",
        popup_fields=["AGEB", "Municipio", "Zonificación Dominante", "Capacidad Infill 2050 (viv)", "Ciudad 15-Min", "En ANP"],
        feature_count=cnt2,
    )

    # 3. Rooftop Solar 3D MW
    solar_feats = []
    for f in agebs_fc["features"]:
        p = f["properties"]
        if float(p.get("solar_mw") or 0) > 0.2:
            solar_feats.append(
                {
                    "type": "Feature",
                    "geometry": f["geometry"],
                    "properties": {
                        "AGEB": p.get("cvegeo_ageb"),
                        "Municipio": p.get("municipality_name"),
                        "Edificios 3D": p.get("buildings_3d_count"),
                        "Potencial Solar (MW)": p.get("solar_mw"),
                        "Generación Estimada (GWh/año)": p.get("solar_gwh_yr"),
                        "Distancia Subestación SIBCS (km)": p.get("dist_substation_km"),
                    },
                }
            )
    cnt3 = _write_fc("bcs_rooftop_solar_3d_mw.geojson", solar_feats)
    add_layer(
        layer_id="bcs_rooftop_solar_3d_mw",
        filename="bcs_rooftop_solar_3d_mw.geojson",
        title="Potencial Solar Fotovoltaico en Techos 3D (3,896 MW)",
        category="infrastructure",
        subcategory="Transición Energética SIBCS",
        source_id="bcs2050_city_science",
        period="2026 (2,150 kWh/m2/año)",
        data_nature="model_reanalysis",
        description="Capacidad técnica fotovoltaica en cubiertas reales de 396,823 edificios 3D para aliviar carga pico de la red aislada SIBCS.",
        color="#facc15",
        popup_fields=["AGEB", "Municipio", "Edificios 3D", "Potencial Solar (MW)", "Generación Estimada (GWh/año)", "Distancia Subestación SIBCS (km)"],
        feature_count=cnt3,
    )

    # 4. Coastal Surge Risk <6m
    surge_feats = []
    for f in agebs_fc["features"]:
        p = f["properties"]
        if int(p.get("surge_exposed_buildings") or 0) > 0:
            surge_feats.append(
                {
                    "type": "Feature",
                    "geometry": f["geometry"],
                    "properties": {
                        "AGEB": p.get("cvegeo_ageb"),
                        "Municipio": p.get("municipality_name"),
                        "Edificios <6 msnm": p.get("surge_exposed_buildings"),
                        "% Expuesto": p.get("surge_exposed_pct"),
                        "Población EIC 2025": round(float(p.get("pobtot_2025_eic_calibrated") or 0), 0),
                        "Política POERBCS": p.get("environmental_policy"),
                    },
                }
            )
    cnt4 = _write_fc("bcs_coastal_surge_risk_6m.geojson", surge_feats)
    add_layer(
        layer_id="bcs_coastal_surge_risk_6m",
        filename="bcs_coastal_surge_risk_6m.geojson",
        title="Exposición Ciclónica y Marea de Tormenta (<6 msnm)",
        category="climate",
        subcategory="Resiliencia Costera IPCC AR6",
        source_id="bcs2050_dem_30m",
        period="GLO-30 + IPCC AR6 SSP5-8.5",
        data_nature="model_reanalysis",
        description="24,209 edificaciones ubicadas bajo cota +6.0 msnm frente a marea de tormenta ciclónica y aumento del nivel del mar 2050.",
        color="#ef4444",
        popup_fields=["AGEB", "Municipio", "Edificios <6 msnm", "% Expuesto", "Población EIC 2025", "Política POERBCS"],
        feature_count=cnt4,
    )

    # 5. Ontology v3.0 2050 Scenarios per Municipality
    ont_feats = []
    for f in muns_fc["features"]:
        p = f["properties"]
        mcode = str(p.get("municipality_code") or p.get("cvegeo") or "")
        comp = compare_canonical_scenarios(mcode, use_bigquery=False, persist_to_bq=False)
        anl = analyze_territory_ontology(mcode, use_bigquery=False)
        bau = comp["scenarios"]["BAU_TENDENCIAL"]
        cmp_sc = comp["scenarios"]["COMPACT_SUSTAINABLE_2050"]
        delta = comp["compact_vs_bau_2050_delta"]
        ont_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Clave": mcode,
                    "Municipio": p.get("nomgeo"),
                    "Población EIC 2025": p.get("population_2025"),
                    "SDI-100 Actual": anl["sdi_100"]["sdi_score_100"],
                    "SDI-100 BAU 2050": bau["sdi_score_2050"],
                    "SDI-100 Compacta 2050": cmp_sc["sdi_score_2050"],
                    "Ganancia SDI (pts)": delta["sdi_gain_points"],
                    "Alivio Acuífero (hm3/año)": delta["aquifer_relief_hm3_yr"],
                    "Suelo Ahorrado (ha)": delta["sprawl_land_saved_ha"],
                    "Año Ruptura BAU": bau["carrying_capacity_breach_year"] or "Sin ruptura",
                    "Capacidad Carga Actual": anl["carrying_capacity"]["overall_status"],
                },
            }
        )
    cnt5 = _write_fc("bcs_ontology_v3_scenarios_2050.geojson", ont_feats)
    add_layer(
        layer_id="bcs_ontology_v3_scenarios_2050",
        filename="bcs_ontology_v3_scenarios_2050.geojson",
        title="Escenarios Contrafactuales 2050 · Ontología v3 (SDI-100)",
        category="urban",
        subcategory="Ontología v3 & Simulador 2050",
        source_id="bcs2050_ontology_v3",
        period="Horizonte 2025–2050",
        data_nature="official_projection",
        description="Comparativa municipal determinista BAU Tendencial vs. Compacta 15-Min 2050: puntaje SDI-100, alivio hídrico hm³/año y hectáreas de expansión evitadas.",
        color="#a855f7",
        popup_fields=["Municipio", "Población EIC 2025", "SDI-100 Actual", "SDI-100 BAU 2050", "SDI-100 Compacta 2050", "Alivio Acuífero (hm3/año)", "Suelo Ahorrado (ha)", "Año Ruptura BAU"],
        feature_count=cnt5,
    )

    # 6. Essential Services 3,510
    srv_feats = []
    for f in services_fc["features"]:
        p = f["properties"]
        srv_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Nombre": p.get("facility_name"),
                    "Sector": p.get("sector"),
                    "Categoría": p.get("category"),
                    "Localidad": p.get("localidad_name"),
                    "Camas / Alumnos": p.get("capacity_value"),
                    "Unidad": p.get("capacity_unit"),
                },
            }
        )
    cnt6 = _write_fc("bcs_essential_services_3510.geojson", srv_feats)
    add_layer(
        layer_id="bcs_essential_services_3510",
        filename="bcs_essential_services_3510.geojson",
        title="Equipamiento Esencial Calibrado (Salud, Educación, Cívico)",
        category="urban",
        subcategory="City Science (Benchmark Aretian)",
        source_id="inegi_denue_ssbcs",
        period="DENUE 2025 + SSBCS + EIC 2025",
        data_nature="official_inventory",
        description="3,510 equipamientos georreferenciados con capacidad hospitalaria y matrícula escolar calibrada.",
        color="#14b8a6",
        popup_fields=["Nombre", "Sector", "Localidad", "Camas / Alumnos", "Unidad"],
        feature_count=cnt6,
        style_hint={"type": "circle", "color": "#14b8a6"},
    )

    # 7. Planned Desal & Energy Projects
    pl_feats = []
    for f in planned_fc["features"]:
        p = f["properties"]
        pl_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Proyecto": p.get("project_name"),
                    "Categoría": p.get("category"),
                    "Zona": p.get("municipality_or_zone"),
                    "Capacidad": f"{p.get('capacity_value', '')} {p.get('capacity_unit', '')}".strip(),
                    "Estatus 2025-2026": p.get("status_2025_2026"),
                    "Año COD": p.get("target_cod_year"),
                    "Fuente": p.get("source_reference"),
                },
            }
        )
    cnt7 = _write_fc("bcs_planned_desal_energy_2035.geojson", pl_feats)
    add_layer(
        layer_id="bcs_planned_desal_energy_2035",
        filename="bcs_planned_desal_energy_2035.geojson",
        title="Proyectos Estratégicos Energía, Desalación e H2 (2025–2035)",
        category="infrastructure",
        subcategory="Infraestructura Estratégica",
        source_id="sener_cenace_pladese",
        period="PLADESE 2025–2039 / PAMRNT",
        data_nature="official_projection",
        description="9 nodos de generación limpia, almacenamiento BESS, hidrógeno y plantas desaladoras (incluye APP Los Cabos 250 lps).",
        color="#d946ef",
        popup_fields=["Proyecto", "Categoría", "Zona", "Capacidad", "Estatus 2025-2026", "Año COD"],
        feature_count=cnt7,
        style_hint={"type": "circle", "color": "#d946ef"},
    )

    # 8. SIBCS Grid Substations & Plants combined
    grid_feats = []
    for f in subs_fc["features"]:
        p = f["properties"]
        grid_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Tipo": "Subestación SIBCS",
                    "Nombre": p.get("name") or "Subestación",
                    "Operador": p.get("operator") or "CFE",
                    "Voltaje / Capacidad": p.get("voltage") or "N/D",
                },
            }
        )
    for f in plants_fc["features"]:
        p = f["properties"]
        grid_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Tipo": "Central Eléctrica",
                    "Nombre": p.get("name") or "Central",
                    "Operador": p.get("operator") or "CFE/IPP",
                    "Voltaje / Capacidad": f"{p.get('capacity', 'N/D')} ({p.get('plant_source', '')})",
                },
            }
        )
    cnt8 = _write_fc("bcs_sibcs_grid_substations.geojson", grid_feats)
    add_layer(
        layer_id="bcs_sibcs_grid_substations",
        filename="bcs_sibcs_grid_substations.geojson",
        title="Nodos Críticos Red Eléctrica Aislada SIBCS / SIMUL",
        category="infrastructure",
        subcategory="Transición Energética SIBCS",
        source_id="sener_atlas_sen",
        period="2025–2026",
        data_nature="official_inventory",
        description="48 subestaciones y centrales de generación que sostienen el sistema eléctrico aislado de Baja California Sur.",
        color="#f59e0b",
        popup_fields=["Tipo", "Nombre", "Operador", "Voltaje / Capacidad"],
        feature_count=cnt8,
        style_hint={"type": "circle", "color": "#f59e0b"},
    )

    # 9. Public Transit Corridors & Stops
    tr_feats = []
    for f in lines_fc["features"]:
        p = f["properties"]
        tr_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Tipo": "Corredor Troncal",
                    "Nombre": p.get("route_name"),
                    "Ciudad": p.get("city_name"),
                    "Modo": p.get("mode"),
                },
            }
        )
    for f in stops_fc["features"]:
        p = f["properties"]
        tr_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Tipo": p.get("stop_type") or "Parada",
                    "Nombre": p.get("name") or "Nodo Transporte",
                    "Ciudad": p.get("city_name"),
                    "Modo": p.get("mode"),
                },
            }
        )
    cnt9 = _write_fc("bcs_transit_corridors_stops.geojson", tr_feats)
    add_layer(
        layer_id="bcs_transit_corridors_stops",
        filename="bcs_transit_corridors_stops.geojson",
        title="Red y Paradas de Transporte Público Integrado (BCS)",
        category="mobility",
        subcategory="Movilidad Sostenible",
        source_id="osm_inegi_transit",
        period="2025–2026",
        data_nature="observation",
        description="115 terminales/paradas y 7 corredores troncales base para análisis multimodal de Ciudad 15-Minutos.",
        color="#818cf8",
        popup_fields=["Tipo", "Nombre", "Ciudad", "Modo"],
        feature_count=cnt9,
    )

    # 10. Municipal Climate IPCC 2050
    clim_feats = []
    for f in muns_fc["features"]:
        p = f["properties"]
        clim_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Municipio": p.get("nomgeo"),
                    "SLR 2050 SSP2-4.5 (m)": p.get("ipcc_ar6_slr_2050_ssp245_m"),
                    "SLR 2050 SSP5-8.5 (m)": p.get("ipcc_ar6_slr_2050_ssp585_m"),
                    "SLR 2100 SSP5-8.5 (m)": p.get("ipcc_ar6_slr_2100_ssp585_m"),
                    "Sitios Erosión Costera": p.get("coastal_erosion_sites"),
                    "Manglar Amortiguador (ha)": p.get("mangrove_buffer_ha"),
                    "Red Escorrentía (km)": p.get("runoff_network_km"),
                },
            }
        )
    cnt10 = _write_fc("bcs_municipal_climate_ipcc_2050.geojson", clim_feats)
    add_layer(
        layer_id="bcs_municipal_climate_ipcc_2050",
        filename="bcs_municipal_climate_ipcc_2050.geojson",
        title="Escenarios Climáticos IPCC AR6 y Manglares por Municipio",
        category="climate",
        subcategory="Resiliencia Costera IPCC AR6",
        source_id="ipcc_inecc_bcs",
        period="2025–2100 (AR6)",
        data_nature="official_projection",
        description="Proyección de elevación del nivel del mar (SSP2-4.5 y SSP5-8.5), sitios de erosión costera y hectáreas de manglar protector.",
        color="#06b6d4",
        popup_fields=["Municipio", "SLR 2050 SSP5-8.5 (m)", "SLR 2100 SSP5-8.5 (m)", "Sitios Erosión Costera", "Manglar Amortiguador (ha)"],
        feature_count=cnt10,
    )

    # 11. Waste & Circular Economy 2026
    wst_feats = []
    for f in waste_fc["features"]:
        p = f["properties"]
        wst_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Instalación": p.get("facility_or_project_name"),
                    "Tipo": p.get("facility_type"),
                    "Municipio": p.get("municipality_name"),
                    "Capacidad (ton/día)": p.get("capacity_or_throughput_tpd"),
                    "Estatus": p.get("project_status"),
                },
            }
        )
    cnt11 = _write_fc("bcs_waste_circular_economy_2026.geojson", wst_feats)
    add_layer(
        layer_id="bcs_waste_circular_economy_2026",
        filename="bcs_waste_circular_economy_2026.geojson",
        title="Rellenos Sanitarios y Economía Circular (Ley RSU BCS 2026)",
        category="infrastructure",
        subcategory="Economía Circular y Residuos",
        source_id="bcs_residuos_2026",
        period="BOGE BCS Feb 2026",
        data_nature="official_inventory",
        description="11 sitios existentes y proyectados de disposición final, valorización MRF y compostaje alineados a la Ley de Economía Circular 2026.",
        color="#84cc16",
        popup_fields=["Instalación", "Tipo", "Municipio", "Capacidad (ton/día)", "Estatus"],
        feature_count=cnt11,
        style_hint={"type": "circle", "color": "#84cc16"},
    )

    # 12. Enriched CONAGUA Aquifers 2020 vs 2023
    aq_feats = []
    for f in aquifers_fc["features"]:
        p = f["properties"]
        dma20 = float(p.get("dma_2020_hm3") or 0)
        dma23 = float(p.get("dma_2023_hm3") or 0)
        aq_feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "Código": p.get("aquifer_code"),
                    "Acuífero": p.get("aquifer_name"),
                    "Recarga (hm3/año)": p.get("recarga_hm3"),
                    "DMA 2020 (hm3/año)": round(dma20, 2),
                    "DMA 2023 (hm3/año)": round(dma23, 2),
                    "Tendencia 20-23": round(dma23 - dma20, 2),
                    "Explotación (%)": p.get("exploitation_ratio_pct"),
                    "Intrusión Marina": p.get("seawater_intrusion_risk"),
                    "Veda": p.get("veda_status"),
                },
            }
        )
    cnt12 = _write_fc("bcs_aquifers_2023_enriched.geojson", aq_feats)
    add_layer(
        layer_id="bcs_aquifers_2023_enriched",
        filename="bcs_aquifers_2023_enriched.geojson",
        title="Acuíferos CONAGUA · Evolución DMA 2020→2023 e Intrusión Marina",
        category="aquifers",
        subcategory="Metabolismo Hídrico",
        source_id="conagua_dma_2023",
        period="DOF 2020 vs 2023-11-09",
        data_nature="official_inventory",
        description="40 acuíferos oficiales de BCS con variación interanual de disponibilidad media anual, razón de explotación e intrusión salina.",
        color="#0ea5e9",
        popup_fields=["Código", "Acuífero", "DMA 2020 (hm3/año)", "DMA 2023 (hm3/año)", "Tendencia 20-23", "Explotación (%)", "Intrusión Marina"],
        feature_count=cnt12,
    )

    catalog_ext = {
        "schemaVersion": 2,
        "updated_at": summary["generated_at"],
        "sources": {
            "bcs2050_city_science": {
                "title": "BCS2050 City Science Engine (Aretian Benchmark)",
                "agency": "BCS2050 / INEGI EIC 2025 / Google Open Buildings 2.5D",
                "url": "https://bcs2050.com",
            },
            "bcs2050_zoning_79k": {
                "title": "Zonificación Municipal Armonizada 5 Municipios (79,515 polígonos)",
                "agency": "IMPLAN La Paz / Los Cabos / Loreto / Comondú / Mulegé",
                "url": "https://bcs2050.com",
            },
            "bcs2050_ontology_v3": {
                "title": "BCS2050 Ontología Operativa v3.0 & Simulador 2050",
                "agency": "BigQuery Graph bcs2050_kg_v3",
                "url": "https://bcs2050.com",
            },
            "bcs2050_dem_30m": {
                "title": "Copernicus GLO-30 DEM + IPCC AR6",
                "agency": "ESA Copernicus / IPCC",
                "url": "https://spacedata.copernicus.eu/",
            },
            "inegi_denue_ssbcs": {
                "title": "DENUE 2025 + CLUES SSBCS + EIC 2025",
                "agency": "INEGI / Secretaría de Salud BCS",
                "url": "https://www.inegi.org.mx/app/mapa/denue/",
            },
            "sener_cenace_pladese": {
                "title": "PLADESE 2025–2039 & PAMRNT CENACE",
                "agency": "SENER / CENACE",
                "url": "https://www.gob.mx/sener",
            },
            "sener_atlas_sen": {
                "title": "Atlas Eléctrico SEN / SIBCS",
                "agency": "SENER / CFE / OSM",
                "url": "https://www.gob.mx/sener",
            },
            "osm_inegi_transit": {
                "title": "Red de Transporte Público BCS",
                "agency": "OpenStreetMap / INEGI 03sip",
                "url": "https://www.openstreetmap.org",
            },
            "ipcc_inecc_bcs": {
                "title": "IPCC AR6 & PEACC Baja California Sur",
                "agency": "IPCC / INECC / Gobierno BCS",
                "url": "https://www.ipcc.ch/",
            },
            "bcs_residuos_2026": {
                "title": "Ley de Residuos y Economía Circular BCS 2026",
                "agency": "BOGE BCS / Ayuntamientos",
                "url": "https://www.bcs.gob.mx/",
            },
            "conagua_dma_2023": {
                "title": "CONAGUA Disponibilidad Media Anual Acuíferos",
                "agency": "CONAGUA DOF 2023-11-09",
                "url": "https://sigagis.conagua.gob.mx/",
            },
        },
        "layers": layers_meta,
    }
    (OUT_DIR / "catalog_v2_extension.json").write_text(
        json.dumps(catalog_ext, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )
    print(f"Generated {len(layers_meta)} panel v2 layers in {OUT_DIR}")


if __name__ == "__main__":
    main()
