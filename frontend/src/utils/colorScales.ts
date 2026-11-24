import type { AgebMetricKey } from "../types/twin";

export interface MetricMeta {
  key: AgebMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  maxValue: number;
  lowColor: [number, number, number];
  midColor: [number, number, number];
  highColor: [number, number, number];
  inverted?: boolean;
  description: string;
}

export const METRIC_CATALOG: Record<AgebMetricKey, MetricMeta> = {
  city_science_index: {
    key: "city_science_index",
    label: "Índice City Science BCS",
    shortLabel: "City Science",
    unit: "pts",
    maxValue: 95,
    lowColor: [239, 68, 68],
    midColor: [245, 158, 11],
    highColor: [16, 185, 129],
    description: "Índice compuesto Aretian (15-Min, Fractalidad, Armonía, Mezcla de Usos, Capacidad Carga y Vitalidad).",
  },
  city15_score: {
    key: "city15_score",
    label: "Ciudad 15-Minutos",
    shortLabel: "15-Min",
    unit: "pts",
    maxValue: 98,
    lowColor: [244, 63, 94],
    midColor: [251, 191, 36],
    highColor: [34, 211, 238],
    description: "Proximidad caminable (<1,200 m) a salud, educación, equipamiento cívico y transporte público.",
  },
  fractality_score: {
    key: "fractality_score",
    label: "Fractalidad Morfológica",
    shortLabel: "Fractalidad",
    unit: "pts",
    maxValue: 95,
    lowColor: [100, 116, 139],
    midColor: [99, 102, 241],
    highColor: [56, 189, 248],
    description: "Dimensión fractal multi-escala (50m–400m) del tejido edificado y permeabilidad urbana.",
  },
  harmony_score: {
    key: "harmony_score",
    label: "Armonía Urbana",
    shortLabel: "Armonía",
    unit: "pts",
    maxValue: 95,
    lowColor: [249, 115, 22],
    midColor: [168, 85, 247],
    highColor: [52, 211, 153],
    description: "Coherencia volumétrica y transición gradual de alturas y huellas entre predios y manzanas.",
  },
  landuse_entropy_score: {
    key: "landuse_entropy_score",
    label: "Entropía Mixticidad Usos",
    shortLabel: "Entropía",
    unit: "pts",
    maxValue: 85,
    lowColor: [71, 85, 105],
    midColor: [234, 179, 8],
    highColor: [236, 72, 153],
    description: "Índice de Shannon sobre la diversidad funcional de las 79,515 parcelas de zonificación.",
  },
  infill_homes_potential: {
    key: "infill_homes_potential",
    label: "Capacidad Infill 2050",
    shortLabel: "Infill Viv",
    unit: "viv",
    maxValue: 900,
    lowColor: [30, 58, 138],
    midColor: [14, 165, 233],
    highColor: [74, 222, 128],
    description: "Viviendas potenciales absorbibles dentro de la envolvente normativa CUS sin expandir mancha urbana.",
  },
  solar_mw: {
    key: "solar_mw",
    label: "Potencial Solar Techos",
    shortLabel: "Solar MW",
    unit: "MW",
    maxValue: 18,
    lowColor: [30, 41, 59],
    midColor: [245, 158, 11],
    highColor: [253, 224, 71],
    description: "Capacidad fotovoltaica instalable en cubiertas 3D (2,150 kWh/m²/año) para aliviar red SIBCS.",
  },
  surge_exposed_pct: {
    key: "surge_exposed_pct",
    label: "Exposición Marea Ciclónica (<6m)",
    shortLabel: "Riesgo <6m",
    unit: "%",
    maxValue: 85,
    lowColor: [16, 185, 129],
    midColor: [245, 158, 11],
    highColor: [239, 68, 68],
    inverted: true,
    description: "Porcentaje de edificios con cota base <6.0 msnm expuestos a marea de tormenta y SLR IPCC SSP5-8.5.",
  },
  carrying_resilience_score: {
    key: "carrying_resilience_score",
    label: "Resiliencia Agua–Red–Clima",
    shortLabel: "Cap. Carga",
    unit: "pts",
    maxValue: 95,
    lowColor: [220, 38, 38],
    midColor: [251, 146, 60],
    highColor: [45, 212, 191],
    description: "Balance integrado de explotación acuífera, tandeo, proximidad a subestaciones SIBCS y cota costera.",
  },
  density_hab_ha_2025: {
    key: "density_hab_ha_2025",
    label: "Densidad Poblacional 2025",
    shortLabel: "Densidad",
    unit: "hab/ha",
    maxValue: 120,
    lowColor: [30, 41, 59],
    midColor: [56, 189, 248],
    highColor: [192, 132, 252],
    description: "Densidad habitacional calibrada EIC 2025 por hectárea en manzanas y AGEBs.",
  },
};

export function interpolateMetricColor(
  value: number,
  meta: MetricMeta,
  alpha = 185,
): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, value / Math.max(1, meta.maxValue)));
  const c0 = t < 0.5 ? meta.lowColor : meta.midColor;
  const c1 = t < 0.5 ? meta.midColor : meta.highColor;
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
): [number, number, number, number] {
  if (metric === "surge_exposed_pct") {
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
    // Highlight 2050 vertical intensification in glowing cyan-emerald
    const boost = Math.min(1, (heightMult - 1.0) / 0.65);
    return [
      Math.round(38 - boost * 10),
      Math.round(165 + boost * 80),
      Math.round(235 - boost * 45),
      242,
    ];
  }
  const h = b.height_m;
  if (h >= 16) return [56, 189, 248, 240];
  if (h >= 9) return [99, 102, 241, 232];
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
