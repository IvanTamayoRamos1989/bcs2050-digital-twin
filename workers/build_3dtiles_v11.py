"""Build OGC 3D Tiles 1.1 tileset (tileset.json + glTF 2.0 .glb with EXT_mesh_features & EXT_structural_metadata).

Reads all 396,823 extruded buildings from SQLite / PostGIS across the 9 BCS cities,
partitions each city via a 2D spatial quadtree, triangulates footprints with ear-clipping,
and emits valid glTF 2.0 binary `.glb` tiles ready for public GCS / Cloud CDN streaming.
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import struct
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

CITY_DISPLAY: dict[str, str] = {
    "la_paz": "La Paz",
    "cabo_san_lucas": "Cabo San Lucas",
    "san_jose_del_cabo": "San José del Cabo",
    "ciudad_constitucion": "Ciudad Constitución",
    "loreto": "Loreto",
    "todos_santos": "Todos Santos",
    "corredor_turistico": "Corredor Turístico",
    "guerrero_negro": "Guerrero Negro",
    "santa_rosalia": "Santa Rosalía",
}

WGS84_A = 6_378_137.0
WGS84_F = 1.0 / 298.257223563
WGS84_E2 = 2.0 * WGS84_F - WGS84_F * WGS84_F


def _enu_to_ecef_transform(lon_deg: float, lat_deg: float) -> list[float]:
    """Return 16-float column-major ENU-to-ECEF 4x4 transform matrix for 3D Tiles node."""
    lam = math.radians(lon_deg)
    phi = math.radians(lat_deg)
    sin_l, cos_l = math.sin(lam), math.cos(lam)
    sin_p, cos_p = math.sin(phi), math.cos(phi)

    n_val = WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_p * sin_p)
    x0 = n_val * cos_p * cos_l
    y0 = n_val * cos_p * sin_l
    z0 = n_val * (1.0 - WGS84_E2) * sin_p

    # East, North, Up unit vectors in ECEF
    east = (-sin_l, cos_l, 0.0)
    north = (-sin_p * cos_l, -sin_p * sin_l, cos_p)
    up = (cos_p * cos_l, cos_p * sin_l, sin_p)

    return [
        east[0], east[1], east[2], 0.0,
        north[0], north[1], north[2], 0.0,
        up[0], up[1], up[2], 0.0,
        x0, y0, z0, 1.0,
    ]


def _signed_area_2d(pts: list[tuple[float, float]]) -> float:
    area = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return 0.5 * area


def _point_in_tri(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> bool:
    def _sign(p1: tuple[float, float], p2: tuple[float, float], p3: tuple[float, float]) -> float:
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = _sign(p, a, b)
    d2 = _sign(p, b, c)
    d3 = _sign(p, c, a)
    has_neg = (d1 < -1e-9) or (d2 < -1e-9) or (d3 < -1e-9)
    has_pos = (d1 > 1e-9) or (d2 > 1e-9) or (d3 > 1e-9)
    return not (has_neg and has_pos)


def _triangulate_ring_2d(pts_ccw: list[tuple[float, float]]) -> list[tuple[int, int, int]]:
    """Lightweight ear-clipping 2D polygon triangulator for CCW building footprints."""
    n = len(pts_ccw)
    if n < 3:
        return []
    if n == 3:
        return [(0, 1, 2)]

    indices = list(range(n))
    tris: list[tuple[int, int, int]] = []
    guard = 0
    while len(indices) > 3 and guard < n * n + 8:
        guard += 1
        ear_found = False
        m = len(indices)
        for i in range(m):
            i_prev = indices[(i - 1) % m]
            i_curr = indices[i]
            i_next = indices[(i + 1) % m]
            a, b, c = pts_ccw[i_prev], pts_ccw[i_curr], pts_ccw[i_next]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cross <= 1e-10:
                continue
            blocked = False
            for j in indices:
                if j in (i_prev, i_curr, i_next):
                    continue
                if _point_in_tri(pts_ccw[j], a, b, c):
                    blocked = True
                    break
            if not blocked:
                tris.append((i_prev, i_curr, i_next))
                indices.pop(i)
                ear_found = True
                break
        if not ear_found:
            break

    if len(indices) == 3:
        tris.append((indices[0], indices[1], indices[2]))
    elif not tris:
        for i in range(1, n - 1):
            tris.append((0, i, i + 1))
    return tris


def _building_rgba(surge_risk: int, height_m: float) -> tuple[int, int, int, int]:
    if surge_risk == 2:
        return (239, 68, 68, 255)
    if surge_risk == 1:
        return (245, 158, 11, 255)
    if height_m >= 18.0:
        return (56, 189, 248, 255)
    if height_m >= 9.0:
        return (99, 179, 237, 255)
    return (148, 163, 184, 255)


def _pad4(data: bytes, pad_byte: bytes = b"\x00") -> bytes:
    rem = len(data) % 4
    if rem == 0:
        return data
    return data + pad_byte * (4 - rem)


def _pack_string_column(values: list[str]) -> tuple[bytes, bytes]:
    raw = bytearray()
    offsets = bytearray()
    for val in values:
        offsets.extend(struct.pack("<I", len(raw)))
        raw.extend(val.encode("utf-8"))
    offsets.extend(struct.pack("<I", len(raw)))
    return bytes(raw), bytes(offsets)


def build_tile_glb(
    buildings: list[dict[str, Any]],
    *,
    lon0: float,
    lat0: float,
) -> tuple[bytes, dict[str, float]]:
    """Build one spec-compliant glTF 2.0 `.glb` binary with OGC 3D Tiles 1.1 metadata."""
    m_per_lon = 111_320.0 * max(0.2, math.cos(math.radians(lat0)))
    m_per_lat = 110_574.0

    pos_buf = bytearray()
    norm_buf = bytearray()
    col_buf = bytearray()
    fid_buf = bytearray()
    idx_buf = bytearray()

    pks: list[int] = []
    bids: list[str] = []
    heights: list[float] = []
    floors_list: list[int] = []
    solars: list[float] = []
    surges: list[int] = []
    agebs: list[str] = []

    min_x = min_y = min_z = float("inf")
    max_x = max_y = max_z = float("-inf")
    max_h = 3.0
    vert_cursor = 0

    def _push_vertex(x: float, y: float, z: float, nx: float, ny: float, nz: float, rgba: tuple[int, int, int, int], fid: int) -> None:
        nonlocal min_x, min_y, min_z, max_x, max_y, max_z, vert_cursor
        pos_buf.extend(struct.pack("<fff", x, y, z))
        norm_buf.extend(struct.pack("<fff", nx, ny, nz))
        col_buf.extend(struct.pack("<BBBB", *rgba))
        fid_buf.extend(struct.pack("<H", fid))
        if x < min_x: min_x = x
        if x > max_x: max_x = x
        if y < min_y: min_y = y
        if y > max_y: max_y = y
        if z < min_z: min_z = z
        if z > max_z: max_z = z
        vert_cursor += 1

    feature_count = 0
    for b in buildings:
        ring = b.get("ring") or []
        if len(ring) < 3:
            continue
        # Strip duplicate closing vertex if present
        if len(ring) >= 4 and abs(ring[0][0] - ring[-1][0]) < 1e-8 and abs(ring[0][1] - ring[-1][1]) < 1e-8:
            ring = ring[:-1]
        if len(ring) < 3:
            continue

        pts_2d = [((pt[0] - lon0) * m_per_lon, (pt[1] - lat0) * m_per_lat) for pt in ring]
        # Deduplicate near-zero consecutive edges cleanly
        clean_2d: list[tuple[float, float]] = []
        for p in pts_2d:
            if not clean_2d or (abs(p[0] - clean_2d[-1][0]) + abs(p[1] - clean_2d[-1][1])) > 1e-4:
                clean_2d.append(p)
        if len(clean_2d) < 3:
            cx = sum(p[0] for p in pts_2d) / max(1, len(pts_2d))
            cy = sum(p[1] for p in pts_2d) / max(1, len(pts_2d))
            clean_2d = [(cx - 1.5, cy - 1.5), (cx + 1.5, cy - 1.5), (cx + 1.5, cy + 1.5), (cx - 1.5, cy + 1.5)]
        if _signed_area_2d(clean_2d) < 0.0:
            clean_2d.reverse()

        h = max(2.5, float(b.get("height_m") or 3.5))
        if h > max_h:
            max_h = h
        rgba = _building_rgba(int(b.get("surge_risk") or 0), h)
        roof_rgba = (min(255, rgba[0] + 18), min(255, rgba[1] + 18), min(255, rgba[2] + 18), 255)
        fid = feature_count

        tris = _triangulate_ring_2d(clean_2d)
        if not tris:
            continue

        # Roof vertices (glTF Y-up: x=east, y=up, z=-north)
        roof_base = vert_cursor
        for e_m, n_m in clean_2d:
            _push_vertex(e_m, h, -n_m, 0.0, 1.0, 0.0, roof_rgba, fid)
        for i0, i1, i2 in tris:
            idx_buf.extend(struct.pack("<III", roof_base + i0, roof_base + i1, roof_base + i2))

        # Extruded vertical walls (CCW outward)
        m_pts = len(clean_2d)
        for i in range(m_pts):
            e0, n0 = clean_2d[i]
            e1, n1 = clean_2d[(i + 1) % m_pts]
            de = e1 - e0
            dn = n1 - n0
            seg_len = math.hypot(de, dn)
            if seg_len < 1e-4:
                continue
            # Right-hand outward normal for CCW boundary in (east, north): (dn, -de)
            nx = dn / seg_len
            nz = -(-de / seg_len)  # z = -north
            w_base = vert_cursor
            _push_vertex(e0, 0.0, -n0, nx, 0.0, nz, rgba, fid)
            _push_vertex(e1, 0.0, -n1, nx, 0.0, nz, rgba, fid)
            _push_vertex(e1, h, -n1, nx, 0.0, nz, rgba, fid)
            _push_vertex(e0, h, -n0, nx, 0.0, nz, rgba, fid)
            idx_buf.extend(struct.pack("<IIIIII", w_base, w_base + 1, w_base + 2, w_base, w_base + 2, w_base + 3))

        pks.append(int(b.get("id") or 0))
        bids.append(str(b.get("building_id") or b.get("id") or ""))
        heights.append(h)
        floors_list.append(int(b.get("floors") or 1))
        solars.append(float(b.get("solar_kwp") or 0.0))
        surges.append(int(b.get("surge_risk") or 0))
        agebs.append(str(b.get("ageb_cvegeo") or ""))
        feature_count += 1

    if feature_count == 0:
        raise ValueError("No valid building geometries in tile chunk")

    # Pack structural metadata property columns cleanly
    pk_bytes = struct.pack(f"<{feature_count}i", *pks)
    height_bytes = struct.pack(f"<{feature_count}f", *heights)
    floors_bytes = struct.pack(f"<{feature_count}h", *floors_list)
    solar_bytes = struct.pack(f"<{feature_count}f", *solars)
    surge_bytes = struct.pack(f"<{feature_count}B", *surges)
    bid_str_bytes, bid_off_bytes = _pack_string_column(bids)
    ageb_str_bytes, ageb_off_bytes = _pack_string_column(agebs)

    # Assemble single binary buffer with strict 4-byte alignment per bufferView
    bin_blob = bytearray()
    views: list[dict[str, Any]] = []

    def _append_bv(chunk: bytes | bytearray, target: int | None = None) -> tuple[int, int]:
        while len(bin_blob) % 4 != 0:
            bin_blob.append(0)
        offset = len(bin_blob)
        byte_len = len(chunk)
        bin_blob.extend(chunk)
        while len(bin_blob) % 4 != 0:
            bin_blob.append(0)
        bv: dict[str, Any] = {"buffer": 0, "byteOffset": offset, "byteLength": byte_len}
        if target is not None:
            bv["target"] = target
        bv_idx = len(views)
        views.append(bv)
        return bv_idx, byte_len

    bv_pos, _ = _append_bv(pos_buf, 34962)
    bv_norm, _ = _append_bv(norm_buf, 34962)
    bv_col, _ = _append_bv(col_buf, 34962)
    bv_fid, _ = _append_bv(fid_buf, 34962)
    bv_idx, _ = _append_bv(idx_buf, 34963)

    bv_pk, _ = _append_bv(pk_bytes)
    bv_bid_str, _ = _append_bv(bid_str_bytes)
    bv_bid_off, _ = _append_bv(bid_off_bytes)
    bv_height, _ = _append_bv(height_bytes)
    bv_floors, _ = _append_bv(floors_bytes)
    bv_solar, _ = _append_bv(solar_bytes)
    bv_surge, _ = _append_bv(surge_bytes)
    bv_ageb_str, _ = _append_bv(ageb_str_bytes)
    bv_ageb_off, _ = _append_bv(ageb_off_bytes)

    idx_count = len(idx_buf) // 4

    gltf: dict[str, Any] = {
        "asset": {"version": "2.0", "generator": "BCS2050 OGC 3D Tiles 1.1 Pipeline"},
        "extensionsUsed": ["EXT_mesh_features", "EXT_structural_metadata"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "BCSBuildings"}],
        "materials": [
            {
                "name": "UrbanMassing",
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.08,
                    "roughnessFactor": 0.78,
                },
            }
        ],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": 0,
                            "NORMAL": 1,
                            "COLOR_0": 2,
                            "_FEATURE_ID_0": 3,
                        },
                        "indices": 4,
                        "material": 0,
                        "mode": 4,
                        "extensions": {
                            "EXT_mesh_features": {
                                "featureIds": [
                                    {
                                        "featureCount": feature_count,
                                        "attribute": 0,
                                        "propertyTable": 0,
                                        "label": "building_feature",
                                    }
                                ]
                            }
                        },
                    }
                ]
            }
        ],
        "accessors": [
            {
                "bufferView": bv_pos,
                "componentType": 5126,
                "count": vert_cursor,
                "type": "VEC3",
                "min": [round(min_x, 3), round(min_y, 3), round(min_z, 3)],
                "max": [round(max_x, 3), round(max_y, 3), round(max_z, 3)],
            },
            {"bufferView": bv_norm, "componentType": 5126, "count": vert_cursor, "type": "VEC3"},
            {"bufferView": bv_col, "componentType": 5121, "normalized": True, "count": vert_cursor, "type": "VEC4"},
            {"bufferView": bv_fid, "componentType": 5123, "count": vert_cursor, "type": "SCALAR"},
            {"bufferView": bv_idx, "componentType": 5125, "count": idx_count, "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_blob)}],
        "extensions": {
            "EXT_structural_metadata": {
                "schema": {
                    "id": "bcs2050_building_schema",
                    "classes": {
                        "building": {
                            "name": "BCS 3D Building",
                            "properties": {
                                "pk": {"type": "SCALAR", "componentType": "INT32"},
                                "building_id": {"type": "STRING"},
                                "height_m": {"type": "SCALAR", "componentType": "FLOAT32"},
                                "floors": {"type": "SCALAR", "componentType": "INT16"},
                                "solar_kwp": {"type": "SCALAR", "componentType": "FLOAT32"},
                                "surge_risk": {"type": "SCALAR", "componentType": "UINT8"},
                                "ageb_cvegeo": {"type": "STRING"},
                            },
                        }
                    },
                },
                "propertyTables": [
                    {
                        "name": "BCS3DBuildingsTable",
                        "class": "building",
                        "count": feature_count,
                        "properties": {
                            "pk": {"values": bv_pk},
                            "building_id": {"values": bv_bid_str, "stringOffsets": bv_bid_off, "stringOffsetType": "UINT32"},
                            "height_m": {"values": bv_height},
                            "floors": {"values": bv_floors},
                            "solar_kwp": {"values": bv_solar},
                            "surge_risk": {"values": bv_surge},
                            "ageb_cvegeo": {"values": bv_ageb_str, "stringOffsets": bv_ageb_off, "stringOffsetType": "UINT32"},
                        },
                    }
                ],
            }
        },
    }

    json_bytes = _pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_blob)
    glb = bytearray()
    glb.extend(struct.pack("<III", 0x46546C67, 2, total_len))
    glb.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    glb.extend(json_bytes)
    glb.extend(struct.pack("<II", len(bin_blob), 0x004E4942))
    glb.extend(bin_blob)

    return bytes(glb), {"max_h": round(max_h, 2), "feature_count": feature_count}


def _quadtree_partition(items: list[dict[str, Any]], *, max_per_leaf: int = 3000, depth: int = 0, max_depth: int = 4) -> list[list[dict[str, Any]]]:
    if len(items) <= max_per_leaf or depth >= max_depth:
        return [items] if items else []
    lons = [b["centroid_lon"] for b in items]
    lats = [b["centroid_lat"] for b in items]
    mid_lon = 0.5 * (min(lons) + max(lons))
    mid_lat = 0.5 * (min(lats) + max(lats))

    quads: list[list[dict[str, Any]]] = [[], [], [], []]
    for b in items:
        idx = (1 if b["centroid_lon"] >= mid_lon else 0) + (2 if b["centroid_lat"] >= mid_lat else 0)
        quads[idx].append(b)

    out: list[list[dict[str, Any]]] = []
    for q in quads:
        if q:
            if len(q) == len(items):
                mid = len(q) // 2
                out.extend([q[:mid], q[mid:]])
            else:
                out.extend(_quadtree_partition(q, max_per_leaf=max_per_leaf, depth=depth + 1, max_depth=max_depth))
    return out


def _region_from_buildings(items: list[dict[str, Any]], max_h: float) -> list[float]:
    min_lon = min(b["min_lon"] for b in items)
    max_lon = max(b["max_lon"] for b in items)
    min_lat = min(b["min_lat"] for b in items)
    max_lat = max(b["max_lat"] for b in items)
    return [
        round(math.radians(min_lon), 6),
        round(math.radians(min_lat), 6),
        round(math.radians(max_lon), 6),
        round(math.radians(max_lat), 6),
        0.0,
        round(max(10.0, max_h + 5.0), 2),
    ]


def _union_regions(regions: list[list[float]]) -> list[float]:
    return [
        min(r[0] for r in regions),
        min(r[1] for r in regions),
        max(r[2] for r in regions),
        max(r[3] for r in regions),
        0.0,
        max(r[5] for r in regions),
    ]


def generate_tileset_from_sqlite(sqlite_path: Path, output_dir: Path, *, max_per_leaf: int = 3000) -> dict[str, Any]:
    t0 = time.perf_counter()
    output_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir = output_dir / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    by_city: dict[str, list[dict[str, Any]]] = defaultdict(list)
    try:
        rows = con.execute(
            "SELECT id, building_id, city_slug, ageb_cvegeo, height_m, floors, solar_kwp, surge_risk, centroid_lon, centroid_lat, ring_json "
            "FROM buildings ORDER BY city_slug, id"
        ).fetchall()
        for r in rows:
            ring = json.loads(r[10])
            if not ring or len(ring) < 3:
                continue
            lons = [pt[0] for pt in ring]
            lats = [pt[1] for pt in ring]
            by_city[str(r[2])].append(
                {
                    "id": int(r[0]),
                    "building_id": str(r[1]),
                    "city_slug": str(r[2]),
                    "ageb_cvegeo": str(r[3] or ""),
                    "height_m": float(r[4] or 3.5),
                    "floors": int(r[5] or 1),
                    "solar_kwp": float(r[6] or 0.0),
                    "surge_risk": int(r[7] or 0),
                    "centroid_lon": float(r[8]),
                    "centroid_lat": float(r[9]),
                    "min_lon": min(lons),
                    "max_lon": max(lons),
                    "min_lat": min(lats),
                    "max_lat": max(lats),
                    "ring": ring,
                }
            )
    finally:
        con.close()

    city_nodes: list[dict[str, Any]] = []
    total_tiles = 0
    total_buildings = 0
    total_bytes = 0
    city_summary: dict[str, Any] = {}

    for city_slug, items in sorted(by_city.items()):
        chunks = _quadtree_partition(items, max_per_leaf=max_per_leaf)
        leaf_nodes: list[dict[str, Any]] = []
        city_dir = tiles_dir / city_slug
        city_dir.mkdir(parents=True, exist_ok=True)

        for idx, chunk in enumerate(chunks):
            lon0 = sum(b["centroid_lon"] for b in chunk) / len(chunk)
            lat0 = sum(b["centroid_lat"] for b in chunk) / len(chunk)
            glb_bytes, meta = build_tile_glb(chunk, lon0=lon0, lat0=lat0)
            rel_uri = f"tiles/{city_slug}/tile_{idx:03d}.glb"
            (output_dir / rel_uri).write_bytes(glb_bytes)

            region = _region_from_buildings(chunk, meta["max_h"])
            leaf_nodes.append(
                {
                    "boundingVolume": {"region": region},
                    "geometricError": 0.0,
                    "refine": "ADD",
                    "transform": _enu_to_ecef_transform(lon0, lat0),
                    "content": {"uri": rel_uri},
                }
            )
            total_tiles += 1
            total_buildings += int(meta["feature_count"])
            total_bytes += len(glb_bytes)

        city_region = _union_regions([n["boundingVolume"]["region"] for n in leaf_nodes])
        city_nodes.append(
            {
                "boundingVolume": {"region": city_region},
                "geometricError": 450.0,
                "refine": "ADD",
                "children": leaf_nodes,
            }
        )
        city_summary[city_slug] = {
            "name": CITY_DISPLAY.get(city_slug, city_slug),
            "buildings": sum(len(c) for c in chunks),
            "tiles": len(leaf_nodes),
        }

    root_region = _union_regions([c["boundingVolume"]["region"] for c in city_nodes])
    tileset = {
        "asset": {
            "version": "1.1",
            "tilesetVersion": "bcs2050-v1.1.0",
            "generator": "BCS2050 OGC 3D Tiles 1.1 Pipeline",
        },
        "geometricError": 5000.0,
        "root": {
            "boundingVolume": {"region": root_region},
            "geometricError": 2500.0,
            "refine": "ADD",
            "children": city_nodes,
        },
    }

    tileset_path = output_dir / "tileset.json"
    tileset_path.write_text(json.dumps(tileset, separators=(",", ":")), encoding="utf-8")

    manifest = {
        "standard": "OGC 3D Tiles 1.1 (glTF 2.0 + EXT_mesh_features + EXT_structural_metadata)",
        "total_buildings": total_buildings,
        "tile_count": total_tiles,
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
        "elapsed_sec": round(time.perf_counter() - t0, 2),
        "cities": city_summary,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build OGC 3D Tiles 1.1 tileset from BCS2050 buildings datastore.")
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "spatial_index.sqlite",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-per-leaf", type=int, default=3000)
    args = parser.parse_args()
    manifest = generate_tileset_from_sqlite(args.sqlite, args.output, max_per_leaf=args.max_per_leaf)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
