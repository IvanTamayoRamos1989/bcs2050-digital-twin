"""Coupled Open-Source Physics Simulation Workers for BCS2050 OGC API - Processes."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from workers.physics_engines.arroyo_flood_sfincs import run_arroyo_flood_sfincs
from workers.physics_engines.network_isochrone_r5py import run_network_isochrone_r5py
from workers.physics_engines.water_network_wntr import run_water_network_wntr

PHYSICS_DISPATCH = {
    "arroyo_flood_sfincs": run_arroyo_flood_sfincs,
    "network_isochrone_r5py": run_network_isochrone_r5py,
    "water_network_wntr": run_water_network_wntr,
}


def run_physics_process(process_id: str, inputs: dict[str, Any], out_dir: Path | None = None) -> dict[str, Any]:
    """Execute one coupled physics engine and return structured summary, overlay GeoJSON, and VVUQ metadata."""
    fn = PHYSICS_DISPATCH.get(process_id)
    if fn is None:
        raise ValueError(f"Unknown physics process '{process_id}'. Valid: {sorted(PHYSICS_DISPATCH)}")
    return fn(inputs, out_dir=out_dir)
