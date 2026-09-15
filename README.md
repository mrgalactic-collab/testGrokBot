# Atlantic HURDAT2 Day-of-Year Animation

Static map animation of historical Atlantic tropical cyclone positions from the
[NHC HURDAT2](https://www.nhc.noaa.gov/data/hurdat/) best-track dataset.

All years are composited onto the same calendar day and 6-hour synoptic time
(0000 / 0600 / 1200 / 1800 UTC). At each frame you see every storm that had a
fix at that month–day–time across the full record.

## Quick start

From this directory:

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000/](http://localhost:8000/).

> Opening `index.html` via `file://` will not load `data/frames.json` in most
> browsers (CORS). Always use a local HTTP server.

## Regenerate data

```bash
python3 scripts/preprocess.py
```

Reads `/workspace/hurdat2/hurdat2-atlantic.txt` (or `data/hurdat2-atlantic.txt`
if already copied) and writes `data/frames.json` (frames + per-storm tracks).

## Controls

- **Play / Pause** — step through the year every 6 hours
- **Speed** — frame interval (default 500 ms)
- **Trails** — Off, 1–6 days, 1 week, or Full path. Sliding lengths keep each segment until it ages past that window (including after the storm ends). Full path lingers for 1 week after the storm’s last fix.
- **Scrubber** — jump to any day/time
- Markers sized/colored by status; hurricanes use Saffir–Simpson Cat 1–5 by max wind (kt). Hover for name, year, category, and wind.

## Map

Approximate Atlantic basin view: 5°N–50°N, 100°W–20°W.

## Data credit

HURDAT2 Atlantic hurricane database, National Hurricane Center / NOAA.
https://www.nhc.noaa.gov/data/hurdat/

Basemap: Esri World Dark Gray Canvas (via Leaflet CDN).

## Layout

```
hurdat2-animation/
├── index.html
├── README.md
├── css/style.css
├── js/app.js
├── data/
│   ├── frames.json          # animation frames + tracks (generated)
│   └── hurdat2-atlantic.txt # local copy of raw HURDAT2 (copied by preprocess)
└── scripts/
    └── preprocess.py
```
