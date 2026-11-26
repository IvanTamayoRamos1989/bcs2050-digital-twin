"""Aino.world-style Natural Language Prompt-to-Map Spatial Engine for BCS2050 Digital Twin.

Translates plain-English and plain-Spanish spatial questions into executable map visualizations:
filtered GeoJSON highlight overlays, automated layer toggles, 3D metric selection, camera framing,
dynamic map legends, and factual summary context grounded in the active geospatial store.
"""

from __future__ import annotations

import json
import math
from typing import Any

from shapely.geometry import mapping, shape

from backend.live_feeds import get_live_telemetry_summary
from backend.spatial_store import load_layer_geojson

MAX_HIGHLIGHT_BYTES = 320 * 1024

GEO_FOCUS_MAP: list[tuple[tuple[str, ...], str, str, dict[str, Any]]] = [
    (
        ("cabo san lucas", "cabo", "cabos", "los cabos", "el tezal", "tezal", "san lucas"),
        "03008",
        "Los Cabos",
        {"lon": -109.9167, "lat": 22.905, "zoom": 11.4, "pitch": 48.0, "bearing": -12.0},
    ),
    (
        ("san jose del cabo", "san josé del cabo", "san jose", "san josé"),
        "03008",
        "San José del Cabo",
        {"lon": -109.698, "lat": 23.062, "zoom": 11.6, "pitch": 48.0, "bearing": -14.0},
    ),
    (
        ("todos santos",),
        "03003",
        "Todos Santos",
        {"lon": -110.226, "lat": 23.449, "zoom": 12.2, "pitch": 46.0, "bearing": -10.0},
    ),
    (
        ("sierra de la laguna", "sierra laguna", "la laguna"),
        "03003",
        "Sierra de la Laguna",
        {"lon": -109.96, "lat": 23.55, "zoom": 10.2, "pitch": 58.0, "bearing": -18.0},
    ),
    (
        ("la paz", "lapaz", "malecon", "malecón", "tandeo"),
        "03003",
        "La Paz",
        {"lon": -110.3128, "lat": 24.1426, "zoom": 11.4, "pitch": 48.0, "bearing": -15.0},
    ),
    (
        ("loreto", "bahia de loreto", "bahía de loreto"),
        "03009",
        "Loreto",
        {"lon": -111.3489, "lat": 26.0127, "zoom": 11.4, "pitch": 48.0, "bearing": -12.0},
    ),
    (
        ("comondu", "comondú", "ciudad constitucion", "ciudad constitución", "santo domingo"),
        "03001",
        "Comondú",
        {"lon": -111.6703, "lat": 25.0322, "zoom": 10.6, "pitch": 45.0, "bearing": -8.0},
    ),
    (
        ("mulege", "mulegé", "santa rosalia", "santa rosalía", "guerrero negro", "vizcaino", "vizcaíno"),
        "03002",
        "Mulegé",
        {"lon": -112.2676, "lat": 27.3396, "zoom": 9.8, "pitch": 46.0, "bearing": -10.0},
    ),
]

MUN_BBOXES: dict[str, tuple[float, float, float, float]] = {
    "03008": (-110.25, 22.80, -109.40, 23.70),
    "03003": (-111.20, 23.25, -109.65, 25.10),
    "03009": (-111.75, 25.45, -111.00, 26.55),
    "03001": (-112.60, 24.25, -110.80, 26.50),
    "03002": (-115.25, 26.30, -111.50, 28.20),
}

DEFAULT_STATE_CAM = {"lon": -111.45, "lat": 25.10, "zoom": 6.6, "pitch": 45.0, "bearing": -12.0}


def _detect_geo_focus(q_low: str, scope_id: str) -> tuple[str | None, str | None, dict[str, Any] | None]:
    for keywords, mcode, label, cam in GEO_FOCUS_MAP:
        if any(k in q_low for k in keywords):
            return mcode, label, cam
    if scope_id in MUN_BBOXES:
        fallback_cams = {m: c for _, m, _, c in GEO_FOCUS_MAP if m == scope_id}
        return scope_id, None, fallback_cams.get(scope_id)
    return None, None, None


def _compute_camera_from_features(
    features: list[dict[str, Any]],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    minx, miny, maxx, maxy = float("inf"), float("inf"), float("-inf"), float("-inf")
    for feat in features:
        try:
            b = shape(feat["geometry"]).bounds
            minx = min(minx, b[0])
            miny = min(miny, b[1])
            maxx = max(maxx, b[2])
            maxy = max(maxy, b[3])
        except Exception:
            continue
    if not all(math.isfinite(v) for v in (minx, miny, maxx, maxy)):
        return dict(fallback)
    span = max(abs(maxx - minx), abs(maxy - miny), 0.04)
    if span > 4.2:
        zoom = 6.5
    elif span > 2.2:
        zoom = 7.4
    elif span > 1.0:
        zoom = 8.6
    elif span > 0.35:
        zoom = 10.2
    elif span > 0.12:
        zoom = 11.6
    else:
        zoom = 12.6
    return {
        "lon": round((minx + maxx) * 0.5, 4),
        "lat": round((miny + maxy) * 0.5, 4),
        "zoom": zoom,
        "pitch": 46.0,
        "bearing": -12.0,
    }


def _in_bbox(feat: dict[str, Any], bbox: tuple[float, float, float, float]) -> bool:
    try:
        b = shape(feat["geometry"]).bounds
        return not (b[2] < bbox[0] or b[0] > bbox[2] or b[3] < bbox[1] or b[1] > bbox[3])
    except Exception:
        return False


def _fit_geojson_size(features: list[dict[str, Any]], max_bytes: int = MAX_HIGHLIGHT_BYTES) -> dict[str, Any]:
    """Ensure highlight GeoJSON stays snappy for inline chat JSON responses."""
    fc = {"type": "FeatureCollection", "features": features}
    raw = json.dumps(fc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(raw) <= max_bytes:
        return fc

    for tol in (0.0012, 0.003, 0.006):
        shrunk: list[dict[str, Any]] = []
        for f in features:
            try:
                g = shape(f["geometry"]).simplify(tol, preserve_topology=True)
                if g.is_empty:
                    g = shape(f["geometry"])
                shrunk.append({"type": "Feature", "geometry": mapping(g), "properties": f.get("properties") or {}})
            except Exception:
                shrunk.append(f)
        cand = {"type": "FeatureCollection", "features": shrunk}
        if len(json.dumps(cand, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) <= max_bytes:
            return cand

    # Final cap safeguard
    return {"type": "FeatureCollection", "features": shrunk[:120]}


def _tag_feat(
    feat: dict[str, Any],
    *,
    fill: list[int],
    line: list[int],
    title: str,
    detail: str,
) -> dict[str, Any]:
    props = dict(feat.get("properties") or {})
    props["_ai_color"] = fill
    props["_ai_line_color"] = line
    props["_ai_title"] = title
    props["_ai_detail"] = detail
    return {"type": "Feature", "geometry": feat["geometry"], "properties": props}


def resolve_spatial_map_action(
    *,
    query: str,
    scope_id: str = "03",
    language: str = "en",
) -> dict[str, Any] | None:
    """Resolve an Aino.world-style spatial prompt into executable map layers, highlights & camera."""
    q_low = (query or "").strip().lower()
    if not q_low:
        return None
    is_en = str(language).strip().lower().startswith("en")
    muni_code, muni_label, muni_cam = _detect_geo_focus(q_low, scope_id)

    # 0. Reset / Clear map filter
    if any(p in q_low for p in ("reset map", "clear filter", "clear map", "clear highlight", "limpiar mapa", "restablecer mapa", "quitar filtro")):
        return {
            "intent": "reset_map",
            "title": "Map Filters Cleared" if is_en else "Filtros Limpios",
            "subtitle": "Default Digital Twin state restored" if is_en else "Vista base del Gemelo Digital restablecida",
            "matched_count": 0,
            "clear_highlight": True,
            "fly_to": DEFAULT_STATE_CAM,
            "analysis_context": {"action": "cleared_active_spatial_highlights"},
        }

    # 1. Protected Land / Conservation / ANPs / POER
    if any(p in q_low for p in (
        "protected", "protection", "conservation", "anp", "poer", "national park", "biosphere",
        "naturaleza", "protegid", "áreas naturales", "areas naturales", "conservacion", "conservación", "reserva de la biosfera"
    )):
        anps_fc = load_layer_geojson("anps")
        feats = anps_fc.get("features") or []
        if muni_code and muni_code in MUN_BBOXES:
            scoped = [f for f in feats if _in_bbox(f, MUN_BBOXES[muni_code])]
            if scoped:
                feats = scoped

        tagged: list[dict[str, Any]] = []
        total_ha = 0.0
        top_items: list[dict[str, Any]] = []
        for f in feats:
            p = f.get("properties") or {}
            area_ha = float(p.get("area_ha") or 0.0)
            total_ha += area_ha
            cls = str(p.get("area_class") or "")
            is_vol = "ADVC" in cls or "VOLUNTARY" in cls.upper()
            fill = [52, 211, 153, 145] if is_vol else [16, 185, 129, 155]
            line = [6, 95, 70, 235]
            name = str(p.get("area_name") or "Protected Area")
            cat = str(p.get("cat_manejo") or cls or "CONANP ANP")
            tagged.append(_tag_feat(f, fill=fill, line=line, title=name, detail=f"{cat} · {area_ha:,.0f} ha"))
            top_items.append({"name": name, "category": cat, "area_ha": round(area_ha, 1)})

        top_items.sort(key=lambda x: -x["area_ha"])
        cam = _compute_camera_from_features(tagged, muni_cam or DEFAULT_STATE_CAM)
        return {
            "intent": "protected_land",
            "title": "Protected Land & Conservation Areas" if is_en else "Áreas Naturales Protegidas y POER",
            "subtitle": f"{len(tagged)} CONANP ANPs · {round(total_ha):,} ha" + (f" · {muni_label}" if muni_label else ""),
            "matched_count": len(tagged),
            "layers_to_enable": ["anps", "poer", "coastalEcosystems"],
            "layers_to_disable": ["aquifers", "hazardAtlas", "landTenure"],
            "fly_to": cam,
            "legend": [
                {"label": "CONANP Federal Reserves / Parks" if is_en else "ANPs Federales CONANP", "color": "#10B981"},
                {"label": "Voluntary Conservation (ADVC)" if is_en else "Conservación Voluntaria (ADVC)", "color": "#34D399"},
                {"label": "POERBCS Ecological UGAs" if is_en else "UGAs Ecológicas POERBCS", "color": "#84CC16"},
            ],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {
                "matched_protected_polygons": len(tagged),
                "total_area_ha": round(total_ha, 1),
                "largest_protected_areas": top_items[:8],
                "layers_activated": ["anps (76)", "poer_ugas (1,990)", "coastal_ecosystems (955)"],
            },
        }

    # 2. Water-Stressed Areas / Aquifer Deficit / Tandeo / Rationing
    if any(p in q_low for p in (
        "water stress", "water stressed", "water deficit", "aquifer", "tandeo", "rationing",
        "scarcity", "overexploited", "agua", "estrés hídrico", "estres hidrico", "déficit hídrico",
        "deficit hidrico", "escasez", "acuífero", "acuifero", "sequía", "sequia", "morada", "desal"
    )):
        aq_fc = load_layer_geojson("aquifers")
        feats = aq_fc.get("features") or []
        stressed: list[dict[str, Any]] = []
        top_items: list[dict[str, Any]] = []
        total_deficit = 0.0
        for f in feats:
            p = f.get("properties") or {}
            dma = float(p.get("dma_2023_hm3") or 0.0)
            if dma <= 0.0:
                total_deficit += min(0.0, dma)
                is_critical = dma < -5.0
                fill = [220, 38, 38, 175] if is_critical else [245, 158, 11, 160]
                line = [255, 255, 255, 235] if is_critical else [120, 53, 15, 220]
                code = str(p.get("aquifer_code") or "")
                name = str(p.get("aquifer_name") or "Aquifer")
                exp_pct = p.get("exploitation_ratio_pct")
                detail = f"DMA 2023: {dma:+.3f} hm³/yr" + (f" · Exploit: {exp_pct}%" if exp_pct is not None else "")
                stressed.append(_tag_feat(f, fill=fill, line=line, title=f"Aquifer {code} · {name}", detail=detail))
                top_items.append({"code": code, "name": name, "dma_2023_hm3": round(dma, 3), "veda": p.get("veda_status")})

        top_items.sort(key=lambda x: x["dma_2023_hm3"])
        cam = muni_cam or DEFAULT_STATE_CAM
        return {
            "intent": "water_stress",
            "title": "Water-Stressed Aquifers & Rationing" if is_en else "Zonas con Estrés Hídrico (CONAGUA)",
            "subtitle": f"{len(stressed)}/40 no-surplus aquifers · Tandeo + Purple-Line active",
            "matched_count": len(stressed),
            "layers_to_enable": ["aquifers", "tandeo", "waterNetworkLc"],
            "layers_to_disable": ["anps", "poer", "hazardAtlas", "landTenure"],
            "active_challenge": "water_energy_climate",
            "active_metric": "carrying_resilience_score",
            "fly_to": cam,
            "legend": [
                {"label": "Severe Deficit (< -5 hm³/yr)" if is_en else "Déficit Severo (< -5 hm³/año)", "color": "#DC2626"},
                {"label": "Deficit / Zero Surplus (<= 0 hm³)" if is_en else "Déficit / Sin Disponibilidad", "color": "#F59E0B"},
                {"label": "La Paz Tandeo Sectors (280)" if is_en else "Sectores Tandeo La Paz (280)", "color": "#F43F5E"},
            ],
            "highlight_geojson": _fit_geojson_size(stressed),
            "analysis_context": {
                "stressed_aquifers_count": len(stressed),
                "combined_deficit_hm3_yr": round(total_deficit, 2),
                "most_stressed_aquifers": top_items[:8],
                "layers_activated": ["aquifers (22 deficit/zero-availability)", "tandeo (280 La Paz rationing zones)", "water_network_lc (3,614 Los Cabos pipes & purple line)"],
            },
        }

    # 3. Flood, Surge & Cyclone Risk Zones
    if any(p in q_low for p in (
        "flood", "hurricane", "cyclone", "storm surge", "arroyo", "heatwave", "hazard", "inundacion",
        "inundación", "huracan", "huracán", "marea", "riesgo", "calor", "ciclón", "ciclon", "+6m"
    )):
        haz_fc = load_layer_geojson("hazard_atlas")
        feats = haz_fc.get("features") or []
        if muni_code and muni_code in MUN_BBOXES:
            scoped = [f for f in feats if _in_bbox(f, MUN_BBOXES[muni_code])]
            if scoped:
                feats = scoped
        # Prioritize flood_tr100 & storm_surge first
        priority_order = {"flood_tr100": 0, "storm_surge": 1, "heatwave": 2, "erosion_site": 3, "cyclone_basin": 4}
        feats_sorted = sorted(feats, key=lambda f: priority_order.get(str((f.get("properties") or {}).get("hazard_type")), 5))[:220]

        tagged = []
        counts_by_type: dict[str, int] = {}
        for f in feats_sorted:
            p = f.get("properties") or {}
            ht = str(p.get("hazard_type") or "hazard")
            counts_by_type[ht] = counts_by_type.get(ht, 0) + 1
            if ht == "flood_tr100":
                fill, line = [220, 38, 38, 170], [255, 255, 255, 220]
            elif ht == "storm_surge":
                fill, line = [234, 88, 12, 165], [255, 255, 255, 210]
            else:
                fill, line = [245, 158, 11, 130], [180, 83, 9, 200]
            tagged.append(
                _tag_feat(
                    f,
                    fill=fill,
                    line=line,
                    title=str(p.get("name") or ht),
                    detail=f"{ht} · {p.get('severity') or p.get('source') or ''}",
                )
            )
        cam = muni_cam or _compute_camera_from_features(tagged, DEFAULT_STATE_CAM)
        return {
            "intent": "flood_hazard",
            "title": "Flood, Surge & Climate Hazards" if is_en else "Atlas de Riesgos e Inundación Tr=100",
            "subtitle": f"{len(tagged)} hazard polygons highlighted" + (f" · {muni_label}" if muni_label else ""),
            "matched_count": len(tagged),
            "layers_to_enable": ["hazardAtlas", "arroyosRivers", "buildings3d"],
            "layers_to_disable": ["anps", "poer", "aquifers"],
            "active_challenge": "water_energy_climate",
            "active_metric": "surge_exposed_pct",
            "fly_to": cam,
            "legend": [
                {"label": "Flood Hazard Tr=100" if is_en else "Inundación Tr=100", "color": "#DC2626"},
                {"label": "Coastal Storm Surge (<6m)" if is_en else "Marea de Tormenta", "color": "#EA580C"},
                {"label": "Arroyo Flash-Flood Channels" if is_en else "Cauces de Arroyos", "color": "#0091B2"},
            ],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {
                "matched_hazard_features": len(tagged),
                "breakdown_by_hazard_type": counts_by_type,
                "scope": muni_label or "Baja California Sur",
            },
        }

    # 4. Real-Time Air & Marine Traffic
    if any(p in q_low for p in (
        "air traffic", "flight", "aircraft", "plane", "marine traffic", "vessel", "ship", "ais", "ads-b",
        "vuelo", "avión", "avion", "barco", "buque", "tráfico aéreo", "trafico aereo", "tráfico marítimo", "trafico maritimo"
    )):
        live = get_live_telemetry_summary()
        air = live.get("aircraft") or {}
        mar = live.get("marine") or {}
        air_list = air.get("aircraft") or []
        mar_list = mar.get("vessels") or []
        cam = DEFAULT_STATE_CAM
        if air_list:
            cam = {"lon": float(air_list[0]["lon"]), "lat": float(air_list[0]["lat"]), "zoom": 7.4, "pitch": 46.0, "bearing": -10.0}
        elif mar_list:
            cam = {"lon": float(mar_list[0]["lon"]), "lat": float(mar_list[0]["lat"]), "zoom": 8.2, "pitch": 46.0, "bearing": -10.0}
        return {
            "intent": "live_traffic",
            "title": "Real-Time Air & Marine Traffic" if is_en else "Tráfico Aéreo y Marítimo en Vivo",
            "subtitle": f"{len(air_list)} ADS-B flights · {len(mar_list)} AIS vessels",
            "matched_count": len(air_list) + len(mar_list),
            "layers_to_enable": ["airTraffic", "marineTraffic", "airportsPortsMarinas"],
            "fly_to": cam,
            "legend": [
                {"label": f"Live Flights ADS-B ({len(air_list)})" if is_en else f"Vuelos ADS-B ({len(air_list)})", "color": "#F59E0B"},
                {"label": f"Live Ships AIS ({len(mar_list)})" if is_en else f"Buques AIS ({len(mar_list)})", "color": "#007AFF"},
            ],
            "analysis_context": {
                "live_aircraft_count": len(air_list),
                "sample_flights": air_list[:6],
                "live_vessels_count": len(mar_list),
                "sample_vessels": mar_list[:6],
                "air_source": air.get("source"),
                "marine_source": mar.get("source"),
            },
        }

    # 5. Social Lag / Vulnerability (CONEVAL IRS)
    if any(p in q_low for p in (
        "social lag", "poverty", "vulnerable", "vulnerability", "coneval", "rezago", "marginacion", "marginación", "pobreza"
    )):
        agebs = load_layer_geojson("agebs").get("features") or []
        if muni_code:
            scoped = [f for f in agebs if str((f.get("properties") or {}).get("municipality_code") or "") == muni_code]
            if scoped:
                agebs = scoped
        ranked = sorted(agebs, key=lambda f: -float((f.get("properties") or {}).get("irs_score_2025_eic_calibrated") or -9.0))[:30]
        tagged = []
        top_items = []
        for f in ranked:
            p = f.get("properties") or {}
            irs = float(p.get("irs_score_2025_eic_calibrated") or 0.0)
            deg = str(p.get("irs_degree_2025_eic_calibrated") or "")
            tagged.append(
                _tag_feat(
                    f,
                    fill=[213, 94, 0, 175],
                    line=[255, 255, 255, 230],
                    title=f"AGEB {p.get('cvegeo_ageb')} · {p.get('municipality_name')}",
                    detail=f"IRS: {irs:.2f} ({deg}) · Pop 2025: {int(p.get('pobtot_2025_eic_calibrated') or 0):,}",
                )
            )
            top_items.append({"ageb": p.get("cvegeo_ageb"), "municipality": p.get("municipality_name"), "irs": round(irs, 3), "degree": deg})
        cam = muni_cam or _compute_camera_from_features(tagged, DEFAULT_STATE_CAM)
        return {
            "intent": "social_lag",
            "title": "Highest CONEVAL Social Lag (IRS)" if is_en else "Mayor Rezago Social CONEVAL (IRS)",
            "subtitle": f"Top {len(tagged)} vulnerable AGEBs highlighted",
            "matched_count": len(tagged),
            "layers_to_enable": ["agebs", "services"],
            "active_challenge": "housing_land",
            "active_metric": "irs_score_2025_eic_calibrated",
            "fly_to": cam,
            "legend": [{"label": "Priority Social Vulnerability AGEBs" if is_en else "AGEBs Prioritarios Rezago Social", "color": "#D55E00"}],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"top_social_lag_agebs": top_items[:8], "scope": muni_label or "BCS State"},
        }

    # 6. Rooftop Solar Potential & SIBCS Energy
    if any(p in q_low for p in ("solar", "photovoltaic", "rooftop pv", "renewable", "power grid", "substation", "energía", "energia", "eléctric", "electric", "subestación")):
        agebs = load_layer_geojson("agebs").get("features") or []
        if muni_code:
            scoped = [f for f in agebs if str((f.get("properties") or {}).get("municipality_code") or "") == muni_code]
            if scoped:
                agebs = scoped
        ranked = sorted(agebs, key=lambda f: -float((f.get("properties") or {}).get("solar_mw") or 0.0))[:30]
        tagged = []
        top_items = []
        total_mw = 0.0
        for f in ranked:
            p = f.get("properties") or {}
            mw = float(p.get("solar_mw") or 0.0)
            total_mw += mw
            tagged.append(
                _tag_feat(
                    f,
                    fill=[245, 158, 11, 175],
                    line=[254, 240, 138, 240],
                    title=f"AGEB {p.get('cvegeo_ageb')} · {p.get('municipality_name')}",
                    detail=f"Rooftop Solar: {mw:.2f} MW · 3D Bldgs: {int(p.get('buildings_3d_count') or 0):,}",
                )
            )
            top_items.append({"ageb": p.get("cvegeo_ageb"), "municipality": p.get("municipality_name"), "solar_mw": round(mw, 2)})
        cam = muni_cam or _compute_camera_from_features(tagged, DEFAULT_STATE_CAM)
        return {
            "intent": "rooftop_solar",
            "title": "Top Rooftop Solar PV Corridors" if is_en else "Zonas de Mayor Potencial Solar en Techos",
            "subtitle": f"Top {len(tagged)} AGEBs · {total_mw:.1f} MW peak potential",
            "matched_count": len(tagged),
            "layers_to_enable": ["agebs", "powerGrid", "plannedProjects", "buildings3d"],
            "active_challenge": "water_energy_climate",
            "active_metric": "solar_mw",
            "fly_to": cam,
            "legend": [
                {"label": "High Rooftop Solar AGEBs (MW)" if is_en else "AGEBs Alto Potencial Solar", "color": "#F59E0B"},
                {"label": "SIBCS Transmission & Substations" if is_en else "Red Eléctrica SIBCS", "color": "#FACC15"},
            ],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"top_solar_agebs": top_items[:8], "combined_top30_mw": round(total_mw, 1)},
        }

    # 7. 15-Minute City & Essential Services
    if any(p in q_low for p in ("15-min", "15 min", "walkable", "school", "clinic", "hospital", "service", "caminable", "escuela", "salud", "equipamiento")):
        agebs = load_layer_geojson("agebs").get("features") or []
        if muni_code:
            scoped = [f for f in agebs if str((f.get("properties") or {}).get("municipality_code") or "") == muni_code]
            if scoped:
                agebs = scoped
        want_deficit = any(w in q_low for w in ("low", "lack", "deficit", "underserved", "worst", "bajo", "carencia", "déficit", "menor"))
        ranked = sorted(
            agebs,
            key=lambda f: float((f.get("properties") or {}).get("city15_score") or 0.0) * (1 if want_deficit else -1),
        )[:30]
        tagged = []
        top_items = []
        for f in ranked:
            p = f.get("properties") or {}
            c15 = float(p.get("city15_score") or 0.0)
            fill = [239, 68, 68, 170] if want_deficit else [14, 165, 233, 170]
            tagged.append(
                _tag_feat(
                    f,
                    fill=fill,
                    line=[255, 255, 255, 230],
                    title=f"AGEB {p.get('cvegeo_ageb')} · {p.get('municipality_name')}",
                    detail=f"15-Min Score: {c15:.1f}/100 · CSI: {p.get('city_science_index')}",
                )
            )
            top_items.append({"ageb": p.get("cvegeo_ageb"), "municipality": p.get("municipality_name"), "city15_score": round(c15, 1)})
        cam = muni_cam or _compute_camera_from_features(tagged, DEFAULT_STATE_CAM)
        return {
            "intent": "walkable_15m",
            "title": ("15-Min City Underserved Zones" if want_deficit else "Top 15-Minute Walkable Zones") if is_en else ("Zonas con Déficit 15-Min" if want_deficit else "Mejores Zonas Ciudad 15-Min"),
            "subtitle": f"{len(tagged)} AGEBs + Essential Services & Transit",
            "matched_count": len(tagged),
            "layers_to_enable": ["agebs", "services", "transit"],
            "active_challenge": "urban_form_15m",
            "active_metric": "city15_score",
            "fly_to": cam,
            "legend": [{"label": "15-Min Underserved" if want_deficit else "High 15-Min Accessibility", "color": "#EF4444" if want_deficit else "#0EA5E9"}],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"mode": "underserved" if want_deficit else "highest", "agebs": top_items[:8]},
        }

    # 8. Infill Housing / Zoning / Density
    if any(p in q_low for p in ("infill", "housing", "zoning", "density", "vivienda", "zonificación", "zonificacion", "densidad", "cus", "cos", "crecimiento")):
        agebs = load_layer_geojson("agebs").get("features") or []
        if muni_code:
            scoped = [f for f in agebs if str((f.get("properties") or {}).get("municipality_code") or "") == muni_code]
            if scoped:
                agebs = scoped
        ranked = sorted(agebs, key=lambda f: -float((f.get("properties") or {}).get("infill_homes_potential") or 0.0))[:30]
        tagged = []
        top_items = []
        total_infill = 0
        for f in ranked:
            p = f.get("properties") or {}
            inf = int(p.get("infill_homes_potential") or 0)
            total_infill += inf
            tagged.append(
                _tag_feat(
                    f,
                    fill=[16, 185, 129, 170],
                    line=[255, 255, 255, 235],
                    title=f"AGEB {p.get('cvegeo_ageb')} · {p.get('municipality_name')}",
                    detail=f"Infill Potential: +{inf:,} homes · 15m Score: {p.get('city15_score')}",
                )
            )
            top_items.append({"ageb": p.get("cvegeo_ageb"), "municipality": p.get("municipality_name"), "infill_homes": inf})
        cam = muni_cam or _compute_camera_from_features(tagged, DEFAULT_STATE_CAM)
        return {
            "intent": "infill_housing",
            "title": "Priority 2050 Infill Housing Capacity" if is_en else "Capacidad Prioritaria de Vivienda Infill 2050",
            "subtitle": f"Top {len(tagged)} AGEBs (+{total_infill:,} homes)" + (f" · {muni_label}" if muni_label else ""),
            "matched_count": len(tagged),
            "layers_to_enable": ["agebs", "buildings3d", "zoning"],
            "active_challenge": "housing_land",
            "active_metric": "infill_homes_potential",
            "fly_to": cam,
            "legend": [
                {"label": "Top Infill Potential AGEBs" if is_en else "AGEBs Alto Potencial Infill", "color": "#10B981"},
                {"label": "PMDU Zoning Envelopes (CUS/COS)" if is_en else "Zonificación PMDU", "color": "#FF9F0A"},
            ],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"top_infill_agebs": top_items[:8], "combined_top30_infill_homes": total_infill},
        }

    # 9. Land Tenure / Ejidos / Reserves
    if any(p in q_low for p in ("ejido", "tenure", "land reserve", "agrarian", "ran ", "tenencia", "reserva territorial", "reservas territoriales")):
        lt_feats = load_layer_geojson("land_tenure").get("features") or []
        tagged = [
            _tag_feat(
                f,
                fill=[52, 199, 89, 155] if (f.get("properties") or {}).get("tenure_type") == "territorial_reserve" else [217, 119, 6, 125],
                line=[255, 255, 255, 210],
                title=str((f.get("properties") or {}).get("name") or "Land Tenure"),
                detail=f"{(f.get('properties') or {}).get('municipality') or 'BCS'} · {(f.get('properties') or {}).get('legal_regime') or ''}",
            )
            for f in lt_feats
        ]
        return {
            "intent": "land_tenure",
            "title": "Ejidos (RAN) & Territorial Reserves" if is_en else "Ejidos (RAN) y Reservas Territoriales",
            "subtitle": f"{len(tagged)} agrarian & reserve polygons",
            "matched_count": len(tagged),
            "layers_to_enable": ["landTenure"],
            "fly_to": muni_cam or DEFAULT_STATE_CAM,
            "legend": [
                {"label": "Urban Territorial Reserves" if is_en else "Reservas Territoriales", "color": "#34C759"},
                {"label": "Agrarian Ejidos (RAN)" if is_en else "Núcleos Agrarios (Ejidos)", "color": "#D97706"},
            ],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"land_tenure_count": len(tagged)},
        }

    # 10. Coastal Ecosystems (Mangroves, Ramsar, Coral Reefs, Oases)
    if any(p in q_low for p in ("mangrove", "ramsar", "reef", "coral", "wetland", "oasis", "manglar", "arrecife", "humedal")):
        eco_feats = (load_layer_geojson("coastal_ecosystems").get("features") or [])[:250]
        tagged = [
            _tag_feat(
                f,
                fill=[0, 199, 190, 165],
                line=[13, 148, 136, 220],
                title=str((f.get("properties") or {}).get("name") or "Coastal Ecosystem"),
                detail=f"{str((f.get('properties') or {}).get('eco_type') or '').upper()}",
            )
            for f in eco_feats
        ]
        return {
            "intent": "coastal_ecosystems",
            "title": "Mangroves, Ramsar & Coastal Ecosystems" if is_en else "Manglares, Ramsar y Arrecifes",
            "subtitle": f"{len(tagged)} blue-carbon & marine ecosystems",
            "matched_count": len(tagged),
            "layers_to_enable": ["coastalEcosystems", "anps"],
            "fly_to": muni_cam or DEFAULT_STATE_CAM,
            "legend": [{"label": "Mangroves / Ramsar / Reefs" if is_en else "Manglares / Ramsar / Arrecifes", "color": "#00C7BE"}],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"coastal_ecosystems_highlighted": len(tagged)},
        }

    # 11. Parks & Beach Access
    if any(p in q_low for p in ("park", "beach", "public space", "plaza", "parque", "playa", "espacio público", "espacio publico")):
        pk_feats = load_layer_geojson("parks_public_space").get("features") or []
        if muni_code and muni_code in MUN_BBOXES:
            scoped = [f for f in pk_feats if _in_bbox(f, MUN_BBOXES[muni_code])]
            if scoped:
                pk_feats = scoped
        pk_feats = pk_feats[:260]
        tagged = [
            _tag_feat(
                f,
                fill=[6, 182, 212, 215] if (f.get("properties") or {}).get("space_type") == "beach_access" else [34, 197, 94, 175],
                line=[255, 255, 255, 220],
                title=str((f.get("properties") or {}).get("name") or "Park / Beach Access"),
                detail=f"{(f.get('properties') or {}).get('space_type') or ''} · {(f.get('properties') or {}).get('municipality') or 'BCS'}",
            )
            for f in pk_feats
        ]
        return {
            "intent": "parks_beaches",
            "title": "Public Parks & Beach Access" if is_en else "Parques y Acceso Público a Playas",
            "subtitle": f"{len(tagged)} civic green & coastal access features",
            "matched_count": len(tagged),
            "layers_to_enable": ["parksPublicSpace"],
            "fly_to": muni_cam or DEFAULT_STATE_CAM,
            "legend": [
                {"label": "Urban Parks & Plazas" if is_en else "Parques y Plazas", "color": "#22C55E"},
                {"label": "Public Beach Access" if is_en else "Accesos a Playas", "color": "#06B6D4"},
            ],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"parks_and_beaches_highlighted": len(tagged)},
        }

    # 12. Cultural Heritage & Jesuit Missions
    if any(p in q_low for p in ("mission", "unesco", "heritage", "archaeological", "mision", "misión", "patrimonio", "arqueolog")):
        ch_feats = load_layer_geojson("cultural_heritage").get("features") or []
        tagged = [
            _tag_feat(
                f,
                fill=[217, 119, 6, 220],
                line=[255, 255, 255, 235],
                title=str((f.get("properties") or {}).get("name") or "Cultural Heritage"),
                detail=f"{str((f.get('properties') or {}).get('heritage_type') or '').upper()}",
            )
            for f in ch_feats
        ]
        return {
            "intent": "cultural_heritage",
            "title": "Missions, UNESCO & Heritage Sites" if is_en else "Misiones, UNESCO y Patrimonio Cultural",
            "subtitle": f"{len(tagged)} patrimony sites across BCS",
            "matched_count": len(tagged),
            "layers_to_enable": ["culturalHeritage"],
            "fly_to": muni_cam or DEFAULT_STATE_CAM,
            "legend": [{"label": "Missions / UNESCO / Archaeology" if is_en else "Misiones / UNESCO / Arqueología", "color": "#D97706"}],
            "highlight_geojson": _fit_geojson_size(tagged),
            "analysis_context": {"heritage_sites_count": len(tagged)},
        }

    # 13. 3D Terrain & Elevation Contours
    if any(p in q_low for p in ("terrain", "elevation", "contour", "mountain", "topography", "slope", "sierra", "relieve", "curvas de nivel", "topografía", "topografia", "elevación", "elevacion")):
        return {
            "intent": "terrain_topography",
            "title": "3D Terrain Relief & Contours" if is_en else "Modelo de Terreno 3D y Curvas de Nivel",
            "subtitle": "Copernicus DEM + 5,724 contour lines (0–2,050 m ASL)",
            "matched_count": 5724,
            "layers_to_enable": ["topographyContours"],
            "terrain_3d_enabled": True,
            "terrain_exaggeration": 2.0,
            "basemap_mode": "terrain",
            "fly_to": muni_cam or {"lon": -109.96, "lat": 23.55, "zoom": 10.2, "pitch": 58.0, "bearing": -18.0},
            "legend": [
                {"label": "Coastal Datum (0–10 m)" if is_en else "Cota Costera (0–10 m)", "color": "#0284C7"},
                {"label": "Mid Slopes (50–250 m)" if is_en else "Laderas Medias (50–250 m)", "color": "#9A7B56"},
                {"label": "Sierra Peaks (600–2,050 m)" if is_en else "Cumbres Sierra (600–2,050 m)", "color": "#9A3412"},
            ],
            "analysis_context": {"elevation_range_m": "0 to 2,050 m ASL (Sierra de la Laguna)", "contours_count": 5724},
        }

    # 14. Pure City Focus Fly-To if a city was named without specific layer keyword
    if muni_cam and any(v in q_low for v in ("show", "fly", "go to", "zoom", "muestra", "ver", "enfoca", "ir a")):
        return {
            "intent": "city_focus",
            "title": f"{muni_label or 'BCS'} 3D Focus",
            "subtitle": "Real 3D Terrain & Buildings" if is_en else "Terreno 3D y Edificios",
            "matched_count": 1,
            "fly_to": muni_cam,
            "analysis_context": {"focused_city": muni_label},
        }

    return None
