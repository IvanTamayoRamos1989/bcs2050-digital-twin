# Multi-stage Production Dockerfile for BCS2050 Digital Twin (Cloud Run / GKE ready)
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY bcs2050_digital_twin/frontend/package*.json ./
RUN npm ci
COPY bcs2050_digital_twin/frontend/ ./
RUN npm run build

FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8050 \
    BCS2050_USE_BIGQUERY=false

RUN pip install --no-cache-dir \
    fastapi>=0.115.0 \
    "uvicorn[standard]>=0.32.0" \
    pydantic>=2.9.0 \
    pyyaml>=6.0.2 \
    shapely>=2.0.0

COPY bcs2050_intelligence /app/bcs2050_intelligence
COPY bcs2050_digital_twin/backend /app/bcs2050_digital_twin/backend
COPY bcs2050_digital_twin/data /app/bcs2050_digital_twin/data
COPY --from=frontend-build /app/frontend/dist /app/bcs2050_digital_twin/frontend/dist

WORKDIR /app/bcs2050_digital_twin
EXPOSE 8050
CMD ["sh", "-c", "uvicorn backend.server:app --host 0.0.0.0 --port ${PORT}"]
