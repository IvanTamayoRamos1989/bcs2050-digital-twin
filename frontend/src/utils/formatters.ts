const CITY_ACCENTS: Record<string, string> = {
  "Ciudad Constitucion": "Ciudad Constitución",
  "San Jose del Cabo": "San José del Cabo",
  "Santa Rosalia": "Santa Rosalía",
};

export function humanizeCityName(name: string | null | undefined): string {
  const clean = (name || "").trim();
  if (!clean) return "";
  return CITY_ACCENTS[clean] || clean;
}

export function fmtNumber(
  value: number | string | null | undefined,
  language: "es" | "en" = "en",
  maxFrac = 0,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  const locale = language === "en" ? "en-US" : "es-MX";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: maxFrac > 0 && !Number.isInteger(num) ? Math.min(1, maxFrac) : 0,
    maximumFractionDigits: maxFrac,
  }).format(num);
}

export function fmtCurrencyMdp(value: number | null | undefined, language: "es" | "en" = "en"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = fmtNumber(value, language, 1);
  return language === "en" ? `$${formatted}M MXN` : `$${formatted} MDP`;
}

const ZONING_LABELS_EN: Record<string, string> = {
  RESIDENTIAL: "Residential",
  MIXED_USE_CORRIDOR: "Mixed-Use Corridor",
  COMMERCIAL_SERVICES: "Commercial & Services",
  TOURISM_HOSPITALITY: "Tourism & Hospitality",
  INDUSTRIAL_LOGISTICS: "Industrial & Logistics",
  PUBLIC_EQUIPMENT: "Public Facilities",
  GREEN_OPEN_SPACE: "Green & Open Space",
  CONSERVATION_RISK_BUFFER: "Conservation & Risk Buffer",
};

const ZONING_LABELS_ES: Record<string, string> = {
  RESIDENTIAL: "Habitacional",
  MIXED_USE_CORRIDOR: "Corredor Mixto",
  COMMERCIAL_SERVICES: "Comercio y Servicios",
  TOURISM_HOSPITALITY: "Turístico Hotelero",
  INDUSTRIAL_LOGISTICS: "Industria y Logística",
  PUBLIC_EQUIPMENT: "Equipamiento Público",
  GREEN_OPEN_SPACE: "Área Verde y Espacio Abierto",
  CONSERVATION_RISK_BUFFER: "Conservación y Amortiguamiento",
};

const SPANISH_ZONING_CODE_EN: Record<string, string> = {
  "Área urbana actual": "Current Urban Area",
  "Area urbana actual": "Current Urban Area",
  "Reserva urbana": "Urban Reserve",
  "Centro de barrio": "Neighborhood Center",
  "Equipamiento urbano": "Urban Facilities",
  "Corredor turístico": "Tourism Corridor",
  "Preservación ecológica": "Ecological Preservation",
};

export function humanizeZoning(
  category: unknown,
  landUseCode: unknown,
  isEn: boolean,
): { categoryLabel: string; codeLabel: string } {
  const rawCat = String(category || "").trim();
  const catMap = isEn ? ZONING_LABELS_EN : ZONING_LABELS_ES;
  const categoryLabel =
    catMap[rawCat] ||
    rawCat
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const rawCode = String(landUseCode || "").trim();
  const codeLabel = !rawCode
    ? isEn ? "N/A" : "N/D"
    : isEn
      ? SPANISH_ZONING_CODE_EN[rawCode] || rawCode
      : rawCode;

  return { categoryLabel, codeLabel };
}

const POER_POLICY_EN: Record<string, string> = {
  "Aprovechamiento sustentable": "Sustainable Use",
  "Conservación": "Conservation",
  "Conservacion": "Conservation",
  "Protección": "Strict Protection",
  "Proteccion": "Strict Protection",
  "Restauración": "Restoration",
  "Restauracion": "Restoration",
  "Aprovechamiento": "Managed Use",
};

const POER_MACRO_EN: Record<string, string> = {
  SUSTAINABLE_USE_RANGELAND_SCRUB: "Rangeland & Desert Scrub",
  CONSERVATION_SIERRA_OASIS: "Sierra & Oasis Conservation",
  PROTECTION_ANP_COASTAL: "Coastal & ANP Protection",
  URBAN_CONSOLIDATION: "Urban Consolidation",
  RESTORATION_WATERSHED: "Watershed Restoration",
};

export function humanizePoer(policy: unknown, macroClass: unknown, isEn: boolean): string {
  const pRaw = String(policy || "").trim();
  const mRaw = String(macroClass || "").trim();
  if (!isEn) {
    return `${pRaw}${mRaw ? ` (${mRaw.replace(/_/g, " ")})` : ""}`;
  }
  const pEn = POER_POLICY_EN[pRaw] || pRaw;
  const mEn =
    POER_MACRO_EN[mRaw] ||
    mRaw
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return mEn ? `${pEn} · ${mEn}` : pEn;
}

const SEVERITY_EN: Record<string, string> = {
  "Muy Alto": "Very High",
  "MUY ALTO": "Very High",
  Alto: "High",
  ALTO: "High",
  Medio: "Moderate",
  MEDIO: "Moderate",
  Bajo: "Low",
  BAJO: "Low",
};

export function humanizeHazardSeverity(sev: unknown, isEn: boolean): string {
  const s = String(sev || "").trim();
  if (!s) return "";
  return isEn ? SEVERITY_EN[s] || s : s;
}

export function formatTandeoSchedule(raw: unknown, isEn: boolean): string {
  const txt = String(raw || "").trim();
  if (!txt) return isEn ? "Scheduled" : "Programado";
  const matches = txt.match(/\d+/g);
  if (matches && matches.length >= 2 && (txt.includes("(") || txt.includes("'"))) {
    const nums = matches.map((n) => String(Number(n)));
    return `${isEn ? "Days" : "Días"} ${nums.join(", ")}`;
  }
  return txt.replace(/^['"(]+|['")]+$/g, "");
}

const CAPABILITY_LABELS_EN: Record<string, string> = {
  bigquery_live: "BigQuery Live Spatial Warehouse",
  google_photorealistic_3d_tiles: "Google Photorealistic 3D Tiles",
  cesium_ion_terrain: "Cesium ion World Terrain",
  maptiler_enterprise: "MapTiler 3D Terrain & Vector",
  arcgis_platform: "ArcGIS Platform Sync",
  ontology_v3_connected: "Ontology v3.0 Reasoning Engine",
  cad_bim_exporters: "CAD / .DXF / .OBJ / BIM Exporters",
  autodesk_aps_acc: "Autodesk APS / ACC Connector",
  autodesk_tandem: "Autodesk Tandem Twin",
  strict_cors_enabled: "Strict CORS Policy",
  rate_limiting_enabled: "Sliding-Window Rate Limiter",
  planner_rbac_enforced: "Planner RBAC Authentication",
  vertex_gemini_strategist: "Vertex AI Gemini Strategist",
  bigquery_vector_rag: "BigQuery VECTOR_SEARCH RAG",
  firestore_telemetry_cache: "Firestore Live Telemetry Cache",
  ogc_sensorthings_v11: "OGC SensorThings v1.1 API",
  bigquery_telemetry_history: "BigQuery Telemetry History",
  postgis_connected: "PostGIS Spatial Database",
  gcs_cloud_native_hydration: "GCS Cloud-Native Hydration",
  ogc_api_features: "OGC API - Features",
  ogc_api_tiles_mvt: "OGC API - Vector Tiles (MVT)",
  ogc_api_processes: "OGC API - Physics Processes",
  ogc_api_records: "OGC API - Metadata Records",
  ogc_3dtiles_v11: "OGC 3D Tiles 1.1 (glTF 2.0)",
  physics_cloud_run_jobs: "Cloud Run Physics Workers",
  vvuq_uncertainty_framework: "ISO 23247-8 VVUQ Framework",
  wntr_hydraulic_solver: "WNTR Hydraulic Solver",
  realtime_air_traffic_adsb: "Live Air Traffic (ADS-B)",
  realtime_marine_ais_stream: "Live Marine Traffic (AIS)",
};

const CAPABILITY_LABELS_ES: Record<string, string> = {
  bigquery_live: "BigQuery Espacial en Vivo",
  google_photorealistic_3d_tiles: "Google Photorealistic 3D Tiles",
  cesium_ion_terrain: "Terreno Mundial Cesium ion",
  maptiler_enterprise: "MapTiler Terreno 3D y Vector",
  arcgis_platform: "Plataforma ArcGIS",
  ontology_v3_connected: "Motor Ontología v3.0",
  cad_bim_exporters: "Exportadores CAD / .DXF / .OBJ / BIM",
  autodesk_aps_acc: "Conector Autodesk APS / ACC",
  autodesk_tandem: "Autodesk Tandem",
  strict_cors_enabled: "CORS Estricto Activo",
  rate_limiting_enabled: "Limitador de Peticiones",
  planner_rbac_enforced: "Autenticación RBAC Municipal",
  vertex_gemini_strategist: "Estratega Vertex AI Gemini",
  bigquery_vector_rag: "RAG Vectorial BigQuery",
  firestore_telemetry_cache: "Caché Telemetría Firestore",
  ogc_sensorthings_v11: "OGC SensorThings v1.1",
  bigquery_telemetry_history: "Histórico Telemetría BigQuery",
  postgis_connected: "Base Espacial PostGIS",
  gcs_cloud_native_hydration: "Hidratación Cloud Storage",
  ogc_api_features: "OGC API - Features",
  ogc_api_tiles_mvt: "OGC API - Tiles (MVT)",
  ogc_api_processes: "OGC API - Processes",
  ogc_api_records: "OGC API - Records",
  ogc_3dtiles_v11: "OGC 3D Tiles 1.1 (glTF 2.0)",
  physics_cloud_run_jobs: "Workers Físicos Cloud Run",
  vvuq_uncertainty_framework: "Incertidumbre VVUQ ISO 23247-8",
  wntr_hydraulic_solver: "Motor Hidráulico WNTR",
  realtime_air_traffic_adsb: "Tráfico Aéreo en Vivo (ADS-B)",
  realtime_marine_ais_stream: "Tráfico Marítimo en Vivo (AIS)",
};

export function humanizeCapability(key: string, isEn: boolean): string {
  const dict = isEn ? CAPABILITY_LABELS_EN : CAPABILITY_LABELS_ES;
  return (
    dict[key] ||
    key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
