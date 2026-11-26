import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Footprints,
  MapPin,
  MessageSquarePlus,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  ThermometerSun,
} from "lucide-react";
import type {
  InspectResponse,
  LiveTelemetrySummary,
  OverviewResponse,
} from "../types/twin";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  scopeId: string;
  overview: OverviewResponse | null;
  inspection: InspectResponse | null;
  liveTelemetry: LiveTelemetrySummary | null;
  language: "es" | "en";
  onOpenParticipation: () => void;
  onSwitchToTechnical: () => void;
}

export const CitizenScorecardPanel: React.FC<Props> = ({
  collapsed,
  onToggleCollapse,
  scopeId,
  overview,
  inspection,
  liveTelemetry,
  language,
  onOpenParticipation,
  onSwitchToTechnical,
}) => {
  const isEn = language === "en";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isEn ? "Neighborhood Card" : "Tu Colonia"}
        className="ios-glass pointer-events-auto absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-[#F5F5F7] hover:bg-white/[0.12] transition-colors cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4 text-[#30D158]" aria-hidden="true" />
        <span>{isEn ? "Neighborhood Card" : "Tu Colonia"}</span>
      </button>
    );
  }

  const mun = overview?.municipalities[scopeId];
  const st = overview?.state;
  const zoneName = mun ? mun.name : st?.name || "Baja California Sur";
  const c15 = Number(inspection?.ageb?.city15_score ?? mun?.city15_score ?? st?.city15_score ?? 81.0);
  const csi = Number(inspection?.ageb?.city_science_index ?? mun?.city_science_index ?? st?.city_science_index ?? 66.6);
  const carrying = Number(
    inspection?.ageb?.carrying_resilience_score ?? mun?.carrying_resilience_score ?? st?.carrying_resilience_score ?? 71.0,
  );
  const surgePct = Number(inspection?.ageb?.surge_exposed_pct ?? 6.1);

  const weatherKey = scopeId === "03008" ? "los_cabos" : scopeId === "03009" ? "loreto" : "la_paz";
  const tempC = liveTelemetry?.weather?.[weatherKey]?.temp_c ?? liveTelemetry?.weather?.la_paz?.temp_c;
  const tandeoInfo = inspection?.tandeo_lapaz;
  const tandeoSchedule =
    typeof tandeoInfo?.dias_tandeo === "string"
      ? tandeoInfo.dias_tandeo
      : typeof tandeoInfo?.frecuencia === "string"
        ? tandeoInfo.frecuencia
        : null;

  const nearestHealth = inspection?.nearest_services?.health?.[0];
  const nearestSchool = inspection?.nearest_services?.education?.[0];
  const nearestTransit = inspection?.nearest_transit?.[0];

  const typicalHomeSolarKwhYr = Math.round(3.0 * 1720);
  const typicalHomeSavingsPct = 58;

  const waterGrade =
    carrying >= 75
      ? { labelEs: "Estable", labelEn: "Stable", cls: "bg-[#64D2FF]/15 text-[#64D2FF]" }
      : carrying >= 55
        ? { labelEs: "Atención Tandeo", labelEn: "Watch · Rationed", cls: "bg-[#FF9F0A]/15 text-[#FF9F0A]" }
        : { labelEs: "Estrés Hídrico", labelEn: "High Water Stress", cls: "bg-[#FF453A]/15 text-[#FF453A]" };

  const riskGrade =
    surgePct >= 20
      ? { labelEs: "Zona Baja / Arroyo", labelEn: "Low-Lying Zone", cls: "bg-[#FF9F0A]/15 text-[#FF9F0A]" }
      : { labelEs: "Cota Segura (+6 m)", labelEn: "Elevated Safe (+6 m)", cls: "bg-[#30D158]/15 text-[#30D158]" };

  return (
    <aside
      aria-label={isEn ? "Citizen neighborhood scorecard" : "Tarjeta ciudadana de tu colonia"}
      className="ios-glass pointer-events-auto absolute right-4 top-4 z-20 flex max-h-[calc(100%-184px)] w-[calc(100vw-32px)] sm:w-[388px] flex-col rounded-[24px] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium tracking-wide text-[#30D158]">
            {isEn ? "Citizen Mode · Plain Language" : "Modo Ciudadano · Lenguaje Claro"}
          </p>
          <h2 className="truncate text-[16px] font-semibold tracking-tight text-[#F5F5F7]">
            {inspection?.ageb?.cvegeo_ageb
              ? `${isEn ? "Selected Neighborhood" : "Tu Zona"} · ${zoneName}`
              : zoneName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isEn ? "Collapse neighborhood card" : "Colapsar tarjeta ciudadana"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[#EBEBF5]/75 hover:bg-white/[0.15] hover:text-white transition-colors cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="twin-scroll overflow-y-auto p-3.5 space-y-3 text-xs">
        {/* Summary Hero Card */}
        <div className="ios-surface rounded-2xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#F5F5F7]">
              {isEn ? "Neighborhood Quality Score" : "Bienestar Urbano de tu Zona"}
            </span>
            <span className="font-mono-num rounded-full bg-[#30D158]/20 px-2.5 py-0.5 text-[12px] font-semibold text-[#30D158]">
              {Math.round(csi)} / 100
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#EBEBF5]/72">
            {inspection
              ? isEn
                ? "Showing aggregated neighborhood data around the point you clicked on the 3D map."
                : "Mostrando indicadores ciudadanos de la zona que seleccionaste en el mapa 3D."
              : isEn
                ? "Click any street or building on the 3D map to inspect water, shade, flood safety, and walking access."
                : "Haz clic en cualquier calle o edificio del mapa 3D para ver agua, sombra, seguridad ante lluvias y servicios a pie."}
          </p>
        </div>

        {/* 1. Water Reliability */}
        <section
          aria-label={isEn ? "Water reliability" : "Agua en tu colonia"}
          className="ios-surface rounded-2xl p-3.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-[#F5F5F7]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#64D2FF]/15 text-[#64D2FF]">
                <Droplets className="h-3.5 w-3.5" />
              </span>
              <span>{isEn ? "1. Water Reliability" : "1. Agua en tu Colonia"}</span>
            </h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${waterGrade.cls}`}>
              {isEn ? waterGrade.labelEn : waterGrade.labelEs}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-[#EBEBF5]/80">
            {tandeoSchedule
              ? isEn
                ? `OOMSAPAS rationing schedule in sector: ${tandeoSchedule}.`
                : `Sector con calendario OOMSAPAS registrado: ${tandeoSchedule}.`
              : isEn
                ? "22 of 39 aquifers in BCS have no surplus availability; purple-line reuse and leak repairs protect household supply."
                : "22 de 39 acuíferos en BCS no tienen disponibilidad libre; el reúso en parques (línea morada) y control de fugas protegen el tandeo."}
          </p>
        </section>

        {/* 2. Heat & Flood Safety */}
        <section
          aria-label={isEn ? "Heat and flood safety" : "Calor y riesgo de lluvia"}
          className="ios-surface rounded-2xl p-3.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-[#F5F5F7]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FF9F0A]/15 text-[#FF9F0A]">
                <ThermometerSun className="h-3.5 w-3.5" />
              </span>
              <span>{isEn ? "2. Heat & Flood Safety" : "2. Calor y Lluvias"}</span>
            </h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${riskGrade.cls}`}>
              {isEn ? riskGrade.labelEn : riskGrade.labelEs}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-[#EBEBF5]/80">
            {tempC != null
              ? isEn
                ? `Live temperature: ${Math.round(tempC)}°C. Around ${surgePct.toFixed(1)}% of structures sit below +6 m surge level.`
                : `Temperatura actual: ${Math.round(tempC)}°C. Alrededor de ${surgePct.toFixed(1)}% de edificaciones están bajo cota +6 m costera o de arroyo.`
              : isEn
                ? `Around ${surgePct.toFixed(1)}% of structures sit below +6 m elevation; keeping arroyos green reduces flood risk.`
                : `Aproximadamente ${surgePct.toFixed(1)}% de edificaciones están bajo cota +6 m; arroyos libres y arbolados reducen inundaciones.`}
          </p>
        </section>

        {/* 3. 15-Min Walkable Services */}
        <section
          aria-label={isEn ? "15-minute walkable services" : "Servicios a 15 minutos caminando"}
          className="ios-surface rounded-2xl p-3.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-[#F5F5F7]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#30D158]/15 text-[#30D158]">
                <Footprints className="h-3.5 w-3.5" />
              </span>
              <span>{isEn ? "3. 15-Min Walkable Services" : "3. Servicios a 15 Min"}</span>
            </h3>
            <span className="font-mono-num rounded-full bg-[#30D158]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[#30D158]">
              {Math.round(c15)} / 100
            </span>
          </div>
          <p className="text-[11px] leading-snug text-[#EBEBF5]/80">
            {nearestHealth || nearestSchool || nearestTransit
              ? isEn
                ? `Nearest school: ${nearestSchool ? `${nearestSchool.walk_min} min (${nearestSchool.name})` : "N/A"} · Health: ${nearestHealth ? `${nearestHealth.walk_min} min` : "N/A"} · Bus: ${nearestTransit ? `${Math.round(nearestTransit.walk_m)} m` : "N/A"}.`
                : `Escuela cercana: ${nearestSchool ? `${nearestSchool.walk_min} min (${nearestSchool.name})` : "N/D"} · Clínica: ${nearestHealth ? `${nearestHealth.walk_min} min` : "N/D"} · Parada: ${nearestTransit ? `${Math.round(nearestTransit.walk_m)} m` : "N/D"}.`
              : isEn
                ? "Measures how easily families can reach schools, clinics, parks, and bus stops on foot."
                : "Mide qué tan fácil es llegar caminando a escuelas, clínicas, parques y paradas de camión."}
          </p>
        </section>

        {/* 4. Rooftop Solar Savings */}
        <section
          aria-label={isEn ? "Estimated rooftop solar savings" : "Ahorro solar en tu techo"}
          className="ios-surface rounded-2xl p-3.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-[#F5F5F7]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFD60A]/15 text-[#FFD60A]">
                <Sun className="h-3.5 w-3.5" />
              </span>
              <span>{isEn ? "4. Home Rooftop Solar" : "4. Solar en Techos"}</span>
            </h3>
            <span className="font-mono-num rounded-full bg-[#FF9F0A]/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-[#FF9F0A]">
              ~{typicalHomeSavingsPct}% {isEn ? "bill cut*" : "ahorro*"}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-[#EBEBF5]/80">
            {isEn
              ? `With BCS high solar irradiance (2,150 kWh/m²/yr), a 3 kWp home array produces ~${typicalHomeSolarKwhYr.toLocaleString()} kWh/yr (*illustrative).`
              : `Con la alta radiación de BCS (2,150 kWh/m²/año), un sistema de 3 kWp genera ~${typicalHomeSolarKwhYr.toLocaleString()} kWh/año (*referencial).`}
          </p>
        </section>

        {/* Civic Participation CTA */}
        <div className="ios-surface rounded-2xl p-3.5 space-y-2.5 ring-1 ring-[#0A84FF]/25">
          <p className="text-[11.5px] font-semibold text-[#F5F5F7]">
            {isEn ? "Have a proposal for your street or PMDU?" : "¿Tienes una propuesta para el PMDU de tu colonia?"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenParticipation}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0A84FF] hover:bg-[#409CFF] px-3.5 py-2 text-[11.5px] font-semibold text-white transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>{isEn ? "Pin Proposal on Map" : "Dejar Pin en PMDU"}</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToTechnical}
              className="ios-pill flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-[#F5F5F7] cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{isEn ? "Technical" : "Técnico"}</span>
            </button>
          </div>
        </div>

        {/* Privacy Disclosure */}
        <div className="flex items-start gap-2 rounded-2xl bg-white/[0.03] p-3 text-[10.5px] text-[#EBEBF5]/70 leading-snug">
          <ShieldCheck className="h-4 w-4 text-[#30D158] shrink-0 mt-0.5" />
          <p>
            {isEn ? (
              <>
                <strong className="text-[#F5F5F7]">Privacy (LGPDPPSO):</strong> All public indicators are aggregated to neighborhood/AGEB level. Zero personal data is published.
              </>
            ) : (
              <>
                <strong className="text-[#F5F5F7]">Privacidad (LGPDPPSO):</strong> Todos los datos públicos se agrupan por colonia/AGEB. Sin nombres de propietarios ni domicilios.
              </>
            )}
          </p>
        </div>

        {inspection?.coordinates && (
          <p className="flex items-center gap-1 font-mono-num text-[10.5px] text-[#EBEBF5]/60 px-1">
            <MapPin className="h-3 w-3 text-[#0A84FF]" />
            <span>
              {inspection.coordinates.lat.toFixed(4)}, {inspection.coordinates.lon.toFixed(4)}
            </span>
          </p>
        )}
      </div>
    </aside>
  );
};
