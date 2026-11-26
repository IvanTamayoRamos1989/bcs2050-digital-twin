import React, { useEffect, useState } from "react";
import { Box, CheckCircle2, CircleDashed, Cpu, Download, FileJson, Film, ShieldCheck, X } from "lucide-react";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
    >
      <div className="ios-glass flex max-h-[88vh] w-full max-w-4xl flex-col rounded-[28px] overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF]/20 text-[#0A84FF]">
              <Cpu className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="arch-modal-title" className="text-[15px] font-semibold tracking-tight text-[#F5F5F7]">
                Gobernanza BCS2050 · Arquitectura, Privacidad y Stack OGC
              </h2>
              <p className="text-[11px] text-[#EBEBF5]/60">
                Principios Gemini · LGPDPPSO/LFPDPPP · CityGML 3.0 LoD2.2 · Catálogo 126 Herramientas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo de gobernanza y arquitectura"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-[#EBEBF5]/75 hover:bg-white/[0.15] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="twin-scroll overflow-y-auto p-5 space-y-5 text-xs">
          {data ? (
            <>
              {/* Institutional Governance, Privacy DPIA & CityGML 3.0 RFP */}
              {governance && (
                <div className="ios-surface rounded-2xl p-4 ring-1 ring-[#30D158]/25 space-y-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-[#F5F5F7]">
                      Gobernanza Institucional (Principios Gemini) · Privacidad DPIA · RFP CityGML 3.0 LoD2.2
                    </h3>
                    <p className="text-[11px] text-[#EBEBF5]/65 mt-0.5">
                      {governance.framework} · Marco legal: {governance.legal_frameworks.join(" · ")}
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-2.5">
                    {governance.data_classification_tiers.map((tier) => (
                      <div key={tier.tier} className="rounded-xl bg-white/[0.04] p-3 space-y-1">
                        <p className="text-[11.5px] font-semibold text-[#30D158]">{tier.tier}</p>
                        <p className="font-mono-num text-[9.5px] text-[#64D2FF]">{tier.license}</p>
                        <p className="text-[10.5px] text-[#EBEBF5]/75 leading-snug">{tier.scope}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {governance.documents.map((doc) => (
                      <div key={doc.id} className="rounded-xl bg-white/[0.04] p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-semibold text-[#F5F5F7]">{doc.title_es}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono-num text-[9.5px] font-semibold ${
                              doc.exists ? "bg-[#30D158]/15 text-[#30D158]" : "bg-[#FF9F0A]/15 text-[#FF9F0A]"
                            }`}
                          >
                            {doc.exists ? `${Math.round(doc.size_bytes / 1024)} KB` : "MISSING"}
                          </span>
                        </div>
                        <p className="font-mono-num text-[9.5px] text-[#64D2FF]">{doc.path}</p>
                        <p className="text-[10.5px] text-[#EBEBF5]/75 leading-snug">{doc.summary_es}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Commercial Keys Status */}
              <div className="ios-surface rounded-2xl p-4">
                <p className="text-[11px] font-semibold text-[#64D2FF] mb-2.5">
                  Estado de Integración de APIs / Licencias Comerciales
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(data.capabilities).map(([k, active]) => (
                    <div
                      key={k}
                      className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2"
                    >
                      {active ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#30D158] shrink-0" />
                      ) : (
                        <CircleDashed className="h-3.5 w-3.5 text-[#FF9F0A] shrink-0" />
                      )}
                      <span className="text-[11px] text-[#F5F5F7] truncate">{k.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AEC / Autodesk / BIM / Lumion / Unreal Bridge */}
              <div className="ios-surface rounded-2xl p-4 ring-1 ring-[#0A84FF]/25 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A84FF]/20 text-[#0A84FF]">
                      <Box className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-[#F5F5F7]">
                        Puente Interoperable AEC · Autodesk · BIM (ISO 19650) · Lumion / Unreal
                      </h3>
                      <p className="text-[10.5px] text-[#EBEBF5]/65">
                        Exportación métrica UTM Zona 12N (EPSG:32612) para Civil 3D, InfraWorks, Revit, ACC y UE5
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Corredor o vista a exportar"
                      value={selectedCorridor}
                      onChange={(e) => setSelectedCorridor(e.target.value)}
                      className="ios-input rounded-full px-3 py-1.5 text-[11px] font-medium cursor-pointer"
                    >
                      {corridorList.length > 0 ? (
                        corridorList.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#16161A] text-[#F5F5F7]">
                            {c.label}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="el_tezal" className="bg-[#16161A] text-[#F5F5F7]">Corredor El Tezal · Los Cabos</option>
                          <option value="la_paz_malecon" className="bg-[#16161A] text-[#F5F5F7]">Malecón & Centro · La Paz</option>
                          <option value="cabo_san_lucas_centro" className="bg-[#16161A] text-[#F5F5F7]">Cabo San Lucas & Marina</option>
                          <option value="san_jose_del_cabo" className="bg-[#16161A] text-[#F5F5F7]">San José del Cabo & Estero</option>
                          <option value="loreto_centro" className="bg-[#16161A] text-[#F5F5F7]">Centro Histórico · Loreto</option>
                        </>
                      )}
                      {currentBbox && currentZoom >= 11.8 && (
                        <option value="__viewport__" className="bg-[#16161A] text-[#F5F5F7]">
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
                        className="flex items-center gap-1.5 rounded-full bg-[#0A84FF] hover:bg-[#409CFF] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors cursor-pointer"
                      >
                        <Film className="h-3.5 w-3.5" />
                        <span>Vuelo El Tezal</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <a
                    href={TwinAPI.buildExportUrl("dxf", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#0A84FF]/15 px-3 py-2.5 text-[#64D2FF] hover:bg-[#0A84FF]/25 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-[11.5px] text-[#F5F5F7]">.DXF 3D UTM 12N</p>
                      <p className="text-[10px] text-[#64D2FF]">Civil 3D / InfraWorks</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <a
                    href={TwinAPI.buildExportUrl("obj3d", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#30D158]/15 px-3 py-2.5 text-[#30D158] hover:bg-[#30D158]/25 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-[11.5px] text-[#F5F5F7]">.OBJ Malla 3D</p>
                      <p className="text-[10px] text-[#30D158]">Lumion / Unreal Engine</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <a
                    href={TwinAPI.buildExportUrl("bim-package", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#BF5AF2]/15 px-3 py-2.5 text-[#DA8FFF] hover:bg-[#BF5AF2]/25 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-[11.5px] text-[#F5F5F7]">BIM ISO 19650</p>
                      <p className="text-[10px] text-[#DA8FFF]">Revit / ACC / Tandem</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <a
                    href={TwinAPI.buildExportUrl("unreal-manifest", exportOpts)}
                    download
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#FF9F0A]/15 px-3 py-2.5 text-[#FF9F0A] hover:bg-[#FF9F0A]/25 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-[11.5px] text-[#F5F5F7]">Cesium for Unreal</p>
                      <p className="text-[10px] text-[#FF9F0A]">Escena UE5 + Cámara</p>
                    </div>
                    <Download className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </div>

                {data.aec_bim_bridge && (
                  <div className="grid md:grid-cols-2 gap-2.5 pt-1">
                    {data.aec_bim_bridge.map((item) => (
                      <div key={item.layer} className="rounded-xl bg-white/[0.04] p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[11.5px] text-[#F5F5F7]">{item.layer}</span>
                          <span className="rounded-full bg-[#30D158]/15 px-2 py-0.5 font-mono-num text-[9px] font-semibold text-[#30D158]">
                            {item.status}
                          </span>
                        </div>
                        <p className="text-[10.5px] font-semibold text-[#64D2FF]">{item.tools}</p>
                        <p className="text-[10.5px] text-[#EBEBF5]/75 leading-snug">{item.role_in_bcs2050}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* OGC API Family & OGC 3D Tiles 1.1 Cloud-Native Core */}
              <div className="ios-surface rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-[#F5F5F7]">
                      Estándares Abiertos OGC API Family &amp; 3D Tiles 1.1 (glTF 2.0)
                    </h3>
                    <p className="text-[10.5px] text-[#EBEBF5]/65">
                      Streaming espacial cloud-native: 396,823 edificios en 283 tiles .glb + MVT + Features + Processes
                    </p>
                  </div>
                  {data.tileset_3d_url && (
                    <a
                      href={data.tileset_3d_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-full bg-[#64D2FF]/15 px-3 py-1.5 text-[11px] font-semibold text-[#64D2FF] hover:bg-[#64D2FF]/25"
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
                    <div key={ep.label} className="rounded-xl bg-white/[0.04] p-3 space-y-1">
                      <p className="font-semibold text-[11px] text-[#64D2FF]">{ep.label}</p>
                      <p className="font-mono-num text-[9.5px] text-[#F5F5F7] break-all">{ep.path}</p>
                      <p className="text-[10px] text-[#EBEBF5]/60">{ep.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Benchmarks */}
              <div className="grid md:grid-cols-2 gap-3">
                {data.benchmarks.map((b) => (
                  <div key={b.name} className="ios-surface rounded-2xl p-3.5 space-y-1.5">
                    <h3 className="font-semibold text-[#64D2FF]">{b.name}</h3>
                    <p className="font-mono-num text-[10px] text-[#EBEBF5]/55">{b.reference}</p>
                    <p className="text-[#EBEBF5]/80">{b.metrics}</p>
                    <p className="text-[#30D158] text-[11px] pt-1.5 border-t border-white/[0.08]">
                      <strong>En BCS2050:</strong> {b.adoption_in_bcs2050}
                    </p>
                  </div>
                ))}
              </div>

              {/* Commercial Tiers */}
              <div>
                <p className="text-[11px] font-semibold text-[#FF9F0A] mb-2">
                  Matriz de Licencias, Software y APIs Comerciales
                </p>
                <div className="grid md:grid-cols-3 gap-3">
                  {data.commercial_tiers.map((t) => (
                    <div key={t.tier} className="ios-surface rounded-2xl p-3.5 space-y-2">
                      <div>
                        <h4 className="font-semibold text-[#F5F5F7]">{t.tier}</h4>
                        <p className="font-mono-num text-sm font-semibold text-[#30D158] mt-0.5">{t.budget_usd_yr} / año</p>
                      </div>
                      <ul className="space-y-1 text-[11px] text-[#EBEBF5]/75 list-disc pl-4">
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
                <p className="text-[11px] font-semibold text-[#30D158] mb-2">
                  Motores Open Source (Orquestados vía OGC API Processes)
                </p>
                <div className="grid md:grid-cols-2 gap-2">
                  {data.top_opensource_engines.map((e) => (
                    <div
                      key={e.name}
                      className="ios-surface flex items-center justify-between rounded-xl px-3 py-2"
                    >
                      <div>
                        <p className="font-semibold text-[#F5F5F7]">{e.name}</p>
                        <p className="text-[10.5px] text-[#EBEBF5]/60">{e.category}</p>
                      </div>
                      <span className="rounded-full bg-[#0A84FF]/15 px-2.5 py-0.5 font-mono-num text-[9.5px] font-semibold text-[#64D2FF]">
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ISO 19115 / DCAT-AP / SPDX Metadata & KPI Reconciliation */}
              {metaCatalog && (
                <div className="ios-surface rounded-2xl p-4 ring-1 ring-[#30D158]/25 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[#30D158]" />
                      <div>
                        <h3 className="text-[12.5px] font-semibold text-[#F5F5F7]">
                          Catálogo ISO 19115 · Licencias SPDX &amp; Reconciliación de KPIs
                        </h3>
                        <p className="text-[10.5px] text-[#EBEBF5]/65">
                          {metaCatalog.summary.total_records} capas documentadas ({metaCatalog.summary.twin_records} Gemelo 3D +{" "}
                          {metaCatalog.summary.panel_v2_records} Panel v2) · Oficial vs. Modelado explícito
                        </p>
                      </div>
                    </div>
                    <a
                      href="/api/twin/metadata"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-full bg-[#30D158]/15 px-3 py-1.5 text-[11px] font-semibold text-[#30D158] hover:bg-[#30D158]/25"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      <span>Ver JSON ISO 19115</span>
                    </a>
                  </div>

                  <p className="text-[10.5px] text-[#EBEBF5]/80 leading-snug rounded-xl bg-white/[0.04] p-3">
                    <strong className="text-[#30D158]">Verdad Única BigQuery (`gold_kpi_state_summary`):</strong>{" "}
                    {metaCatalog.canonical_kpis.state.reconciliation_notes}
                  </p>

                  <div className="grid sm:grid-cols-5 gap-2">
                    {metaCatalog.canonical_kpis.municipal_coverage_audit.map((aud) => (
                      <div key={aud.municipality_code} className="rounded-xl bg-white/[0.04] p-2.5 text-[10px]">
                        <p className="font-semibold text-[#F5F5F7]">{aud.municipality_name}</p>
                        <p className="font-mono-num text-[9px] text-[#64D2FF] mt-0.5 truncate" title={aud.water_rationing_status}>
                          Agua: {aud.water_rationing_status}
                        </p>
                        <p className="font-mono-num text-[9px] text-[#FF9F0A] truncate" title={aud.transit_inventory_status}>
                          Bus: {aud.transit_inventory_status}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[#EBEBF5]/60">Cargando catálogo arquitectónico...</p>
          )}
        </div>
      </div>
    </div>
  );
};
