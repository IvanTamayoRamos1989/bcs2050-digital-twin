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
        className="glass-panel pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-slate-800/90 cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
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

  // Illustrative 3 kWp residential rooftop solar estimate (~2,150 kWh/m2/yr irradiance in BCS)
  const typicalHomeSolarKwhYr = Math.round(3.0 * 1720);
  const typicalHomeSavingsPct = 58;

  const waterGrade =
    carrying >= 75
      ? { labelEs: "Estable / Moderado", labelEn: "Stable / Moderate", cls: "bg-sky-500/20 text-sky-200 ring-sky-400/40" }
      : carrying >= 55
        ? { labelEs: "Atención por Tandeo", labelEn: "Watch · Rationed", cls: "bg-amber-500/20 text-amber-200 ring-amber-400/40" }
        : { labelEs: "Estrés Hídrico Alto", labelEn: "High Water Stress", cls: "bg-rose-500/20 text-rose-200 ring-rose-400/40" };

  const riskGrade =
    surgePct >= 20
      ? { labelEs: "Zona Baja / Arroyo", labelEn: "Low-Lying / Arroyo Zone", cls: "bg-amber-500/20 text-amber-200 ring-amber-400/40" }
      : { labelEs: "Cota Segura (+6 m)", labelEn: "Elevated Safe (+6 m)", cls: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40" };

  return (
    <aside
      aria-label={isEn ? "Citizen neighborhood scorecard" : "Tarjeta ciudadana de tu colonia"}
      className="glass-panel pointer-events-auto absolute right-3 top-3 z-20 flex max-h-[calc(100%-64px)] w-[calc(100vw-24px)] sm:w-[392px] flex-col rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/70 px-4 py-2.5">
        <div>
          <p className="font-mono-num text-[10px] uppercase tracking-widest text-emerald-300">
            {isEn ? "Citizen Mode · Plain Language" : "Modo Ciudadano · Lenguaje Claro"}
          </p>
          <h2 className="text-sm font-bold text-white">
            {inspection?.ageb?.cvegeo_ageb
              ? `${isEn ? "Selected Neighborhood" : "Tu Zona"} · ${zoneName}`
              : zoneName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isEn ? "Collapse neighborhood card" : "Colapsar tarjeta ciudadana"}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="twin-scroll overflow-y-auto p-3.5 space-y-3 text-xs">
        {/* Summary banner */}
        <div className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-700/80 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-200">
              {isEn ? "Overall Neighborhood Quality Score" : "Bienestar Urbano de tu Zona"}
            </span>
            <span className="font-mono-num rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-200 ring-1 ring-emerald-400/40">
              {Math.round(csi)} / 100
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">
            {inspection
              ? isEn
                ? "Showing aggregated neighborhood data around the point you clicked on the 3D map."
                : "Mostrando indicadores ciudadanos de la zona que seleccionaste en el mapa 3D."
              : isEn
                ? "Click any street or building on the 3D map to inspect water, shade, flood safety, and walking access in your neighborhood."
                : "Haz clic en cualquier calle o edificio del mapa 3D para ver agua, sombra, seguridad ante lluvias y servicios cercanos a pie."}
          </p>
        </div>

        {/* 1. Water Reliability */}
        <section
          aria-label={isEn ? "Water reliability" : "Agua en tu colonia"}
          className="rounded-xl bg-slate-900/85 p-3 ring-1 ring-slate-700/80 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Droplets className="h-4 w-4 text-sky-300" />
              <span>{isEn ? "1. Water & Rationing Reliability" : "1. Agua en tu Colonia"}</span>
            </h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${waterGrade.cls}`}>
              {isEn ? waterGrade.labelEn : waterGrade.labelEs}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-slate-200">
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
          className="rounded-xl bg-slate-900/85 p-3 ring-1 ring-slate-700/80 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ThermometerSun className="h-4 w-4 text-amber-300" />
              <span>{isEn ? "2. Heat & Hurricane Flood Safety" : "2. Calor y Seguridad ante Lluvias"}</span>
            </h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${riskGrade.cls}`}>
              {isEn ? riskGrade.labelEn : riskGrade.labelEs}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-slate-200">
            {tempC != null
              ? isEn
                ? `Live temperature: ${Math.round(tempC)}°C. Around ${surgePct.toFixed(1)}% of structures in this zone sit below +6 m coastal surge level.`
                : `Temperatura actual: ${Math.round(tempC)}°C. Alrededor de ${surgePct.toFixed(1)}% de edificaciones aquí están por debajo de +6 m de nivel costero o arroyo.`
              : isEn
                ? `Around ${surgePct.toFixed(1)}% of structures in this zone sit below +6 m elevation; keep arroyo channels unpaved and green.`
                : `Aproximadamente ${surgePct.toFixed(1)}% de las edificaciones están bajo cota de +6 m; mantener arroyos libres y arbolados reduce inundaciones.`}
          </p>
        </section>

        {/* 3. 15-Min Walkable Services */}
        <section
          aria-label={isEn ? "15-minute walkable services" : "Servicios a 15 minutos caminando"}
          className="rounded-xl bg-slate-900/85 p-3 ring-1 ring-slate-700/80 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Footprints className="h-4 w-4 text-emerald-300" />
              <span>{isEn ? "3. Services Within a 15-Min Walk" : "3. Servicios a 15 Minutos"}</span>
            </h3>
            <span className="font-mono-num rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-400/40">
              {Math.round(c15)} / 100
            </span>
          </div>
          <p className="text-[11px] leading-snug text-slate-200">
            {nearestHealth || nearestSchool || nearestTransit
              ? isEn
                ? `Nearest school: ${nearestSchool ? `${nearestSchool.walk_min} min (${nearestSchool.name})` : "N/A"} · Health: ${nearestHealth ? `${nearestHealth.walk_min} min` : "N/A"} · Bus stop: ${nearestTransit ? `${Math.round(nearestTransit.walk_m)} m` : "N/A"}.`
                : `Escuela más cercana: ${nearestSchool ? `${nearestSchool.walk_min} min (${nearestSchool.name})` : "N/D"} · Clínica: ${nearestHealth ? `${nearestHealth.walk_min} min` : "N/D"} · Parada: ${nearestTransit ? `${Math.round(nearestTransit.walk_m)} m` : "N/D"}.`
              : isEn
                ? "Measures how easily families can reach schools, clinics, parks, and bus stops on foot without needing a car."
                : "Mide qué tan fácil es llegar caminando a escuelas, clínicas, parques y paradas de camión sin depender del automóvil."}
          </p>
        </section>

        {/* 4. Rooftop Solar Savings */}
        <section
          aria-label={isEn ? "Estimated rooftop solar savings" : "Ahorro solar en tu techo"}
          className="rounded-xl bg-slate-900/85 p-3 ring-1 ring-slate-700/80 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Sun className="h-4 w-4 text-yellow-300" />
              <span>{isEn ? "4. Home Rooftop Solar Potential" : "4. Ahorro Solar en Techos"}</span>
            </h3>
            <span className="font-mono-num rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-400/40">
              ~{typicalHomeSavingsPct}% {isEn ? "bill cut*" : "ahorro*"}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-slate-200">
            {isEn
              ? `With BCS high desert sun (2,150 kWh/m²/yr), a standard 3 kWp home array produces ~${typicalHomeSolarKwhYr.toLocaleString()} kWh/yr (*illustrative estimate).`
              : `Con la alta radiación solar de BCS (2,150 kWh/m²/año), un sistema doméstico de 3 kWp genera ~${typicalHomeSolarKwhYr.toLocaleString()} kWh/año y reduce picos de aire acondicionado (*estimación referencial).`}
          </p>
        </section>

        {/* Civic Participation CTA */}
        <div className="rounded-xl bg-gradient-to-br from-sky-950/70 to-emerald-950/50 p-3 ring-1 ring-sky-400/40 space-y-2">
          <p className="text-[11px] font-semibold text-white">
            {isEn ? "Have a proposal for your street or PMDU?" : "¿Tienes una propuesta o reporte para el PMDU de tu colonia?"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenParticipation}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-[11px] font-bold text-slate-950 hover:bg-sky-400 cursor-pointer"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>{isEn ? "Pin Proposal on Map" : "Dejar Pin en Consulta PMDU"}</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToTechnical}
              className="flex items-center justify-center gap-1 rounded-lg bg-slate-900/90 px-2.5 py-2 text-[11px] font-semibold text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800 cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{isEn ? "Technical Mode" : "Modo Técnico"}</span>
            </button>
          </div>
        </div>

        {/* Privacy Disclosure */}
        <div className="flex items-start gap-2 rounded-lg bg-slate-950/80 p-2.5 ring-1 ring-slate-800 text-[10.5px] text-slate-300 leading-snug">
          <ShieldCheck className="h-4 w-4 text-emerald-300 shrink-0 mt-0.5" />
          <p>
            {isEn ? (
              <>
                <strong className="text-slate-100">Privacy (LGPDPPSO / LFPDPPP):</strong> All public indicators are aggregated to neighborhood/AGEB level. Zero personal names, property owners, or tax IDs are published.
              </>
            ) : (
              <>
                <strong className="text-slate-100">Privacidad (LGPDPPSO / LFPDPPP):</strong> Todos los datos públicos se agrupan por colonia/AGEB. No se muestran nombres de propietarios, RFC ni domicilios particulares.
              </>
            )}
          </p>
        </div>

        {inspection?.coordinates && (
          <p className="flex items-center gap-1 font-mono-num text-[10px] text-slate-300">
            <MapPin className="h-3 w-3 text-sky-300" />
            <span>
              {inspection.coordinates.lat.toFixed(4)}, {inspection.coordinates.lon.toFixed(4)}
            </span>
          </p>
        )}
      </div>
    </aside>
  );
};
