# ============================================================================
# spatial_postgis_cdn.tf — Instruction 5: Cloud-Native PostGIS Spatial Core,
# Public OGC 3D Tiles 1.1 Bucket + Cloud CDN, Secret Manager 3D Tiles Keys, & ETL
# ============================================================================

variable "enable_cloudsql_postgis" {
  type        = bool
  default     = false
  description = "Set true when activating dedicated Cloud SQL PostgreSQL 16 + PostGIS in northamerica-south1."
}

variable "enable_3dtiles_cloud_cdn" {
  type        = bool
  default     = false
  description = "Set true to front bcs2050-3dtiles-public with HTTPS Load Balancer + Cloud CDN."
}

resource "google_storage_bucket" "tiles3d_public" {
  name                        = "bcs2050-3dtiles-public"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Content-Encoding", "Cache-Control", "Access-Control-Allow-Origin"]
    max_age_seconds = 86400
  }
}

resource "google_storage_bucket_iam_member" "tiles3d_public_viewer" {
  bucket = google_storage_bucket.tiles3d_public.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_storage_bucket_iam_member" "curated_runtime_hydration" {
  bucket = "bcs2050-gis-curated"
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.runtime_service_account_email}"
}

resource "google_compute_backend_bucket" "tiles3d_cdn" {
  count       = var.enable_3dtiles_cloud_cdn ? 1 : 0
  name        = "bcs2050-3dtiles-cdn-backend"
  project     = var.project_id
  bucket_name = google_storage_bucket.tiles3d_public.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 86400
    max_ttl           = 604800
    negative_caching  = true
  }
}

resource "google_sql_database_instance" "bcs_spatial_postgis" {
  count               = var.enable_cloudsql_postgis ? 1 : 0
  name                = "bcs2050-spatial-pg16"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier = "db-custom-2-8192"
    disk_autoresize = true
    disk_size       = 40
    backup_configuration {
      enabled = true
    }
    ip_configuration {
      ipv4_enabled = false
    }
  }
}

resource "google_sql_database" "bcs2050_spatial" {
  count    = var.enable_cloudsql_postgis ? 1 : 0
  name     = "bcs2050_spatial"
  project  = var.project_id
  instance = google_sql_database_instance.bcs_spatial_postgis[0].name
}

resource "google_cloud_run_v2_job" "postgis_etl" {
  name                = "bcs2050-postgis-etl"
  location            = var.region
  project             = var.project_id
  deletion_protection = false

  template {
    template {
      service_account = var.runtime_service_account_email
      max_retries     = 1
      timeout         = "900s"

      containers {
        image   = var.digital_twin_image
        command = ["python"]
        args    = ["-m", "workers.etl_bigquery_to_postgis"]

        env {
          name  = "BCS2050_GCS_HYDRATE_DATA"
          value = "true"
        }
        env {
          name  = "BCS2050_GCS_DATA_TAR_URI"
          value = "gs://bcs2050-gis-curated/digital_twin_artifacts/twin_data.tar.gz"
        }

        resources {
          limits = {
            cpu    = "2"
            memory = "2Gi"
          }
        }
      }
    }
  }
}
