# HURDAT2 Day-of-Year Animation

Static map animation of historical tropical cyclone positions from the
[NHC HURDAT2](https://www.nhc.noaa.gov/data/hurdat/) best-track dataset.

Supports two basins via tabs:

- **Atlantic** — NHC HURDAT2 Atlantic (AL), ~1851–present
- **Pacific** — NHC HURDAT2 Northeast / North Central Pacific (EP/CP), ~1949–present

This is **not** Western Pacific / typhoon (JTWC) coverage.

All years are composited onto the same calendar day and 6-hour synoptic time
(0000 / 0600 / 1200 / 1800 UTC). At each frame you see every storm that had a
fix at that month–day–time across the full record for the selected basin.

## Quick start

From this directory:

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000/](http://localhost:8000/).

> Opening `index.html` via `file://` will not load frame JSON in most
> browsers (CORS). Always use a local HTTP server.

## Regenerate data

```bash
python3 scripts/preprocess.py
```

Downloads (if missing) and processes both basins:

- Atlantic → `data/frames-atlantic.json` (also copied to legacy `data/frames.json`)
- Pacific (NEPAC) → `data/frames-pacific.json`

Pacific source:
https://www.nhc.noaa.gov/data/hurdat/hurdat2-nepac-1949-2025-02272026.txt

Raw files are stored as `data/hurdat2-atlantic.txt` and `data/hurdat2-pacific.txt`.

## Controls

- **Atlantic | Pacific** — switch basin (reloads frames, resets map view)
- **Play / Pause** — step through the year every 6 hours
- **Speed** — frame interval (default 500 ms)
- **Trails** — Off, 1–6 days, 1 week, or Full path. Sliding lengths keep each segment until it ages past that window (including after the storm ends). Full path lingers for 1 week after the storm’s last fix.
- **Scrubber** — jump to any day/time
- Markers sized/colored by status; hurricanes use Saffir–Simpson Cat 1–5 by max wind (kt). Non-hurricane markers match Cat 1 size. Hover for name, year, category, and wind.

## Map views

- Atlantic: ~5°N–50°N, 100°W–20°W
- Pacific (NE/NC): ~0°N–50°N, ~150°E–80°W continuous view (Mexico / Central America through Hawaii across the Date Line; E longitudes wrapped)

## Data credit

HURDAT2 Atlantic and Northeast/North Central Pacific hurricane databases,
National Hurricane Center / NOAA.
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
│   ├── frames-atlantic.json   # Atlantic frames + tracks (generated)
│   ├── frames-pacific.json    # Pacific frames + tracks (generated)
│   ├── frames.json            # legacy alias of Atlantic frames
│   ├── hurdat2-atlantic.txt   # local copy of raw Atlantic HURDAT2
│   └── hurdat2-pacific.txt    # local copy of raw NEPAC HURDAT2
└── scripts/
    └── preprocess.py
```
