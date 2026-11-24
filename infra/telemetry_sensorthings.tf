# ============================================================================
# telemetry_sensorthings.tf — Instruction 4: Resilient Event-Driven Telemetry
# & OGC SensorThings API Backbone for BCS2050 Digital Twin
# ============================================================================

variable "project_id" {
  type    = string
  default = "bcs2050"
}

variable "region" {
  type    = string
  default = "northamerica-south1"
}

variable "scheduler_region" {
  type    = string
  default = "us-central1"
}

variable "digital_twin_image" {
  type    = string
  default = "northamerica-south1-docker.pkg.dev/bcs2050/cloud-run-source-deploy/bcs2050-digital-twin:latest"
}

variable "runtime_service_account_email" {
  type    = string
  default = "sa-bcs2050-agent-sandbox@bcs2050.iam.gserviceaccount.com"
}

variable "enable_standalone_frost_cloudsql" {
  type        = bool
  default     = false
  description = "Set true in Instruction 5 when Cloud SQL PostGIS is provisioned to deploy the dedicated Fraunhofer FROST-Server JVM container."
}

locals {
  telemetry_apis = [
    "firestore.googleapis.com",
    "pubsub.googleapis.com",
    "cloudscheduler.googleapis.com",
    "run.googleapis.com",
    "bigquery.googleapis.com",
  ]
}

resource "google_project_service" "telemetry_apis" {
  for_each           = toset(local.telemetry_apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_pubsub_topic" "telemetry_events" {
  project = var.project_id
  name    = "bcs2050-telemetry-events"

  depends_on = [google_project_service.telemetry_apis]
}

resource "google_bigquery_table" "telemetry_observations" {
  project             = var.project_id
  dataset_id          = "bcs2050_gis"
  table_id            = "telemetry_observations"
  deletion_protection = false

  time_partitioning {
    type  = "DAY"
    field = "observed_at"
  }

  clustering = ["feed_name", "thing_id", "municipality_code"]

  schema = jsonencode([
    { name = "observed_at", type = "TIMESTAMP", mode = "REQUIRED" },
    { name = "ingested_at", type = "TIMESTAMP", mode = "REQUIRED" },
    { name = "feed_name", type = "STRING", mode = "REQUIRED" },
    { name = "thing_id", type = "STRING", mode = "REQUIRED" },
    { name = "municipality_code", type = "STRING", mode = "NULLABLE" },
    { name = "metric_name", type = "STRING", mode = "REQUIRED" },
    { name = "numeric_value", type = "FLOAT64", mode = "NULLABLE" },
    { name = "string_value", type = "STRING", mode = "NULLABLE" },
    { name = "unit", type = "STRING", mode = "NULLABLE" },
    { name = "status", type = "STRING", mode = "REQUIRED" },
    { name = "source", type = "STRING", mode = "NULLABLE" },
    { name = "lat", type = "FLOAT64", mode = "NULLABLE" },
    { name = "lon", type = "FLOAT64", mode = "NULLABLE" },
    { name = "payload_json", type = "STRING", mode = "NULLABLE" },
  ])
}

resource "google_cloud_run_v2_job" "telemetry_ingestor" {
  name                = "bcs2050-telemetry-ingestor"
  location            = var.region
  project             = var.project_id
  deletion_protection = false

  template {
    template {
      service_account = var.runtime_service_account_email
      max_retries     = 1
      timeout         = "180s"

      containers {
        image   = var.digital_twin_image
        command = ["python"]
        args    = ["-m", "workers.telemetry_ingestor"]

        env {
          name  = "BCS2050_USE_BIGQUERY"
          value = "true"
        }
        env {
          name  = "BCS2050_USE_FIRESTORE"
          value = "true"
        }
        env {
          name  = "BCS2050_FIRESTORE_DATABASE"
          value = "bcs-studio"
        }
        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }
        env {
          name  = "BQ_LOCATION"
          value = var.region
        }
        env {
          name  = "BCS2050_TELEMETRY_PUBSUB_TOPIC"
          value = google_pubsub_topic.telemetry_events.name
        }
        env {
          name  = "TERRITORIAL_IA_URL"
          value = "https://bcs2050-territorial-ia-96586614897.northamerica-south1.run.app"
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }
      }
    }
  }

  depends_on = [google_project_service.telemetry_apis]
}

resource "google_cloud_scheduler_job" "telemetry_every_5m" {
  name        = "bcs2050-telemetry-every-5m"
  project     = var.project_id
  region      = var.scheduler_region
  description = "Triggers asynchronous BCS2050 live telemetry ingestor every 5 minutes."
  schedule    = "*/5 * * * *"
  time_zone   = "America/Mexico_City"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.telemetry_ingestor.name}:run"

    oauth_token {
      service_account_email = var.runtime_service_account_email
    }
  }

  depends_on = [google_cloud_run_v2_job.telemetry_ingestor]
}

# Opt-in Fraunhofer FROST-Server JVM + Cloud SQL PostGIS module (for Instruction 5 scale-out)
resource "google_sql_database_instance" "frost_postgis" {
  count               = var.enable_standalone_frost_cloudsql ? 1 : 0
  name                = "bcs2050-frost-pg16"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier = "db-custom-1-3840"
    ip_configuration {
      ipv4_enabled = false
    }
  }
}

resource "google_cloud_run_v2_service" "frost_server_standalone" {
  count    = var.enable_standalone_frost_cloudsql ? 1 : 0
  name     = "bcs2050-frost-server"
  location = var.region
  project  = var.project_id

  template {
    service_account = var.runtime_service_account_email
    containers {
      image = "fraunhoferiosb/frost-server:2.3"
      ports {
        container_port = 8080
      }
      env {
        name  = "serviceRootUrl"
        value = "https://twin.bcs2050.com/FROST-Server"
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }
    }
  }
}
