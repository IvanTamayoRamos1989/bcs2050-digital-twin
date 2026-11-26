import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Crosshair,
  MapPin,
  MessageSquarePlus,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { TwinAPI } from "../api/client";
import type {
  CameraPreset,
  CitizenPin,
  ParticipationCategoryMeta,
  PmduConsultationPeriod,
} from "../types/twin";

interface Props {
  open: boolean;
  onClose: () => void;
  language: "es" | "en";
  pins: CitizenPin[];
  sessionSubmittedPins: CitizenPin[];
  pmduPeriods: PmduConsultationPeriod[];
  categories: ParticipationCategoryMeta[];
  pinPlacementMode: boolean;
  onTogglePinPlacementMode: () => void;
  pendingPinCoords: { lon: number; lat: number } | null;
  onSetManualCoords: (coords: { lon: number; lat: number }) => void;
  onPinSubmitted: (pin: CitizenPin) => void;
  onPinsUpdated: () => void;
  onFlyTo: (cam: CameraPreset) => void;
}

const QUICK_LOCATIONS: { label: string; lon: number; lat: number }[] = [
  { label: "La Paz · Malecón / Centro", lon: -110.3128, lat: 24.1564 },
  { label: "Cabo San Lucas · El Tezal", lon: -109.8975, lat: 22.9052 },
  { label: "San José del Cabo · Estero", lon: -109.6895, lat: 23.0582 },
  { label: "Loreto · Centro / Arroyo", lon: -111.3452, lat: 26.0116 },
  { label: "Cd. Constitución · Centro", lon: -111.6705, lat: 25.0318 },
];

export const ParticipationPanel: React.FC<Props> = ({
  open,
  onClose,
  language,
  pins,
  sessionSubmittedPins,
  pmduPeriods,
  categories,
  pinPlacementMode,
  onTogglePinPlacementMode,
  pendingPinCoords,
  onSetManualCoords,
  onPinSubmitted,
  onPinsUpdated,
  onFlyTo,
}) => {
  const isEn = language === "en";
  const [pmduPeriod, setPmduPeriod] = useState<string>("PMDU-LPZ-2026");
  const [category, setCategory] = useState<string>("water");
  const [title, setTitle] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [authorAlias, setAuthorAlias] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [modOpen, setModOpen] = useState(false);
  const [plannerToken, setPlannerToken] = useState("");
  const [queuePins, setQueuePins] = useState<CitizenPin[]>([]);
  const [modMessage, setModMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const coords = pendingPinCoords || { lon: -110.3128, lat: 24.1564 };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);
    try {
      const res = await TwinAPI.submitParticipationPin({
        lon: coords.lon,
        lat: coords.lat,
        category,
        pmdu_period: pmduPeriod,
        title: title.trim(),
        comment: comment.trim(),
        author_alias: authorAlias.trim() || undefined,
      });
      onPinSubmitted(res.pin);
      setTitle("");
      setComment("");
      setSubmitNotice(isEn ? res.message_en : res.message_es);
      onFlyTo({ lon: res.pin.lon, lat: res.pin.lat, zoom: 14.5, pitch: 52, bearing: -15 });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadModerationQueue = async () => {
    setModMessage(null);
    try {
      const res = await TwinAPI.getParticipationPins({
        include_pending: true,
        plannerToken: plannerToken.trim() || undefined,
      });
      setQueuePins(res.pins.filter((p) => p.status === "pending_moderation"));
    } catch (err) {
      setModMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleModerate = async (pinId: string, action: "approve" | "reject") => {
    setModMessage(null);
    try {
      await TwinAPI.moderateParticipationPin(
        pinId,
        { action, moderator_note: action === "approve" ? "Aprobado en mesa PMDU" : "Rechazado en moderación" },
        plannerToken.trim() || undefined,
      );
      setQueuePins((prev) => prev.filter((p) => p.pin_id !== pinId));
      setModMessage(
        action === "approve"
          ? isEn ? "Pin approved and published on the 3D map." : "Pin aprobado y publicado en el mapa 3D."
          : isEn ? "Pin rejected." : "Pin rechazado.",
      );
      onPinsUpdated();
    } catch (err) {
      setModMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="participation-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md p-3 sm:p-5"
    >
      <div className="hig-glass-sidebar flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[28px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--hig-divider)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF]/18 text-[var(--hig-accent)]">
              <MessageSquarePlus className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 id="participation-dialog-title" className="text-[15px] font-semibold tracking-tight text-[var(--hig-ink)]">
                {isEn
                  ? "Citizen Participation · 3D PMDU Consultation"
                  : "Participación Ciudadana · Consulta Pública PMDU"}
              </h2>
              <p className="text-[11px] text-[var(--hig-ink-2)]">
                {isEn
                  ? "Inspired by 3D Rotterdam & Helsinki · Moderated by SEPUIMM / IMPLAN"
                  : "Inspirado en Rotterdam 3D y Helsinki · Moderado por SEPUIMM / IMPLAN"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? "Close citizen participation panel" : "Cerrar panel de participación"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="twin-scroll overflow-y-auto p-5 space-y-4 text-xs">
          {/* Submission Form */}
          <form onSubmit={handleSubmit} className="hig-content-group rounded-2xl p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] font-semibold text-[var(--hig-ink)]">
                {isEn ? "1. Locate & Submit Your Neighborhood Proposal" : "1. Ubica y Envía tu Propuesta Ciudadana"}
              </p>
              <button
                type="button"
                onClick={() => {
                  onTogglePinPlacementMode();
                  if (!pinPlacementMode) onClose();
                }}
                aria-pressed={pinPlacementMode}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                  pinPlacementMode
                    ? "bg-[#FF9F0A] text-[#050507]"
                    : "bg-[#0A84FF]/18 text-[var(--hig-accent)] hover:bg-[#0A84FF]/28"
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span>
                  {isEn ? "Pick Location on 3D Map" : "Clic para Ubicar Pin en Mapa 3D"}
                </span>
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pin-coords-preset" className="block text-[11px] font-medium text-[var(--hig-ink-2)] mb-1">
                  {isEn ? "Coordinates / Reference Zone" : "Coordenadas / Zona de Referencia"}
                </label>
                <select
                  id="pin-coords-preset"
                  value=""
                  onChange={(e) => {
                    const chosen = QUICK_LOCATIONS.find((q) => q.label === e.target.value);
                    if (chosen) onSetManualCoords({ lon: chosen.lon, lat: chosen.lat });
                  }}
                  className="ios-input w-full rounded-xl px-3 py-2 text-[11.5px]"
                >
                  <option value="" className="bg-[var(--hig-select-bg)] text-[var(--hig-ink)]">
                    {`${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)} (${isEn ? "Change preset..." : "Elegir zona..."})`}
                  </option>
                  {QUICK_LOCATIONS.map((q) => (
                    <option key={q.label} value={q.label} className="bg-[var(--hig-select-bg)] text-[var(--hig-ink)]">
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pin-period" className="block text-[11px] font-medium text-[var(--hig-ink-2)] mb-1">
                  {isEn ? "PMDU Consultation Period" : "Instrumento / Consulta PMDU"}
                </label>
                <select
                  id="pin-period"
                  value={pmduPeriod}
                  onChange={(e) => setPmduPeriod(e.target.value)}
                  className="ios-input w-full rounded-xl px-3 py-2 text-[11.5px]"
                >
                  {pmduPeriods.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[var(--hig-select-bg)] text-[var(--hig-ink)]">
                      {isEn ? p.label_en : p.label_es} ({p.window})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pin-category" className="block text-[11px] font-medium text-[var(--hig-ink-2)] mb-1">
                  {isEn ? "Theme Category" : "Tema Urbano"}
                </label>
                <select
                  id="pin-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="ios-input w-full rounded-xl px-3 py-2 text-[11.5px]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[var(--hig-select-bg)] text-[var(--hig-ink)]">
                      {isEn ? c.label_en : c.label_es}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pin-alias" className="block text-[11px] font-medium text-[var(--hig-ink-2)] mb-1">
                  {isEn ? "Alias / Neighborhood (No real name)" : "Alias o Colonia (Sin nombre real)"}
                </label>
                <input
                  id="pin-alias"
                  type="text"
                  maxLength={48}
                  value={authorAlias}
                  onChange={(e) => setAuthorAlias(e.target.value)}
                  placeholder={isEn ? "e.g. El Manglito Neighbor" : "Ej. Vecino El Manglito"}
                  className="ios-input w-full rounded-xl px-3 py-2 text-[11.5px] placeholder:text-[var(--hig-ink-3)]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pin-title" className="block text-[11px] font-medium text-[var(--hig-ink-2)] mb-1">
                {isEn ? "Short Title (min 3 chars)" : "Título Breve (mín. 3 caracteres)"}
              </label>
              <input
                id="pin-title"
                type="text"
                required
                minLength={3}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  isEn
                    ? "e.g. Shaded bus stop & rain garden on Forjadores"
                    : "Ej. Parada con sombra y jardín pluvial en cruce Forjadores"
                }
                className="ios-input w-full rounded-xl px-3 py-2 text-[11.5px] placeholder:text-[var(--hig-ink-3)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pin-comment" className="block text-[11px] font-medium text-[var(--hig-ink-2)]">
                  {isEn ? "Detailed Proposal / Observation (10–600 chars)" : "Propuesta u Observación (10–600 caracteres)"}
                </label>
                <span className="font-mono-num text-[10px] text-[var(--hig-ink-3)]">{comment.length}/600</span>
              </div>
              <textarea
                id="pin-comment"
                required
                minLength={10}
                maxLength={600}
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  isEn
                    ? "Describe water supply gaps, flooding hotspots, safe crossings, or park needs..."
                    : "Describe problemas de tandeo, cruce de arroyo, calor urbano o mejora de espacio público..."
                }
                className="ios-input w-full rounded-xl px-3 py-2 text-[11.5px] placeholder:text-[var(--hig-ink-3)]"
              />
            </div>

            {/* LGPDPPSO / LFPDPPP Privacy Notice */}
            <div className="flex items-start gap-2 rounded-xl bg-[var(--hig-pill-bg)] p-2.5 text-[10.5px] text-[var(--hig-ink-2)]">
              <ShieldCheck className="h-4 w-4 text-[var(--hig-green)] shrink-0 mt-0.5" />
              <p>
                {isEn
                  ? "Privacy Notice (LGPDPPSO): Please do not include phone numbers, emails, or personal IDs. Automated filters redact PII and IMPLAN moderators review pins before public display."
                  : "Aviso de Privacidad (LGPDPPSO): No incluyas teléfonos, correos ni CURP/RFC. El sistema redacta PII automáticamente y moderadores IMPLAN validan cada pin antes de publicarlo."}
              </p>
            </div>

            {submitNotice && (
              <div role="status" className="rounded-xl bg-[#30D158]/15 p-2.5 text-[11px] font-medium text-[var(--hig-green)]">
                {submitNotice}
              </div>
            )}
            {submitError && (
              <div role="alert" className="rounded-xl bg-[#FF453A]/15 p-2.5 text-[11px] font-medium text-[var(--hig-red)]">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="hig-lift w-full rounded-full bg-[var(--hig-accent)] hover:bg-[var(--hig-accent-hover)] py-2.5 text-[12px] font-semibold text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting
                ? isEn ? "Submitting..." : "Enviando aporte..."
                : isEn ? "Submit to PMDU Moderation Queue" : "Enviar Aporte a Consulta PMDU"}
            </button>
          </form>

          {/* Session Pending Submissions Preview */}
          {sessionSubmittedPins.length > 0 && (
            <div className="hig-content-group rounded-2xl p-3.5 ring-1 ring-[#FF9F0A]/30 space-y-2">
              <p className="text-[11.5px] font-semibold text-[var(--hig-amber)]">
                {isEn ? "Your Recent Submissions (Awaiting Moderation)" : "Tus Aportes Recientes (En Moderación PMDU)"}
              </p>
              {sessionSubmittedPins.map((sp) => (
                <div key={sp.pin_id} className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--hig-ink)]">{sp.title}</span>
                    <span className="rounded-full bg-[#FF9F0A]/20 px-2 py-0.5 font-mono-num text-[9.5px] font-semibold text-[var(--hig-amber)]">
                      {sp.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--hig-ink-2)]">{sp.comment}</p>
                </div>
              ))}
            </div>
          )}

          {/* Published Community Pins */}
          <div className="space-y-2">
            <h3 className="px-1 text-[11px] font-semibold tracking-wide text-[var(--hig-ink-2)]">
              {isEn
                ? `Published Community Pins (${pins.length})`
                : `Pines Públicos Aprobados (${pins.length})`}
            </h3>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {pins.map((pin) => (
                <div key={pin.pin_id} className="hig-content-group rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#0A84FF]/15 px-2 py-0.5 font-mono-num text-[9.5px] font-semibold text-[var(--hig-accent)]">
                      {pin.pmdu_period}
                    </span>
                    <span className="text-[10px] text-[var(--hig-ink-3)]">
                      {pin.seeded_example ? (isEn ? "Reference Example" : "Ejemplo Referencia") : pin.author_alias}
                    </span>
                  </div>
                  <h4 className="text-[12px] font-semibold text-[var(--hig-ink)] leading-snug">{pin.title}</h4>
                  <p className="text-[11px] text-[var(--hig-ink-2)] leading-snug">{pin.comment}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onFlyTo({ lon: pin.lon, lat: pin.lat, zoom: 14.5, pitch: 52, bearing: -12 });
                      onClose();
                    }}
                    className="ios-pill flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-semibold text-[var(--hig-accent)] cursor-pointer"
                  >
                    <MapPin className="h-3 w-3" />
                    <span>{isEn ? "Fly to Pin on 3D Map" : "Ir al Pin en el Mapa"}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Municipal / IMPLAN Moderation Drawer */}
          <div className="hig-content-group rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[var(--hig-ink)]">
                {isEn ? "IMPLAN / SEPUIMM Moderation Console" : "Consola de Moderación IMPLAN / SEPUIMM"}
              </span>
              <button
                type="button"
                onClick={() => setModOpen((v) => !v)}
                aria-expanded={modOpen}
                className="ios-pill px-3 py-1 text-[10.5px] font-semibold text-[var(--hig-accent)] cursor-pointer"
              >
                {modOpen ? (isEn ? "Hide" : "Ocultar") : isEn ? "Open" : "Abrir"}
              </button>
            </div>
            {modOpen && (
              <div className="space-y-2.5 pt-2 border-t border-[var(--hig-divider)]">
                <div className="flex flex-wrap gap-2">
                  <label htmlFor="planner-mod-token" className="sr-only">
                    {isEn ? "Planner token (optional in demo)" : "Token municipal (opcional en demo)"}
                  </label>
                  <input
                    id="planner-mod-token"
                    type="password"
                    value={plannerToken}
                    onChange={(e) => setPlannerToken(e.target.value)}
                    placeholder={isEn ? "X-BCS-Planner-Token (if enforced)" : "Token Planificador (si aplica RBAC)"}
                    className="ios-input flex-1 rounded-xl px-3 py-1.5 text-[11px] placeholder:text-[var(--hig-ink-3)]"
                  />
                  <button
                    type="button"
                    onClick={handleLoadModerationQueue}
                    className="rounded-full bg-[#0A84FF]/18 px-3.5 py-1.5 text-[11px] font-semibold text-[var(--hig-accent)] hover:bg-[#0A84FF]/28 cursor-pointer"
                  >
                    {isEn ? "Load Pending Queue" : "Cargar Cola Pendiente"}
                  </button>
                </div>
                {modMessage && <p className="text-[11px] text-[var(--hig-green)]">{modMessage}</p>}
                {queuePins.length === 0 ? (
                  <p className="text-[10.5px] text-[var(--hig-ink-3)]">
                    {isEn ? "No pending submissions loaded." : "Sin pines pendientes cargados."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {queuePins.map((qp) => (
                      <div key={qp.pin_id} className="rounded-xl bg-[var(--hig-pill-bg)] p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--hig-ink)]">{qp.title}</span>
                          <span className="font-mono-num text-[9.5px] text-[var(--hig-ink-3)]">{qp.pin_id}</span>
                        </div>
                        <p className="text-[11px] text-[var(--hig-ink-2)]">{qp.comment}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleModerate(qp.pin_id, "approve")}
                            className="flex items-center gap-1 rounded-full bg-[#30D158]/20 px-3 py-1 text-[10.5px] font-semibold text-[var(--hig-green)] hover:bg-[#30D158]/30 cursor-pointer"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{isEn ? "Approve" : "Aprobar"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModerate(qp.pin_id, "reject")}
                            className="flex items-center gap-1 rounded-full bg-[#FF453A]/20 px-3 py-1 text-[10.5px] font-semibold text-[var(--hig-red)] hover:bg-[#FF453A]/30 cursor-pointer"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>{isEn ? "Reject" : "Rechazar"}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
