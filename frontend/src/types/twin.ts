export type AretianPhase = "diagnostics" | "goals" | "scenarios" | "recommendations";

export type ViewMode = "technical" | "citizen";

export type EngineMode = "deck3d" | "cesium3d";

export type BasemapMode = "obsidian" | "satellite" | "terrain";

export type ChallengeId =
  | "housing_land"
  | "urban_form_15m"
  | "economy_clusters"
  | "water_energy_climate"
  | "mobility_corridors";

export type AgebMetricKey =
  | "city_science_index"
  | "city15_score"
  | "fractality_score"
  | "harmony_score"
  | "landuse_entropy_score"
  | "infill_homes_potential"
  | "solar_mw"
  | "surge_exposed_pct"
  | "carrying_resilience_score"
  | "density_hab_ha_2025"
  | "irs_score_2025_eic_calibrated";

export interface CameraPreset {
  lon: number;
  lat: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

export interface MunicipalitySummary {
  municipality_code: string;
  name: string;
  corridor: string;
  population_2020: number;
  population_inegi_2020_official?: number;
  population_2025: number;
  dwellings_2025: number;
  ageb_count: number;
  buildings_3d_count: number;
  built_gfa_m2: number;
  infill_homes_potential: number;
  solar_mw: number;
  solar_gwh_yr: number;
  surge_exposed_buildings: number;
  city_science_index: number;
  city15_score: number;
  fractality_score: number;
  harmony_score: number;
  landuse_entropy_score: number;
  carrying_resilience_score: number;
  socioecon_score: number;
  ipcc_slr_2050_ssp585_m: number;
  mangrove_buffer_ha: number;
  coastal_erosion_sites: number;
  camera: CameraPreset;
}

export interface CitySummary {
  slug: string;
  name: string;
  municipality_code: string;
  buildings_count: number;
  mean_height_m: number;
  max_height_m: number;
  footprint_ha: number;
  total_gfa_m2: number;
  rooftop_solar_mw: number;
  rooftop_solar_gwh_yr: number;
  surge_exposed_buildings: number;
  surge_exposed_pct: number;
  camera: CameraPreset;
}

export interface CorridorArc {
  id: string;
  name: string;
  source: [number, number];
  target: [number, number];
  flow_index: number;
  corridor: string;
}

export interface CanonicalKpis {
  state: {
    scope_id: string;
    name: string;
    population_inegi_2020_official: number;
    population_2020_urban_agebs: number;
    population_2025_eic_calibrated: number;
    aquifers_bcs_official_count: number;
    aquifers_bcs_no_availability_count: number;
    aquifers_strict_deficit_count: number;
    aquifers_zero_availability_code: string;
    aquifers_transboundary_polygons: number;
    aquifers_transboundary_code: string;
    bigquery_gold_views: string[];
    reconciliation_notes: string;
  };
  municipalities: Record<
    string,
    {
      name: string;
      population_inegi_2020_official: number;
      population_2025_eic_calibrated: number;
      water_rationing_coverage: string;
      transit_coverage: string;
    }
  >;
  municipal_coverage_audit: {
    municipality_code: string;
    municipality_name: string;
    water_rationing_status: string;
    transit_inventory_status: string;
    notes: string;
  }[];
}

export interface MetadataCatalogRecord {
  identifier: string;
  title: string;
  abstract: string;
  source_agency: string;
  source_url: string;
  reference_date: string;
  last_updated_utc: string;
  update_cadence: string;
  crs: string;
  spatial_accuracy_note: string;
  data_nature: string;
  license_spdx: string;
  attribution_text: string;
  distribution_url: string;
  dataset_scope: string;
  feature_count: number | null;
}

export interface MetadataCatalogResponse {
  standard: string;
  conformsTo: string[];
  generated_at: string;
  basemap_attributions: string[];
  summary: {
    total_records: number;
    twin_records: number;
    panel_v2_records: number;
    counts_by_data_nature: Record<string, number>;
  };
  canonical_kpis: CanonicalKpis;
  records: MetadataCatalogRecord[];
}

export interface OverviewResponse {
  generated_at: string;
  state: {
    scope_id: string;
    name: string;
    population_2025: number;
    population_inegi_2020_official?: number;
    population_2020_urban_agebs?: number;
    aquifers_bcs_official_count?: number;
    aquifers_bcs_no_availability_count?: number;
    aquifers_strict_deficit_count?: number;
    dwellings_2025: number;
    agebs_count: number;
    buildings_3d_count: number;
    zoning_parcels_count: number;
    essential_services_count: number;
    transit_stops_count: number;
    aquifers_count: number;
    aquifers_in_deficit_count: number;
    total_aquifer_dma_2023_hm3: number;
    tandeo_sectors_lapaz: number;
    power_lines_count: number;
    substations_count: number;
    power_plants_count: number;
    planned_projects_count: number;
    poer_ugas_count: number;
    anps_count: number;
    total_built_gfa_m2: number;
    infill_homes_potential: number;
    rooftop_solar_mw: number;
    rooftop_solar_gwh_yr: number;
    surge_exposed_buildings: number;
    city_science_index: number;
    city15_score: number;
    fractality_score: number;
    harmony_score: number;
    landuse_entropy_score: number;
    carrying_resilience_score: number;
    socioecon_score: number;
    camera: CameraPreset;
  };
  municipalities: Record<string, MunicipalitySummary>;
  cities: Record<string, CitySummary>;
  corridor_arcs: CorridorArc[];
  capabilities: Record<string, boolean>;
  layers_available: string[];
}

export interface BuildingRecord {
  id: number;
  building_id: string;
  city_slug: string;
  city_name: string;
  mun_code: string;
  ageb_cvegeo: string;
  height_m: number;
  floors: number;
  footprint_m2: number;
  gfa_m2: number;
  ground_elev_m: number;
  solar_kwp: number;
  surge_risk: number;
  lon: number;
  lat: number;
  polygon: [number, number][];
}

export interface ZoningParcelRecord {
  id: number;
  zone_id: string;
  city_name: string;
  mun_code: string;
  land_use_code: string;
  category: string;
  cos_max: number | null;
  cus_max: number | null;
  max_levels: number | null;
  area_ha: number;
  polygon: [number, number][];
}

export interface InspectResponse {
  coordinates: { lon: number; lat: number };
  building: Record<string, unknown> | null;
  ageb: Record<string, unknown> | null;
  zoning: Record<string, unknown> | null;
  terrain_elevation_m?: number | null;
  aquifer: Record<string, unknown> | null;
  tandeo_lapaz: Record<string, unknown> | null;
  poer_uga: Record<string, unknown> | null;
  protected_area: Record<string, unknown> | null;
  ejido_or_reserve?: Record<string, unknown> | null;
  hazard_zone?: Record<string, unknown> | null;
  nearest_services: Record<string, { name: string; sector: string; walk_m: number; walk_min: number }[]>;
  nearest_transit: { name: string; mode: string; walk_m: number }[];
  nearest_substation: { name: string; voltage: string; distance_km: number } | null;
}

export interface VvuqMetadata {
  standard: string;
  engine_family: string;
  calibration_dataset: string;
  validation_error_rmse_or_mape: Record<string, number | string>;
  p10_p50_p90_uncertainty_band: Record<string, unknown>;
  assumptions: string[];
  legal_disclaimer: string;
  backtest_report?: string;
}

export interface SimulationTrajectoryPoint {
  year: number;
  population: number;
  hotel_keys: number;
  cumulative_new_sprawl_ha: number;
  aquifer_effective_balance_hm3_yr: number;
  desalination_load_mw: number;
  sibcs_headroom_mw: number;
  sibcs_reserve_margin_pct: number;
  flood_mitigated_pct: number;
  period_capex_mdp: number;
  sdi_score_100: number;
  carrying_capacity_status: string;
  sdi_p10?: number;
  sdi_p50?: number;
  sdi_p90?: number;
  aquifer_p10?: number;
  aquifer_p50?: number;
  aquifer_p90?: number;
  sibcs_margin_p10?: number;
  sibcs_margin_p50?: number;
  sibcs_margin_p90?: number;
}

export interface SimulationResponse {
  scope_id: string;
  scope_name: string;
  scope_level: string;
  scenario_name: string;
  scenario_meta: { title: string; tag: string; summary: string };
  target_year: number;
  levers: Record<string, number>;
  sdi_score_2031: number;
  sdi_score_2050: number;
  carrying_capacity_breach_year: number | null;
  breach_warnings: string[];
  trajectory: SimulationTrajectoryPoint[];
  active_year_snapshot: SimulationTrajectoryPoint & {
    deployed_rooftop_solar_mw: number;
    total_rooftop_potential_mw: number;
    state_infill_capacity_homes: number;
  };
  ageb_deltas: Record<string, { height_multiplier: number; projected_solar_mw: number; water_relief_factor: number }>;
  vvuq?: VvuqMetadata;
}

export interface GoalGapResponse {
  scope_id: string;
  scope_name: string;
  population_2025: number;
  projected_new_people_2050: number;
  projected_new_homes_2050: number;
  infill_homes_needed: number;
  zoned_infill_capacity_homes: number;
  infill_absorption_coverage_pct: number;
  target_solar_mw: number;
  recommended_desal_lps: number;
  estimated_capex_mdp_mxn: number;
  capex_breakdown_mdp: Record<string, number>;
  pillars: { id: string; label: string; unit: string; current: number; target: number; gap: number }[];
  optimal_levers: Record<string, number>;
  vvuq?: VvuqMetadata;
}

export type OgcPhysicsProcessId = "arroyo_flood_sfincs" | "network_isochrone_r5py" | "water_network_wntr";

export interface OgcPhysicsJobStatus {
  jobID: string;
  processID: string;
  status: "accepted" | "running" | "successful" | "failed" | string;
  execution_backend?: string;
  cloud_run_execution?: string;
  error?: string | null;
}

export interface OgcPhysicsJobResult {
  process_id: OgcPhysicsProcessId | string;
  execution_backend?: string;
  summary: Record<string, number | string | boolean | number[]>;
  overlay_geojson?: GeoJSON.FeatureCollection;
  artifact_urls?: {
    overlay_geojson?: string;
    flood_depth_cog?: string;
    result_json?: string;
  };
  camera?: CameraPreset;
  tank_depletion_series?: {
    hour: number;
    baseline_pressure_m: number;
    scenario_pressure_m: number;
    tank_norte_m: number;
    tank_sur_m: number;
  }[];
  vvuq?: VvuqMetadata;
}

export interface ActivePhysicsOverlay {
  jobId: string;
  processId: OgcPhysicsProcessId | string;
  result: OgcPhysicsJobResult;
}

export interface PriorityActionCard {
  id: string;
  challenge: string;
  priority: string;
  title: string;
  rationale: string;
  metric_badge: string;
  municipality: string;
  ageb_cvegeo: string;
  camera: CameraPreset;
}

export interface RecommendationsResponse {
  scope_id: string;
  sdi_100: { sdi_score_100: number; pillars: Record<string, number> };
  carrying_capacity: {
    overall_status: string;
    limiting_factors: string[];
    water: Record<string, number | string>;
    energy: Record<string, unknown>;
    land: Record<string, unknown>;
  };
  contradictions: { id?: string; severity?: string; message: string }[];
  decision_lenses: {
    lens_id: string;
    lens_name: string;
    score_100: number;
    verdict: string;
    recommended_actions: string[];
  }[];
  priority_actions: PriorityActionCard[];
}

export interface ChatCitation {
  doc_id: string;
  chunk_id?: string | null;
  doc_type?: string | null;
  municipality_code?: string | null;
  source_uri?: string | null;
  page_or_section?: string | null;
  distance?: number | null;
  excerpt?: string | null;
}

export interface ChatResponse {
  query: string;
  scope_id: string;
  scope_name: string;
  language?: "es" | "en";
  engine_mode?: "vertex_gemini_grounded" | "deterministic_fallback" | string;
  model_used?: string | null;
  tools_used?: string[];
  citations?: ChatCitation[];
  uncertainty_note?: string | null;
  implan_context_used?: boolean;
  answer_markdown: string;
  fly_to: CameraPreset | null;
  lineage: string[];
}

export interface AerialTourWaypoint {
  title: string;
  lon: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
  duration_ms?: number;
}

export interface AerialTour {
  id: string;
  name: string;
  short_label: string;
  scope_id: string;
  corridor_id: string;
  description: string;
  waypoints: AerialTourWaypoint[];
}

export interface CorridorPreset {
  id: string;
  label: string;
  scope_id: string;
  bbox: [number, number, number, number];
}

export interface AecBimBridgeItem {
  layer: string;
  tools: string;
  status: string;
  role_in_bcs2050: string;
}

export interface ArchitectureResponse {
  capabilities: Record<string, boolean>;
  tileset_3d_url?: string;
  ogc_endpoints?: Record<string, string>;
  benchmarks: { name: string; reference: string; metrics: string; adoption_in_bcs2050: string }[];
  commercial_tiers: { tier: string; budget_usd_yr: string; items: string[] }[];
  top_opensource_engines: { name: string; category: string; status: string }[];
  aec_bim_bridge?: AecBimBridgeItem[];
}

export interface Tiles3DInfoResponse {
  standard: string;
  tileset_url: string;
  buildings_count: number;
  cities_count: number;
  cache_control: string;
  ogc_endpoints: Record<string, string>;
}

export interface TelemetryFeedMeta {
  status: "LIVE" | "CACHED" | "STALE" | "OFFLINE" | string;
  upstream_ok: boolean;
  fetched_at?: string | null;
  age_seconds?: number | null;
  freshness_es: string;
  freshness_en: string;
  latency_ms?: number | null;
  source?: string;
  notice?: string;
  count: number;
}

export interface LiveTelemetrySummary {
  updated_at: string;
  ingested_at?: string | null;
  age_seconds?: number | null;
  cache_backend?: string;
  overall_status?: "LIVE" | "CACHED" | "STALE" | "OFFLINE" | string;
  weather: Record<string, { temp_c?: number; humidity_pct?: number; wind_kmh?: number; municipality_code?: string; name?: string; time?: string; error?: string }>;
  aircraft: {
    count: number;
    stale: boolean;
    aircraft: { icao24: string; callsign: string; country: string; lon: number; lat: number; altitude_m: number; velocity_ms: number; heading: number }[];
  };
  marine: {
    count: number;
    connected: boolean;
    vessels: { mmsi: string; name: string; type: string; lon: number; lat: number; cog?: number; heading?: number }[];
  };
  cyclones: { count: number; active_storms: unknown[]; source: string };
  feeds?: {
    weather: TelemetryFeedMeta;
    aircraft: TelemetryFeedMeta;
    marine: TelemetryFeedMeta;
    cyclones: TelemetryFeedMeta;
  };
}

export interface SensorObservationRecord {
  "@iot.id": string;
  phenomenonTime: string;
  resultTime?: string;
  result: number | string | boolean | null;
  resultQuality?: string;
  parameters?: Record<string, unknown>;
}

export interface SensorDatastreamRecord {
  "@iot.id": string;
  name: string;
  description?: string;
  unitOfMeasurement?: { name?: string; symbol?: string; definition?: string };
  Observations?: SensorObservationRecord[];
}

export interface SensorLocationRecord {
  "@iot.id": string;
  name?: string;
  encodingType?: string;
  location?: { type: string; coordinates: [number, number] };
}

export interface SensorThingRecord {
  "@iot.id": string;
  "@iot.selfLink"?: string;
  name: string;
  description?: string;
  properties?: {
    category?: string;
    municipality_code?: string;
    feed_status?: string;
    origin?: string;
    source?: string;
    [key: string]: unknown;
  };
  Locations?: SensorLocationRecord[];
  Datastreams?: SensorDatastreamRecord[];
}

export interface SensorThingsCollectionResponse {
  "@iot.count"?: number;
  value: SensorThingRecord[];
}

export interface LayerVisibility {
  buildings3d: boolean;
  agebs: boolean;
  zoning: boolean;
  aquifers: boolean;
  tandeo: boolean;
  powerGrid: boolean;
  services: boolean;
  transit: boolean;
  poer: boolean;
  anps: boolean;
  corridorArcs: boolean;
  plannedProjects: boolean;
  liveTelemetry: boolean;
  citizenPins: boolean;
  waterNetworkLc: boolean;
  arroyosRivers: boolean;
  hazardAtlas: boolean;
  parksPublicSpace: boolean;
  landTenure: boolean;
  mobilityArterials: boolean;
  airportsPortsMarinas: boolean;
  coastalEcosystems: boolean;
  culturalHeritage: boolean;
  wasteManagement: boolean;
  topographyContours: boolean;
}

export interface CitizenPin {
  pin_id: string;
  lon: number;
  lat: number;
  municipality_code: string;
  pmdu_period: string;
  category: string;
  title: string;
  comment: string;
  author_alias: string;
  status: "approved" | "pending_moderation" | "rejected" | string;
  created_at: string;
  moderated_at: string;
  moderator_note: string;
  seeded_example: boolean;
  pii_redacted: boolean;
}

export interface PmduConsultationPeriod {
  id: string;
  municipality_code: string;
  label_es: string;
  label_en: string;
  window: string;
  status: string;
}

export interface ParticipationCategoryMeta {
  id: string;
  label_es: string;
  label_en: string;
}

export interface ParticipationResponse {
  count: number;
  approved_count: number;
  pending_count: number;
  include_pending: boolean;
  persistence_backend: string;
  moderation_rbac_mode: string;
  pmdu_periods: PmduConsultationPeriod[];
  categories: ParticipationCategoryMeta[];
  privacy_notice_es: string;
  privacy_notice_en: string;
  pins: CitizenPin[];
}

export interface GovernanceDocumentSpec {
  id: string;
  category: string;
  path: string;
  title_es: string;
  title_en: string;
  summary_es: string;
  summary_en: string;
  exists: boolean;
  size_bytes: number;
}

export interface GovernanceSummaryResponse {
  framework: string;
  legal_frameworks: string[];
  steering_committee: { entity: string; role: string }[];
  data_classification_tiers: { tier: string; license: string; scope: string }[];
  technical_controls: Record<string, boolean>;
  documents: GovernanceDocumentSpec[];
}

export interface ClientConfigResponse {
  google_maps_api_key: string;
  cesium_ion_token: string;
  maptiler_key: string;
}
