# Carta de Gobernanza Institucional del Gemelo Digital Territorial BCS2050

**Versión:** 1.0 · **Marco de Referencia:** Principios Gemini (*Centre for Digital Built Britain — CDBB*) & ISO 23247  
**Ámbito:** Estado de Baja California Sur (03) y sus 5 municipios (Comondú `03001`, Mulegé `03002`, La Paz `03003`, Los Cabos `03008`, Loreto `03009`)  
**Repositorio Técnico:** `bcs2050-digital-twin` · **Dominios Institucionales:** `bcs2050.com`, `panel.bcs2050.com`, `twin.bcs2050.com`

---

## 1. Propósito y Naturaleza Institucional

El **Gemelo Digital Territorial BCS2050** es una infraestructura pública digital de apoyo a la planeación urbana, gestión hídrica, transición energética y resiliencia climática de Baja California Sur. Esta Carta establece su arquitectura de gobernanza multi-institucional para garantizar continuidad transexenal, soberanía de datos públicos, interoperabilidad abierta y custodia tecnológica compartida, evitando la dependencia operativa de individuos o proveedores únicos (*vendor lock-in*).

---

## 2. Alineación Explícita con los Principios Gemini (*The Gemini Principles*)

Siguiendo la taxonomía del **Centre for Digital Built Britain (CDBB)**, todas las decisiones técnicas, regulatorias y presupuestales del ecosistema BCS2050 se rigen por nueve principios agrupados en tres pilares:

| Pilar | Principio Gemini | Implementación Concreta en BCS2050 Digital Twin | Evidencia Verificable en Plataforma |
| :--- | :--- | :--- | :--- |
| **Propósito** (*Purpose*) | **1. Bien Público** (*Public Good*) | Orientado a combatir el estrés hídrico (21 acuíferos en déficit estricto / 22 de 39 sin disponibilidad en BCS), ordenar el crecimiento urbano dentro de la envolvente normativa CUS sin expansión desmedida (*infill*) y democratizar la información mediante `Modo Ciudadano` y `Participación PMDU`. | Visor público abierto (`Nivel 1`), `CitizenScorecardPanel`, módulo `/api/twin/participation`. |
| **Propósito** | **2. Creación de Valor** (*Value Creation*) | Cuantifica brechas CAPEX (*Goal-Gap 2050*), evalúa escenarios contrafactuales 2025–2050 y ejecuta motores acoplados de física territorial (SFINCS inundación 2D, r5py accesibilidad 15-min, WNTR hidráulica y presión por sectores). | Endpoints `/api/twin/simulate`, `/api/twin/goal-gap`, `/ogc/processes/*`. |
| **Propósito** | **3. Conocimiento / Perspicacia** (*Insight*) | Integra `396,823` huellas de edificación 2.5D/3D, `79,515` parcelas de zonificación PMDU, `1,155` AGEBs calibrados, `68,826` tramos de la Red Vial INEGI y `26` capas IMPLAN Los Cabos v3 con explicabilidad IA fundamentada (*Vertex AI / Gemini RAG*). | `/api/twin/overview`, `/api/twin/inspect`, `/api/twin/chat`. |
| **Confianza** (*Trust*) | **4. Seguridad** (*Security*) | Defensa en profundidad: clasificación en 3 niveles (`Abierto`, `Restringido Técnico`, `Confidencial/PII`), control RBAC mediante tokens municipales (`X-BCS-Planner-Token`), cabeceras HTTP de endurecimiento, limitación de tasa por ventana deslizante y sanitización automatizada de PII. | `backend/security.py`, `backend/participation.py`, `DPIA_PRIVACY_CRITICAL_INFRASTRUCTURE_BCS2050.md`. |
| **Confianza** | **5. Apertura** (*Openness*) | Uso estricto de estándares abiertos OGC (`OGC API - Features`, `Tiles MVT`, `Processes`, `Records`, `SensorThings API v1.1`, `3D Tiles 1.1`) y licencias documentadas (`ISO 19115 + SPDX`, `167` registros catalogados). Sin formatos propietarios cerrados en el núcleo. | `/ogc/*`, `/FROST-Server/v1.1/*`, `/api/twin/metadata`, `/api/twin/3dtiles/info`. |
| **Confianza** | **6. Calidad** (*Quality*) | Toda simulación estratégica y modelo físico reporta intervalos de incertidumbre `P10 / P50 / P90` y métricas de validación histórica bajo el marco **ISO 23247-8 VVUQ** (*Verification, Validation & Uncertainty Quantification*), diferenciando explícitamente cifras censales oficiales (INEGI 2020) de proyecciones modeladas (2025–2050). | `backend/vvuq.py`, `docs/VVUQ_BACKTEST_REPORT_2010_2023.md`. |
| **Función** (*Function*) | **7. Federación** (*Federation*) | En lugar de duplicar catastros locales en silos aislados, BCS2050 federa datos de CONAGUA, OOMSAPAS, CFE/CENACE, IMPLANs y NOAA/OpenSky mediante conectores reproducibles hacia BigQuery, Firestore (`bcs-studio`), PostGIS y GCS. | `workers/etl_bigquery_to_postgis.py`, `workers/telemetry_ingestor.py`. |
| **Función** | **8. Curación** (*Curation*) | Curación automatizada con separación estricta entre contenedor sin datos incrustados (*zero-baked-data*) e hidratación de artefactos versionados (`twin_data.tar.gz` / `bcs_buildings_v11`), junto con Custodios de Dominio responsables de la vigencia de cada capa. | `Dockerfile`, `gs://bcs2050-gis-curated/`, Matriz de Custodios (Sección 4). |
| **Función** | **9. Evolución** (*Evolution*) | Arquitectura desacoplada (*React 18 + MapLibre/deck.gl/CesiumJS* en frontend; *FastAPI* en API; *Cloud Run Jobs* para física pesada) preparada para evolucionar hacia levantamientos **LiDAR aéreo / CityGML 3.0 LoD2.2** y ventanilla única BIM/IFC conforme el RFP en `docs/rfp/`. | `docs/rfp/RFP_AERIAL_LIDAR_TOPOBATHY_CITYGML3_LOD2.md`, `REGULATORY_ORDINANCE_DIGITAL_PERMITTING_BIM_IFC.md`. |

---

## 3. Comité Directivo Multi-Actor (*Comité Directivo BCS2050*)

El **Comité Directivo BCS2050** es el órgano colegiado máximo de gobernanza estratégica, priorización presupuestal, aprobación de convenios y resolución de conflictos inter-institucionales.

### 3.1 Composición y Derecho a Voto

| Miembro Institucional | Rol en el Comité | Peso / Atribución | Alcance Principal |
| :--- | :--- | :--- | :--- |
| **SEPUIMM** *(Secretaría de Planeación Urbana, Infraestructura, Movilidad, Medio Ambiente y Recursos Naturales de BCS)* | **Presidencia y Secretaría Técnica** | Voz y voto (voto de calidad en empates administrativos). Administra la custodia estatal de infraestructura cloud y dominios. | Política estatal, POERBCS, infraestructura estratégica e interoperabilidad estatal. |
| **IMPLAN La Paz** | **Vocalía Metropolitana Centro** | Voz y voto. Co-administrador de flujos PMDU y participación ciudadana de la capital. | PMDU La Paz, sectores tandeo OOMSAPAS LPZ, resiliencia Bahía de La Paz. |
| **IMPLAN Los Cabos** | **Vocalía Corredor Sur** | Voz y voto. Co-administrador de capas IMPLAN Los Cabos v3 (`26` capas) y ventanilla El Tezal / CSL / SJC. | PMDU Los Cabos, estrés turístico/hídrico, arroyos ciclónicos y desaladoras. |
| **Direcciones de Planeación / Desarrollo Urbano de Comondú, Loreto y Mulegé** | **Vocalía Regional Centro-Norte** *(1 asiento rotativo anual con voto + 2 vocalías con voz)* | Voz y voto (asiento titular rotativo). | Ordenamiento de valles agrícolas, Bahía de Loreto, corredores costeros norteños. |
| **Consorcio Científico UABCS / CIBNOR** | **Presidencia de Validación Científica y VVUQ** | Voz y voto técnico. Audita calibración de modelos VVUQ, hidrología ciclónica y biodiversidad/ANPs. | Auditoría anual de `VVUQ_BACKTEST_REPORT`, ética de datos, escenarios IPCC SSP5-8.5. |
| **Consejo Consultivo Cívico y Privado** *(CCE BCS, Colegios de Arquitectos e Ingenieros Civiles, ONGs Hídricas/Ambientales)* | **Observatorio Ciudadano y Gremial** | Voz permanente (2 votos colegiados en resoluciones de apertura de datos y reglas de participación pública). | Transparencia, accesibilidad WCAG 2.1 AA, interoperabilidad BIM/CAD y consulta pública PMDU. |

### 3.2 Reglas de Operación, Quórum y Conflictos de Interés
- **Periodicidad:** Sesiones ordinarias trimestrales (febrero, mayo, agosto, noviembre) y sesiones extraordinarias ante declaratorias hidrometeorológicas o reformas a PMDUs.
- **Quórum:** Mínimo 50% + 1 de los integrantes con derecho a voto, siendo indispensable la presencia de SEPUIMM y al menos un representante científico (UABCS/CIBNOR) o un IMPLAN municipal.
- **Declaratoria de Conflicto de Interés:** Cualquier miembro del consejo privado o gremial deberá excusarse de votar o acceder a datos `Nivel 2 Restringido` cuando su firma tenga un trámite de desarrollo inmobiliario o licitación vigente en el polígono discutido.
- **Publicidad de Actas:** Las minutas y acuerdos aprobados (excluyendo anexos técnicos `Nivel 2/3`) se publicarán en formato abierto dentro de los 10 días hábiles posteriores a cada sesión.

---

## 4. Matriz de Custodios de Dominio de Datos (*Domain Data Stewards*)

Cada dominio territorial del Gemelo Digital cuenta con un **Custodio de Dominio** nombrado oficialmente por su titular institucional, responsable de calidad geométrica, metadatos ISO 19115, cadencia de actualización y revisión de nivel de acceso.

| Dominio de Datos | Institución Custodia Responsable | Enlaces Operativos / Inter-agencia | Capas y Motores Bajo Custodia | Clasificación Máxima Permitida en Web | Cadencia Mínima de Actualización |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Agua e Hidrología** | **CONAGUA BCS** & **5 OOMSAPAS Municipales** | Subdirección Técnica CONAGUA; Direcciones de Operación OOMSAPAS | `aquifers` (40 polígonos), `tandeo` (280 sectores LPZ), PTARs, desaladoras, motor `WNTR` y telemetría piezométrica | `Nivel 1` (agregado DMA/sector) / `Nivel 2` (nodos/ductos SCADA por RBAC) | Telemetría cada 15–60 min; tandeo semanal; DMA anual (DOF) |
| **2. Energía y Red Eléctrica** | **CFE Distribución / Transmisión & CENACE** *(enlace SEPUIMM)* | Gerencia Divisional Baja California / SIBCS | `power_lines`, `substations`, `power_plants`, potencial fotovoltaico en techos y márgenes de reserva SIBCS | `Nivel 1` (trazo esquemático y potencial solar) / `Nivel 2` (capacidad nodal hosting) / `Nivel 3` (protecciones SCADA prohibidas) | Mensual (demanda máxima / hosting) y trimestral (infraestructura) |
| **3. Catastro, Edificación 3D y Usos de Suelo** | **IMPLANs & Direcciones de Catastro Municipal** | Coordinación SIG IMPLAN; Dirección de Catastro y Licencias | `buildings_3d` (396,823), `zoning` (79,515 parcelas), futuro CityGML 3.0 LoD2.2, exportadores CAD/IFC | `Nivel 1` (envolvente, altura, CUS/COS) / `Nivel 3` (titularidad/RFC/CURP prohibidos) | Semestral (licencias terminadas y reformas PMDU) |
| **4. Movilidad, Espacio Público y Red Vial** | **SEPUIMM / Direcciones de Movilidad Municipal** | Dirección de Movilidad Urbana; IMPLANs | `transit_stops`, `transit_lines`, `corridor_arcs`, Red Vial INEGI (`68,826` tramos), motor `r5py` 15-Min | `Nivel 1 Abierto` (GTFS, paraderos, isócronas) | Trimestral (ajustes de rutas y frecuencia) |
| **5. Clima, Costas y Protección Civil** | **Subsecretaría de Protección Civil BCS & CIBNOR** | Centro Estatal de Alertamiento; Lab. Oceanografía/Hidrología CIBNOR | `surge_exposed_pct`, arroyos `SFINCS`, ciclones NOAA NHC, `poer_ugas` (1,990), `anps` (76) | `Nivel 1 Abierto` (alertas y peligro histórico) / `Nivel 2` (albergues operativos críticos) | En vivo (ciclones/clima cada 15 min); anual (actualización VVUQ) |
| **6. Núcleo Espacial 3D y APIs OGC** | **Arquitectura Tecnológica BCS2050 (SEPUIMM TIC)** | Líder de Plataforma Cloud & Datos Geoespaciales | SQLite R-Tree / PostGIS, `3D Tiles 1.1` (`.glb`), `/ogc/*`, `/FROST-Server/v1.1`, CI/CD y Artifact Registry | `Nivel 1` y control de acceso `Nivel 2` | Continua (CI/CD y caché CDN/Cloud Run) |
| **7. Participación Ciudadana y Oficial de Protección de Datos (DPO)** | **Comité de Transparencia SEPUIMM / IMPLAN** | Oficial de Protección de Datos Personales (*LGPDPPSO*) | `/api/twin/participation`, moderación PMDU, bitácora ARCO y cumplimiento DPIA | `Nivel 1` (pines aprobados sin PII) / `Nivel 2` (cola pendiente moderación) | Moderación en ≤ 72 horas hábiles durante consulta PMDU |

---

## 5. Protocolo de Transferencia de Propiedad Institucional (Dominios, Cloud y Código)

Para eliminar el riesgo de punto único de falla (*bus factor = 1*) durante el paso de fase de prototipo a infraestructura pública institucional, el Comité Directivo ejecutará el siguiente protocolo de transferencia dentro de los **90 días naturales** posteriores a la adopción de esta Carta:

### 5.1 Inventario de Activos Sujetos a Custodia Institucional

| Capa de Activo | Identificador Actual | Custodia Destino Institucional | Mecanismo Técnico de Transferencia |
| :--- | :--- | :--- | :--- |
| **Google Cloud Platform (GCP)** | Proyecto `bcs2050` (`northamerica-south1`: Cloud Run `bcs2050-digital-twin`, Cloud Run Jobs `bcs2050-physics-worker` y `bcs2050-telemetry-ingestor`, Firestore `bcs-studio`, BigQuery, GCS `bcs2050-gis-curated`, `bcs2050-3dtiles-public`, Secret Manager, Artifact Registry) | **Organización GCP Institucional de SEPUIMM / Gobierno de BCS** *(o Fideicomiso Técnico Multi-actor BCS2050)* | 1. Vincular proyecto `bcs2050` a la Organización Cloud oficial mediante `gcloud beta projects move`.<br>2. Asignar `roles/resourcemanager.projectOwner` exclusivamente a **2 cuentas institucionales separadas (Break-Glass MFA por hardware)** bajo custodia de SEPUIMM TIC e IMPLAN La Paz.<br>3. Migrar cuenta de facturación (*Cloud Billing*) a partida presupuestal institucional.<br>4. Mantener `sa-bcs2050-agent-sandbox` / Workload Identity Federation con principio de mínimo privilegio. |
| **Dominios y Zona DNS** | `bcs2050.com`, `www.bcs2050.com`, `panel.bcs2050.com`, `twin.bcs2050.com` | Registrador corporativo a nombre de la entidad pública / organismo coordinador | 1. Transferir titularidad (*Registrant*) a correo institucional (`dominios@bcs2050.gob.mx` / `ti@sepuimm.bcs.gob.mx`), nunca a correos personales.<br>2. Habilitar *Registrar Lock*, DNSSEC y autenticación 2FA por llave física o aplicación institucional.<br>3. Documentar registros `A`, `AAAA`, `CNAME` y `TXT` en repositorio de infraestructura como código (`infra/`). |
| **Hosting Panel / Frontend Alterno (Netlify)** | `panel.bcs2050.com` | Equipo Empresarial (*Netlify Team*) de la Secretaría Técnica | 1. Migrar sitio al *Team* institucional con mínimo 3 administradores (`SEPUIMM`, `IMPLAN LPZ`, `IMPLAN Los Cabos`).<br>2. Verificar variables de entorno y cabeceras CORS contra `ALLOWED_ORIGINS`. |
| **Repositorio de Código Fuente (GitHub)** | `IvanTamayoRamos1989/bcs2050-digital-twin` | **GitHub Organization Institucional (`github.com/bcs2050-digital-twin` o equivalente gubernamental)** | 1. Ejecutar *Repository Transfer* hacia la Organización verificada.<br>2. Activar protección de rama `main` (requerir Pull Request + al menos 1 revisión de pares + CI/CD verde de pruebas `pytest` y `npm run build`).<br>3. Configurar secretos `GCP_WIF_PROVIDER` y `GCP_DEPLOY_SA` bajo *GitHub Environments* (`production`) con aprobadores institucionales. |

### 5.2 Cláusula de Continuidad y Depósito (*Escrow*)
- Ningún dominio, cuenta de facturación o secreto de despliegue podrá permanecer registrado bajo una cuenta personal más allá del periodo de transición de 90 días.
- Toda modificación a los parámetros físicos calibrados (`backend/simulation.py`, `backend/vvuq.py`) deberá ser revisada en rama Pull Request y acompañada de una actualización en `docs/VVUQ_BACKTEST_REPORT_2010_2023.md`.
- En caso de cambio de administración estatal o municipal, los Custodios de Dominio suscribirán un **Acta de Entrega-Recepción Digital** verificando acceso vigente a consola GCP, Netlify, GitHub, registrador DNS y respaldo completo de `Firestore (bcs-studio)` y `gs://bcs2050-gis-curated/`.
