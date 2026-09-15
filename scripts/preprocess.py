#!/usr/bin/env python3
"""
Preprocess NHC HURDAT2 Atlantic best-track data into animation frames.

Groups synoptic fixes (0000/0600/1200/1800 UTC) by calendar day+time
(MMDD-HHMM), ignoring year, so all historical storms share one composite
timeline.
"""

from __future__ import annotations

import json
import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW = Path("/workspace/hurdat2/hurdat2-atlantic.txt")
LOCAL_RAW = ROOT / "data" / "hurdat2-atlantic.txt"
OUT_PATH = ROOT / "data" / "frames.json"

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


def is_header(parts: list[str]) -> bool:
    if len(parts) < 3:
        return False
    basin = parts[0].strip()
    return len(basin) == 8 and basin[:2] == "AL" and basin[2:].isdigit()


def month_days(leap: bool = True) -> list[int]:
    return [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def all_frame_keys(leap: bool = True) -> list[str]:
    keys: list[str] = []
    for month, ndays in enumerate(month_days(leap), start=1):
        for day in range(1, ndays + 1):
            for hhmm in ("0000", "0600", "1200", "1800"):
                keys.append(f"{month:02d}{day:02d}-{hhmm}")
    return keys


def find_raw() -> Path:
    if LOCAL_RAW.is_file():
        return LOCAL_RAW
    if DEFAULT_RAW.is_file():
        return DEFAULT_RAW
    raise FileNotFoundError(
        f"HURDAT2 raw file not found at {LOCAL_RAW} or {DEFAULT_RAW}"
    )


def preprocess(raw_path: Path) -> dict:
    frames: dict[str, list] = defaultdict(list)
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
            if is_header(parts):
                storm_name = parts[1].strip() or "UNNAMED"
                n_storms += 1
                continue

            if len(parts) < 7:
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

            frames[key].append(
                [round(lat, 2), round(lon, 2), storm_name, year, status, wind]
            )
            n_points += 1
            years.add(year)
            status_counts[status] += 1

    keys = all_frame_keys(leap=True)
    packed: dict[str, list] = {}
    for k in keys:
        pts = frames.get(k)
        if pts:
            pts.sort(key=lambda p: (p[3], p[2]))
            packed[k] = pts

    meta = {
        "source": "NHC HURDAT2 Atlantic",
        "source_url": "https://www.nhc.noaa.gov/data/hurdat/",
        "raw_file": str(raw_path.name),
        "storms": n_storms,
        "points": n_points,
        "frames_with_data": len(packed),
        "frame_slots": len(keys),
        "year_min": min(years) if years else None,
        "year_max": max(years) if years else None,
        "status_counts": dict(status_counts),
        "point_schema": ["lat", "lon", "name", "year", "status", "wind_kt"],
        "frame_key": "MMDD-HHMM (UTC, year ignored)",
    }
    return {"meta": meta, "keys": keys, "frames": packed}


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw = find_raw()

    if raw.resolve() != LOCAL_RAW.resolve():
        print(f"Copying raw data → {LOCAL_RAW}")
        shutil.copy2(raw, LOCAL_RAW)
        raw = LOCAL_RAW

    print(f"Reading {raw} ...")
    data = preprocess(raw)

    print(f"Writing {OUT_PATH} ...")
    with OUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))

    size_mb = OUT_PATH.stat().st_size / (1024 * 1024)
    m = data["meta"]
    print(
        f"Done: {m['storms']} storms, {m['points']} points, "
        f"{m['frames_with_data']}/{m['frame_slots']} non-empty frames, "
        f"{size_mb:.2f} MB → {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
