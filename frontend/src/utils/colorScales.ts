import type { AgebMetricKey } from "../types/twin";

export interface MetricMeta {
  key: AgebMetricKey;
  label: string;
  labelEn: string;
  shortLabel: string;
  shortLabelEn: string;
  unit: string;
  maxValue: number;
  lowColor: [number, number, number];
  midColor: [number, number, number];
  highColor: [number, number, number];
  inverted?: boolean;
  description: string;
  descriptionEn: string;
}

// Perceptually uniform sequential ramp (Viridis-inspired) & inverted risk ramp (Cividis/Okabe-Ito)
// Designed for Deuteranopia / Protanopia / Tritanopia accessibility (WCAG 2.1 AA colorblind safety)
const VIRIDIS_SEQ: [[number, number, number], [number, number, number], [number, number, number]] = [
  [68, 1, 84],     // Deep Indigo-Violet
  [33, 145, 140],  // Teal-Blue
  [253, 231, 37],  // High-luminance Yellow
];

const RISK_CVD_SEQ: [[number, number, number], [number, number, number], [number, number, number]] = [
  [0, 114, 178],   // Okabe-Ito Blue (Safe / Low risk)
  [240, 228, 66],  // Okabe-Ito Yellow (Moderate)
  [213, 94, 0],    // Okabe-Ito Vermillion (High exposure)
];

export const METRIC_CATALOG: Record<AgebMetricKey, MetricMeta> = {
  city_science_index: {
    key: "city_science_index",
    label: "Índice City Science BCS",
    labelEn: "BCS City Science Index",
    shortLabel: "City Science",
    shortLabelEn: "City Science",
    unit: "pts",
    maxValue: 95,
    lowColor: [239, 68, 68],
    midColor: [245, 158, 11],
    highColor: [16, 185, 129],
    description: "Índice compuesto Aretian (15-Min, Fractalidad, Armonía, Mezcla de Usos, Capacidad Carga y Vitalidad).",
    descriptionEn: "Composite Aretian index (15-Min, Fractality, Harmony, Land-Use Mix, Carrying Capacity & Vitality).",
  },
  city15_score: {
    key: "city15_score",
    label: "Ciudad 15-Minutos",
    labelEn: "15-Minute City",
    shortLabel: "15-Min",
    shortLabelEn: "15-Min",
    unit: "pts",
    maxValue: 98,
    lowColor: [244, 63, 94],
    midColor: [251, 191, 36],
    highColor: [34, 211, 238],
    description: "Proximidad caminable (<1,200 m) a salud, educación, equipamiento cívico y transporte público.",
    descriptionEn: "Walkable proximity (<1,200 m) to clinics, schools, civic parks, and public transit.",
  },
  fractality_score: {
    key: "fractality_score",
    label: "Fractalidad Morfológica",
    labelEn: "Morphological Fractality",
    shortLabel: "Fractalidad",
    shortLabelEn: "Fractality",
    unit: "pts",
    maxValue: 95,
    lowColor: [100, 116, 139],
    midColor: [99, 102, 241],
    highColor: [56, 189, 248],
    description: "Dimensión fractal multi-escala (50m–400m) del tejido edificado y permeabilidad urbana.",
    descriptionEn: "Multi-scale fractal dimension (50m–400m) of urban fabric and street permeability.",
  },
  harmony_score: {
    key: "harmony_score",
    label: "Armonía Urbana",
    labelEn: "Urban Harmony",
    shortLabel: "Armonía",
    shortLabelEn: "Harmony",
    unit: "pts",
    maxValue: 95,
    lowColor: [249, 115, 22],
    midColor: [168, 85, 247],
    highColor: [52, 211, 153],
    description: "Coherencia volumétrica y transición gradual de alturas y huellas entre predios y manzanas.",
    descriptionEn: "Volumetric coherence and gradual height transition across parcels and blocks.",
  },
  landuse_entropy_score: {
    key: "landuse_entropy_score",
    label: "Entropía Mixticidad Usos",
    labelEn: "Land-Use Mix Entropy",
    shortLabel: "Entropía",
    shortLabelEn: "Mix Entropy",
    unit: "pts",
    maxValue: 85,
    lowColor: [71, 85, 105],
    midColor: [234, 179, 8],
    highColor: [236, 72, 153],
    description: "Índice de Shannon sobre la diversidad funcional de las 79,515 parcelas de zonificación.",
    descriptionEn: "Shannon diversity index across 79,515 PMDU zoning parcels.",
  },
  infill_homes_potential: {
    key: "infill_homes_potential",
    label: "Capacidad Infill 2050",
    labelEn: "2050 Infill Capacity",
    shortLabel: "Infill Viv",
    shortLabelEn: "Infill Homes",
    unit: "viv",
    maxValue: 900,
    lowColor: [30, 58, 138],
    midColor: [14, 165, 233],
    highColor: [74, 222, 128],
    description: "Viviendas potenciales absorbibles dentro de la envolvente normativa CUS sin expandir mancha urbana.",
    descriptionEn: "Potential homes absorbable within permitted CUS zoning envelopes without sprawl.",
  },
  solar_mw: {
    key: "solar_mw",
    label: "Potencial Solar Techos",
    labelEn: "Rooftop Solar Potential",
    shortLabel: "Solar MW",
    shortLabelEn: "Solar MW",
    unit: "MW",
    maxValue: 18,
    lowColor: [30, 41, 59],
    midColor: [245, 158, 11],
    highColor: [253, 224, 71],
    description: "Capacidad fotovoltaica instalable en cubiertas 3D (2,150 kWh/m²/año) para aliviar red SIBCS.",
    descriptionEn: "Installable rooftop PV capacity (2,150 kWh/m²/yr) to relieve the SIBCS power grid.",
  },
  surge_exposed_pct: {
    key: "surge_exposed_pct",
    label: "Exposición Marea Ciclónica (<6m)",
    labelEn: "Cyclone Surge Exposure (<6m)",
    shortLabel: "Riesgo <6m",
    shortLabelEn: "Surge <6m",
    unit: "%",
    maxValue: 85,
    lowColor: [16, 185, 129],
    midColor: [245, 158, 11],
    highColor: [239, 68, 68],
    inverted: true,
    description: "Porcentaje de edificios con cota base <6.0 msnm expuestos a marea de tormenta y SLR IPCC SSP5-8.5.",
    descriptionEn: "Share of buildings below +6.0 m elevation exposed to storm surge & IPCC SSP5-8.5 SLR.",
  },
  carrying_resilience_score: {
    key: "carrying_resilience_score",
    label: "Resiliencia Agua–Red–Clima",
    labelEn: "Water–Grid–Climate Resilience",
    shortLabel: "Cap. Carga",
    shortLabelEn: "Carrying Cap.",
    unit: "pts",
    maxValue: 95,
    lowColor: [220, 38, 38],
    midColor: [251, 146, 60],
    highColor: [45, 212, 191],
    description: "Balance integrado de explotación acuífera, tandeo, proximidad a subestaciones SIBCS y cota costera.",
    descriptionEn: "Integrated balance of aquifer extraction, rationing, SIBCS substations & coastal elevation.",
  },
  density_hab_ha_2025: {
    key: "density_hab_ha_2025",
    label: "Densidad Poblacional 2025",
    labelEn: "2025 Population Density",
    shortLabel: "Densidad",
    shortLabelEn: "Density",
    unit: "hab/ha",
    maxValue: 120,
    lowColor: [30, 41, 59],
    midColor: [56, 189, 248],
    highColor: [192, 132, 252],
    description: "Densidad habitacional calibrada EIC 2025 por hectárea en manzanas y AGEBs.",
    descriptionEn: "Calibrated 2025 residential density (inhabitants/ha) across urban AGEBs.",
  },
};

export function getMetricStops(
  meta: MetricMeta,
  colorblindSafe = true,
): [[number, number, number], [number, number, number], [number, number, number]] {
  if (!colorblindSafe) {
    return [meta.lowColor, meta.midColor, meta.highColor];
  }
  return meta.inverted ? RISK_CVD_SEQ : VIRIDIS_SEQ;
}

export function getMetricGradientCss(meta: MetricMeta, colorblindSafe = true): string {
  const [low, mid, high] = getMetricStops(meta, colorblindSafe);
  return `linear-gradient(90deg, rgb(${low.join(",")}), rgb(${mid.join(",")}), rgb(${high.join(",")}))`;
}

export function interpolateMetricColor(
  value: number,
  meta: MetricMeta,
  alpha = 185,
  colorblindSafe = true,
): [number, number, number, number] {
  const [low, mid, high] = getMetricStops(meta, colorblindSafe);
  const t = Math.max(0, Math.min(1, value / Math.max(1, meta.maxValue)));
  const c0 = t < 0.5 ? low : mid;
  const c1 = t < 0.5 ? mid : high;
  const lt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * lt),
    Math.round(c0[1] + (c1[1] - c0[1]) * lt),
    Math.round(c0[2] + (c1[2] - c0[2]) * lt),
    alpha,
  ];
}

export function getBuildingColor(
  b: { height_m: number; solar_kwp: number; surge_risk: number },
  metric: AgebMetricKey,
  heightMult = 1.0,
  colorblindSafe = true,
): [number, number, number, number] {
  if (metric === "surge_exposed_pct") {
    if (colorblindSafe) {
      if (b.surge_risk === 2) return [213, 94, 0, 240];   // Okabe-Ito Vermillion
      if (b.surge_risk === 1) return [240, 228, 66, 228]; // Okabe-Ito Yellow
      return [0, 114, 178, 215];                          // Okabe-Ito Blue
    }
    if (b.surge_risk === 2) return [239, 68, 68, 240];
    if (b.surge_risk === 1) return [245, 158, 11, 225];
    return [34, 197, 94, 210];
  }
  if (metric === "solar_mw") {
    const t = Math.min(1, b.solar_kwp / 45);
    return [
      Math.round(55 + t * 200),
      Math.round(85 + t * 145),
      Math.round(115 - t * 65),
      235,
    ];
  }
  if (heightMult > 1.08) {
    const boost = Math.min(1, (heightMult - 1.0) / 0.65);
    if (colorblindSafe) {
      // Okabe-Ito Sky-Blue -> Bright Amber highlight
      return [
        Math.round(0 + boost * 86),
        Math.round(114 + boost * 90),
        Math.round(178 + boost * 55),
        242,
      ];
    }
    return [
      Math.round(38 - boost * 10),
      Math.round(165 + boost * 80),
      Math.round(235 - boost * 45),
      242,
    ];
  }
  const h = b.height_m;
  if (h >= 16) return [86, 180, 233, 240];   // Okabe-Ito Sky Blue
  if (h >= 9) return [0, 114, 178, 232];     // Okabe-Ito Blue
  if (h >= 6) return [129, 140, 248, 224];
  return [148, 163, 184, 215];
}

export const ZONING_CATEGORY_COLORS: Record<string, [number, number, number, number]> = {
  RESIDENTIAL: [245, 158, 11, 145],
  MIXED_USE_CORRIDOR: [236, 72, 153, 155],
  COMMERCIAL_SERVICES: [239, 68, 68, 150],
  TOURISM_HOSPITALITY: [56, 189, 248, 160],
  INDUSTRIAL_LOGISTICS: [168, 85, 247, 150],
  PUBLIC_EQUIPMENT: [59, 130, 246, 160],
  GREEN_OPEN_SPACE: [34, 197, 94, 150],
  CONSERVATION_RISK_BUFFER: [20, 184, 166, 150],
};

// Okabe-Ito distinct categorical palette for colorblind-safe PMDU zoning
export const ZONING_CATEGORY_COLORS_COLORBLIND: Record<string, [number, number, number, number]> = {
  RESIDENTIAL: [230, 159, 0, 150],              // Orange
  MIXED_USE_CORRIDOR: [204, 121, 167, 160],     // Reddish Purple
  COMMERCIAL_SERVICES: [213, 94, 0, 155],       // Vermillion
  TOURISM_HOSPITALITY: [86, 180, 233, 165],     // Sky Blue
  INDUSTRIAL_LOGISTICS: [148, 103, 189, 155],   // Violet
  PUBLIC_EQUIPMENT: [0, 114, 178, 165],         // Blue
  GREEN_OPEN_SPACE: [0, 158, 115, 155],         // Bluish Green
  CONSERVATION_RISK_BUFFER: [240, 228, 66, 150],// Yellow
};
