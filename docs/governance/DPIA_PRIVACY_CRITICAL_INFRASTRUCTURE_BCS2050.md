# Evaluación de Impacto en Protección de Datos Personales e Infraestructura Crítica (DPIA — BCS2050)

**Normativa Aplicable en México:**
- **LGPDPPSO:** *Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados* (aplicable a SEPUIMM, IMPLANs, OOMSAPAS y Ayuntamientos de BCS).
- **LFPDPPP:** *Ley Federal de Protección de Datos Personales en Posesión de los Particulares* (aplicable a colaboradores privados, consultores técnicos y consejos ciudadanos).
- **LGTAIP / LFTAIP & LTAIPBCS:** *Leyes de Transparencia y Acceso a la Información Pública* (Arts. 110/113 reserva por seguridad de infraestructura estratégica; Art. 116 confidencialidad de datos personales).

---

## 1. Alcance del Análisis de Impacto

Esta DPIA evalúa los riesgos de privacidad ciudadana y seguridad nacional/estatal derivados de operar el **Gemelo Digital Territorial BCS2050** en entorno cloud público (`Cloud Run northamerica-south1`, `Firestore bcs-studio`, `BigQuery`, `Cloud Storage`) abarcando:
1. Visualización territorial abierta (`396,823` huellas de edificios 2.5D/3D, `79,515` parcelas de zonificación PMDU, `1,155` AGEBs).
2. Participación ciudadana georreferenciada (`POST /api/twin/participation` sobre mapas PMDU).
3. Integración de telemetría de infraestructura hídrica y energética (`OOMSAPAS`, `CONAGUA`, `CFE/CENACE`).

---

## 2. Inventario de Tratamiento y Principio de Minimización desde el Diseño (*Privacy by Design*)

| Flujo de Datos | ¿Contiene Datos Personales (PII)? | Nivel de Agregación Pública | Controles Implementados en Código y Arquitectura |
| :--- | :--- | :--- | :--- |
| **Socioeconomía e Indicadores Urbanos** | **No** *(disociados en origen)* | **AGEB (`1,155` polígonos) / Malla H3** | Las tablas en `data/spatial_index.sqlite` y BigQuery almacenan exclusivamente conteos y promedios censales por AGEB. No existen tablas de personas físicas, CURP, RFC ni nombres de propietarios catastrales. |
| **Edificios 3D y Parcelas PMDU** | **No** | Huella poligonal, altura y parámetros normativos (`COS`, `CUS`, niveles máx.) | Solo se expone morfología física (OpenBuildings 2.5D) y zonificación normativa (`PMDU`). Cero asociación con titularidad registral. |
| **Pines y Comentarios de Participación Ciudadana PMDU** | **Potencial incidental** *(si el usuario escribe su correo o teléfono en el texto libre)* | **Coordenada pública + alias opcional + estatus de moderación** | 1. **Aviso de Privacidad visible** antes de enviar instruyendo no incluir datos personales.<br>2. **Sanitización automática en `backend/participation.py`**: eliminación de etiquetas HTML, bloqueo de URLs externas y **enmascaramiento automático por expresiones regulares** de correos electrónicos (`[email-protegido]`), teléfonos de 10 dígitos (`[tel-protegido]`) y patrones CURP/RFC (`[id-protegido]`), registrando bandera `pii_redacted`.<br>3. **Pre-moderación obligatoria**: todo pin nuevo entra como `pending_moderation` y no aparece en la vista pública `GET /api/twin/participation` hasta aprobación explícita de un planificador municipal autenticado. |
| **Infraestructura Crítica Agua / Electricidad** | **No** *(Seguridad operativa Art. 110 LGTAIP)* | Tandeo agregado por sector; subestaciones y líneas a escala cartográfica macro | Las rutas `/api/twin/export/dxf`, `/obj3d`, `/bim-package` y `/api/twin/participation/*/moderate` soportan bloqueo RBAC por token institucional (`X-BCS-Planner-Token` vía `BCS2050_PLANNER_TOKENS` en `backend/security.py`). Nunca se almacenan credenciales SCADA ni relés de control en la nube del Gemelo Digital. |

---

## 3. Matriz de Riesgos, Amenazas y Mitigaciones (Infraestructura Crítica & Privacidad)

| ID | Riesgo / Amenaza Identificada | Base Legal Afectada | Probabilidad / Impacto | Controles Técnicos y Administrativos Implementados | Riesgo Residual |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R1** | **Exposición de PII ciudadana en comentarios PMDU** *(correos, teléfonos, direcciones exactas o difamación)* | LGPDPPSO Arts. 16, 22, 31; LFPDPPP Art. 8 | Media / Alto | Redacción automática de correos/teléfonos/CURP en backend + estado inicial `pending_moderation` + revisión humana previa por IMPLAN/SEPUIMM + rate-limit estricto (`12 req/min` en `POST /api/twin/participation`). | **Bajo** |
| **R2** | **Identificación de propietarios o ingreso familiar mediante parcelas catastrales** | LGPDPPSO Art. 6; LFTAIP Art. 116 | Baja / Alto | Prohibición absoluta de ingestar nombres, RFC, CURP o padrón de usuarios de agua (`Nivel 3`). Los indicadores socioeconómicos y demográficos se publican estrictamente agregados a nivel `AGEB` o `Municipio`. | **Muy Bajo** |
| **R3** | **Uso malicioso de mapas de infraestructura crítica (CFE SIBCS / macro-ductos OOMSAPAS)** | LGTAIP Art. 110 fracc. I y V *(Seguridad Nacional / Instalaciones Estratégicas)* | Media / Medio-Alto | Separación en capas `Nivel 1` (trazo esquemático referencial) y `Nivel 2` (diagramas de presión nodales WNTR, exportables CAD/BIM y futuros ductos `UtilityNetwork ADE` protegidos bajo RBAC institucional). Cero comandos de actuación SCADA. | **Bajo** |
| **R4** | **Abuso de API, scraping masivo o denegación de servicio sobre simuladores y exportadores** | LGPDPPSO Art. 31 *(Medidas de seguridad)* | Media / Medio | Middleware `SecurityAndRateLimitMiddleware` (`backend/security.py`): `HEAVY_RPM=12` en `/api/twin/chat`, `/api/twin/simulate`, `/api/twin/export/*`, `/ogc/processes/*/execution` y `POST /api/twin/participation`; CORS restringido por `ALLOWED_ORIGINS`; cabeceras `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. | **Bajo** |
| **R5** | **Re-identificación mediante metadatos técnicos o registros de bitácora (Logs IP)** | LGPDPPSO Arts. 26–28 | Baja / Medio | Los documentos en Firestore (`bcs2050_citizen_pins`) **no almacenan direcciones IP ni agentes de navegador**. El limitador de tasa opera en memoria efímera en ventana deslizante de 60 segundos exclusivamente para control anti-abuso. | **Muy Bajo** |

---

## 4. Cumplimiento Específico LGPDPPSO / LFPDPPP (Derechos ARCO y Avisos de Privacidad)

### 4.1 Aviso de Privacidad Simplificado (Integrado en UI)
Antes de confirmar cualquier envío en el módulo **Participación Ciudadana PMDU**, la interfaz informa en idioma español e inglés que:
- Los aportes ciudadanos tienen finalidad exclusiva de consulta pública para instrumentos de planeación urbana (**PMDU / POERBCS**) de SEPUIMM e IMPLANs municipales.
- No se solicitan nombres reales, correos ni teléfonos; se recomienda usar un alias y evitar datos personales en la descripción.
- Las personas titulares pueden ejercer sus derechos **ARCO** (*Acceso, Rectificación, Cancelación y Oposición*) para solicitar la eliminación o corrección de un pin ciudadano aprobado.

### 4.2 Procedimiento de Atención a Derechos ARCO y Moderación
- **Ventanilla ARCO / Moderación:** Coordinación de Transparencia de SEPUIMM y Enlaces de Datos Personales de los IMPLAN municipales (`participacion@bcs2050.com` / Unidad de Transparencia correspondiente).
- **Plazo de Respuesta:** Remoción inmediata de comentarios con PII inadvertida (`< 24 horas`) mediante `POST /api/twin/participation/{pin_id}/moderate` (`action: "reject"`), y resolución formal de solicitudes ARCO dentro del término legal de **20 días hábiles** establecido en el Art. 51 de la LGPDPPSO.

---

## 5. Política de Retención y Protocolo de Respuesta a Incidentes

1. **Retención de Datos:**
   - Pines ciudadanos aprobados asociados a una consulta PMDU (`PMDU-LPZ-2026`, etc.): se conservan anonimizados durante la vigencia de la consulta y como memoria técnica pública del instrumento aprobado; registros rechazados por spam/PII se depuran cada 90 días.
   - Trabajos de simulación física (`/ogc/jobs/*` en Firestore `bcs-studio`): artefactos anónimos sin PII con purga automática programable cada 180 días.
2. **Respuesta a Incidentes de Seguridad (Ventana de 72 Horas):**
   - **0–4 horas:** Revocación inmediata de tokens `BCS2050_PLANNER_TOKENS` comprometidos en Secret Manager, elevación de restricciones CORS/IAM o deshabilitación temporal del endpoint afectado.
   - **4–24 horas:** Análisis forense de bitácoras en Google Cloud Logging y auditoría de colecciones en `Firestore bcs-studio`.
   - **24–72 horas:** Notificación al Comité Directivo BCS2050, a las Entidades Aportantes afectadas y, en caso de vulneración confirmada de datos personales, notificación oficial ante el organismo garante (**ITAI BCS / autoridad competente**) en estricto apego al Art. 40 de la LGPDPPSO.
