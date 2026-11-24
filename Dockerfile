# Multi-stage Production Dockerfile for BCS2050 Digital Twin (Cloud Run / GKE ready)
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8050 \
    BCS2050_USE_BIGQUERY=false \
    BCS2050_USE_FIRESTORE=false \
    BCS2050_FIRESTORE_DATABASE=bcs-studio \
    BCS2050_TELEMETRY_PUBSUB_TOPIC=bcs2050-telemetry-events \
    GOOGLE_CLOUD_LOCATION=global \
    BCS2050_CHAT_MODEL=gemini-4-hydrogen

RUN pip install --no-cache-dir \
    fastapi>=0.115.0 \
    "uvicorn[standard]>=0.32.0" \
    pydantic>=2.9.0 \
    pyyaml>=6.0.2 \
    shapely>=2.0.0 \
    numpy>=1.26.0 \
    httpx>=0.27.0 \
    ezdxf>=1.3.0 \
    pyproj>=3.6.0 \
    google-cloud-bigquery>=3.27.0 \
    google-cloud-firestore>=2.19.0 \
    google-cloud-pubsub>=2.27.0 \
    google-genai>=1.0.0

COPY bcs2050_intelligence /app/bcs2050_intelligence
COPY backend /app/bcs2050_digital_twin/backend
COPY workers /app/bcs2050_digital_twin/workers
COPY data /app/bcs2050_digital_twin/data
COPY --from=frontend-build /app/frontend/dist /app/bcs2050_digital_twin/frontend/dist

WORKDIR /app/bcs2050_digital_twin
EXPOSE 8050
CMD ["sh", "-c", "uvicorn backend.server:app --host 0.0.0.0 --port ${PORT}"]
