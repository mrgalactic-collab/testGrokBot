#!/usr/bin/env python3
"""
Preprocess NHC HURDAT2 best-track data into animation frames.

Supports Atlantic (AL) and Northeast/North Central Pacific (EP/CP) basins.
Groups synoptic fixes (0000/0600/1200/1800 UTC) by calendar day+time
(MMDD-HHMM), ignoring year, so all historical storms share one composite
timeline. Also emits per-storm chronological tracks for trail rendering.
"""

from __future__ import annotations

import json
import shutil
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# Basin configs: download if local raw missing; write named frame JSONs.
BASINS = {
    "atlantic": {
        "label": "NHC HURDAT2 Atlantic",
        "source_url": "https://www.nhc.noaa.gov/data/hurdat/",
        "download_url": (
            "https://www.nhc.noaa.gov/data/hurdat/"
            "hurdat2-1851-2025-091226.txt"
        ),
        "prefixes": ("AL",),
        "local_raw": DATA_DIR / "hurdat2-atlantic.txt",
        "fallback_raw": Path("/workspace/hurdat2/hurdat2-atlantic.txt"),
        "out_path": DATA_DIR / "frames-atlantic.json",
        # Keep legacy path as Atlantic for backward compatibility
        "legacy_out": DATA_DIR / "frames.json",
    },
    "pacific": {
        "label": "NHC HURDAT2 Northeast/North Central Pacific",
        "source_url": (
            "https://www.nhc.noaa.gov/data/hurdat/"
            "hurdat2-nepac-1949-2025-02272026.txt"
        ),
        "download_url": (
            "https://www.nhc.noaa.gov/data/hurdat/"
            "hurdat2-nepac-1949-2025-02272026.txt"
        ),
        "prefixes": ("EP", "CP"),
        "local_raw": DATA_DIR / "hurdat2-pacific.txt",
        "fallback_raw": None,
        "out_path": DATA_DIR / "frames-pacific.json",
        "legacy_out": None,
    },
}

SYNOPTIC = {"0000", "0600", "1200", "1800"}
STATUS_ORDER = ["TD", "TS", "HU", "EX", "LO", "DB", "SS", "SD", "WV", "OTHER"]


def parse_lat(s: str) -> float:
    s = s.strip()
    hemi = s[-1].upper()
    val = float(s[:-1])
    return -val if hemi == "S" else val


def parse_lon(s: str) -> float:
    s = s.strip()
    hemi = s[-1].upper()
    val = float(s[:-1])
    return -val if hemi == "W" else val


def is_header(parts: list[str], prefixes: tuple[str, ...]) -> bool:
    if len(parts) < 3:
        return False
    basin = parts[0].strip()
    return len(basin) == 8 and basin[:2] in prefixes and basin[2:].isdigit()


def month_days(leap: bool = True) -> list[int]:
    return [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def all_frame_keys(leap: bool = True) -> list[str]:
    keys: list[str] = []
    for month, ndays in enumerate(month_days(leap), start=1):
        for day in range(1, ndays + 1):
            for hhmm in ("0000", "0600", "1200", "1800"):
                keys.append(f"{month:02d}{day:02d}-{hhmm}")
    return keys


def storm_year_from_id(storm_id: str, fallback: int | None = None) -> int | None:
    # ATCF id e.g. AL092021 / EP092021 → season year 2021
    if len(storm_id) >= 8 and storm_id[4:8].isdigit():
        return int(storm_id[4:8])
    return fallback


def ensure_raw(basin_key: str, cfg: dict) -> Path:
    local = cfg["local_raw"]
    if local.is_file():
        return local

    fallback = cfg.get("fallback_raw")
    if fallback is not None and Path(fallback).is_file():
        print(f"[{basin_key}] Copying raw data → {local}")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(fallback, local)
        return local

    url = cfg["download_url"]
    print(f"[{basin_key}] Downloading {url} → {local}")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, local)
    return local


def preprocess(raw_path: Path, cfg: dict) -> dict:
    prefixes = cfg["prefixes"]
    frames: dict[str, list] = defaultdict(list)
    tracks: dict[str, dict] = {}
    storm_id = ""
    storm_name = "UNNAMED"
    n_points = 0
    n_storms = 0
    years: set[int] = set()
    status_counts: dict[str, int] = defaultdict(int)

    with raw_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(",")]
            if is_header(parts, prefixes):
                storm_id = parts[0].strip()
                storm_name = parts[1].strip() or "UNNAMED"
                n_storms += 1
                continue

            if len(parts) < 7 or not storm_id:
                continue

            date_s = parts[0]
            time_s = parts[1]
            if len(date_s) != 8 or not date_s.isdigit():
                continue
            if time_s not in SYNOPTIC:
                continue

            status = parts[3].strip() or "OTHER"
            if status not in STATUS_ORDER:
                status = "OTHER"

            try:
                lat = parse_lat(parts[4])
                lon = parse_lon(parts[5])
                wind = int(parts[6]) if parts[6] not in ("", "-999") else None
            except (ValueError, IndexError):
                continue

            year = int(date_s[0:4])
            mmdd = date_s[4:8]
            key = f"{mmdd}-{time_s}"
            lat_r = round(lat, 2)
            lon_r = round(lon, 2)

            frames[key].append(
                [lat_r, lon_r, storm_name, year, status, wind, storm_id]
            )

            if storm_id not in tracks:
                tracks[storm_id] = {
                    "name": storm_name,
                    "year": storm_year_from_id(storm_id, year),
                    "pts": [],
                }
            # Append in file order = chronological by real date/time
            tracks[storm_id]["pts"].append([lat_r, lon_r, status, wind, key])

            n_points += 1
            years.add(year)
            status_counts[status] += 1

    keys = all_frame_keys(leap=True)
    packed: dict[str, list] = {}
    for k in keys:
        pts = frames.get(k)
        if pts:
            pts.sort(key=lambda p: (p[3], p[2], p[6]))
            packed[k] = pts

    meta = {
        "basin": next(
            (k for k, v in BASINS.items() if v is cfg),
            None,
        ),
        "source": cfg["label"],
        "source_url": cfg["source_url"],
        "raw_file": str(raw_path.name),
        "storms": n_storms,
        "points": n_points,
        "frames_with_data": len(packed),
        "frame_slots": len(keys),
        "year_min": min(years) if years else None,
        "year_max": max(years) if years else None,
        "status_counts": dict(status_counts),
        "point_schema": [
            "lat",
            "lon",
            "name",
            "year",
            "status",
            "wind_kt",
            "storm_id",
        ],
        "track_pt_schema": ["lat", "lon", "status", "wind_kt", "MMDD-HHMM"],
        "frame_key": "MMDD-HHMM (UTC, year ignored)",
    }
    return {"meta": meta, "keys": keys, "frames": packed, "tracks": tracks}


def write_basin(basin_key: str) -> None:
    cfg = BASINS[basin_key]
    raw = ensure_raw(basin_key, cfg)
    print(f"[{basin_key}] Reading {raw} ...")
    data = preprocess(raw, cfg)
    # Fix basin key in meta (cfg identity may fail across reloads)
    data["meta"]["basin"] = basin_key

    out = cfg["out_path"]
    print(f"[{basin_key}] Writing {out} ...")
    with out.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))

    legacy = cfg.get("legacy_out")
    if legacy is not None:
        print(f"[{basin_key}] Also writing legacy {legacy} ...")
        shutil.copy2(out, legacy)

    size_mb = out.stat().st_size / (1024 * 1024)
    m = data["meta"]
    print(
        f"[{basin_key}] Done: {m['storms']} storms, {m['points']} points, "
        f"{m['frames_with_data']}/{m['frame_slots']} non-empty frames, "
        f"{len(data['tracks'])} tracks, "
        f"{size_mb:.2f} MB → {out}"
    )


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for basin_key in ("atlantic", "pacific"):
        write_basin(basin_key)


if __name__ == "__main__":
    main()
