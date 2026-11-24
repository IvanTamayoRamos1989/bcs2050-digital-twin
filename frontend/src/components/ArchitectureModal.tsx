import React, { useEffect, useState } from "react";
import { Box, CheckCircle2, CircleDashed, Cpu, Download, FileJson, Film, Layers, ShieldCheck, X } from "lucide-react";
import { TwinAPI } from "../api/client";
import type { ArchitectureResponse, CorridorPreset, GovernanceSummaryResponse, MetadataCatalogResponse } from "../types/twin";

interface Props {
  open: boolean;
  onClose: () => void;
  currentBbox?: [number, number, number, number] | null;
  currentZoom?: number;
  corridors?: Record<string, CorridorPreset>;
  onStartTour?: (tourId: string) => void;
}

export const ArchitectureModal: React.FC<Props> = ({
  open,
  onClose,
  currentBbox,
  currentZoom = 6.4,
  corridors,
  onStartTour,
}) => {
  const [data, setData] = useState<ArchitectureResponse | null>(null);
  const [metaCatalog, setMetaCatalog] = useState<MetadataCatalogResponse | null>(null);
  const [governance, setGovernance] = useState<GovernanceSummaryResponse | null>(null);
  const [selectedCorridor, setSelectedCorridor] = useState<string>("el_tezal");

  useEffect(() => {
    if (open && !data) {
      TwinAPI.getArchitecture().then(setData).catch(() => {});
    }
    if (open && !metaCatalog) {
      TwinAPI.getMetadata().then(setMetaCatalog).catch(() => {});
    }
    if (open && !governance) {
      TwinAPI.getGovernanceSummary().then(setGovernance).catch(() => {});
    }
  }, [open, data, metaCatalog, governance]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && currentZoom >= 12.0 && currentBbox && selectedCorridor === "el_tezal") {
      // Keep default preset unless user selects viewport explicitly
    }
  }, [open, currentZoom, currentBbox, selectedCorridor]);

  if (!open) return null;

  const corridorList = corridors ? Object.values(corridors) : [];
  const exportLabel =
    selectedCorridor === "__viewport__"
      ? "Vista_Actual_BCS2050"
      : corridors?.[selectedCorridor]?.label || "Corredor_El_Tezal";
  const exportOpts = {
    corridor: selectedCorridor,
    bbox: selectedCorridor === "__viewport__" ? currentBbox : null,
    label: exportLabel,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="arch-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
    >
      <div className="glass-panel flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-sky-400" aria-hidden="true" />
            <div>
              <h2 id="arch-modal-title" className="text-sm font-bold text-white">
                Gobernanza BCS2050 · Arquitectura Empresarial, Privacidad y Stack OGC
              </h2>
              <p className="text-[11px] text-slate-300">
                Principios Gemini · LGPDPPSO/LFPDPPP · CityGML 3.0 LoD2.2 · Catálogo 126 Herramientas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo de gobernanza y arquitectura"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="twin-scroll overflow-y-auto p-5 space-y-5 text-xs">
          {data ? (
            <>
              {/* Institutional Governance, Privacy DPIA & CityGML 3.0 RFP */}
              {governance && (
                <div className="rounded-xl bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-emerald-950/50 p-4 ring-1 ring-emerald-400/35 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white">
                        Gobernanza Institucional (Principios Gemini) · Privacidad DPIA · RFP CityGML 3.0 LoD2.2
                      </h3>
                      <p className="text-[10.5px] text-slate-300">
                        {governance.framework} · Marco legal: {governance.legal_frameworks.join(" · ")}
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-2">
                    {governance.data_classification_tiers.map((tier) => (
                      <div key={tier.tier} className="rounded-lg bg-slate-950/80 p-2.5 ring-1 ring-slate-800 space-y-1">
                        <p className="text-[11px] font-bold text-emerald-300">{tier.tier}</p>
                        <p className="font-mono-num text-[9.5px] text-sky-300">{tier.license}</p>
                        <p className="text-[10px] text-slate-300 leading-snug">{tier.scope}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2">
                    {governance.documents.map((doc) => (
                      <div key={doc.id} className="rounded-lg bg-slate-950/75 p-2.5 ring-1 ring-slate-800 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-white">{doc.title_es}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-mono-num text-[9px] font-semibold ${
                              doc.exists ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"
                            }`}
                          >
                            {doc.exists ? `${Math.round(doc.size_bytes / 1024)} KB` : "MISSING"}
                          </span>
                        </div>
                        <p className="font-mono-num text-[9.5px] text-sky-300">{doc.path}</p>
                        <p className="text-[10px] text-slate-300 leading-snug">{doc.summary_es}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Commercial Keys Status */}
              <div className="rounded-xl bg-slate-900/80 p-3.5 ring-1 ring-slate-700/70">
                <p className="font-mono-num text-[10px] uppercase tracking-wider text-sky-400 mb-2">
                  Estado de Integración de APIs / Licencias Comerciales (Plug & Play en `.env`)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(data.capabilities).map(([k, active]) => (
                    <div
                      key={k}
                      className="flex items-center gap-2 rounded-lg bg-slate-950/70 px-2.5 py-1.5 ring-1 ring-slate-800"
                    >
                      {active ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <CircleDashed className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="text-[11px] text-slate-200 truncate">{k.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AEC / Autodesk / BIM / Lumion / Unreal Bridge */}
              <div className="rounded-xl bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-indigo-950/60 p-4 ring-1 ring-indigo-400/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-indigo-400" />
                    <div>
                      <h3 className="text-xs font-bold text-white">
                        Puente Interoperable AEC · Autodesk · BIM (ISO 19650) · Lumion / Unreal
                      </h3>
                      <p className="text-[10.5px] text-slate-300">
                        Exportación métrica UTM Zona 12N (EPSG:32612) lista para Civil 3D, InfraWorks, Revit, ACC/Tandem, Lumion y UE5
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Corredor o vista a exportar"
                      value={selectedCorridor}
                      onChange={(e) => setSelectedCorridor(e.target.value)}
                      className="rounded-lg bg-slate-950/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 ring-1 ring-slate-700 focus:outline-none cursor-pointer"
                    >
                      {corridorList.length > 0 ? (
                        corridorList.map((c) => (
                          <option key={c.id} value={c.id} className="bg-slate-900">
                            {c.label}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="el_tezal" className="bg-slate-900">Corredor El Tezal · Los Cabos</option>
                          <option value="la_paz_malecon" className="bg-slate-900">Malecón & Centro · La Paz</option>
                          <option value="cabo_san_lucas_centro" className="bg-slate-900">Cabo San Lucas & Marina</option>
                          <option value="san_jose_del_cabo" className="bg-slate-900">San José del Cabo & Estero</option>
                          <option value="loreto_centro" className="bg-slate-900">Centro Histórico · Loreto</option>
                        </>
                      )}
                      {currentBbox && currentZoom >= 11.8 && (
                        <option value="__viewport__" className="bg-slate-900">
                          Vista actual del mapa (Z {currentZoom.toFixed(1)})
                        </option>
                      )}
                    </select>
                    {onStartTour && (
                      <button
                        type="button"
                        onClick={() => {
                          onStartTour("el_tezal");
                          onClose();
                        }}
                        className="flex items-center gap-1 rounded-lg bg-indigo-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/35 cursor-pointer"
                      >
                        <Film className="h-3.5 w-3.5" />
                        <span>Vuelo El Tezal</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <a
                    href={TwinAPI.buildExportUrl("dxf", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-lg bg-sky-500/15 px-3 py-2 text-sky-200 ring-1 ring-sky-400/35 hover:bg-sky-500/25 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-[11px] text-white">.DXF 3D UTM 12N</p>
                      <p className="text-[10px] text-sky-300/90">Civil 3D / InfraWorks / CAD</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <a
                    href={TwinAPI.buildExportUrl("obj3d", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-200 ring-1 ring-emerald-400/35 hover:bg-emerald-500/25 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-[11px] text-white">.OBJ Malla 3D</p>
                      <p className="text-[10px] text-emerald-300/90">Lumion / Unreal Engine</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <a
                    href={TwinAPI.buildExportUrl("bim-package", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-lg bg-indigo-500/15 px-3 py-2 text-indigo-200 ring-1 ring-indigo-400/35 hover:bg-indigo-500/25 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-[11px] text-white">BIM ISO 19650 JSON</p>
                      <p className="text-[10px] text-indigo-300/90">Revit / ACC / Tandem</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <a
                    href={TwinAPI.buildExportUrl("unreal-manifest", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-amber-200 ring-1 ring-amber-400/35 hover:bg-amber-500/25 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-[11px] text-white">Cesium for Unreal</p>
                      <p className="text-[10px] text-amber-300/90">Escena UE5 + Cámara</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </div>

                {data.aec_bim_bridge && (
                  <div className="grid md:grid-cols-2 gap-2.5 pt-1">
                    {data.aec_bim_bridge.map((item) => (
                      <div key={item.layer} className="rounded-lg bg-slate-950/75 p-2.5 ring-1 ring-slate-800 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[11px] text-white">{item.layer}</span>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono-num text-[9px] text-emerald-300 ring-1 ring-emerald-400/30">
                            {item.status}
                          </span>
                        </div>
                        <p className="text-[10.5px] font-semibold text-sky-300">{item.tools}</p>
                        <p className="text-[10.5px] text-slate-300 leading-snug">{item.role_in_bcs2050}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* OGC API Family & OGC 3D Tiles 1.1 Cloud-Native Core */}
              <div className="rounded-xl bg-slate-900/85 p-4 ring-1 ring-cyan-500/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-white">
                      Estándares Abiertos OGC API Family &amp; 3D Tiles 1.1 (glTF 2.0)
                    </h3>
                    <p className="text-[10.5px] text-slate-300">
                      Streaming espacial cloud-native sin baked-data: 396,823 edificios en 283 tiles .glb + MVT + Features + Processes + Records
                    </p>
                  </div>
                  {data.tileset_3d_url && (
                    <a
                      href={data.tileset_3d_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 ring-1 ring-cyan-400/35 hover:bg-cyan-500/25"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      <span>Ver tileset.json (GCS)</span>
                    </a>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[
                    {
                      label: "OGC API - Features",
                      path: data.ogc_endpoints?.features || "/ogc/collections",
                      desc: "18 colecciones vectoriales GeoJSON paginadas",
                    },
                    {
                      label: "OGC API - Tiles (MVT)",
                      path: data.ogc_endpoints?.tiles_mvt || "/ogc/collections/{collection_id}/tiles/WebMercatorQuad/{z}/{y}/{x}.mvt",
                      desc: "Teselas vectoriales binarias Mapbox Vector Tile",
                    },
                    {
                      label: "OGC API - Processes",
                      path: data.ogc_endpoints?.processes || "/ogc/processes",
                      desc: "Simulación 2050 y Goal-Gap síncrono/asíncrono",
                    },
                    {
                      label: "OGC API - Records",
                      path: data.ogc_endpoints?.records || "/ogc/collections/records/items",
                      desc: "Catálogo ISO 19115 + SPDX interoperable",
                    },
                    {
                      label: "OGC SensorThings v1.1",
                      path: data.ogc_endpoints?.sensorthings || "/FROST-Server/v1.1/Things",
                      desc: "Entidades IoT ambientales, hidrológicas y red eléctrica",
                    },
                    {
                      label: "OGC 3D Tiles 1.1 Info",
                      path: "/api/twin/3dtiles/info",
                      desc: "EXT_mesh_features + EXT_structural_metadata (.glb)",
                    },
                  ].map((ep) => (
                    <div key={ep.label} className="rounded-lg bg-slate-950/75 p-2.5 ring-1 ring-slate-800 space-y-1">
                      <p className="font-bold text-[11px] text-cyan-300">{ep.label}</p>
                      <p className="font-mono-num text-[9.5px] text-slate-200 break-all">{ep.path}</p>
                      <p className="text-[10px] text-slate-400">{ep.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Benchmarks */}
              <div className="grid md:grid-cols-2 gap-3">
                {data.benchmarks.map((b) => (
                  <div key={b.name} className="rounded-xl bg-slate-900/75 p-3.5 ring-1 ring-slate-700/70 space-y-1.5">
                    <h3 className="font-bold text-sky-300">{b.name}</h3>
                    <p className="font-mono-num text-[10px] text-slate-400">{b.reference}</p>
                    <p className="text-slate-300">{b.metrics}</p>
                    <p className="text-emerald-300/90 text-[11px] pt-1 border-t border-slate-800">
                      <strong>En BCS2050:</strong> {b.adoption_in_bcs2050}
                    </p>
                  </div>
                ))}
              </div>

              {/* Commercial Tiers */}
              <div>
                <p className="font-mono-num text-[10px] uppercase tracking-wider text-amber-400 mb-2">
                  Matriz de Licencias, Software, APIs y Datos Comerciales Recomendados
                </p>
                <div className="grid md:grid-cols-3 gap-3">
                  {data.commercial_tiers.map((t) => (
                    <div key={t.tier} className="rounded-xl bg-slate-900/80 p-3.5 ring-1 ring-slate-700/70 space-y-2">
                      <div>
                        <h4 className="font-bold text-white">{t.tier}</h4>
                        <p className="font-mono-num text-sm font-bold text-emerald-400 mt-0.5">{t.budget_usd_yr} / año</p>
                      </div>
                      <ul className="space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                        {t.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Source Stack */}
              <div>
                <p className="font-mono-num text-[10px] uppercase tracking-wider text-emerald-400 mb-2">
                  Top Motores Open Source del Catálogo (Orquestados vía OGC API Processes)
                </p>
                <div className="grid md:grid-cols-2 gap-2">
                  {data.top_opensource_engines.map((e) => (
                    <div
                      key={e.name}
                      className="flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2 ring-1 ring-slate-800"
                    >
                      <div>
                        <p className="font-semibold text-white">{e.name}</p>
                        <p className="text-[10.5px] text-slate-400">{e.category}</p>
                      </div>
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-mono-num text-[9.5px] text-sky-300">
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ISO 19115 / DCAT-AP / SPDX Metadata & KPI Reconciliation */}
              {metaCatalog && (
                <div className="rounded-xl bg-slate-900/85 p-4 ring-1 ring-emerald-500/30 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <div>
                        <h3 className="text-xs font-bold text-white">
                          Catálogo ISO 19115 · Licencias SPDX &amp; Reconciliación de KPIs
                        </h3>
                        <p className="text-[10.5px] text-slate-300">
                          {metaCatalog.summary.total_records} capas documentadas ({metaCatalog.summary.twin_records} Gemelo 3D +{" "}
                          {metaCatalog.summary.panel_v2_records} Panel v2) · Oficial vs. Modelado explícito
                        </p>
                      </div>
                    </div>
                    <a
                      href="/api/twin/metadata"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/35 hover:bg-emerald-500/25"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      <span>Ver JSON ISO 19115</span>
                    </a>
                  </div>

                  <p className="text-[10.5px] text-slate-300 leading-snug bg-slate-950/70 rounded-lg p-2.5 ring-1 ring-slate-800">
                    <strong className="text-emerald-300">Verdad Única BigQuery (`gold_kpi_state_summary`):</strong>{" "}
                    {metaCatalog.canonical_kpis.state.reconciliation_notes}
                  </p>

                  <div className="grid sm:grid-cols-5 gap-1.5">
                    {metaCatalog.canonical_kpis.municipal_coverage_audit.map((aud) => (
                      <div key={aud.municipality_code} className="rounded-lg bg-slate-950/75 p-2 ring-1 ring-slate-800 text-[10px]">
                        <p className="font-bold text-white">{aud.municipality_name}</p>
                        <p className="font-mono-num text-[9px] text-sky-300 mt-0.5 truncate" title={aud.water_rationing_status}>
                          Agua: {aud.water_rationing_status}
                        </p>
                        <p className="font-mono-num text-[9px] text-amber-300 truncate" title={aud.transit_inventory_status}>
                          Bus: {aud.transit_inventory_status}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-400">Cargando catálogo arquitectónico...</p>
          )}
        </div>
      </div>
    </div>
  );
};
