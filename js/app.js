/* HURDAT2 composite day-of-year animation (Atlantic + NE/NC Pacific) */
(function () {
  "use strict";

  const STATUS_COLORS = {
    TD: "#60a5fa", // tropical depression
    TS: "#34d399", // tropical storm
    HU: "#f87171", // hurricane (fallback)
    EX: "#a78bfa", // extratropical
    LO: "#94a3b8", // low
    DB: "#fbbf24", // disturbance
    SS: "#2dd4bf", // subtropical storm
    SD: "#38bdf8", // subtropical depression
    WV: "#fb923c", // tropical wave
    OTHER: "#e2e8f0",
  };

  // Saffir–Simpson by max wind (kt) — subtle red ramp
  const HU_CAT_COLORS = {
    1: "#fda4af", // light red / rose
    2: "#fb7185",
    3: "#f43f5e",
    4: "#e11d48",
    5: "#9f1239", // darkest
  };

  const HU_CAT_RADIUS = {
    1: 5.5,
    2: 6.5,
    3: 7.5,
    4: 8.5,
    5: 10,
  };

  // Match Cat 1 so TD/TS/etc. are as visible as the smallest hurricanes
  const NON_HU_RADIUS = HU_CAT_RADIUS[1];

  const STATUS_LABELS = {
    TD: "Tropical Depression",
    TS: "Tropical Storm",
    HU: "Hurricane",
    EX: "Extratropical",
    LO: "Low",
    DB: "Disturbance",
    SS: "Subtropical Storm",
    SD: "Subtropical Depression",
    WV: "Tropical Wave",
    OTHER: "Other",
  };

  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  // trail select value → number of synoptic fixes in sliding window (null = full)
  const TRAIL_FIXES = {
    off: 0,
    "1": 4,
    "2": 8,
    "3": 12,
    "4": 16,
    "5": 20,
    "6": 24,
    "7": 28,
    full: null,
  };

  const BASINS = {
    atlantic: {
      id: "atlantic",
      title: "Atlantic HURDAT2 Composite",
      subtitle:
        "All years stacked on the same calendar day & 6-hour synoptic time (UTC). Data: NHC HURDAT2 Atlantic.",
      dataUrl: "data/frames-atlantic.json",
      // ~ 5N–50N, 100W–20W
      bounds: [[5, -100], [50, -20]],
    },
    pacific: {
      id: "pacific",
      title: "Pacific HURDAT2 Composite",
      subtitle:
        "NE/NC Pacific (EP/CP). All years stacked on the same calendar day & 6-hour synoptic time (UTC). Data: NHC HURDAT2 NEPAC — not Western Pacific / JTWC.",
      dataUrl: "data/frames-pacific.json",
      // Mexico / Central America through Hawaii toward/west of the Date Line
      // Lon < -180 holds NEPAC fixes recorded east of 180° after wrap
      bounds: [[0, -210], [50, -80]],
    },
  };

  const state = {
    data: null,
    index: 0,
    playing: false,
    timer: null,
    intervalMs: 500,
    trailMode: "off",
    layer: null,
    trailLayer: null,
    keyIndex: null,
    basin: "atlantic",
    cache: Object.create(null),
    map: null,
    renderer: null,
  };

  const els = {
    map: null,
    play: null,
    scrubber: null,
    speed: null,
    trails: null,
    datetime: null,
    count: null,
    loading: null,
    legend: null,
    years: null,
    title: null,
    subtitle: null,
  };

  function formatKey(key) {
    // MMDD-HHMM
    const mm = parseInt(key.slice(0, 2), 10);
    const dd = parseInt(key.slice(2, 4), 10);
    const hh = key.slice(5, 7);
    const mi = key.slice(7, 9);
    return `${MONTHS[mm - 1]} ${dd} · ${hh}:${mi} UTC`;
  }

  function huCategory(wind) {
    if (wind == null || wind < 64) return null;
    if (wind <= 82) return 1;
    if (wind <= 95) return 2;
    if (wind <= 112) return 3;
    if (wind <= 136) return 4;
    return 5;
  }

  function colorFor(status, wind) {
    if (status === "HU") {
      const cat = huCategory(wind);
      if (cat) return HU_CAT_COLORS[cat];
      return STATUS_COLORS.HU;
    }
    return STATUS_COLORS[status] || STATUS_COLORS.OTHER;
  }

  function radiusFor(status, wind) {
    if (status === "HU") {
      const cat = huCategory(wind);
      if (cat) return HU_CAT_RADIUS[cat];
    }
    return NON_HU_RADIUS;
  }

  function statusLabel(status, wind) {
    if (status === "HU") {
      const cat = huCategory(wind);
      if (cat) return `Hurricane Cat ${cat}`;
      return STATUS_LABELS.HU;
    }
    return STATUS_LABELS[status] || status;
  }

  /** Legend swatch diameter (px); Cat n uses 6+n so sizes scale with HU_CAT_RADIUS. */
  function legendSwatchPx(cat) {
    return 6 + cat;
  }

  function buildLegend() {
    const items = [];
    // Cat 5 at top → Cat 1; non-HU follow at Cat 1 size (matches NON_HU_RADIUS)
    const cat1Px = legendSwatchPx(1);
    for (let c = 5; c >= 1; c--) {
      const px = legendSwatchPx(c);
      items.push(
        `<div class="legend-item"><span class="swatch" style="background:${HU_CAT_COLORS[c]};width:${px}px;height:${px}px"></span>Hurricane Cat ${c}</div>`
      );
    }
    const rest = ["TS", "TD", "SS", "SD", "EX", "LO", "DB", "WV", "OTHER"];
    for (const s of rest) {
      items.push(
        `<div class="legend-item"><span class="swatch" style="background:${STATUS_COLORS[s]};width:${cat1Px}px;height:${cat1Px}px"></span>${STATUS_LABELS[s]}</div>`
      );
    }
    els.legend.innerHTML =
      '<button type="button" class="legend-toggle" aria-expanded="false" aria-controls="legend-body" id="legend-toggle">Legend</button>' +
      '<div class="legend-body" id="legend-body">' +
      '<h2 class="legend-title">Status</h2>' +
      items.join("") +
      "</div>";
    els.legend.classList.remove("is-open");
    const toggle = document.getElementById("legend-toggle");
    toggle.addEventListener("click", () => {
      const open = els.legend.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // Full-path linger after storm ends (1 week of synoptic steps)
  const FULL_PATH_LINGER_FIXES = 28;

  function buildKeyIndex(keys) {
    const map = Object.create(null);
    for (let i = 0; i < keys.length; i++) map[keys[i]] = i;
    return map;
  }

  function addTrailSegments(segments, slice) {
    if (slice.length < 2) return;
    for (let j = 1; j < slice.length; j++) {
      const a = slice[j - 1];
      const b = slice[j];
      const col = colorFor(b[2], b[3]);
      segments.push(
        L.polyline(
          [
            [a[0], a[1]],
            [b[0], b[1]],
          ],
          {
            color: col,
            weight: 1.5,
            opacity: 0.35,
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
            renderer: state.renderer,
          }
        )
      );
    }
  }

  function trailSliceForTrack(trackPts, currentIdx, mode) {
    const keyIndex = state.keyIndex;
    if (!trackPts.length) return [];

    const calIdx = [];
    for (let i = 0; i < trackPts.length; i++) {
      const ki = keyIndex[trackPts[i][4]];
      calIdx.push(ki == null ? -1 : ki);
    }

    const n = TRAIL_FIXES[mode];

    // Sliding window: keep each track point until it is older than the
    // selected trail length on the day-of-year timeline (storm can be over).
    if (n != null) {
      if (n === 0) return [];
      const windowStart = currentIdx - n + 1;
      const out = [];
      for (let i = 0; i < trackPts.length; i++) {
        const ki = calIdx[i];
        if (ki < 0) continue;
        if (ki >= windowStart && ki <= currentIdx) out.push(trackPts[i]);
      }
      return out;
    }

    // Full path: grow through current time, then linger 1 week past last fix.
    let firstKi = Infinity;
    let lastKi = -Infinity;
    let lastTrackI = -1;
    for (let i = 0; i < calIdx.length; i++) {
      const ki = calIdx[i];
      if (ki < 0) continue;
      if (ki < firstKi) firstKi = ki;
      if (ki > lastKi) {
        lastKi = ki;
        lastTrackI = i;
      }
    }
    if (lastTrackI < 0) return [];
    if (currentIdx < firstKi) return [];
    if (currentIdx > lastKi + FULL_PATH_LINGER_FIXES) return [];

    if (currentIdx <= lastKi) {
      const out = [];
      for (let i = 0; i < trackPts.length; i++) {
        const ki = calIdx[i];
        if (ki < 0) continue;
        if (ki <= currentIdx) out.push(trackPts[i]);
      }
      return out;
    }

    // Within linger window after storm ended: entire path
    return trackPts.slice();
  }

  function clearLayers() {
    if (state.trailLayer) {
      state.map.removeLayer(state.trailLayer);
      state.trailLayer = null;
    }
    if (state.layer) {
      state.map.removeLayer(state.layer);
      state.layer = null;
    }
  }

  function drawTrails(currentIdx) {
    if (state.trailLayer) {
      state.map.removeLayer(state.trailLayer);
      state.trailLayer = null;
    }
    const mode = state.trailMode;
    if (mode === "off" || !state.data || !state.data.tracks) {
      state.trailLayer = L.layerGroup().addTo(state.map);
      return;
    }

    const segments = [];
    const tracks = state.data.tracks;
    for (const sid in tracks) {
      if (!Object.prototype.hasOwnProperty.call(tracks, sid)) continue;
      const track = tracks[sid];
      if (!track || !track.pts || track.pts.length < 2) continue;
      const slice = trailSliceForTrack(track.pts, currentIdx, mode);
      addTrailSegments(segments, slice);
    }

    state.trailLayer = L.layerGroup(segments).addTo(state.map);
  }

  function renderFrame(idx) {
    const keys = state.data.keys;
    const key = keys[idx];
    const points = state.data.frames[key] || [];

    drawTrails(idx);

    if (state.layer) {
      state.map.removeLayer(state.layer);
    }
    const markers = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const lat = p[0];
      const lon = p[1];
      const name = p[2];
      const year = p[3];
      const status = p[4];
      const wind = p[5];
      const windTxt = wind == null ? "—" : `${wind} kt`;
      const marker = L.circleMarker([lat, lon], {
        radius: radiusFor(status, wind),
        color: "#0f172a",
        weight: 0.6,
        opacity: 0.5,
        fillColor: colorFor(status, wind),
        fillOpacity: 0.55,
        renderer: state.renderer,
      });
      marker.bindTooltip(
        `<strong>${name}</strong> (${year})<br>${statusLabel(status, wind)}<br>Max wind: ${windTxt}`,
        { className: "storm-tooltip", direction: "top", sticky: true }
      );
      markers.push(marker);
    }
    state.layer = L.layerGroup(markers).addTo(state.map);

    els.datetime.textContent = formatKey(key);
    els.count.textContent = `${points.length} storm fix${points.length === 1 ? "" : "es"}`;
    els.scrubber.value = String(idx);
  }

  function setIndex(idx) {
    const n = state.data.keys.length;
    state.index = ((idx % n) + n) % n;
    renderFrame(state.index);
  }

  function stop() {
    state.playing = false;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    els.play.textContent = "Play";
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    els.play.textContent = "Pause";
    state.timer = setInterval(() => {
      setIndex(state.index + 1);
    }, state.intervalMs);
  }

  function togglePlay() {
    if (state.playing) stop();
    else play();
  }

  function jumpToPeakSeason() {
    // Start near Aug 1 00:00 for denser activity
    const keys = state.data.keys;
    const i = keys.indexOf("0801-0000");
    setIndex(i >= 0 ? i : 0);
  }

  function applyBasinView(basinId) {
    const cfg = BASINS[basinId];
    const bounds = L.latLngBounds(cfg.bounds[0], cfg.bounds[1]);
    state.map.setMaxBounds(null);
    state.map.fitBounds(bounds, { padding: [20, 20] });
    state.map.setMaxBounds(bounds.pad(0.35));
  }

  function updateBasinTabs(basinId) {
    document.querySelectorAll(".basin-tab").forEach((btn) => {
      const active = btn.getAttribute("data-basin") === basinId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function applyMeta(basinId) {
    const cfg = BASINS[basinId];
    els.title.textContent = cfg.title;
    els.subtitle.textContent = cfg.subtitle;
    const meta = (state.data && state.data.meta) || {};
    els.years.textContent = meta.year_min && meta.year_max
      ? `${meta.year_min}–${meta.year_max} · ${meta.storms?.toLocaleString?.() || meta.storms} storms · ${meta.points?.toLocaleString?.() || meta.points} fixes`
      : "";
  }

  async function loadBasinData(basinId) {
    if (state.cache[basinId]) return state.cache[basinId];
    const cfg = BASINS[basinId];
    const resp = await fetch(cfg.dataUrl);
    if (!resp.ok) throw new Error(`Failed to load ${cfg.dataUrl}`);
    const data = await resp.json();
    state.cache[basinId] = data;
    return data;
  }

  async function switchBasin(basinId) {
    if (!BASINS[basinId]) return;
    if (basinId === state.basin && state.data) return;

    stop();
    els.loading.classList.remove("hidden");
    els.loading.textContent = `Loading ${BASINS[basinId].title}…`;

    try {
      const data = await loadBasinData(basinId);
      clearLayers();
      state.basin = basinId;
      state.data = data;
      state.keyIndex = buildKeyIndex(data.keys);
      state.trailLayer = L.layerGroup().addTo(state.map);
      state.layer = L.layerGroup().addTo(state.map);

      applyBasinView(basinId);
      updateBasinTabs(basinId);
      applyMeta(basinId);

      els.scrubber.min = "0";
      els.scrubber.max = String(data.keys.length - 1);
      els.scrubber.value = "0";

      jumpToPeakSeason();
      els.loading.classList.add("hidden");
    } catch (err) {
      console.error(err);
      els.loading.textContent =
        "Failed to load animation data. Serve this folder over HTTP (see README).";
    }
  }

  async function init() {
    els.map = document.getElementById("map");
    els.play = document.getElementById("btn-play");
    els.scrubber = document.getElementById("scrubber");
    els.speed = document.getElementById("speed");
    els.trails = document.getElementById("trails");
    els.datetime = document.getElementById("datetime");
    els.count = document.getElementById("count");
    els.loading = document.getElementById("loading");
    els.legend = document.getElementById("legend");
    els.years = document.getElementById("years");
    els.title = document.getElementById("title");
    els.subtitle = document.getElementById("subtitle");

    buildLegend();

    const map = L.map("map", {
      worldCopyJump: false,
      minZoom: 3,
      maxZoom: 8,
    });

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri — Esri, DeLorme, NAVTEQ",
        maxZoom: 16,
      }
    ).addTo(map);

    state.map = map;
    state.renderer = L.canvas({ padding: 0.5 });
    state.trailLayer = L.layerGroup().addTo(map);
    state.layer = L.layerGroup().addTo(map);

    state.trailMode = els.trails.value;

    els.play.addEventListener("click", togglePlay);
    els.scrubber.addEventListener("input", () => {
      stop();
      setIndex(parseInt(els.scrubber.value, 10));
    });
    els.speed.addEventListener("change", () => {
      state.intervalMs = parseInt(els.speed.value, 10);
      if (state.playing) {
        stop();
        play();
      }
    });
    els.trails.addEventListener("change", () => {
      state.trailMode = els.trails.value;
      renderFrame(state.index);
    });

    document.querySelectorAll(".basin-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-basin");
        switchBasin(id);
      });
    });

    await switchBasin("atlantic");
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => {
      console.error(err);
      document.getElementById("loading").textContent =
        "Failed to load animation data. Serve this folder over HTTP (see README).";
    });
  });
})();
