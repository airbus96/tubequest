(function () {
  "use strict";

  const STORAGE_KEY = "tubequest_visited_stations_v1";

  /** @type {Set<string>} */
  let visited = new Set();
  let modeFilter = "all"; // 'all' or a mode key
  let statusFilter = "all"; // all | visited | unvisited

  // ---------- derived data ----------

  /** station name -> { lines: [{key,name,color}], modes: Set } */
  const stationIndex = new Map();
  TUBE_LINES.forEach((line) => {
    line.stations.forEach((name) => {
      if (!stationIndex.has(name)) {
        stationIndex.set(name, { name, lines: [], modes: new Set() });
      }
      const entry = stationIndex.get(name);
      entry.lines.push({ key: line.key, name: line.name, color: line.color });
      entry.modes.add(line.mode);
    });
  });
  const allStationNames = Array.from(stationIndex.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

  // ---------- persistence ----------

  function loadVisited() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) visited = new Set(JSON.parse(raw));
    } catch (e) {
      visited = new Set();
    }
  }

  function saveVisited() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visited)));
    } catch (e) {
      /* storage unavailable; ignore */
    }
  }

  function isVisited(name) {
    return visited.has(name);
  }

  function toggleVisited(name) {
    if (visited.has(name)) visited.delete(name);
    else visited.add(name);
    saveVisited();
    renderAll();
  }

  // ---------- rendering ----------

  const els = {
    visitedCount: document.getElementById("visited-count"),
    totalCount: document.getElementById("total-count"),
    progressFill: document.getElementById("progress-bar-fill"),
    resetBtn: document.getElementById("reset-btn"),
    searchInput: document.getElementById("search-input"),
    clearSearch: document.getElementById("clear-search"),
    searchResults: document.getElementById("search-results"),
    modeFilters: document.getElementById("mode-filters"),
    mapPanel: document.getElementById("map-panel"),
  };

  function renderProgress() {
    els.totalCount.textContent = allStationNames.length;
    els.visitedCount.textContent = visited.size;
    const pct = allStationNames.length
      ? Math.round((visited.size / allStationNames.length) * 100)
      : 0;
    els.progressFill.style.width = pct + "%";
  }

  function renderModeFilters() {
    const modes = Array.from(new Set(TUBE_LINES.map((l) => l.mode)));
    els.modeFilters.innerHTML = "";
    const allChip = makeChip("All lines", "all", modeFilter === "all");
    els.modeFilters.appendChild(allChip);
    modes.forEach((m) => {
      const chip = makeChip(MODE_LABELS[m] || m, m, modeFilter === m);
      els.modeFilters.appendChild(chip);
    });
  }

  function makeChip(label, value, pressed) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = label;
    btn.dataset.mode = value;
    btn.setAttribute("aria-pressed", String(pressed));
    btn.addEventListener("click", () => {
      modeFilter = value;
      renderModeFilters();
      applyFilters();
    });
    return btn;
  }

  function renderMap() {
    els.mapPanel.innerHTML = "";
    const modesInOrder = ["underground", "overground", "dlr", "elizabeth"];
    modesInOrder.forEach((mode) => {
      const linesForMode = TUBE_LINES.filter((l) => l.mode === mode);
      if (!linesForMode.length) return;
      const heading = document.createElement("div");
      heading.className = "mode-heading";
      heading.textContent = MODE_LABELS[mode] || mode;
      els.mapPanel.appendChild(heading);

      linesForMode.forEach((line) => {
        els.mapPanel.appendChild(buildLineBlock(line));
      });
    });
    applyFilters();
  }

  function buildLineBlock(line) {
    const block = document.createElement("div");
    block.className = "line-block";
    block.dataset.mode = line.mode;
    block.dataset.lineKey = line.key;

    const header = document.createElement("div");
    header.className = "line-header";

    const dot = document.createElement("span");
    dot.className = "swatch";
    dot.style.background = line.color;
    dot.style.width = "12px";
    dot.style.height = "12px";
    dot.style.borderRadius = "50%";
    dot.style.display = "inline-block";

    const name = document.createElement("span");
    name.className = "line-name";
    name.textContent = line.name;

    const uniqueStations = Array.from(new Set(line.stations));
    const visitedCount = uniqueStations.filter(isVisited).length;
    const progress = document.createElement("span");
    progress.className = "line-progress";
    progress.textContent = `${visitedCount}/${uniqueStations.length}`;

    header.appendChild(dot);
    header.appendChild(name);
    header.appendChild(progress);
    block.appendChild(header);

    const scroll = document.createElement("div");
    scroll.className = "rail-scroll";
    const rail = document.createElement("div");
    rail.className = "rail";
    rail.style.setProperty("--line-color", line.color);

    line.stations.forEach((stationName) => {
      const stop = document.createElement("button");
      stop.className = "station-stop";
      stop.dataset.station = stationName;
      if (isVisited(stationName)) stop.classList.add("visited");
      stop.title = stationName;

      const dotEl = document.createElement("span");
      dotEl.className = "station-dot";

      const label = document.createElement("span");
      label.className = "station-label";
      label.textContent = stationName;

      stop.appendChild(dotEl);
      stop.appendChild(label);
      stop.addEventListener("click", () => toggleVisited(stationName));

      rail.appendChild(stop);
    });

    scroll.appendChild(rail);
    block.appendChild(scroll);
    return block;
  }

  function applyFilters() {
    const blocks = els.mapPanel.querySelectorAll(".line-block");
    blocks.forEach((block) => {
      const matchesMode = modeFilter === "all" || block.dataset.mode === modeFilter;
      block.classList.toggle("hidden-by-filter", !matchesMode);
      if (!matchesMode) return;

      const stops = block.querySelectorAll(".station-stop");
      stops.forEach((stop) => {
        const name = stop.dataset.station;
        const v = isVisited(name);
        let show = true;
        if (statusFilter === "visited") show = v;
        else if (statusFilter === "unvisited") show = !v;
        stop.classList.toggle("hidden-by-filter", !show);
      });
    });
  }

  function renderStatusFilterChips() {
    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset.filter === statusFilter)
      );
      btn.addEventListener("click", () => {
        statusFilter = btn.dataset.filter;
        renderStatusFilterChips();
        applyFilters();
      });
    });
  }

  // ---------- search ----------

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    els.clearSearch.hidden = q.length === 0;
    if (!q) {
      els.searchResults.hidden = true;
      els.searchResults.innerHTML = "";
      return;
    }
    const matches = allStationNames
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, 25);

    els.searchResults.innerHTML = "";
    if (!matches.length) {
      const li = document.createElement("li");
      li.textContent = "No stations found.";
      li.style.cursor = "default";
      els.searchResults.appendChild(li);
    } else {
      matches.forEach((name) => {
        const entry = stationIndex.get(name);
        const li = document.createElement("li");

        const left = document.createElement("div");
        const nameSpan = document.createElement("div");
        nameSpan.className = "result-name";
        nameSpan.textContent = name;
        const linesSpan = document.createElement("div");
        linesSpan.className = "result-lines";
        entry.lines.forEach((l) => {
          const d = document.createElement("span");
          d.className = "line-dot";
          d.style.background = l.color;
          d.title = l.name;
          linesSpan.appendChild(d);
        });
        left.appendChild(nameSpan);
        left.appendChild(linesSpan);

        const toggleBtn = document.createElement("button");
        toggleBtn.className = "visit-toggle";
        const v = isVisited(name);
        toggleBtn.textContent = v ? "Visited ✓" : "Mark visited";
        if (v) toggleBtn.classList.add("visited");
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleVisited(name);
          renderSearchResults(els.searchInput.value);
        });

        li.appendChild(left);
        li.appendChild(toggleBtn);
        li.addEventListener("click", () => {
          toggleVisited(name);
          renderSearchResults(els.searchInput.value);
        });

        els.searchResults.appendChild(li);
      });
    }
    els.searchResults.hidden = false;
  }

  // ---------- wiring ----------

  function renderAll() {
    renderProgress();
    // Update visited state on existing map DOM without full rebuild for speed
    document.querySelectorAll(".station-stop").forEach((stop) => {
      stop.classList.toggle("visited", isVisited(stop.dataset.station));
    });
    document.querySelectorAll(".line-block").forEach((block) => {
      const lineKey = block.dataset.lineKey;
      const line = TUBE_LINES.find((l) => l.key === lineKey);
      if (!line) return;
      const uniqueStations = Array.from(new Set(line.stations));
      const visitedCount = uniqueStations.filter(isVisited).length;
      const progress = block.querySelector(".line-progress");
      if (progress) progress.textContent = `${visitedCount}/${uniqueStations.length}`;
    });
    applyFilters();
  }

  function init() {
    loadVisited();
    renderModeFilters();
    renderStatusFilterChips();
    renderMap();
    renderProgress();

    els.searchInput.addEventListener("input", (e) => {
      renderSearchResults(e.target.value);
    });
    els.clearSearch.addEventListener("click", () => {
      els.searchInput.value = "";
      renderSearchResults("");
      els.searchInput.focus();
    });

    els.resetBtn.addEventListener("click", () => {
      if (confirm("Clear all visited stations? This cannot be undone.")) {
        visited.clear();
        saveVisited();
        renderAll();
        renderSearchResults(els.searchInput.value);
      }
    });

    document.addEventListener("click", (e) => {
      if (
        !els.searchResults.contains(e.target) &&
        e.target !== els.searchInput
      ) {
        els.searchResults.hidden = true;
      }
    });
    els.searchInput.addEventListener("focus", () => {
      if (els.searchInput.value.trim()) els.searchResults.hidden = false;
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
