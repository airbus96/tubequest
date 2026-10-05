(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "findings_trainer_v1";
  const HIT_DICE = 0.3;
  const COLORS = ["#f43f5e", "#22d3ee", "#a3e635", "#facc15", "#c084fc"];

  const cases = CASES.map((c) => ({ ...c, source: "demo" }));
  /** case id -> { frames, window, invert } */
  const seriesCache = new Map();

  const PRESETS = {
    cthead: [
      { name: "Brain", wc: 40, ww: 80 },
      { name: "Stroke", wc: 32, ww: 40 },
      { name: "Subdural", wc: 75, ww: 215 },
      { name: "Bone", wc: 400, ww: 1800 }
    ],
    ctthorax: [
      { name: "Lung", wc: -600, ww: 1500 },
      { name: "Mediastinum", wc: 50, ww: 350 },
      { name: "Bone", wc: 400, ww: 1800 }
    ]
  };

  let studyType = "cxr";
  let selectedId = null;
  let series = null;
  let slice = 0;
  let tool = "wl";
  let cineTimer = null;
  let revealed = false;
  let showOverlay = false;
  /** In-progress learner outline: { caseId, slice, points: [[x, y], ...] } */
  let outline = null;
  const view = { wc: 40, ww: 400, zoom: 1, panX: 0, panY: 0, invert: false };

  // ---------- persistence ----------

  /**
   * attempts:   caseId -> { hit, dice }   (outlines checked on verified overlays)
   * seen:       caseId -> true
   * revealed:   caseId -> true            (findings shown at least once)
   * flags:      [{ caseId, at }]           ("I can't see it")
   * ratings:    "caseId:idx" -> "good" | "poor"
   * community:  caseId -> [{ finding, slice, points, weight }]
   */
  let store = { attempts: {}, seen: {}, revealed: {}, flags: [], ratings: {}, community: {}, termsAccepted: false };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) store = Object.assign(store, JSON.parse(raw));
    } catch (e) { /* storage unavailable: keep in-memory state */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  // Trust weight for community outlines: accuracy on verified cases, with a
  // low provisional weight until the learner has a few attempts.
  function trust() {
    const list = Object.values(store.attempts);
    const hits = list.filter((a) => a.hit).length;
    const accuracy = list.length ? hits / list.length : 0;
    const weight = list.length < 3 ? 0.2 : Math.max(0.1, accuracy);
    return { attempts: list.length, hits, accuracy, weight };
  }

  // ---------- helpers ----------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function tokens(q) {
    return q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlight(text, terms) {
    const safe = escapeHtml(text || "");
    if (!terms.length) return { html: safe, count: 0 };
    const re = new RegExp("(" + terms.map((t) => escapeRegExp(escapeHtml(t))).join("|") + ")", "gi");
    let count = 0;
    const html = safe.replace(re, (m) => { count++; return "<mark>" + m + "</mark>"; });
    return { html, count };
  }

  const findingName = (key) => (FINDINGS[key] ? FINDINGS[key].name : key);
  const currentCase = () => cases.find((c) => c.id === selectedId);
  const typeInfo = (key) => STUDY_TYPES.find((t) => t.key === key);

  function caseStatus(c) {
    const a = store.attempts[c.id];
    if (a) return a.hit ? "Found" : "Missed";
    return store.seen[c.id] ? "Seen" : "New";
  }

  /** Slices (0-based) on which finding `idx` of the current series appears. */
  function sliceRange(idx) {
    if (!series) return null;
    let first = -1, last = -1;
    series.frames.forEach((f, i) => {
      if (f.mask && f.mask.includes(idx + 1)) { if (first < 0) first = i; last = i; }
    });
    return first < 0 ? null : [first, last];
  }

  // ---------- filter bar ----------

  function renderTypeTabs() {
    const tabs = STUDY_TYPES.slice();
    if (cases.some((c) => c.type === "local")) tabs.push({ key: "local", name: "Local files", available: true });
    $("type-tabs").innerHTML = tabs.map((t) => `<button type="button" role="tab" class="seg" data-type="${t.key}"
        aria-selected="${t.key === studyType}" ${t.available ? "" : 'aria-disabled="true"'}
        title="${escapeHtml(t.available ? t.plannedSource || "" : t.note)}">${escapeHtml(t.name)}${t.available ? "" : " · soon"}</button>`).join("");
  }

  $("type-tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".seg");
    if (!b) return;
    studyType = b.dataset.type;
    renderTypeTabs();
    fillFindingFilter();
    renderList();
    const info = typeInfo(studyType);
    if (info && info.available) randomCase();
  });

  function fillFindingFilter() {
    const info = typeInfo(studyType);
    const keys = info && info.findings ? info.findings : [];
    $("f-finding").innerHTML = '<option value="">Any case</option>' +
      keys.map((k) => `<option value="${k}">${escapeHtml(findingName(k))}</option>`).join("") +
      (keys.length ? '<option value="normal">Normal only</option>' : "");
  }

  function filteredCases() {
    const finding = $("f-finding").value;
    const terms = tokens($("f-query").value);
    const unseen = $("f-unseen").checked;
    return cases.filter((c) => {
      if (c.type !== studyType) return false;
      if (finding === "normal" && c.findings.length) return false;
      if (finding && finding !== "normal" && !c.findings.some((f) => f.key === finding)) return false;
      if (unseen && store.seen[c.id]) return false;
      if (terms.length) {
        const hay = [c.id, c.clinical, c.findings.map((f) => findingName(f.key)).join(" "),
          c.report ? c.report.findings + " " + c.report.impression : ""].join(" ").toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }

  ["f-finding", "f-query", "f-unseen"].forEach((id) => $(id).addEventListener("input", renderList));
  $("f-finding").addEventListener("change", () => {
    // Drilling a finding jumps straight to a matching case.
    const c = currentCase();
    const f = $("f-finding").value;
    if (f && (!c || !filteredCases().includes(c))) randomCase();
  });
  $("btn-random").addEventListener("click", randomCase);

  // ---------- case list ----------

  function renderList() {
    const info = typeInfo(studyType);
    const note = $("type-note");
    note.hidden = !info || info.available;
    if (info && !info.available) note.textContent = info.note;

    const list = filteredCases();
    const total = cases.filter((c) => c.type === studyType).length;
    $("result-count").textContent = `${list.length} of ${total}`;
    const terms = tokens($("f-query").value);
    const ul = $("study-list");
    if (!list.length) {
      ul.innerHTML = info && !info.available ? "" : '<li class="empty-list">No cases match these filters.</li>';
      return;
    }
    ul.innerHTML = list.map((c) => {
      const status = caseStatus(c);
      // Finding names stay hidden until the learner has looked at the case.
      const names = store.revealed[c.id]
        ? (c.findings.length ? c.findings.map((f) => highlight(findingName(f.key), terms).html).join(", ") : "Normal")
        : "Findings hidden";
      return `<li class="study" role="option" tabindex="0" data-id="${escapeHtml(c.id)}" aria-selected="${c.id === selectedId}">
        <div class="study-top"><span class="study-name">${highlight(c.id, terms).html}</span><span class="badge ${status}">${status}</span></div>
        <div class="study-desc">${names}</div>
      </li>`;
    }).join("");
  }

  $("study-list").addEventListener("click", (e) => {
    const li = e.target.closest(".study");
    if (li) selectCase(li.dataset.id);
  });
  $("study-list").addEventListener("keydown", (e) => {
    const li = e.target.closest(".study");
    if (!li) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCase(li.dataset.id); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? li.nextElementSibling : li.previousElementSibling;
      if (next) next.focus();
    }
  });

  function randomCase() {
    let pool = filteredCases();
    if (pool.length > 1) pool = pool.filter((c) => c.id !== selectedId);
    if (!pool.length) {
      showFeedback("No cases match these filters.", "info");
      return;
    }
    selectCase(pool[Math.floor(Math.random() * pool.length)].id);
  }

  // ---------- selection ----------

  function selectCase(id) {
    const c = cases.find((x) => x.id === id);
    if (!c) return;
    stopCine();
    selectedId = id;
    if (!seriesCache.has(id)) seriesCache.set(id, Phantoms.render(c));
    series = seriesCache.get(id);
    slice = Math.floor((series.frames.length - 1) / 2);
    revealed = false;
    showOverlay = false;
    outline = null;
    store.seen[id] = true;
    save();
    fillPresets();
    resetView();
    $("slice").max = series.frames.length - 1;
    $("slice").value = slice;
    $("stage-empty").hidden = true;
    $("stage-error").hidden = true;
    hideFeedback();
    syncButtons();
    renderList();
    renderReport();
    renderOutlineBar();
    markDirty();
  }

  function fillPresets() {
    const sel = $("preset");
    const c = currentCase();
    const list = [{ name: "Default", wc: series.window.wc, ww: series.window.ww }].concat(PRESETS[c.type] || []);
    sel.innerHTML = list.map((p, i) => `<option value="${i}">${escapeHtml(p.name)} (${Math.round(p.wc)}/${Math.round(p.ww)})</option>`).join("");
    sel._presets = list;
  }

  $("preset").addEventListener("change", (e) => {
    const p = e.target._presets && e.target._presets[e.target.value];
    if (!p) return;
    view.wc = p.wc;
    view.ww = p.ww;
    markDirty();
  });

  function resetView() {
    if (!series) return;
    view.wc = series.window.wc;
    view.ww = series.window.ww;
    view.invert = series.invert;
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
    $("preset").value = "0";
    syncButtons();
    markDirty();
  }

  function setSlice(i) {
    if (!series) return;
    slice = Math.max(0, Math.min(series.frames.length - 1, i));
    $("slice").value = slice;
    markDirty();
  }

  function syncButtons() {
    $("btn-invert").setAttribute("aria-pressed", String(view.invert));
    $("btn-overlay").setAttribute("aria-pressed", String(showOverlay));
    $("btn-reveal").textContent = revealed ? "Hide findings" : "Show findings";
    const c = currentCase();
    $("btn-cantsee").disabled = !c || !c.findings.length;
  }

  // ---------- findings panel ----------

  function setRevealed(v) {
    revealed = v;
    if (v && selectedId) { store.revealed[selectedId] = true; save(); }
    syncButtons();
    renderReport();
    renderList();
    renderOutlineBar();
  }

  $("btn-reveal").addEventListener("click", () => setRevealed(!revealed));

  $("btn-overlay").addEventListener("click", () => {
    showOverlay = !showOverlay;
    syncButtons();
    markDirty();
  });

  $("btn-cantsee").addEventListener("click", () => {
    const c = currentCase();
    if (!c || !c.findings.length) return;
    store.flags.push({ caseId: c.id, at: new Date().toISOString() });
    save();
    showOverlay = true;
    setRevealed(true);
    const verified = c.findings.findIndex((f) => f.overlay === "verified");
    const range = verified >= 0 && sliceRange(verified);
    if (range) setSlice(Math.round((range[0] + range[1]) / 2));
    showFeedback("Flagged. Cases that many learners can't see are checked for wrong labels. The findings and overlay are now shown.", "info");
    renderProgress();
  });

  function renderReport() {
    const body = $("report-body");
    const c = currentCase();
    $("report-count").textContent = "";
    if (!c) {
      body.innerHTML = '<p class="report-empty">Pick a case to start.</p>';
      renderProgress();
      return;
    }
    const info = typeInfo(c.type);
    const head = `<div class="report-header">
      <div class="rh-name"><span>${escapeHtml(c.id)}</span><span class="badge ${caseStatus(c)}">${caseStatus(c)}</span></div>
      <dl>
        <dt>Study</dt><dd>${escapeHtml(info ? info.name : c.description || "Local file")}</dd>
        <dt>Clinical</dt><dd>${escapeHtml(c.clinical || "—")}</dd>
        <dt>Technique</dt><dd>${escapeHtml(c.technique || "—")}</dd>
      </dl>
    </div>`;

    if (!revealed) {
      body.innerHTML = head + `<p class="report-empty">Findings are hidden. Look at the images first. Then use <strong>Outline</strong> to mark what you see, or press <strong>Show findings</strong>.</p>`;
      renderProgress();
      return;
    }

    const terms = tokens($("f-query").value);
    const items = c.findings.map((f, idx) => {
      const range = f.overlay === "verified" ? sliceRange(idx) : null;
      const community = (store.community[c.id] || []).filter((o) => o.finding === idx);
      const kind = f.overlay === "verified"
        ? '<span class="chip verified">Verified overlay</span>'
        : community.length
          ? `<span class="chip community">Community label (${community.length})</span>`
          : '<span class="chip label">Label only. Outline it</span>';
      const rateable = f.overlay === "verified" || community.length;
      const rating = store.ratings[c.id + ":" + idx];
      const rate = !rateable ? "" : rating === "poor"
        ? '<span class="muted">Sent for radiologist review</span>'
        : rating === "good"
          ? '<span class="muted">Rated good</span>'
          : `<span class="rate">Rate this label: <button class="link" data-rate="good" data-idx="${idx}">Good</button> · <button class="link" data-rate="poor" data-idx="${idx}">Poor</button></span>`;
      const go = range ? `<button class="link" data-goto="${Math.round((range[0] + range[1]) / 2)}">Slices ${range[0] + 1}–${range[1] + 1}</button>` : "";
      return `<li class="finding" style="--swatch:${COLORS[idx % COLORS.length]}">
        <div class="finding-top"><span class="swatch"></span><strong>${highlight(findingName(f.key), terms).html}</strong>${kind}</div>
        <div class="finding-meta">${go}${rate}</div>
      </li>`;
    }).join("");

    let total = 0;
    const section = (title, text, cls) => {
      const h = highlight(text, terms);
      total += h.count;
      return `<section class="report-section ${cls || ""}"><h3>${title}</h3><p>${h.html}</p></section>`;
    };
    const report = c.report
      ? section("Report", c.report.findings) + section("Impression", c.report.impression, "impression")
      : '<p class="report-empty">No report attached.</p>';
    const source = c.source === "demo"
      ? `<p class="source">Synthetic demo case. In production this study type would draw on ${escapeHtml(info.plannedSource)}.</p>`
      : '<p class="source">Opened from a local file.</p>';

    body.innerHTML = head +
      (c.findings.length ? `<ul class="finding-list">${items}</ul>` : '<p class="normal-case">Normal study: no findings.</p>') +
      report + source;
    $("report-count").textContent = terms.length ? `${total} match${total === 1 ? "" : "es"}` : "";
    renderProgress();
  }

  $("report-body").addEventListener("click", (e) => {
    const go = e.target.closest("[data-goto]");
    if (go) { setSlice(Number(go.dataset.goto)); showOverlay = true; syncButtons(); markDirty(); return; }
    const rate = e.target.closest("[data-rate]");
    if (rate) {
      store.ratings[selectedId + ":" + rate.dataset.idx] = rate.dataset.rate;
      save();
      renderReport();
    }
  });

  function renderProgress() {
    const t = trust();
    const review = Object.values(store.ratings).filter((r) => r === "poor").length;
    const labels = Object.values(store.community).reduce((n, l) => n + l.length, 0);
    $("progress").innerHTML = `<h3>Your progress</h3>
      <dl>
        <dt>Accuracy on verified cases</dt><dd>${t.attempts ? `${t.hits}/${t.attempts} (${Math.round(t.accuracy * 100)}%)` : "No attempts yet"}</dd>
        <dt>Weight of your outlines</dt><dd>${t.weight.toFixed(2)}${t.attempts < 3 ? " (provisional until 3 attempts)" : ""}</dd>
        <dt>Labels contributed</dt><dd>${labels}</dd>
        <dt>"Can't see it" flags</dt><dd>${store.flags.length}</dd>
        <dt>Sent to radiologist review</dt><dd>${review}</dd>
      </dl>
      <button class="link" id="btn-reset-progress">Reset progress</button>`;
  }

  $("progress").addEventListener("click", (e) => {
    if (e.target.id !== "btn-reset-progress") return;
    if (!confirm("Clear your attempts, flags, ratings and contributed labels in this browser?")) return;
    store = { attempts: {}, seen: {}, revealed: {}, flags: [], ratings: {}, community: {}, termsAccepted: store.termsAccepted };
    save();
    renderList();
    renderReport();
    markDirty();
  });

  function showFeedback(html, kind) {
    const el = $("feedback");
    el.className = "feedback " + (kind || "info");
    el.innerHTML = html;
    el.hidden = false;
  }

  function hideFeedback() {
    $("feedback").hidden = true;
  }

  // ---------- outlining ----------

  function renderOutlineBar() {
    const bar = $("outline-bar");
    const c = currentCase();
    const has = outline && c && outline.caseId === c.id;
    bar.hidden = !has;
    if (!has) return;
    const labelOnly = c.findings.map((f, i) => ({ f, i })).filter((x) => x.f.overlay === "label");
    const canSubmit = revealed && labelOnly.length > 0;
    $("outline-info").textContent = `Outline on slice ${outline.slice + 1}`;
    $("btn-submit").hidden = !canSubmit;
    const target = $("outline-target");
    target.hidden = !canSubmit;
    if (canSubmit) {
      target.innerHTML = labelOnly.map((x) => `<option value="${x.i}">${escapeHtml(findingName(x.f.key))}</option>`).join("");
    }
    $("btn-check").hidden = c.source === "local" || (c.findings.length > 0 && !c.findings.some((f) => f.overlay === "verified"));
  }

  /** Rasterise the outline polygon to a mask at image resolution. */
  function rasterise(points, w, h) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d");
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    const data = g.getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 127 ? 1 : 0;
    return m;
  }

  function dice(a, maskArr, id) {
    let inter = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) {
      const b = maskArr && maskArr[i] === id ? 1 : 0;
      sa += a[i];
      sb += b;
      if (a[i] && b) inter++;
    }
    return sa + sb ? (2 * inter) / (sa + sb) : 0;
  }

  $("btn-check").addEventListener("click", () => {
    const c = currentCase();
    if (!c || !outline) return;
    const frame = series.frames[outline.slice];
    const user = rasterise(outline.points, frame.width, frame.height);

    if (!c.findings.length) {
      store.attempts[c.id] = { hit: false, dice: 0 };
      save();
      showFeedback("<strong>Normal study.</strong> There is no finding here to outline. This counts as a miss.", "bad");
      return afterCheck();
    }
    const verified = c.findings.map((f, i) => ({ f, i })).filter((x) => x.f.overlay === "verified");
    if (!verified.length) {
      showFeedback("This case has labels but no verified overlay, so your outline can't be scored. Show findings, then submit your outline as a community label.", "info");
      return;
    }
    let best = { d: 0, i: -1 };
    verified.forEach((x) => {
      const d = dice(user, frame.mask, x.i + 1);
      if (d > best.d) best = { d, i: x.i };
    });
    const hit = best.d >= HIT_DICE;
    const prev = store.attempts[c.id];
    // Keep the learner's first scored attempt per case for accuracy.
    if (!prev) store.attempts[c.id] = { hit, dice: Math.round(best.d * 100) / 100 };
    save();
    const pct = Math.round(best.d * 100);
    if (hit) {
      showFeedback(`<strong>${pct >= 60 ? "Spot on" : "Found it"}.</strong> Your outline overlaps the ${escapeHtml(findingName(c.findings[best.i].key))} with a Dice score of ${pct}%.`, "good");
    } else if (best.d > 0) {
      showFeedback(`<strong>Close.</strong> Your outline partly overlaps the ${escapeHtml(findingName(c.findings[best.i].key))} (Dice ${pct}%). Compare it with the overlay.`, "bad");
    } else {
      const ranges = verified.map((x) => sliceRange(x.i)).filter(Boolean);
      const where = ranges.length && !ranges.some((r) => outline.slice >= r[0] && outline.slice <= r[1])
        ? ` The finding is on slices ${ranges[0][0] + 1}–${ranges[0][1] + 1}.` : "";
      showFeedback(`<strong>Missed.</strong> Your outline doesn't overlap a verified finding on this slice.${where}`, "bad");
    }
    afterCheck();
  });

  function afterCheck() {
    showOverlay = true;
    setRevealed(true);
    markDirty();
  }

  $("btn-submit").addEventListener("click", () => {
    if (!store.termsAccepted) {
      const dlg = $("terms-dialog");
      dlg.returnValue = "";
      dlg.showModal();
      dlg.addEventListener("close", function onClose() {
        dlg.removeEventListener("close", onClose);
        if (dlg.returnValue === "accept") {
          store.termsAccepted = true;
          save();
          submitOutline();
        }
      });
      return;
    }
    submitOutline();
  });

  function submitOutline() {
    const c = currentCase();
    if (!c || !outline) return;
    const idx = Number($("outline-target").value);
    const weight = trust().weight;
    (store.community[c.id] = store.community[c.id] || []).push({
      finding: idx, slice: outline.slice, points: outline.points, weight
    });
    save();
    outline = null;
    showOverlay = true;
    showFeedback(`Thanks. Your outline was saved as a community label for ${escapeHtml(findingName(c.findings[idx].key))}, with weight ${weight.toFixed(2)}.`, "good");
    syncButtons();
    renderOutlineBar();
    renderReport();
    markDirty();
  }

  $("btn-clear-outline").addEventListener("click", () => {
    outline = null;
    renderOutlineBar();
    markDirty();
  });

  // ---------- rendering ----------

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const imgCanvas = document.createElement("canvas");
  const imgCtx = imgCanvas.getContext("2d");
  const ovCanvas = document.createElement("canvas");
  const ovCtx = ovCanvas.getContext("2d");
  let dirty = false;

  function markDirty() {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(draw);
  }

  function renderFrame(frame) {
    if (imgCanvas.width !== frame.width || imgCanvas.height !== frame.height) {
      imgCanvas.width = frame.width;
      imgCanvas.height = frame.height;
    }
    const img = imgCtx.createImageData(frame.width, frame.height);
    const out = img.data;
    const px = frame.pixels;
    const ww = Math.max(1, view.ww);
    const low = view.wc - ww / 2;
    const scale = 255 / ww;
    for (let i = 0, j = 0; i < px.length; i++, j += 4) {
      let v = (px[i] - low) * scale;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      if (view.invert) v = 255 - v;
      out[j] = out[j + 1] = out[j + 2] = v;
      out[j + 3] = 255;
    }
    imgCtx.putImageData(img, 0, 0);
  }

  // Verified overlays: translucent fill with a solid edge, per finding colour.
  function renderMaskOverlay(frame, kase) {
    const { width: w, height: h, mask } = frame;
    if (ovCanvas.width !== w || ovCanvas.height !== h) { ovCanvas.width = w; ovCanvas.height = h; }
    const img = ovCtx.createImageData(w, h);
    const out = img.data;
    const rgb = COLORS.map((c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)));
    const verified = new Set(kase.findings.map((f, i) => (f.overlay === "verified" ? i + 1 : 0)).filter(Boolean));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = mask[i];
        if (!m || !verified.has(m)) continue;
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
          mask[i - 1] !== m || mask[i + 1] !== m || mask[i - w] !== m || mask[i + w] !== m;
        const [r, g, b] = rgb[(m - 1) % rgb.length];
        const j = i * 4;
        out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = edge ? 255 : 70;
      }
    ovCtx.putImageData(img, 0, 0);
  }

  function fitScale(frame) {
    const r = canvas.getBoundingClientRect();
    return Math.min(r.width / frame.width, r.height / frame.height) * 0.95;
  }

  function tracePath(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  }

  function draw() {
    dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    if (!series) { renderOverlays(); return; }

    const kase = currentCase();
    const frame = series.frames[slice];
    renderFrame(frame);
    const s = fitScale(frame) * view.zoom * dpr;
    ctx.setTransform(s, 0, 0, s, w / 2 + view.panX * dpr, h / 2 + view.panY * dpr);
    ctx.translate(-frame.width / 2, -frame.height / 2);
    ctx.imageSmoothingEnabled = view.zoom < 4;
    ctx.drawImage(imgCanvas, 0, 0);

    if (showOverlay && frame.mask) {
      renderMaskOverlay(frame, kase);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ovCanvas, 0, 0);
    }
    if (showOverlay) {
      (store.community[kase.id] || []).filter((o) => o.slice === slice).forEach((o) => {
        tracePath(o.points);
        ctx.closePath();
        ctx.setLineDash([4 / s * dpr, 3 / s * dpr]);
        ctx.lineWidth = 1.5 / s * dpr;
        ctx.strokeStyle = COLORS[o.finding % COLORS.length];
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    if (outline && outline.caseId === kase.id && outline.slice === slice && outline.points.length > 1) {
      tracePath(outline.points);
      if (!drag) ctx.closePath();
      ctx.lineWidth = 2 / s * dpr;
      ctx.strokeStyle = "#fbbf24";
      ctx.fillStyle = "rgba(251, 191, 36, 0.12)";
      if (!drag) ctx.fill();
      ctx.stroke();
    }
    renderOverlays();
  }

  function renderOverlays() {
    const kase = currentCase();
    if (!kase || !series) {
      ["ov-tl", "ov-tr", "ov-bl", "ov-br"].forEach((id) => { $(id).innerHTML = ""; });
      $("slice-label").textContent = "–";
      return;
    }
    const frame = series.frames[slice];
    const n = series.frames.length;
    const info = typeInfo(kase.type);
    $("ov-tl").innerHTML = `${escapeHtml(kase.id)}<br>${escapeHtml(info ? info.name : "Local file")}`;
    $("ov-tr").innerHTML = kase.source === "demo" ? "Synthetic demo<br>Not patient data" : escapeHtml(kase.description || "");
    $("ov-bl").innerHTML = `Im: ${slice + 1}/${n}<br>${frame.width} × ${frame.height}`;
    $("ov-br").innerHTML = `W: ${Math.round(view.ww)} L: ${Math.round(view.wc)}<br>Zoom: ${(view.zoom * 100).toFixed(0)}%${showOverlay ? "<br>Overlay on" : ""}`;
    $("slice-label").textContent = `${slice + 1} / ${n}`;
  }

  new ResizeObserver(markDirty).observe($("stage"));

  // ---------- interaction ----------

  const stage = $("stage");
  let drag = null;

  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  function setTool(t) {
    tool = t;
    document.querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
    stage.style.cursor = { wl: "crosshair", pan: "grab", zoom: "zoom-in", scroll: "ns-resize", outline: "cell" }[t];
  }

  function toImage(e) {
    const frame = series.frames[slice];
    const r = canvas.getBoundingClientRect();
    const s = fitScale(frame) * view.zoom;
    return [
      (e.clientX - r.left - r.width / 2 - view.panX) / s + frame.width / 2,
      (e.clientY - r.top - r.height / 2 - view.panY) / s + frame.height / 2
    ];
  }

  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  stage.addEventListener("pointerdown", (e) => {
    if (!series) return;
    stage.setPointerCapture(e.pointerId);
    // Right button always adjusts W/L, middle always pans.
    const mode = e.button === 2 ? "wl" : e.button === 1 ? "pan" : tool;
    drag = { mode, x: e.clientX, y: e.clientY, acc: 0 };
    if (mode === "outline") {
      stopCine();
      outline = { caseId: selectedId, slice, points: [toImage(e)] };
      renderOutlineBar();
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.mode === "outline") {
      const p = toImage(e);
      const last = outline.points[outline.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1) outline.points.push(p);
      markDirty();
      return;
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.mode === "wl") {
      const k = Math.max(1, view.ww / 200);
      view.ww = Math.max(1, view.ww + dx * k);
      view.wc = view.wc + dy * k;
    } else if (drag.mode === "pan") {
      view.panX += dx;
      view.panY += dy;
    } else if (drag.mode === "zoom") {
      view.zoom = Math.max(0.1, Math.min(20, view.zoom * Math.exp(-dy * 0.01)));
    } else if (drag.mode === "scroll") {
      drag.acc += dy;
      const step = Math.trunc(drag.acc / 8);
      if (step) { drag.acc -= step * 8; setSlice(slice + step); }
    }
    markDirty();
  });

  function endDrag() {
    if (drag && drag.mode === "outline" && outline && outline.points.length < 3) outline = null;
    drag = null;
    renderOutlineBar();
    markDirty();
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("wheel", (e) => {
    if (!series) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      view.zoom = Math.max(0.1, Math.min(20, view.zoom * Math.exp(-e.deltaY * 0.002)));
      markDirty();
    } else {
      setSlice(slice + Math.sign(e.deltaY));
    }
  }, { passive: false });

  $("slice").addEventListener("input", (e) => setSlice(Number(e.target.value)));

  $("btn-invert").addEventListener("click", () => {
    view.invert = !view.invert;
    syncButtons();
    markDirty();
  });
  $("btn-reset").addEventListener("click", resetView);
  $("btn-cine").addEventListener("click", () => (cineTimer ? stopCine() : startCine()));

  function startCine() {
    if (!series || series.frames.length < 2) return;
    $("btn-cine").textContent = "Pause";
    $("btn-cine").setAttribute("aria-pressed", "true");
    cineTimer = setInterval(() => setSlice((slice + 1) % series.frames.length), 100);
  }

  function stopCine() {
    clearInterval(cineTimer);
    cineTimer = null;
    $("btn-cine").textContent = "Play";
    $("btn-cine").setAttribute("aria-pressed", "false");
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea, dialog")) return;
    const k = e.key.toLowerCase();
    if (k === "n") return randomCase();
    if (!series) return;
    if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); setSlice(slice + 1); }
    else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); setSlice(slice - 1); }
    else if (e.key === "Home") setSlice(0);
    else if (e.key === "End") setSlice(series.frames.length - 1);
    else if (k === "r") resetView();
    else if (k === "i") $("btn-invert").click();
    else if (k === "o") $("btn-overlay").click();
    else if (k === "f") $("btn-reveal").click();
    else if (k === "d") setTool("outline");
    else if (e.key === "Escape" && outline) $("btn-clear-outline").click();
    else if (e.key === " " && !e.target.closest("button, .study")) { e.preventDefault(); $("btn-cine").click(); }
  });

  // ---------- local DICOM files ----------

  let localCount = 0;

  async function openFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;
    const parsed = [];
    const errors = [];
    for (const file of files) {
      try {
        const result = Dicom.parse(await file.arrayBuffer());
        result.frames.forEach((frame, k) => parsed.push({ meta: result.meta, frame, order: k }));
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }
    if (!parsed.length) {
      showError(errors.join("\n") || "No readable images.");
      return;
    }
    parsed.sort((a, b) =>
      (Number(a.meta.instanceNumber) || 0) - (Number(b.meta.instanceNumber) || 0) ||
      (parseFloat(a.meta.sliceLocation) || 0) - (parseFloat(b.meta.sliceLocation) || 0) ||
      a.order - b.order);

    const meta = parsed[0].meta;
    const frames = parsed.map((p) => ({ ...p.frame, mask: null }));
    let { windowCenterValue: wc, windowWidthValue: ww } = meta;
    if (wc === undefined || ww === undefined) {
      let min = Infinity, max = -Infinity;
      const px = frames[Math.floor(frames.length / 2)].pixels;
      for (let i = 0; i < px.length; i++) { if (px[i] < min) min = px[i]; if (px[i] > max) max = px[i]; }
      wc = (min + max) / 2;
      ww = Math.max(1, max - min);
    }

    const id = `LOCAL-${++localCount}`;
    cases.push({
      id,
      type: "local",
      source: "local",
      description: meta.studyDescription || meta.seriesDescription || files[0].name,
      clinical: "",
      technique: meta.modality || "",
      slices: frames.length,
      findings: [],
      report: null
    });
    seriesCache.set(id, { frames, window: { wc, ww }, invert: !!meta.invert });
    studyType = "local";
    renderTypeTabs();
    fillFindingFilter();
    selectCase(id);
    if (errors.length) showError(`Opened ${parsed.length} image(s); skipped ${errors.length}:\n` + errors.join("\n"), 6000);
  }

  function showError(msg, timeout) {
    const el = $("stage-error");
    el.textContent = msg;
    el.style.whiteSpace = "pre-line";
    el.hidden = false;
    if (timeout) setTimeout(() => { el.hidden = true; }, timeout);
  }

  $("file-input").addEventListener("change", (e) => {
    openFiles(e.target.files);
    e.target.value = "";
  });

  stage.addEventListener("dragover", (e) => { e.preventDefault(); stage.classList.add("dragover"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("dragover"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("dragover");
    openFiles(e.dataTransfer.files);
  });

  $("btn-sources").addEventListener("click", () => $("sources-dialog").showModal());

  // ---------- init ----------

  load();
  renderTypeTabs();
  fillFindingFilter();
  renderList();
  renderReport();
  randomCase();
})();
