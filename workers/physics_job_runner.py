"""Cloud Run Job Runner for Coupled Physics Processes (OGC API - Processes -> GCS + Firestore)."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config import (  # noqa: E402
    get_firestore_database,
    get_sim_artifacts_bucket,
    use_firestore_cache,
)
from backend.spatial_store import ensure_spatial_data_ready  # noqa: E402
from workers.physics_engines import run_physics_process  # noqa: E402

JOB_COLLECTION = "bcs2050_ogc_jobs"


def _utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _update_firestore_job(job_id: str, fields: dict[str, Any]) -> None:
    if not use_firestore_cache():
        return
    try:
        from google.cloud import firestore

        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "bcs2050")
        db = firestore.Client(project=project, database=get_firestore_database())
        db.collection(JOB_COLLECTION).document(job_id).set(fields, merge=True)
    except Exception as exc:  # noqa: BLE001
        print(f"Firestore update warning for {job_id}: {exc}", file=sys.stderr)


def execute_physics_job_to_cloud(
    *,
    job_id: str,
    process_id: str,
    inputs: dict[str, Any],
    output_bucket: str | None = None,
) -> dict[str, Any]:
    """Execute a physics worker, upload artifacts to GCS when enabled, and persist Firestore state."""
    ensure_spatial_data_ready()
    _update_firestore_job(job_id, {"jobID": job_id, "processID": process_id, "status": "running", "started": _utc_iso()})

    bucket_name = (output_bucket or get_sim_artifacts_bucket()).strip()
    try:
        with tempfile.TemporaryDirectory(prefix=f"bcs2050_{job_id}_") as tmp_str:
            tmp_dir = Path(tmp_str)
            result = run_physics_process(process_id, inputs, out_dir=tmp_dir)

            artifact_urls: dict[str, str] = {}
            cog_local = result.pop("cog_local_path", None)
            result_json_path = tmp_dir / "result.json"
            result_json_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

            if bucket_name and (use_firestore_cache() or os.environ.get("BCS2050_UPLOAD_JOB_ARTIFACTS", "false").lower() == "true"):
                try:
                    from google.cloud import storage

                    st = storage.Client()
                    bucket = st.bucket(bucket_name)
                    prefix = f"simulation_artifacts/{job_id}"
                    for fname, content_type in [
                        ("overlay.geojson", "application/geo+json"),
                        ("result.json", "application/json"),
                        ("flood_depth_cog.tif", "image/tiff"),
                    ]:
                        fpath = tmp_dir / fname
                        if fpath.exists():
                            blob = bucket.blob(f"{prefix}/{fname}")
                            blob.cache_control = "public, max-age=86400"
                            blob.upload_from_filename(str(fpath), content_type=content_type)
                            key = fname.replace(".", "_").replace("_tif", "")
                            if fname == "overlay.geojson":
                                artifact_urls["overlay_geojson"] = f"https://storage.googleapis.com/{bucket_name}/{prefix}/{fname}"
                            elif fname == "flood_depth_cog.tif":
                                artifact_urls["flood_depth_cog"] = f"https://storage.googleapis.com/{bucket_name}/{prefix}/{fname}"
                            else:
                                artifact_urls["result_json"] = f"https://storage.googleapis.com/{bucket_name}/{prefix}/{fname}"
                except Exception as exc:  # noqa: BLE001
                    print(f"GCS upload warning for {job_id}: {exc}", file=sys.stderr)

            if artifact_urls:
                result["artifact_urls"] = artifact_urls

            # Serialize result payload to avoid Firestore nested-array limits on GeoJSON coordinates
            compact_result = dict(result)
            if "overlay_geojson" in artifact_urls:
                compact_result.pop("overlay_geojson", None)

            fs_payload: dict[str, Any] = {
                "jobID": job_id,
                "processID": process_id,
                "status": "successful",
                "finished": _utc_iso(),
                "execution_backend": "cloud_run_job",
                "artifact_urls": artifact_urls,
                "results_json": json.dumps(compact_result, ensure_ascii=False),
            }
            _update_firestore_job(job_id, fs_payload)
            return result
    except Exception as exc:  # noqa: BLE001
        _update_firestore_job(
            job_id,
            {
                "jobID": job_id,
                "processID": process_id,
                "status": "failed",
                "finished": _utc_iso(),
                "error": str(exc),
            },
        )
        raise


def main() -> None:
    job_id = os.environ.get("JOB_ID", f"job-cli-{datetime.now(timezone.utc).strftime('%H%M%S')}")
    process_id = os.environ.get("PROCESS_ID", "arroyo_flood_sfincs")
    raw_inputs = os.environ.get("INPUTS_JSON", "{}")
    output_bucket = os.environ.get("OUTPUT_BUCKET", get_sim_artifacts_bucket())
    inputs = json.loads(raw_inputs) if raw_inputs else {}

    out = execute_physics_job_to_cloud(
        job_id=job_id,
        process_id=process_id,
        inputs=inputs,
        output_bucket=output_bucket,
    )
    print(json.dumps({"jobID": job_id, "processID": process_id, "status": "successful", "summary": out.get("summary")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
