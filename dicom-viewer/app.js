(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const studies = STUDIES.map((s) => ({ ...s, source: "sample" }));
  /** study id -> { frames, window: {wc, ww}, invert } */
  const seriesCache = new Map();

  const PRESETS = {
    CT: [
      { name: "Brain", wc: 40, ww: 80 },
      { name: "Subdural", wc: 75, ww: 215 },
      { name: "Stroke", wc: 32, ww: 40 },
      { name: "Lung", wc: -600, ww: 1500 },
      { name: "Mediastinum", wc: 50, ww: 350 },
      { name: "Abdomen", wc: 50, ww: 400 },
      { name: "Liver", wc: 60, ww: 160 },
      { name: "Bone", wc: 400, ww: 1800 }
    ]
  };

  let selectedId = null;
  let series = null;
  let slice = 0;
  let tool = "wl";
  let cineTimer = null;
  const view = { wc: 40, ww: 400, zoom: 1, panX: 0, panY: 0, invert: false };

  // ---------- helpers ----------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function formatName(dicomName) {
    if (!dicomName) return "Unknown";
    const [last, first] = dicomName.split("^");
    return first ? `${last}, ${first}` : last;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  function dicomDateToIso(d) {
    return d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
  }

  function tokens(q) {
    return q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** Escape text and wrap any of the search terms in <mark>. */
  function highlight(text, terms) {
    const safe = escapeHtml(text || "");
    if (!terms.length) return { html: safe, count: 0 };
    const re = new RegExp("(" + terms.map((t) => escapeRegExp(escapeHtml(t))).join("|") + ")", "gi");
    let count = 0;
    const html = safe.replace(re, (m) => {
      count++;
      return "<mark>" + m + "</mark>";
    });
    return { html, count };
  }

  function reportText(study) {
    const r = study.report;
    return r ? [r.clinical, r.technique, r.findings, r.impression].join(" ") : "";
  }

  // ---------- filters ----------

  const filterEls = {
    query: $("f-query"),
    modality: $("f-modality"),
    bodyPart: $("f-bodypart"),
    status: $("f-status"),
    priority: $("f-priority"),
    from: $("f-from"),
    to: $("f-to")
  };

  function fillSelect(el, values) {
    const current = el.value;
    el.innerHTML = '<option value="">All</option>' +
      values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    el.value = values.includes(current) ? current : "";
  }

  function refreshFilterOptions() {
    const uniq = (key) => Array.from(new Set(studies.map((s) => s[key]).filter(Boolean))).sort();
    fillSelect(filterEls.modality, uniq("modality"));
    fillSelect(filterEls.bodyPart, uniq("bodyPart"));
    fillSelect(filterEls.status, uniq("status"));
    fillSelect(filterEls.priority, uniq("priority"));
  }

  function currentFilters() {
    return {
      terms: tokens(filterEls.query.value),
      modality: filterEls.modality.value,
      bodyPart: filterEls.bodyPart.value,
      status: filterEls.status.value,
      priority: filterEls.priority.value,
      from: filterEls.from.value,
      to: filterEls.to.value
    };
  }

  function matches(study, f) {
    if (f.modality && study.modality !== f.modality) return false;
    if (f.bodyPart && study.bodyPart !== f.bodyPart) return false;
    if (f.status && study.status !== f.status) return false;
    if (f.priority && study.priority !== f.priority) return false;
    if (f.from && (!study.date || study.date < f.from)) return false;
    if (f.to && (!study.date || study.date > f.to)) return false;
    if (f.terms.length) {
      const hay = [
        study.patient.name, formatName(study.patient.name), study.patient.id, study.accession,
        study.description, study.modality, study.bodyPart, study.radiologist, reportText(study)
      ].join(" ").toLowerCase();
      return f.terms.every((t) => hay.includes(t));
    }
    return true;
  }

  // ---------- study list ----------

  function renderList() {
    const f = currentFilters();
    const list = studies.filter((s) => matches(s, f)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    $("result-count").textContent = `${list.length} of ${studies.length}`;
    const ul = $("study-list");
    if (!list.length) {
      ul.innerHTML = '<li class="empty-list">No studies match these filters.</li>';
      return;
    }
    ul.innerHTML = list.map((s) => {
      const name = highlight(formatName(s.patient.name), f.terms).html;
      const desc = highlight(s.description, f.terms).html;
      const acc = highlight(s.accession || "", f.terms).html;
      const mrn = highlight(s.patient.id || "", f.terms).html;
      const prio = s.priority && s.priority !== "Routine" ? `<span class="prio-${s.priority}">${s.priority}</span>` : "";
      return `<li class="study" role="option" tabindex="0" data-id="${escapeHtml(s.id)}" aria-selected="${s.id === selectedId}">
        <div class="study-top"><span class="study-name">${name}</span><span class="badge ${escapeHtml(s.status)}">${escapeHtml(s.status)}</span></div>
        <div class="study-desc">${desc}</div>
        <div class="study-meta"><span>${escapeHtml(s.modality)}</span><span>${formatDate(s.date)}</span><span>${mrn}</span><span>${acc}</span>${prio}</div>
      </li>`;
    }).join("");
  }

  $("study-list").addEventListener("click", (e) => {
    const li = e.target.closest(".study");
    if (li) selectStudy(li.dataset.id);
  });
  $("study-list").addEventListener("keydown", (e) => {
    const li = e.target.closest(".study");
    if (!li) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectStudy(li.dataset.id);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? li.nextElementSibling : li.previousElementSibling;
      if (next) next.focus();
    }
  });

  Object.values(filterEls).forEach((el) => {
    el.addEventListener("input", () => { renderList(); renderReport(); });
  });
  $("f-clear").addEventListener("click", () => {
    Object.values(filterEls).forEach((el) => { el.value = ""; });
    renderList();
    renderReport();
  });

  // ---------- report panel ----------

  function renderReport() {
    const body = $("report-body");
    const study = studies.find((s) => s.id === selectedId);
    const ownTerms = tokens($("report-query").value);
    const terms = ownTerms.length ? ownTerms : currentFilters().terms;
    if (!study) {
      body.innerHTML = '<p class="report-empty">Select a study to see its report.</p>';
      $("report-count").textContent = "";
      return;
    }
    const header = `<div class="report-header">
      <div class="rh-name"><span>${escapeHtml(formatName(study.patient.name))}</span><span class="badge ${escapeHtml(study.status)}">${escapeHtml(study.status)}</span></div>
      <dl>
        <dt>MRN</dt><dd>${escapeHtml(study.patient.id || "—")}</dd>
        ${study.patient.age ? `<dt>Age / sex</dt><dd>${study.patient.age} ${escapeHtml(study.patient.sex || "")}</dd>` : ""}
        <dt>Accession</dt><dd>${escapeHtml(study.accession || "—")}</dd>
        <dt>Study</dt><dd>${escapeHtml(study.description)}</dd>
        <dt>Date</dt><dd>${formatDate(study.date) || "—"}</dd>
        ${study.radiologist ? `<dt>Reported by</dt><dd>${escapeHtml(study.radiologist)}</dd>` : ""}
      </dl>
    </div>`;
    if (!study.report) {
      body.innerHTML = header + `<p class="report-empty">${study.source === "local"
        ? "Opened from a local file — no report attached."
        : "This study has not been reported yet."}</p>`;
      $("report-count").textContent = "";
      return;
    }
    let total = 0;
    const section = (title, text, cls) => {
      const h = highlight(text, terms);
      total += h.count;
      return `<section class="report-section ${cls || ""}"><h3>${title}</h3><p>${h.html}</p></section>`;
    };
    const r = study.report;
    body.innerHTML = header +
      section("Clinical details", r.clinical) +
      section("Technique", r.technique) +
      section("Findings", r.findings) +
      section("Impression", r.impression, "impression");
    $("report-count").textContent = terms.length ? `${total} match${total === 1 ? "" : "es"}` : "";
    const first = body.querySelector("mark");
    if (first && ownTerms.length) first.scrollIntoView({ block: "nearest" });
  }

  $("report-query").addEventListener("input", renderReport);

  // ---------- selection ----------

  function selectStudy(id) {
    const study = studies.find((s) => s.id === id);
    if (!study) return;
    stopCine();
    selectedId = id;
    if (!seriesCache.has(id)) seriesCache.set(id, Dicom.generateSeries(study));
    series = seriesCache.get(id);
    slice = Math.floor((series.frames.length - 1) / 2);
    fillPresets(study);
    resetView();
    $("slice").max = series.frames.length - 1;
    $("slice").value = slice;
    $("stage-empty").hidden = true;
    $("stage-error").hidden = true;
    document.querySelectorAll(".study").forEach((li) => {
      li.setAttribute("aria-selected", String(li.dataset.id === id));
    });
    renderReport();
    markDirty();
  }

  function fillPresets(study) {
    const sel = $("preset");
    const list = [{ name: "Default", wc: series.window.wc, ww: series.window.ww }].concat(PRESETS[study.modality] || []);
    sel.innerHTML = list.map((p, i) => `<option value="${i}">${escapeHtml(p.name)} (${p.wc}/${p.ww})</option>`).join("");
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
    $("btn-invert").setAttribute("aria-pressed", String(view.invert));
    markDirty();
  }

  function setSlice(i) {
    if (!series) return;
    const n = series.frames.length;
    slice = Math.max(0, Math.min(n - 1, i));
    $("slice").value = slice;
    markDirty();
  }

  // ---------- rendering ----------

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const imgCanvas = document.createElement("canvas");
  const imgCtx = imgCanvas.getContext("2d");
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

  function fitScale(frame) {
    const r = canvas.getBoundingClientRect();
    return Math.min(r.width / frame.width, r.height / frame.height) * 0.95;
  }

  function draw() {
    dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    if (!series) { renderOverlays(); return; }

    const frame = series.frames[slice];
    renderFrame(frame);
    const s = fitScale(frame) * view.zoom * dpr;
    ctx.setTransform(s, 0, 0, s, w / 2 + view.panX * dpr, h / 2 + view.panY * dpr);
    ctx.imageSmoothingEnabled = view.zoom < 4;
    ctx.drawImage(imgCanvas, -frame.width / 2, -frame.height / 2);
    renderOverlays();
  }

  function renderOverlays() {
    const study = studies.find((s) => s.id === selectedId);
    if (!study || !series) {
      ["ov-tl", "ov-tr", "ov-bl", "ov-br"].forEach((id) => { $(id).innerHTML = ""; });
      $("slice-label").textContent = "–";
      return;
    }
    const frame = series.frames[slice];
    const n = series.frames.length;
    $("ov-tl").innerHTML = `${escapeHtml(formatName(study.patient.name))}<br>${escapeHtml(study.patient.id || "")}<br>${escapeHtml(study.accession || "")}`;
    $("ov-tr").innerHTML = `${escapeHtml(study.description)}<br>${escapeHtml(study.modality)} · ${formatDate(study.date)}`;
    $("ov-bl").innerHTML = `Im: ${slice + 1}/${n}<br>${frame.width} × ${frame.height}`;
    $("ov-br").innerHTML = `W: ${Math.round(view.ww)} L: ${Math.round(view.wc)}<br>Zoom: ${(view.zoom * 100).toFixed(0)}%${view.invert ? "<br>Inverted" : ""}`;
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
    stage.style.cursor = { wl: "crosshair", pan: "grab", zoom: "zoom-in", scroll: "ns-resize" }[t];
  }

  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  stage.addEventListener("pointerdown", (e) => {
    if (!series) return;
    stage.setPointerCapture(e.pointerId);
    // Right button always adjusts W/L, middle always pans.
    const mode = e.button === 2 ? "wl" : e.button === 1 ? "pan" : tool;
    drag = { mode, x: e.clientX, y: e.clientY, acc: 0 };
  });

  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
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

  const endDrag = () => { drag = null; };
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

  stage.addEventListener("dblclick", resetView);

  $("slice").addEventListener("input", (e) => setSlice(Number(e.target.value)));

  $("btn-invert").addEventListener("click", () => {
    view.invert = !view.invert;
    $("btn-invert").setAttribute("aria-pressed", String(view.invert));
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
    if (e.target.closest("input, select, textarea") || !series) return;
    if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); setSlice(slice + 1); }
    else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); setSlice(slice - 1); }
    else if (e.key === "Home") setSlice(0);
    else if (e.key === "End") setSlice(series.frames.length - 1);
    else if (e.key === "r" || e.key === "R") resetView();
    else if (e.key === "i" || e.key === "I") $("btn-invert").click();
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
    const frames = parsed.map((p) => p.frame);
    let { windowCenterValue: wc, windowWidthValue: ww } = meta;
    if (wc === undefined || ww === undefined) {
      let min = Infinity, max = -Infinity;
      const px = frames[Math.floor(frames.length / 2)].pixels;
      for (let i = 0; i < px.length; i++) { if (px[i] < min) min = px[i]; if (px[i] > max) max = px[i]; }
      wc = (min + max) / 2;
      ww = Math.max(1, max - min);
    }

    const id = `LOCAL-${++localCount}`;
    studies.push({
      id,
      source: "local",
      accession: "",
      patient: { name: meta.patientName || "Anonymous", id: meta.patientId || "" },
      date: dicomDateToIso(meta.studyDate),
      modality: meta.modality || "OT",
      bodyPart: meta.bodyPart ? meta.bodyPart.charAt(0) + meta.bodyPart.slice(1).toLowerCase() : "",
      description: meta.studyDescription || meta.seriesDescription || files[0].name,
      status: "Local",
      priority: "",
      radiologist: "",
      report: null
    });
    seriesCache.set(id, { frames, window: { wc, ww }, invert: !!meta.invert });
    refreshFilterOptions();
    renderList();
    selectStudy(id);
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

  // ---------- init ----------

  refreshFilterOptions();
  renderList();
  renderReport();
  const firstLi = document.querySelector(".study");
  if (firstLi) selectStudy(firstLi.dataset.id);
})();
