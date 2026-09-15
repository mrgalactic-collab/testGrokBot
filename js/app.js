/* Atlantic HURDAT2 composite day-of-year animation */
(function () {
  "use strict";

  const STATUS_COLORS = {
    TD: "#60a5fa", // tropical depression
    TS: "#34d399", // tropical storm
    HU: "#f87171", // hurricane
    EX: "#a78bfa", // extratropical
    LO: "#94a3b8", // low
    DB: "#fbbf24", // disturbance
    SS: "#2dd4bf", // subtropical storm
    SD: "#38bdf8", // subtropical depression
    WV: "#fb923c", // tropical wave
    OTHER: "#e2e8f0",
  };

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

  const state = {
    data: null,
    index: 0,
    playing: false,
    timer: null,
    intervalMs: 500,
    layer: null,
  };

  const els = {
    map: null,
    play: null,
    scrubber: null,
    speed: null,
    datetime: null,
    count: null,
    loading: null,
    legend: null,
    years: null,
  };

  function formatKey(key) {
    // MMDD-HHMM
    const mm = parseInt(key.slice(0, 2), 10);
    const dd = parseInt(key.slice(2, 4), 10);
    const hh = key.slice(5, 7);
    const mi = key.slice(7, 9);
    return `${MONTHS[mm - 1]} ${dd} · ${hh}:${mi} UTC`;
  }

  function colorFor(status) {
    return STATUS_COLORS[status] || STATUS_COLORS.OTHER;
  }

  function buildLegend() {
    const order = ["HU", "TS", "TD", "SS", "SD", "EX", "LO", "DB", "WV", "OTHER"];
    els.legend.innerHTML =
      "<h2>Status</h2>" +
      order
        .map(
          (s) =>
            `<div class="legend-item"><span class="swatch" style="background:${colorFor(
              s
            )}"></span>${STATUS_LABELS[s]}</div>`
        )
        .join("");
  }

  function renderFrame(idx) {
    const keys = state.data.keys;
    const key = keys[idx];
    const points = state.data.frames[key] || [];

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
        radius: 5,
        color: "#0f172a",
        weight: 0.6,
        opacity: 0.5,
        fillColor: colorFor(status),
        fillOpacity: 0.55,
        renderer: state.renderer,
      });
      marker.bindTooltip(
        `<strong>${name}</strong> (${year})<br>${STATUS_LABELS[status] || status}<br>Max wind: ${windTxt}`,
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

  async function init() {
    els.map = document.getElementById("map");
    els.play = document.getElementById("btn-play");
    els.scrubber = document.getElementById("scrubber");
    els.speed = document.getElementById("speed");
    els.datetime = document.getElementById("datetime");
    els.count = document.getElementById("count");
    els.loading = document.getElementById("loading");
    els.legend = document.getElementById("legend");
    els.years = document.getElementById("years");

    buildLegend();

    const map = L.map("map", {
      worldCopyJump: false,
      minZoom: 3,
      maxZoom: 8,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // Atlantic basin ~ 5N–50N, 100W–20W
    const bounds = L.latLngBounds([5, -100], [50, -20]);
    map.fitBounds(bounds, { padding: [20, 20] });
    map.setMaxBounds(bounds.pad(0.35));

    state.map = map;
    state.renderer = L.canvas({ padding: 0.5 });
    state.layer = L.layerGroup().addTo(map);

    const resp = await fetch("data/frames.json");
    if (!resp.ok) throw new Error("Failed to load data/frames.json");
    state.data = await resp.json();

    const meta = state.data.meta || {};
    els.years.textContent = meta.year_min && meta.year_max
      ? `${meta.year_min}–${meta.year_max} · ${meta.storms?.toLocaleString?.() || meta.storms} storms · ${meta.points?.toLocaleString?.() || meta.points} fixes`
      : "";

    els.scrubber.min = "0";
    els.scrubber.max = String(state.data.keys.length - 1);
    els.scrubber.value = "0";

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

    jumpToPeakSeason();
    els.loading.classList.add("hidden");
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => {
      console.error(err);
      document.getElementById("loading").textContent =
        "Failed to load animation data. Serve this folder over HTTP (see README).";
    });
  });
})();
