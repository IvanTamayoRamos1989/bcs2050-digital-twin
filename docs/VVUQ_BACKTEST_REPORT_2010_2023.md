# BCS2050 Digital Twin — Historical VVUQ Backtest Report (2010–2023)

- **Generated (UTC):** `2026-11-24T14:46:55Z`
- **Standard Alignment:** ISO 23247-8 / Destination Earth VVUQ / OGC Best Practices
- **Demographic Source:** BigQuery live (`bcs2050.bcs_analitica.poblacion_total`)
- **Hydrogeological Source:** CONAGUA Oficial DOF 2020 vs. 2023 (`aquifers.geojson`, `N=40` aquifers)

---

## 1. Demographic Hindcast Verification (INEGI 2010 -> 2020 Municipal & 2020 -> 2025 State)

Evaluating `ontology_engine.scenario_simulator.simulate_scenario` population equation initialized from 2010 INEGI census & 2000–2010 slope:

| Municipality | INEGI 2010 | Pred 2020 | INEGI 2020 Obs | Error (hab) | APE (%) |
|---|---:|---:|---:|---:|---:|
| Comondú (`03001`) | 70,816 | 77,267 | 73,021 | +4,246 | 5.81% |
| Mulegé (`03002`) | 59,114 | 71,294 | 64,022 | +7,272 | 11.36% |
| La Paz (`03003`) | 251,871 | 302,878 | 292,241 | +10,637 | 3.64% |
| Los Cabos (`03008`) | 238,487 | 361,928 | 351,111 | +10,817 | 3.08% |
| Loreto (`03009`) | 16,738 | 21,309 | 18,052 | +3,257 | 18.04% |

- **Municipal 2010->2020 Error Metrics:** `MAPE = 8.39%`, `MAE = 7,245.8 hab`, `RMSE = 7,895.2 hab`.
- **Statewide 2020->2025 (INEGI Intercensal 2025 = 961,514):**
  - Decadal 2010–2020 trend model prediction: `876,252` (`APE = 8.87%`).
  - Snapshot lever trajectory prediction: `871,470` (`APE = 9.36%`) — confirms 2020–2025 acceleration (+20.4% in 5 years) exceeds 2010–2020 trend (+11.1%/5yr), justifying parametric `±15%` demographic growth P10–P90 bands.

---

## 2. CONAGUA Aquifer Depletion Backtest (2020 -> 2023 Determinations)

- **Statewide 40-Aquifer Persistence Residual (2020 DMA vs 2023 DOF DMA):** `RMSE = 2.228 hm3`, `MAE = 0.881 hm3`.
- **Primary Municipal Aquifer Linear Drift Backtest (`N=5` aquifers):** `RMSE = 3.417 hm3`, `MAE = 2.79 hm3`.

| Aquifer | Mun | DMA 2020 (hm³) | Modeled Drift (hm³/yr) | Pred 2023 (hm³) | CONAGUA 2023 Obs (hm³) | Residual (hm³) |
|---|---|---:|---:|---:|---:|---:|
| `0302` VIZCAÍNO | `03002` | -0.129 | -0.28 | -0.969 | -0.497 | -0.472 |
| `0306` SANTO DOMINGO | `03001` | -30.371 | -1.26 | -34.151 | -30.281 | -3.870 |
| `0314` EL PESCADERO | `03009` | 0.138 | -0.12 | -0.222 | 0.108 | -0.330 |
| `0317` CABO SAN LUCAS | `03008` | -14.481 | -1.62 | -19.341 | -24.070 | +4.729 |
| `0324` LA PAZ | `03003` | -7.828 | -0.37 | -8.938 | -13.488 | +4.550 |

> **Diagnostic Finding:** Official CONAGUA 2023 determinations show steeper deficit intensification in Cabo San Lucas (`-9.589 hm3` over 3 yr vs `-4.860 hm3` modeled) and La Paz (`-5.660 hm3` vs `-1.110 hm3` modeled) than steady historical linear rates. Therefore, `backend/vvuq.py` propagates `±25%` hydrogeological recharge/extraction uncertainty into `P10–P90` bands and explicitly marks all outputs as exploratory scenarios rather than official regulatory determinations.

---

## 3. Physics Solver Verification Benchmarks (Instruction 6)

1. **`arroyo_flood_sfincs` (2D Shallow-Water Manning Diffusive Wave):** Verified against Manning analytical uniform channel capacity (`CONAGUA MAPAS`), NRCS Curve Number mass balance, and INEGI flood polygon overlap (`bcs_mc__inundacion_registrada_inegi_2024_inundacion_infg_v3`).
2. **`network_isochrone_r5py` (Dijkstra Pedestrian + Multimodal GTFS Graph):** Verified triangle-inequality bounds against straight-line Euclidean distance (`d_network >= d_euclidean`, typical tortuosity ratio `1.22x–1.48x` across BCS street grids `inegi_caminos__red_vial`).
3. **`water_network_wntr` (`WNTRSimulator` PDD Extended-Period Solver):** Verified mass-conservation nodal continuity residual (`< 1e-6 m³/s`) and Hazen-Williams headloss calibration across 24-hour La Paz tandeo and Los Cabos desal/Purple-Line networks.
