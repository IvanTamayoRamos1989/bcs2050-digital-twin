# Plantillas Estandarizadas de Convenio de Colaboración e Intercambio de Datos Geoespaciales y Telemetría (BCS2050)

**Marco Jurídico:** Constitución Política de los Estados Unidos Mexicanos (Art. 6° y 115), Ley General de Asentamientos Humanos, Ordenamiento Territorial y Desarrollo Urbano (LGAHOTDU), Ley de Desarrollo Urbano del Estado de BCS, Ley del Sistema Nacional de Información Estadística y Geográfica (LSNIEG), **LGPDPPSO** y **LFTAIP/LTAIPBCS**.

---

## Parte I — Cláusulas Marco del Convenio Específico de Colaboración

> **CONVENIO ESPECÍFICO DE COLABORACIÓN E INTERCAMBIO DE INFORMACIÓN GEOESPACIAL, HIDROMETEOROLÓGICA Y TELEMETRÍA EN TIEMPO REAL** QUE CELEBRAN POR UNA PARTE LA **SECRETARÍA DE PLANEACIÓN URBANA, INFRAESTRUCTURA, MOVILIDAD, MEDIO AMBIENTE Y RECURSOS NATURALES (SEPUIMM)** / EL **COMITÉ DIRECTIVO DEL GEMELO DIGITAL TERRITORIAL BCS2050** *(EN LO SUCESIVO "EL CUSTODIO DE PLATAFORMA")*, Y POR LA OTRA PARTE **«NOMBRE_DEPENDENCIA_U_ORGANISMO»** *(EN LO SUCESIVO "LA ENTIDAD APORTANTE")*, AL TENOR DE LAS SIGUIENTES CLÁUSULAS:

### Cláusula Primera — Objeto
Establecer las bases técnicas, jurídicas y operativas bajo las cuales **LA ENTIDAD APORTANTE** compartirá de manera periódica o continua conjuntos de datos geoespaciales, tabulares y flujos de telemetría hacia el **Gemelo Digital Territorial BCS2050** (`bcs2050-digital-twin`), y **EL CUSTODIO DE PLATAFORMA** integrará, validará mediante metadatos **ISO 19115** y disponibilizará dicha información conforme a su **Nivel de Clasificación**.

### Cláusula Segunda — Clasificación de la Información en Tres Niveles

| Nivel | Denominación | Régimen de Acceso y Publicación | Condiciones de Uso y Redacción |
| :--- | :--- | :--- | :--- |
| **Nivel 1** | **Abierto Público** *(Open Data)* | Público en `twin.bcs2050.com`, `/api/twin/*` y servicios estándar `/ogc/*` bajo licencia **CC-BY-4.0 / Datos Abiertos MX** con atribución obligatoria a **LA ENTIDAD APORTANTE**. | Información agregada a nivel **AGEB (1,155), malla H3 o polígono zonal PMDU**, huellas 2.5D/3D, calidad ambiental e indicadores municipales sin datos personales ni vulnerabilidad operativa. |
| **Nivel 2** | **Restringido Técnico** *(Institutional RBAC)* | Acceso exclusivo para funcionarios designados de **SEPUIMM**, **IMPLANs**, **OOMSAPAS**, **Protección Civil** y **UABCS/CIBNOR** autenticados mediante token RBAC (`X-BCS-Planner-Token` / IAM Federado). | Diagramas hidráulicos de tuberías y presiones sectoriales (`WNTR`), exportación CAD/DXF/BIM por corredor, redes subterráneas (`UtilityNetwork ADE`), colas de moderación ciudadana e infraestructura crítica desagregada. |
| **Nivel 3** | **Confidencial / PII / Seguridad Crítica** *(Prohibido en Web Pública)* | **PROHIBIDA su ingestión en endpoints públicos, BigQuery abierto o Firestore público.** Si se requiere cruce estadístico interno, se realiza exclusivamente en enclave seguro previo al envío de agregados. | Nombres de propietarios, RFC, CURP, contratos individuales de agua/luz, claves de relés de protección eléctrica o credenciales SCADA de control operativo (*write/actuation*). |

### Cláusula Tercera — Niveles de Servicio (SLA) y Estándares de Interoperabilidad
1. **Protocolos de Transporte Admitidos:**
   - **Telemetría casi real:** HTTP REST / MQTT hacia puente **OGC SensorThings API v1.1** (`/FROST-Server/v1.1/`) o depósito cifrado en bucket GCS con autenticación *Workload Identity Federation (WIF)* sin llaves estáticas.
   - **Capas vectoriales y catastro:** **GeoPackage (`.gpkg`)**, **OGC API - Features**, **GeoParquet** o **CityGML 3.0** en sistema de referencia **WGS84 (`EPSG:4326`)** o **UTM Zona 12N (`EPSG:32612`)**.
2. **Disponibilidad de Plataforma:** EL CUSTODIO DE PLATAFORMA mantendrá un objetivo de disponibilidad de `99.5%` mensual en Cloud Run (`northamerica-south1`), con degradación elegante a último estado en caché Firestore (`bcs-studio`) ante intermitencias de enlaces remotos, mostrando visiblemente la etiqueta `LIVE / CACHED / STALE` al usuario.
3. **Resguardo de Seguridad:** Ninguna conexión permitirá comandos de escritura sobre sistemas SCADA de control físico (*read-only one-way telemetry pull or push*).

### Cláusula Cuarta — Deslinde de Responsabilidad Técnica y Legal (*Liability Disclaimer*)
1. **Naturaleza de Apoyo a la Decisión:** Los escenarios prospectivos 2025–2050, cálculos de brecha CAPEX (`goal-gap`), índices Aretian (`SDI-100`) y simulaciones físicas (`SFINCS`, `r5py`, `WNTR`) publicados en BCS2050 constituyen **herramientas cuantitativas de diagnóstico y planeación estratégica** acompañadas de sus bandas de incertidumbre **ISO 23247-8 (`P10 / P50 / P90`)**.
2. **Ausencia de Validez Jurídica Sustitutiva:** Los resultados del Gemelo Digital **no sustituyen** ni equivalen legalmente a una *Constancia de Zonificación y Uso de Suelo*, una *Licencia de Construcción*, un *Dictamen Oficial de Factibilidad Hídrica* emitido por OOMSAPAS, una *Manifestación de Impacto Ambiental (MIA)* ante SEMARNAT, una concesión de *CONAGUA* o una orden de evacuación de *Protección Civil*.
3. **Veracidad de Origen:** **LA ENTIDAD APORTANTE** garantiza que cuenta con las atribuciones legales para compartir sus conjuntos de datos, mientras que **EL CUSTODIO DE PLATAFORMA** se obliga a respetar íntegramente los avisos de actualización, escalas válidas de visualización y exclusiones de garantía.

### Cláusula Quinta — Vigencia, Confidencialidad y Terminación Anticipada
El convenio tendrá vigencia indefinida o anual con renovación tácita, pudiendo suspenderse inmediatamente el flujo de datos `Nivel 2` ante cualquier incidente de seguridad notificado dentro de las primeras **24 horas**.

---

## Parte II — Anexos Técnicos Específicos por Entidad Aportante (5 Plantillas)

### Anexo 1 — Organismos Operadores Municipales de Agua Potable (**OOMSAPAS La Paz, Los Cabos, Comondú, Loreto y Mulegé**)
- **Datasets y Telemetría Aportada:**
  - Polígonos actualizados de sectores hidrométricos y **calendarios semanales de tandeo** (hoy integrados `280` sectores en La Paz; meta extender cobertura formal a Los Cabos, Comondú, Loreto y Mulegé).
  - Caudal (`lps`), presión en nodos cabecera (`mca`) y niveles de tanques de almacenamiento vía `OGC SensorThings v1.1` (piloto acoplado a `WNTR`).
  - Producción de plantas desalinizadoras existentes/proyectadas y caudales tratados/reusados en PTAR (*línea morada*).
- **Clasificación:** Polígonos de tandeo y disponibilidad agregada por sector/AGEB (`Nivel 1 Abierto`); topología exacta de tuberías matrices, válvulas de seccionamiento y presiones nodales (`Nivel 2 Restringido Técnico`); padrón nominal de usuarios y recibos (`Nivel 3 Prohibido`).
- **SLA de Actualización:** Calendarios de tandeo: actualización semanal (o dentro de las 6 horas posteriores a contingencia en pozo/acueducto); telemetría macro-medidores: cada 15–60 minutos; balances de agua no contabilizada y PTAR: mensual.

### Anexo 2 — Comisión Nacional del Agua (**CONAGUA — Dirección Local BCS**)
- **Datasets y Telemetría Aportada:**
  - Actualización oficial de Disponibilidad Media Anual de Agua Subterránea (**DMA**) para los `39` acuíferos oficiales en BCS y el acuífero transfronterizo `0228` (*40 polígonos totales*).
  - Niveles estáticos y dinámicos agregados de red de monitoreo piezométrico (anonymized/generalized to 1 km² grid or aquifer centroid si aplica reserva).
  - Delimitación oficial de zonas federales de arroyos y cauces ante eventos hidrometeorológicos.
- **Clasificación:** Polígonos DMA, estatus de déficit (`21` en déficit estricto / `22` sin disponibilidad) y zonas federales públicas (`Nivel 1 Abierto`); concesiones individuales vinculadas a personas físicas (`Nivel 3 Confidencial` conforme LFTAIP, anonimizadas a volumen total municipal/agrícola en la plataforma).
- **SLA de Actualización:** Piezometría y volúmenes de extracción agregados: trimestral; actualización formal de Acuerdos DMA en el DOF: dentro de los 15 días hábiles posteriores a su publicación oficial.

### Anexo 3 — Comisión Federal de Electricidad / Centro Nacional de Control de Energía (**CFE / CENACE — Sistema Interconectado Baja California Sur / SIBCS**)
- **Datasets y Telemetría Aportada:**
  - Curvas horarias agregadas de demanda neta y margen de reserva operativo del **SIBCS** (`MW`).
  - Capacidad de alojamiento (*hosting capacity*) para generación distribuida solar en techos por circuito/subestación (`Nivel 2`), y geometría referencial de subestaciones y líneas principales (`150` elementos en red).
- **Clasificación:** Margen de reserva estatal agregado y mapa estatal de aptitud fotovoltaica en techos (`Nivel 1 Abierto`); diagramas unifilares detallados, límites térmicos por alimentador y localización exacta de infraestructura estratégica crítica (`Nivel 2 Restringido Técnico` bajo Art. 110 LGTAIP); telecontrol SCADA/protecciones (`Nivel 3 Prohibido`).
- **SLA de Actualización:** Demanda agregada y alertas de reserva operativa: cada 1 hora (o evento de alerta); capacidad de alojamiento por circuito: trimestral.

### Anexo 4 — Subsecretaría de Protección Civil Estatal y Direcciones Municipales de Protección Civil (**Protección Civil BCS**)
- **Datasets y Telemetría Aportada:**
  - Registro georreferenciado de incidentes históricos de inundación, desbordamiento de arroyos y daños post-ciclón (calibración continua de `SFINCS` y `docs/VVUQ_BACKTEST_REPORT_2010_2023.md`).
  - Ubicación verificada, aforo y estado de apertura en tiempo real de **refugios temporales**, rutas de evacuación y pluviómetros/estaciones meteorológicas locales.
- **Clasificación:** Polígonos de peligro por marea ciclónica/arroyo y catálogo público de refugios temporales activos (`Nivel 1 Abierto`); protocolos internos de mando, inventarios tácticos de equipos de rescate y vulnerabilidad de instalaciones estratégicas (`Nivel 2 Restringido Técnico`).
- **SLA de Actualización:** En temporada ciclónica (15 de mayo – 30 de noviembre) y alertas activas: cada 15 minutos; inventario anual de arroyos y tirantes históricos post-evento: dentro de los 30 días posteriores al cierre de la emergencia.

### Anexo 5 — Catastros Municipales y Direcciones de Desarrollo Urbano / IMPLANs (**Catastro Municipal y Desarrollo Urbano**)
- **Datasets y Telemetría Aportada:**
  - Envolventes poligonales de predios, clave catastral **hasheada o disociada de titularidad**, clasificación PMDU vigente (`COS`, `CUS`, niveles máximos, categoría de uso de suelo sobre `79,515+` parcelas), registro georreferenciado de licencias de construcción autorizadas y entregas digitales futuras en `IFC / GeoJSON`.
- **Clasificación:** Geometría predial sin nombre de propietario y normatividad PMDU vigente (`Nivel 1 Abierto`); expedientes de obra en trámite, dictámenes de impacto urbano y exportaciones métricas UTM Zona 12N (`Nivel 2 Restringido Técnico`); **nombre del propietario, domicilio fiscal, CURP, RFC, avalúo fiscal y datos registrales (`Nivel 3 Confidencial / PII — estrictamente excluidos de todo repositorio y API del Gemelo Digital`)**.
- **SLA de Actualización:** Modificaciones a PMDU y tablas de zonificación: dentro de los 10 días hábiles posteriores a publicación en Boletín Oficial; altas de licencias/volumetría aprobada: mensual.
