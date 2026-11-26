import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Compass, Film, MapPin, Search, X } from "lucide-react";
import type { AerialTour, CameraPreset, OverviewResponse } from "../types/twin";

interface SearchEntry {
  id: string;
  group: "city" | "scope" | "tour";
  title: string;
  subtitle: string;
  run: () => void;
}

interface Props {
  overview: OverviewResponse | null;
  tours: AerialTour[];
  scopeId: string;
  activeCitySlug: string;
  language: "es" | "en";
  onScopeChange: (scopeId: string, cam?: CameraPreset) => void;
  onCityJump: (citySlug: string) => void;
  onStartTour: (tourId: string) => void;
  onOpenChange?: (open: boolean) => void;
}

const SCOPE_LABELS: Record<string, { title: string; subtitleEs: string; subtitleEn: string }> = {
  "03": { title: "Estado BCS (03)", subtitleEs: "Ámbito estatal · 5 municipios", subtitleEn: "State scope · 5 municipalities" },
  "03003": { title: "La Paz (03003)", subtitleEs: "Municipio · Corredor Centro", subtitleEn: "Municipality · Central Corridor" },
  "03008": { title: "Los Cabos (03008)", subtitleEs: "Municipio · Corredor Sur", subtitleEn: "Municipality · Southern Corridor" },
  "03009": { title: "Loreto (03009)", subtitleEs: "Municipio · Corredor Norte", subtitleEn: "Municipality · Northern Corridor" },
  "03001": { title: "Comondú (03001)", subtitleEs: "Municipio · Corredor Valle", subtitleEn: "Municipality · Valley Corridor" },
  "03002": { title: "Mulegé (03002)", subtitleEs: "Municipio · Corredor Norte", subtitleEn: "Municipality · Northern Corridor" },
  "CORR-SUR-CABOS": { title: "Corredor Sur · Los Cabos", subtitleEs: "Corredor estratégico", subtitleEn: "Strategic corridor" },
  "CORR-CENTRO-LA-PAZ": { title: "Corredor Centro · La Paz", subtitleEs: "Corredor estratégico", subtitleEn: "Strategic corridor" },
  "CORR-VALLE-COMONDU": { title: "Corredor Valle · Comondú", subtitleEs: "Corredor estratégico", subtitleEn: "Strategic corridor" },
  "CORR-NORTE-LORETO-MULEGE": { title: "Corredor Norte · Loreto–Mulegé", subtitleEs: "Corredor estratégico", subtitleEn: "Strategic corridor" },
};

export const SpatialSearchField: React.FC<Props> = ({
  overview,
  tours,
  scopeId,
  activeCitySlug,
  language,
  onScopeChange,
  onCityJump,
  onStartTour,
  onOpenChange,
}) => {
  const isEn = language === "en";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setOpenSync = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (next) {
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  };

  // Global ⌘K / Ctrl+K Spotlight shortcut & Escape dismissal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenSync(!open);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpenSync(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Dismiss on outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dialogRef.current || !dialogRef.current.contains(target))
      ) {
        setOpenSync(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeCity = activeCitySlug && overview?.cities?.[activeCitySlug];
  const scopeMeta = SCOPE_LABELS[scopeId];
  const triggerLabel = activeCity
    ? activeCity.name
    : scopeMeta?.title || "Estado BCS (03)";

  const entries = useMemo<SearchEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const list: SearchEntry[] = [];

    const cities = overview ? Object.values(overview.cities) : [];
    for (const c of cities) {
      list.push({
        id: `city:${c.slug}`,
        group: "city",
        title: c.name,
        subtitle: `${c.buildings_count.toLocaleString()} ${isEn ? "3D buildings" : "edificios 3D"}`,
        run: () => onCityJump(c.slug),
      });
    }

    for (const [id, meta] of Object.entries(SCOPE_LABELS)) {
      const cam =
        id === "03"
          ? overview?.state.camera
          : overview?.municipalities?.[id]?.camera;
      list.push({
        id: `scope:${id}`,
        group: "scope",
        title: meta.title,
        subtitle: isEn ? meta.subtitleEn : meta.subtitleEs,
        run: () => onScopeChange(id, cam),
      });
    }

    const tourList =
      tours && tours.length > 0
        ? tours
        : [
            { id: "el_tezal", short_label: "Vuelo El Tezal" },
            { id: "la_paz_malecon", short_label: "Vuelo Malecón LPZ" },
            { id: "loreto_bahia", short_label: "Vuelo Loreto" },
          ];
    for (const t of tourList) {
      list.push({
        id: `tour:${t.id}`,
        group: "tour",
        title: t.short_label || t.id,
        subtitle: isEn ? "3D Aerial Fly-through" : "Recorrido Aéreo 3D",
        run: () => onStartTour(t.id),
      });
    }

    if (!q) return list;
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q),
    );
  }, [isEn, onCityJump, onScopeChange, onStartTour, overview, query, tours]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelect = (entry: SearchEntry) => {
    entry.run();
    setQuery("");
    setOpenSync(false);
  };

  const cityResults = entries.filter((e) => e.group === "city");
  const scopeResults = entries.filter((e) => e.group === "scope");
  const tourResults = entries.filter((e) => e.group === "tour");
  const ordered = [...cityResults, ...scopeResults, ...tourResults];

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpenSync(!open)}
        aria-expanded={open}
        aria-label={
          isEn
            ? `Search city, municipality or corridor (${triggerLabel})`
            : `Buscar ciudad, municipio o corredor (${triggerLabel})`
        }
        className="ios-pill hig-lift flex items-center gap-1.5 px-2.5 py-1.5 max-sm:min-h-[38px] text-[11.5px] font-medium text-[var(--hig-ink)] max-w-[84px] sm:max-w-[210px] overflow-hidden cursor-pointer"
      >
        <Search className="h-3.5 w-3.5 text-[var(--hig-accent)] shrink-0" aria-hidden="true" />
        <span className="truncate">{triggerLabel}</span>
        <kbd className="hidden lg:inline-flex items-center rounded bg-[var(--hig-pill-bg)] px-1.5 py-0.2 font-mono-num text-[9.5px] font-semibold text-[var(--hig-ink-3)] shrink-0">
          ⌘K
        </kbd>
      </button>

      {open &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-label={isEn ? "Spotlight territorial search" : "Búsqueda territorial Spotlight"}
            className="hig-glass-sidebar fixed z-50 max-sm:left-2.5 max-sm:right-2.5 max-sm:top-[74px] max-sm:w-auto sm:left-4 sm:top-[70px] sm:w-[340px] rounded-[22px] p-3 text-left whitespace-normal space-y-2.5"
          >
          {/* Search Input Bar */}
          <div className="ios-input flex items-center gap-2 rounded-full px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--hig-accent)] shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && ordered.length > 0) {
                  e.preventDefault();
                  setActiveIndex((i) => (i + 1) % ordered.length);
                } else if (e.key === "ArrowUp" && ordered.length > 0) {
                  e.preventDefault();
                  setActiveIndex((i) => (i - 1 + ordered.length) % ordered.length);
                } else if (e.key === "Enter" && ordered[activeIndex]) {
                  e.preventDefault();
                  handleSelect(ordered[activeIndex]);
                }
              }}
              aria-label={isEn ? "Search city, municipality or corridor" : "Buscar ciudad, municipio o corredor"}
              placeholder={isEn ? "Search city, municipality, tour..." : "Buscar ciudad, municipio, tour..."}
              className="w-full bg-transparent text-[12px] text-[var(--hig-ink)] placeholder:text-[var(--hig-ink-3)] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={isEn ? "Clear search" : "Limpiar búsqueda"}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--hig-pill-bg)] text-[var(--hig-ink-2)] hover:text-[var(--hig-ink)] cursor-pointer shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Grouped Results */}
          <div className="twin-scroll max-h-[340px] overflow-y-auto space-y-2.5 pr-0.5">
            {ordered.length === 0 ? (
              <p className="py-6 text-center text-[11.5px] text-[var(--hig-ink-3)]">
                {isEn ? "No matching places or corridors." : "Sin resultados territoriales."}
              </p>
            ) : (
              <>
                {[
                  { key: "city", label: isEn ? "3D Cities (9)" : "Ciudades 3D (9)", items: cityResults, icon: <Building2 className="h-3.5 w-3.5 text-[var(--hig-green)]" /> },
                  { key: "scope", label: isEn ? "Municipalities & Corridors" : "Municipios y Corredores", items: scopeResults, icon: <Compass className="h-3.5 w-3.5 text-[var(--hig-accent)]" /> },
                  { key: "tour", label: isEn ? "3D Aerial Tours" : "Recorridos Aéreos 3D", items: tourResults, icon: <Film className="h-3.5 w-3.5 text-[#BF5AF2]" /> },
                ].map(
                  (section) =>
                    section.items.length > 0 && (
                      <div key={section.key} className="space-y-1">
                        <p className="px-1.5 text-[10.5px] font-semibold tracking-wide text-[var(--hig-ink-3)]">
                          {section.label}
                        </p>
                        <div className="hig-content-group rounded-2xl divide-y divide-[var(--hig-divider)] overflow-hidden">
                          {section.items.map((item) => {
                            const idx = ordered.findIndex((o) => o.id === item.id);
                            const isActive = idx === activeIndex;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleSelect(item)}
                                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                                  isActive
                                    ? "bg-[var(--hig-accent)]/16 text-[var(--hig-ink)]"
                                    : "text-[var(--hig-ink)] hover:bg-[var(--hig-pill-bg)]"
                                }`}
                              >
                                <span className="flex items-center gap-2.5 min-w-0">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--hig-pill-bg)]">
                                    {section.icon}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-[12px] font-medium text-[var(--hig-ink)]">
                                      {item.title}
                                    </span>
                                    <span className="block truncate text-[10px] text-[var(--hig-ink-2)]">
                                      {item.subtitle}
                                    </span>
                                  </span>
                                </span>
                                <MapPin className="h-3 w-3 shrink-0 text-[var(--hig-ink-3)]" aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ),
                )}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
