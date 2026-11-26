import type {
  AerialTour,
  ArchitectureResponse,
  BuildingRecord,
  ChatResponse,
  CitizenPin,
  ClientConfigResponse,
  CorridorPreset,
  GoalGapResponse,
  GovernanceSummaryResponse,
  InspectResponse,
  LiveTelemetrySummary,
  MetadataCatalogResponse,
  OgcPhysicsJobResult,
  OgcPhysicsJobStatus,
  OgcPhysicsProcessId,
  OverviewResponse,
  ParticipationResponse,
  RecommendationsResponse,
  SensorThingsCollectionResponse,
  SimulationResponse,
  Tiles3DInfoResponse,
  ZoningParcelRecord,
} from "../types/twin";

const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

export const TwinAPI = {
  getOverview: () => apiFetch<OverviewResponse>("/api/twin/overview"),
  getLayer: (layerId: string) => apiFetch<GeoJSON.FeatureCollection>(`/api/twin/layer/${layerId}`),
  getBuildings: (
    bbox: [number, number, number, number],
    limit = 6500,
    signal?: AbortSignal,
  ) => {
    const [minx, miny, maxx, maxy] = bbox;
    const qs = new URLSearchParams({
      minx: String(minx),
      miny: String(miny),
      maxx: String(maxx),
      maxy: String(maxy),
      limit: String(limit),
    });
    return apiFetch<{ count: number; buildings: BuildingRecord[] }>(`/api/twin/buildings?${qs}`, { signal });
  },
  getCityBuildingsCesium: (citySlug: string, limit = 2400) =>
    apiFetch<{ city_slug: string; count: number; buildings: BuildingRecord[] }>(
      `/api/twin/buildings/city/${encodeURIComponent(citySlug)}?limit=${limit}`,
    ),
  getZoning: (bbox: [number, number, number, number], limit = 3000, signal?: AbortSignal) => {
    const [minx, miny, maxx, maxy] = bbox;
    const qs = new URLSearchParams({
      minx: String(minx),
      miny: String(miny),
      maxx: String(maxx),
      maxy: String(maxy),
      limit: String(limit),
    });
    return apiFetch<{ count: number; parcels: ZoningParcelRecord[] }>(`/api/twin/zoning?${qs}`, { signal });
  },
  inspect: (payload: { lon: number; lat: number; building_pk?: number | null; ageb_cvegeo?: string | null }) =>
    apiFetch<InspectResponse>("/api/twin/inspect", { method: "POST", body: JSON.stringify(payload) }),
  simulate: (payload: {
    scope_id: string;
    scenario_name: string;
    target_year: number;
    custom_levers?: Record<string, number> | null;
    language?: "es" | "en";
  }) => apiFetch<SimulationResponse>("/api/twin/simulate", { method: "POST", body: JSON.stringify(payload) }),
  compareScenarios: (scopeId: string) =>
    apiFetch<Record<string, unknown>>(`/api/twin/scenarios/compare/${encodeURIComponent(scopeId)}`),
  computeGoalGap: (payload: {
    scope_id: string;
    target_city15_score: number;
    target_infill_share_pct: number;
    target_ptar_reuse_pct: number;
    target_rooftop_solar_pct: number;
    target_suds_coverage_pct: number;
    language?: "es" | "en";
  }) => apiFetch<GoalGapResponse>("/api/twin/goal-gap", { method: "POST", body: JSON.stringify(payload) }),
  getRecommendations: (scopeId: string, language: "es" | "en" = "es") =>
    apiFetch<RecommendationsResponse>(`/api/twin/recommendations/${encodeURIComponent(scopeId)}?language=${language}`),
  chat: (payload: { query: string; scope_id: string; scenario_name: string; language?: "es" | "en" }) =>
    apiFetch<ChatResponse>("/api/twin/chat", { method: "POST", body: JSON.stringify(payload) }),
  getArchitecture: (language: "es" | "en" = "es") =>
    apiFetch<ArchitectureResponse>(`/api/twin/architecture?language=${language}`),
  getClientConfig: () => apiFetch<ClientConfigResponse>("/api/twin/client-config"),
  getGovernanceSummary: (language: "es" | "en" = "es") =>
    apiFetch<GovernanceSummaryResponse>(`/api/twin/governance/summary?language=${language}`),
  getParticipationPins: (opts?: {
    pmdu_period?: string;
    category?: string;
    include_pending?: boolean;
    plannerToken?: string;
  }) => {
    const qs = new URLSearchParams();
    if (opts?.pmdu_period) qs.set("pmdu_period", opts.pmdu_period);
    if (opts?.category) qs.set("category", opts.category);
    if (opts?.include_pending) qs.set("include_pending", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const headers: Record<string, string> = {};
    if (opts?.plannerToken) headers["X-BCS-Planner-Token"] = opts.plannerToken;
    return apiFetch<ParticipationResponse>(`/api/twin/participation${suffix}`, { headers });
  },
  submitParticipationPin: (payload: {
    lon: number;
    lat: number;
    category: string;
    title: string;
    comment: string;
    pmdu_period: string;
    author_alias?: string;
  }) =>
    apiFetch<{
      pin: CitizenPin;
      persistence_backend: string;
      message_es: string;
      message_en: string;
    }>("/api/twin/participation", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  moderateParticipationPin: (
    pinId: string,
    payload: { action: "approve" | "reject"; moderator_note?: string },
    plannerToken?: string,
  ) => {
    const headers: Record<string, string> = {};
    if (plannerToken) headers["X-BCS-Planner-Token"] = plannerToken;
    return apiFetch<{ pin: CitizenPin; persistence_backend: string }>(
      `/api/twin/participation/${encodeURIComponent(pinId)}/moderate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
    );
  },
  get3DTilesInfo: () => apiFetch<Tiles3DInfoResponse>("/api/twin/3dtiles/info"),
  getMetadata: () => apiFetch<MetadataCatalogResponse>("/api/twin/metadata"),
  getLiveTelemetry: () => apiFetch<LiveTelemetrySummary>("/api/twin/live/summary"),
  getSensorThings: () =>
    apiFetch<SensorThingsCollectionResponse>(
      "/FROST-Server/v1.1/Things?$expand=Locations,Datastreams($expand=Observations($top=1))",
    ),
  getTours: () => apiFetch<{ tours: AerialTour[]; corridors: Record<string, CorridorPreset> }>("/api/twin/tours"),
  executeOgcProcessAsync: (processId: OgcPhysicsProcessId, inputs: Record<string, unknown>) =>
    apiFetch<OgcPhysicsJobStatus>(`/ogc/processes/${processId}/execution`, {
      method: "POST",
      headers: { Prefer: "respond-async" },
      body: JSON.stringify({ inputs, mode: "async" }),
    }),
  getOgcJobStatus: (jobId: string) => apiFetch<OgcPhysicsJobStatus>(`/ogc/jobs/${encodeURIComponent(jobId)}`),
  getOgcJobResults: (jobId: string) => apiFetch<OgcPhysicsJobResult>(`/ogc/jobs/${encodeURIComponent(jobId)}/results`),
  buildExportUrl: (
    kind: "dxf" | "obj3d" | "bim-package" | "unreal-manifest",
    opts: { corridor?: string; bbox?: [number, number, number, number] | null; label?: string },
  ) => {
    const qs = new URLSearchParams();
    if (opts.corridor && opts.corridor !== "__viewport__") {
      qs.set("corridor", opts.corridor);
    } else if (opts.bbox) {
      qs.set("minx", String(opts.bbox[0]));
      qs.set("miny", String(opts.bbox[1]));
      qs.set("maxx", String(opts.bbox[2]));
      qs.set("maxy", String(opts.bbox[3]));
    } else {
      qs.set("corridor", "el_tezal");
    }
    if (opts.label) qs.set("label", opts.label);
    return `${BASE}/api/twin/export/${kind}?${qs.toString()}`;
  },
};
