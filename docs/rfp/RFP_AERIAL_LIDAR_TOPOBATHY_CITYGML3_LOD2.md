# Especificación Técnica de Licitación (RFP): Levantamiento LiDAR Aéreo, Fotogrametría Oblicua, Topo-Batimetría Costera y Modelo Semántico CityGML 3.0 / 3DCityDB LoD2.2 (BCS2050)

**Entidad Convocante:** Gobierno del Estado de Baja California Sur (`SEPUIMM`) en coordinación con `IMPLAN La Paz`, `IMPLAN Los Cabos` y Ayuntamientos de Comondú, Loreto y Mulegé  
**Destino Técnico:** Ingestión directa en el Gemelo Digital Territorial **BCS2050** (`3DCityDB v5` + `PostGIS` + `OGC 3D Tiles 1.1` + simuladores `SFINCS`)  
**Marco de Referencia Geodésico:** `EPSG:32612` (*WGS84 / UTM Zona 12N*) · Alturas ortométricas referidas al geoide oficial **GGM10** (INEGI) / **ITRF2008 época 2010.0**

---

## 1. Objeto y Justificación Técnica

El estado actual del Gemelo Digital BCS2050 integra `396,823` huellas OpenBuildings 2.5D y modelos de elevación de mediana resolución que permiten planeación estratégica metropolitana. Para habilitar ingeniería de detalle ante ciclones en arroyos, diseño de líneas moradas PTAR, dictámenes de *factibilidad hídrica* y ventanilla única de *licencias de construcción*, el Comité Directivo BCS2050 requiere contratar un **levantamiento aerotransportado de alta resolución** y la generación de un **modelo urbano semántico abierto bajo OGC CityGML 3.0 (LoD2.2) + UtilityNetwork ADE**.

---

## 2. Cobertura Geográfica Prioritaria (Las 5 Cabeceras Municipales + Corredor Los Cabos)

El alcance se divide en polígonos urbanos consolidados, corredores de crecimiento y frentes costeros/arroyos críticos:

| Lote / Zona | Cobertura Prioritaria | Superficie Aprox. (km²) | Sensores Requeridos |
| :--- | :--- | :--- | :--- |
| **Lote 1 — Corredor Los Cabos (`03008`)** | Cabo San Lucas, Corredor Turístico (El Tezal – Palmilla), San José del Cabo, Estero de SJC y abanicos aluviales de arroyos El Salto / San José | **295 km²** urbano/arroyo + **65 km** línea costera | LiDAR Topográfico + Fotogrametría Oblicua 5-cámaras + LiDAR Topo-Batimétrico costero |
| **Lote 2 — Bahía y Ciudad de La Paz (`03003`)** | Mancha urbana La Paz, El Centenario, Chametla, Malecón–Mogote, El Cajoncito, arroyos El Piojillo / La Palma y zona portuaria Pichilingue | **240 km²** urbano/arroyo + **55 km** línea costera | LiDAR Topográfico + Fotogrametría Oblicua 5-cámaras + LiDAR Topo-Batimétrico costero |
| **Lote 3 — Loreto y Bahía de Loreto (`03009`)** | Cabecera municipal de Loreto, Nopoló, Puerto Escondido, abanico arroyo San Telmo y frente costero Parque Nacional | **75 km²** urbano/arroyo + **30 km** línea costera | LiDAR Topográfico + Fotogrametría Oblicua + Topo-Batimétrico en zona marina adyacente |
| **Lote 4 — Ciudad Constitución y Puerto San Carlos (`03001`)** | Cabecera Comondú (Valle de Santo Domingo) y frente costero de Puerto San Carlos / Bahía Magdalena | **85 km²** urbano/costero | LiDAR Topográfico + Fotogrametría Oblicua (20 km frente estuarino en San Carlos) |
| **Lote 5 — Santa Rosalía y Guerrero Negro (`03002`)** | Centro histórico y arroyos de Santa Rosalía, Puerto Isla San Marcos y cabecera urbana de Guerrero Negro | **70 km²** urbano/costero | LiDAR Topográfico + Fotogrametría Oblicua |

---

## 3. Especificaciones Cuantitativas de Sensores y Exactitud Geométrica

### 3.1 LiDAR Topográfico Aerotransportado
- **Densidad nominal de pulsos (últimos retornos en suelo y cubiertas):**
  - Centros urbanos, El Tezal, Malecón La Paz y abanicos de arroyos críticos: **≥ 12 puntos/m²** (`≥ 16 pts/m²` en áreas patrimoniales).
  - Áreas periurbanas, reservas territoriales PMDU y cuencas bajas de arroyos: **≥ 6 puntos/m²**.
- **Exactitud Posicional (estándar ASPRS NSSDA):**
  - Precisión vertical absoluta sin vegetación (*Non-Vegetated Vertical Accuracy — NVA*, 95% confianza): **RMSEz ≤ 5.0 cm** (`Accuracy_z ≤ 9.8 cm`).
  - Precisión vertical en áreas con vegetación/matorral desértico (*VVA*, percentil 95): **≤ 15.0 cm**.
  - Precisión planimétrica horizontal: **RMSEr ≤ 10.0 cm**.
- **Clasificación obligatoria ASPRS LAS 1.4 (CRS georreferenciado `EPSG:32612 + GGM10`):**
  - Clase 1 (*Unclassified*), Clase 2 (*Ground*), Clase 3–5 (*Low/Med/High Vegetation & Mangrove*), Clase 6 (*Building*), Clase 7/18 (*Noise*), Clase 9 (*Water*), Clase 17 (*Bridge Deck* — puentes/vados sobre arroyos).

### 3.2 Fotogrametría Oblicua y Ortofotografía Verdadera (*True Orthophoto*)
- **Sistema de captura:** Cámara métrica multi-cabezal (1 nadir + 4 oblicuas a 45° simultáneas con LiDAR o vuelo co-registrado).
- **Resolución espacial (GSD):** **≤ 5.0 cm/píxel** en zonas urbanas (corredores y cabeceras) y **≤ 10 cm/píxel** en amortiguamiento periurbano.
- **Productos:** Ortofotomosaico verdadero (*True Ortho RGB+NIR*, `COG GeoTIFF`) libre de abatimiento de edificios para identificar albercas, tinacos, techos de lámina/losa, arbolado urbano y estacionamientos; malla fotorrealista texturizada georreferenciada (`3D Tiles 1.1` / `OBJ`).

### 3.3 LiDAR Topo-Batimétrico Costero (Láser Verde 532 nm)
- **Alcance de profundidad:** Transición continua sin brechas desde **-15 m** (o `1.5×` disco Secchi en aguas turbias de lagunas/manglares) hasta **+15 msnm** tierra adentro cubriendo zona intermareal, dunas costeras, manglares y muelles.
- **Densidad:** **≥ 4 puntos/m²** en lecho marino somero y **≥ 8 puntos/m²** en playa seca y malecón.
- **Exactitud:** **RMSEz ≤ 15 cm** en lámina sumergida (`≤ 5 cm` en franja terrestre), vinculada directamente al **Nivel Medio del Mar (NMM)** y **Pleamar Media Superior (PMS)** para alimentar sin discontinuidades el motor hidrodinámico **SFINCS** (`arroyo_flood_sfincs`) con proyecciones **IPCC SSP5-8.5**.

---

## 4. Arquitectura de Entregables Semánticos: CityGML 3.0 / 3DCityDB LoD2.2 + UtilityNetwork ADE

El licitante ganador entregará no solo nubes de puntos crudas, sino modelos urbanos semánticos validados e importados directamente en PostgreSQL/PostGIS mediante **3DCityDB v5 (OGC CityGML 3.0)**:

1. **Módulo `Building` (Nivel de Detalle LoD2.2) sobre ≥ 400,000 Edificaciones:**
   - Geometría 3D sólida cerrada (*watertight MultiSolid*) con descomposición semántica explícita en **`RoofSurface`**, **`WallSurface`** y **`GroundSurface`**.
   - Atributos obligatorios por edificio: ID catastral anónimo (`parcel_uid`), `AGEB`, altura total (`measuredHeight`), pendiente y acimut real por vertiente de techo (*crucial para modelado solar fotovoltaico y carga térmica*), volumen neto (`m³`) y cota de desplante (`ground_elev_m` para cota ciclónica `<6 m`).
2. **Módulo `Relief` (DTM/DSM Hidrológico de 0.50 m):**
   - Modelo Digital de Terreno (**DTM Hidro-acondicionado** con corte de alcantarillas y puentes sobre arroyos para evitar diques artificiales en SFINCS) y Modelo Digital de Superficie (**DSM**) en **Cloud-Optimized GeoTIFF (`COG`)** de **0.50 m** de píxel.
3. **Módulo `Transportation`, `WaterBody`, `Vegetation` & `CityFurniture`:**
   - Segmentación de calzadas, banquetas/cruces peatonales accesibles (r5py / PMDU movilidad), cuerpos de agua/arroyos permanentes e intermitentes y copas de arbolado urbano / manglar costero (`CIBNOR`).
4. **Módulo `CityGML UtilityNetwork ADE` (Infraestructura Subterránea — Acceso `Nivel 2 Restringido Técnico`):**
   - Esquema relacional e ingesta inicial (en corredores piloto de La Paz Centro y Cabo San Lucas / El Tezal) de redes subterráneas: líneas maestras de agua potable / sectores tandeo (`OOMSAPAS`), colectores de alcantarillado y líneas moradas PTAR, drenaje pluvial y ductos subterráneos de media tensión (`CFE`), vinculando redes desde planimetría as-built / georradar GPR hacia nodos compatibles con **WNTR** y **Civil 3D**.
5. **Empaquetado Cloud-Native OGC 3D Tiles 1.1:**
   - Conversión automatizada de todos los edificios CityGML LoD2.2 y mallas a **OGC 3D Tiles 1.1 (`glTF 2.0` + `EXT_mesh_features` + `EXT_structural_metadata`)** compatible directamente con `workers/build_3dtiles_v11.py`, `deck.gl Tile3DLayer` y **CesiumJS**, entregado en `gs://bcs2050-3dtiles-public/`.

---

## 5. Programa Multi-Anual de Ejecución y Presupuesto Referencial

| Año / Fase | Alcance Operativo | Entregables Clave en BCS2050 | Inversión Estimada (MXN sin IVA) |
| :--- | :--- | :--- | :--- |
| **Año 1 (Meses 1–12)** | **Lotes 1 y 2:** Corredor Los Cabos (`03008`) y Bahía de La Paz (`03003`) | Topo-batimetría costera integral, `DTM 0.5m` hidro-acondicionado, `CityGML 3.0 LoD2.2` (~310k edificios) y `3D Tiles 1.1` + piloto subterráneo Centro LPZ / El Tezal. | **$24.0M – $31.0M MXN** *(~72% de población urbana BCS)* |
| **Año 2 (Meses 13–24)** | **Lotes 3, 4 y 5:** Loreto (`03009`), Comondú (`03001`), Mulegé (`03002`) + actualización arroyos | Cobertura 100% de las 5 cabeceras municipales, modelos SFINCS calibrados estatales y `3DCityDB` unificado estatal. | **$14.5M – $19.5M MXN** |
| **Año 3 (Meses 25–36)** | **UtilityNetwork ADE Extendido & Refresco Post-Ciclón** | Mapeo GPR/subterráneo en corredores prioritarios OOMSAPAS/CFE y vuelo de actualización selectiva de zonas de expansión/erosión costera. | **$9.0M – $12.5M MXN** |

---

## 6. Criterios de Control de Calidad (QA/QC) y Recepción

1. **Red de Control Terrestre (GNSS RTK/PPK + Nivelación Diferencial):** Mínimo 35 puntos de chequeo independientes (*checkpoints*) por lote urbano y 12 perfiles batimétricos con ecosonda monohaz/multihaz en zona marina para verificación ciega por **UABCS/CIBNOR** antes de liberar finiquitos.
2. **Validación Geométrica Automática:** 100% de los sólidos `CityGML 3.0 Building LoD2.2` deberán superar validación geométrica (**Val3dity / CityDoctor**: cero auto-intersecciones, orientación correcta de normales, compacidad topológica) y esquema XSD/JSON OGC oficial sin errores.
3. **Metadatos ISO 19115:** Cada tile LAS, COG y archivo CityGML entregará XML/JSON compatible con `/api/twin/metadata` y licencia institucional explícita (`Nivel 1 Abierto` para morfología/DTM; `Nivel 2 Restringido Técnico` para `UtilityNetwork ADE`).
4. **Propiedad Intelectual Abierta:** Todo producto crudo y procesado pasa a ser propiedad pública del Gobierno del Estado de Baja California Sur y Ayuntamientos participantes sin regalías por licenciamiento de software propietario.
