# Modelo de Lineamiento y Reglamento Municipal: Ventanilla Única Digital 3D (IFC / GeoJSON / ISO 19650) para Licencias de Construcción y Factibilidad Hídrica (BCS2050)

**Fundamento Legal:** Art. 115 Fracc. V de la CPEUM, Ley General de Asentamientos Humanos, Ordenamiento Territorial y Desarrollo Urbano (`LGAHOTDU`), Ley de Desarrollo Urbano del Estado de Baja California Sur, Reglamentos de Construcciones Municipales y Programas Municipales de Desarrollo Urbano (`PMDU`).  
**Propósito:** Modernizar el dictamen urbano, ambiental e hídrico integrando entregas digitales estandarizadas directamente al **Gemelo Digital Territorial BCS2050**, reduciendo discrecionalidad, tiempos de autorización y riesgos en zonas de arroyo/costa.

---

## 1. Objeto de la Reforma Reglamentaria Municipal

El presente modelo normativo establece los requisitos de entrega digital tridimensional e interoperable exigibles a las personas solicitantes, Directores Responsables de Obra (DRO) y desarrolladores dentro de los trámites municipales de:
1. **Constancia de Alineamiento, Uso de Suelo y Compatibilidad Urbanística.**
2. **Licencia de Construcción (Obra Nueva, Ampliación y Conjuntos Habitacionales/Turísticos).**
3. **Dictamen de Factibilidad Hídrica y Saneamiento (`OOMSAPAS` / Comisión de Factibilidad).**
4. **Autorización de Fraccionamientos, Condominios y Obras de Urbanización.**

---

## 2. Esquema Escalonado de Entregables Digitales (*Tiered Submission Matrix*)

Para evitar cargas desproporcionadas a la autoconstrucción o vivienda unifamiliar menor, la obligatoriedad se gradúa en **tres niveles de complejidad**:

| Nivel de Trámite | Umbral de Superficie / Tipología | Formato Digital Obligatorio | Datos y Revisión Automatizada en BCS2050 |
| :--- | :--- | :--- | :--- |
| **Nivel A — Obra Menor / Unifamiliar** | Construcción `≤ 250 m²` totales o `≤ 2 niveles` en lote consolidado fuera de zona federal | **`GeoJSON` (RFC 7946, WGS84 o EPSG:32612) + Ficha JSON de Envolvente** *(además de planos PDF firmados electrónicamente)* | Verificación automática de predio contra `79,515` parcelas PMDU: cumplimiento de `COS máx`, `CUS máx`, niveles y verificación negativa de invasión a arroyo (`SFINCS`) o zona de protección costera ZOFEMAT. |
| **Nivel B — Multifamiliar, Comercial y Turístico Mediano** | Edificación de `251 m²` a `5,000 m²`, o proyectos en lotes con pendiente/costa/arroyo | **Modelo openBIM `IFC 4.3` (*ISO 16739-1*)** georreferenciado mediante `IfcMapConversion` en **`EPSG:32612`** + `GeoJSON` del polígono | Pre-validación automática mediante `IfcOpenShell` / motor geométrico contra: 1) Envolvente 3D (`COS/CUS/remetimientos/altura`); 2) Sombra proyectada y captura solar mínima en techos; 3) Demanda hidráulica estimada (`lps`) inyectada al simulador **`WNTR` OOMSAPAS**; 4) Escurrimiento neto cero (`SUDS`) ante tormenta `Tr=100` en **`SFINCS`**. |
| **Nivel C — Mega-Desarrollos, Desaladoras y Obra Pública Estratégica** | Proyectos `> 5,000 m²`, conjuntos `> 50` viviendas/llaves hoteleras, plantas desaladoras, PTARs, hospitales o infraestructura estatal (`SEPUIMM`) | **Entorno Común de Datos (CDE) bajo `ISO 19650-1 y 19650-2` + `IFC 4.3` Federado + Modelo O&M** *(con ganchos opcionales Autodesk Construction Cloud `ACC` / `Autodesk Tandem`)* | Revisión federada de interferencias urbanas, vinculación obligatoria de red **línea morada (PTAR)** cuando exista infraestructura a `< 500 m`, auditoría de capacidad de alojamiento eléctrico `CFE SIBCS`, plan de mitigación vial (`15-Min` / transporte) y entrega *As-Built* en `CityGML LoD2 / IFC` al término de obra para actualizar el Gemelo Digital estatal. |

---

## 3. Reglas Específicas para *Factibilidad Hídrica* (`OOMSAPAS`) y Resiliencia Ciclónica

### Artículo Modelo 14 — Regla de Neutralidad Hidráulica e Integración `WNTR`
1. Todo proyecto de **Nivel B o C** deberá declarar en su esquema estructurado (JSON/IFC Pset `Pset_BCS_WaterFactibility`) su demanda media y pico en **litros por segundo (`lps`)**, número de tomas y propuesta de recirculación.
2. Ningún proyecto de **Nivel C** podrá recibir factibilidad positiva cuando su sector hidráulico simulado en **WNTR (`water_network_wntr`)** caiga por debajo de la presión mínima normativa de **15 m.c.a.** en hora de máxima demanda, salvo que el desarrollador financie obras de reforzamiento, macromedición inteligente conectada vía **OGC SensorThings v1.1** o acreditación de reúso en **línea morada ≥ 65%**.
3. En predios con frente mayor a `1,000 m²` o ubicados en abanicos aluviales catalogados de riesgo medio/alto, el dictamen requerirá demostrar mediante archivo de salida compatible con **SFINCS** la implementación de Sistemas Urbanos de Drenaje Sostenible (**SUDS**) que absorban al menos el incremento de escorrentía para tormenta de diseño **`Tr = 25 años`** y libre paso en `Tr = 100 años`.

### Artículo Modelo 18 — Integración Opcional con Autodesk ACC / Autodesk Tandem (Obra Pública y Gran Escala)
- Los contratos de obra pública ejecutados por **SEPUIMM** o Ayuntamientos con monto superior a `30 millones de pesos MXN`, así como concesiones estratégicas de agua/energía, podrán gestionar sus revisiones de diseño bajo el flujo CDE **ISO 19650** utilizando conectores bidireccionales hacia **Autodesk Construction Cloud (ACC) / Tandem** *(mediante estándar Autodesk Platform Services — APS)*, garantizando en todo momento que la versión final aprobada se exporte en formatos abiertos **`IFC 4.3` y `CityGML 3.0`** sin dependencia perpetua de licencias comerciales.

---

## 4. Cláusula de Privacidad y Protección de Propiedad Intelectual en Ventanilla Única
- Los archivos **`IFC 4.3`** completos de interiores estructurales o electromecánicos privados se resguardan en el buzón municipal autenticado bajo clasificación **`Nivel 2 Restringido Técnico`** durante la vigencia del trámite.
- Únicamente la **envolvente exterior volumétrica (`LoD2`), usos agregados, alturas y parámetros normativos** se publican en las capas abiertas **`Nivel 1`** del Gemelo Digital BCS2050, eliminando planos interiores residenciales privados, nombres de propietarios, CURP y RFC en estricto apego a la **LGPDPPSO** y la **DPIA de BCS2050**.

---

## 5. Ruta Crítica de Adopción en Cabildo y Periodo de Transición (18 Meses)

| Etapa | Plazo | Hito Institucional / Normativo |
| :--- | :--- | :--- |
| **Fase I — Piloto Voluntario (*Fast-Track*)** | Meses 1–6 | Los Cabildos de **La Paz y Los Cabos** aprueban acuerdos administrativos otorgando **reducción de hasta 30% en tiempos de revisión** (*carril rápido digital*) a DROs que ingresen paquetes `IFC 4.3` / `GeoJSON` georreferenciados en `EPSG:32612`. |
| **Fase II — Publicación Reglamentaria** | Meses 7–12 | Aprobación en sesiones de Cabildo de las reformas al Reglamento de Construcciones y publicación en el **Boletín Oficial del Gobierno del Estado de BCS**. Capacitación gratuita a Colegios de Arquitectos, Colegios de Ingenieros y DROs mediante plantillas abiertas Civil 3D / Revit / QGIS (`IMPLAN + UABCS`). |
| **Fase III — Obligatoriedad Nivel B y C** | Meses 13–18 | Entra en vigor la obligatoriedad plena para trámites Nivel B (`> 250 m²`) y Nivel C (`> 5,000 m²` / obras públicas), integrando actualización automática mensual hacia las capas del Gemelo Digital BCS2050. |
