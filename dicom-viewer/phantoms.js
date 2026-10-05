// Procedural images for the demo cases. Each case is drawn from its seed and
// finding parameters; every finding is painted together with a per-slice
// mask (value = finding index + 1), which is the exact ground truth used for
// overlays and for scoring learner outlines.
//
// Coordinates are normalised to [-1, 1] with +y down. Axial images follow
// radiological convention: patient right is image left, anterior is up.

const Phantoms = (function () {
  "use strict";

  const SIZE = 256;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeImage(fill) {
    const px = new Float32Array(SIZE * SIZE).fill(fill);
    const mask = new Uint8Array(SIZE * SIZE);
    let used = false;

    // Paint `value` wherever pred(nx, ny) holds inside the bounding box.
    function region(box, pred, value, opts) {
      opts = opts || {};
      const x0 = Math.max(0, Math.floor(((box[0] + 1) / 2) * SIZE));
      const x1 = Math.min(SIZE - 1, Math.ceil(((box[2] + 1) / 2) * SIZE));
      const y0 = Math.max(0, Math.floor(((box[1] + 1) / 2) * SIZE));
      const y1 = Math.min(SIZE - 1, Math.ceil(((box[3] + 1) / 2) * SIZE));
      for (let y = y0; y <= y1; y++) {
        const ny = ((y + 0.5) / SIZE) * 2 - 1;
        for (let x = x0; x <= x1; x++) {
          const nx = ((x + 0.5) / SIZE) * 2 - 1;
          if (!pred(nx, ny)) continue;
          const i = y * SIZE + x;
          px[i] = opts.add ? px[i] + value : value;
          if (opts.maskId) { mask[i] = opts.maskId; used = true; }
        }
      }
    }

    function ellipse(cx, cy, rx, ry, value, opts) {
      if (rx <= 0 || ry <= 0) return;
      region([cx - rx, cy - ry, cx + rx, cy + ry], inEllipse(cx, cy, rx, ry), value, opts);
    }

    return { px, mask, region, ellipse, hasMask: () => used };
  }

  function inEllipse(cx, cy, rx, ry) {
    return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }

  function inRotEllipse(cx, cy, rx, ry, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return (x, y) => {
      const dx = x - cx, dy = y - cy;
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
    };
  }

  const FULL = [-1, -1, 1, 1];

  function blur(px, passes) {
    const tmp = new Float32Array(px.length);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const a = px[y * SIZE + Math.max(0, x - 1)], b = px[y * SIZE + x], c = px[y * SIZE + Math.min(SIZE - 1, x + 1)];
          tmp[y * SIZE + x] = (a + b + c) / 3;
        }
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const a = tmp[Math.max(0, y - 1) * SIZE + x], b = tmp[y * SIZE + x], c = tmp[Math.min(SIZE - 1, y + 1) * SIZE + x];
          px[y * SIZE + x] = (a + b + c) / 3;
        }
    }
  }

  function noise(px, amount, rand) {
    for (let i = 0; i < px.length; i++) px[i] += (rand() + rand() + rand() - 1.5) * amount;
  }

  // Image x sign of a patient side (patient right = image left).
  const sideX = (side) => (side === "right" ? -1 : 1);

  // ---------- chest X-ray ----------

  function chestXray(c, kase, rand) {
    const lungs = {
      right: { cx: -0.38, cy: -0.05, rx: 0.3, ry: 0.6 },
      left: { cx: 0.38, cy: -0.05, rx: 0.28, ry: 0.6 }
    };
    const inLung = (L) => inEllipse(L.cx, L.cy, L.rx, L.ry);
    const box = (L) => [L.cx - L.rx, L.cy - L.ry, L.cx + L.rx, L.cy + L.ry];

    c.ellipse(0, 0.15, 0.95, 0.95, 260);
    Object.values(lungs).forEach((L) => c.ellipse(L.cx, L.cy, L.rx, L.ry, 100));

    // Vascular markings, denser towards the hila.
    Object.values(lungs).forEach((L) => {
      const lung = inLung(L);
      for (let k = 0; k < 140; k++) {
        const r = Math.sqrt(rand()) * 0.95;
        const a = rand() * Math.PI * 2;
        const vx = L.cx + Math.cos(a) * L.rx * r * (rand() < 0.5 ? 0.6 : 1);
        const vy = L.cy + Math.sin(a) * L.ry * r;
        const sz = 0.006 + rand() * 0.012 * (1.2 - r);
        const vessel = inRotEllipse(vx, vy, sz * 2.5, sz, a);
        c.region([vx - 0.05, vy - 0.05, vx + 0.05, vy + 0.05], (x, y) => lung(x, y) && vessel(x, y), 28, { add: true });
      }
    });

    let heart = { cx: 0.1, cy: 0.25, rx: 0.3, ry: 0.28 };
    let heartMask = 0;

    kase.findings.forEach((f, idx) => {
      const id = idx + 1;
      const p = f.params;
      const L = lungs[p.side];
      const lung = L && inLung(L);
      const medial = L ? -Math.sign(L.cx) : 0;
      const zoneY = { upper: -0.38, middle: -0.05, lower: 0.28 };
      if (f.key === "pneumothorax") {
        const s = 0.25 + rand() * 0.25;
        const ccx = L.cx + medial * L.rx * s * 0.45, ccy = L.cy + L.ry * s * 0.25;
        const crx = L.rx * (1 - s * 0.7), cry = L.ry * (1 - s * 0.45);
        const collapsed = inEllipse(ccx, ccy, crx, cry);
        const pleura = inEllipse(ccx, ccy, crx + 0.012, cry + 0.012);
        c.region(box(L), (x, y) => lung(x, y) && collapsed(x, y), 30, { add: true });
        c.region(box(L), (x, y) => lung(x, y) && pleura(x, y) && !collapsed(x, y), 150);
        c.region(box(L), (x, y) => lung(x, y) && !pleura(x, y), 25, { maskId: id });
      } else if (f.key === "effusion") {
        const level = 0.22 + rand() * 0.2;
        const top = L.cy + L.ry - level;
        c.region(box(L), (x, y) => {
          const lateral = Math.abs(x - (L.cx + medial * L.rx)) / (2 * L.rx);
          return lung(x, y) && y > top - 0.12 * lateral;
        }, 300, { maskId: id });
      } else if (f.key === "consolidation") {
        const cx = L.cx + (rand() - 0.5) * 0.12, cy = zoneY[p.zone] + (rand() - 0.5) * 0.08;
        const rx = 0.12 + rand() * 0.06, ry = 0.1 + rand() * 0.06;
        const blob = inEllipse(cx, cy, rx, ry);
        c.region([cx - rx, cy - ry, cx + rx, cy + ry], (x, y) => lung(x, y) && blob(x, y), 110, { add: true, maskId: id });
      } else if (f.key === "nodule") {
        const cx = L.cx + (rand() - 0.5) * 0.25, cy = zoneY[p.zone] + (rand() - 0.5) * 0.1;
        const r = (p.mm / 350) * 1.2;
        c.ellipse(cx, cy, r, r, 130, { add: true, maskId: id });
      } else if (f.key === "cardiomegaly") {
        heart = { cx: 0.08, cy: 0.25, rx: 0.44, ry: 0.34 };
        heartMask = id;
      }
    });

    c.ellipse(heart.cx, heart.cy, heart.rx, heart.ry, 180, { add: true, maskId: heartMask || undefined });
    c.ellipse(0, 0.1, 0.06, 0.95, 260, { add: true });
    for (let k = 0; k < 8; k++) {
      const y = -0.55 + k * 0.14;
      c.ellipse(-0.38, y, 0.32, 0.018, 90, { add: true });
      c.ellipse(0.38, y, 0.3, 0.018, 90, { add: true });
    }
    c.ellipse(-0.35, -0.7, 0.3, 0.025, 160, { add: true });
    c.ellipse(0.35, -0.7, 0.3, 0.025, 160, { add: true });
    return { wc: 300, ww: 600, noise: 6, blur: 2 };
  }

  // ---------- CT head ----------

  function ctHead(c, kase, t, frand) {
    const s = Math.sqrt(Math.max(0, 1 - ((t - 0.45) * 1.9) ** 2));
    if (s < 0.05) return { wc: 40, ww: 80, noise: 4 };
    const B = { rx: 0.68 * s, ry: 0.8 * s };
    const brain = inEllipse(0, 0, B.rx, B.ry);
    const bbox = [-B.rx, -B.ry, B.rx, B.ry];

    c.ellipse(0, 0, 0.78 * s, 0.9 * s, 40);
    c.ellipse(0, 0, 0.74 * s, 0.86 * s, 1200);
    c.ellipse(0, 0, B.rx, B.ry, 36);
    c.ellipse(0, 0, 0.5 * s, 0.62 * s, 27);
    if (t > 0.3 && t < 0.75) {
      const v = Math.sin(((t - 0.3) / 0.45) * Math.PI);
      c.ellipse(-0.1, -0.05, 0.06 * v, 0.28 * v, 6);
      c.ellipse(0.1, -0.05, 0.06 * v, 0.28 * v, 6);
    }

    kase.findings.forEach((f, idx) => {
      const id = idx + 1;
      const p = f.params;
      const r = rng(kase.seed + idx * 977);
      const sx = sideX(p.side);
      if (f.key === "sdh") {
        if (t < 0.25 || t > 0.8 || s < 0.5) return;
        const th = (0.05 + r() * 0.05) * Math.sin(((t - 0.25) / 0.55) * Math.PI) + 0.02;
        const inner = inEllipse(-sx * th, 0, B.rx - th * 0.25, B.ry - th * 0.4);
        c.region(bbox, (x, y) => brain(x, y) && !inner(x, y) && x * sx > 0 && Math.abs(y) < 0.75 * B.ry, 72, { maskId: id });
      } else if (f.key === "edh") {
        const t0 = 0.45 + r() * 0.15;
        const k = 1 - ((t - t0) / 0.16) ** 2;
        if (k <= 0 || s < 0.5) return;
        const cy = (r() - 0.6) * 0.5 * s;
        const lens = inEllipse(sx * B.rx, cy, 0.16 * Math.sqrt(k), 0.3 * Math.sqrt(k) * s);
        c.region(bbox, (x, y) => brain(x, y) && lens(x, y), 80, { maskId: id });
      } else if (f.key === "sah") {
        if (t < 0.22 || t > 0.55) return;
        const k = Math.sin(((t - 0.22) / 0.33) * Math.PI);
        const parts = [];
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2 + 0.3;
          parts.push(inRotEllipse(Math.cos(ang) * 0.1, 0.08 + Math.sin(ang) * 0.1, 0.11 * k, 0.018, ang));
        }
        parts.push(inRotEllipse(-0.3, 0.02, 0.2 * k, 0.02, -0.5));
        parts.push(inRotEllipse(0.3, 0.02, 0.2 * k, 0.02, 0.5));
        c.region(bbox, (x, y) => brain(x, y) && parts.some((q) => q(x, y)), 62, { maskId: id });
      } else if (f.key === "iph") {
        const t0 = 0.4 + r() * 0.2;
        const R = (p.mm / 160) * 0.9;
        const k = 1 - ((t - t0) / (R * 1.4)) ** 2;
        if (k <= 0) return;
        const cx = sx * (0.18 + r() * 0.15), cy = (r() - 0.5) * 0.5;
        const rr = R * Math.sqrt(k);
        c.region([cx - rr, cy - rr, cx + rr, cy + rr], (x, y) => brain(x, y) && inEllipse(cx, cy, rr, rr * 0.85)(x, y), 70, { maskId: id });
      } else if (f.key === "infarct") {
        if (t < 0.38 || t > 0.78 || s < 0.5) return;
        const a0 = -0.55, a1 = 0.45;
        c.region(bbox, (x, y) => {
          if (!brain(x, y) || x * sx <= 0) return false;
          const ang = Math.atan2(y, Math.abs(x));
          const rad = Math.sqrt((x / B.rx) ** 2 + (y / B.ry) ** 2);
          return ang > a0 && ang < a1 && rad > 0.35;
        }, 19, { maskId: id });
      }
    });
    return { wc: 40, ww: 80, noise: 3 };
  }

  // ---------- CT thorax ----------

  function ctThorax(c, kase, t, frand) {
    const w = 0.92 - Math.abs(t - 0.5) * 0.2;
    const lungR = 0.42 * Math.sqrt(Math.max(0.05, 1 - ((t - 0.55) * 1.6) ** 2));
    const lungs = {
      right: { cx: -0.42, cy: 0, rx: 0.32, ry: lungR + 0.08 },
      left: { cx: 0.42, cy: 0, rx: 0.3, ry: lungR + 0.08 }
    };
    const h = t > 0.35 ? Math.min(1, (t - 0.35) * 3) : 0;
    const heart = inEllipse(0.08, 0.05, 0.26 * h || 1e-6, 0.22 * h || 1e-6);

    c.ellipse(0, 0.05, w, 0.66, -100);
    c.ellipse(0, 0.05, w - 0.06, 0.6, 40);
    Object.values(lungs).forEach((L) => c.ellipse(L.cx, L.cy, L.rx, L.ry, -840));
    Object.values(lungs).forEach((L) => {
      const lung = inEllipse(L.cx, L.cy, L.rx, L.ry);
      for (let k = 0; k < 30; k++) {
        const r = Math.sqrt(frand()) * 0.9, a = frand() * Math.PI * 2;
        const vx = L.cx + Math.cos(a) * L.rx * r, vy = L.cy + Math.sin(a) * L.ry * r;
        const sz = 0.006 + frand() * 0.012 * (1.1 - r);
        c.region([vx - sz, vy - sz, vx + sz, vy + sz], (x, y) => lung(x, y) && inEllipse(vx, vy, sz, sz)(x, y), -60);
      }
    });
    if (h) c.ellipse(0.08, 0.05, 0.26 * h, 0.22 * h, 45);
    c.ellipse(0.06, -0.12, 0.07, 0.07, 220);
    c.ellipse(0, 0.48, 0.1, 0.09, 700);
    c.ellipse(0, 0.48, 0.05, 0.04, 30);

    kase.findings.forEach((f, idx) => {
      const id = idx + 1;
      const p = f.params;
      const r = rng(kase.seed + idx * 977);
      const L = lungs[p.side];
      const lung = inEllipse(L.cx, L.cy, L.rx, L.ry);
      const inside = (x, y) => lung(x, y) && !heart(x, y);
      const box = [L.cx - L.rx, L.cy - L.ry, L.cx + L.rx, L.cy + L.ry];
      const size = { small: 0.08, moderate: 0.16, large: 0.26 }[p.size] || 0;
      if (f.key === "ctNodule") {
        const t0 = p.lobe === "upper" ? 0.25 + r() * 0.15 : 0.6 + r() * 0.2;
        const R = (p.mm / 300) * 1.4;
        const k = 1 - ((t - t0) / (R * 1.6)) ** 2;
        if (k <= 0) return;
        const cx = L.cx + (r() - 0.5) * L.rx * 0.8, cy = (r() - 0.5) * 0.4;
        const rr = R * Math.sqrt(k);
        c.region([cx - rr, cy - rr, cx + rr, cy + rr], (x, y) => inside(x, y) && inEllipse(cx, cy, rr, rr)(x, y), 35, { maskId: id });
      } else if (f.key === "ctEffusion") {
        if (t < 0.3) return;
        const depth = size * (0.5 + t);
        const top = L.cy + L.ry - depth;
        c.region(box, (x, y) => inside(x, y) && y > top, 12, { maskId: id });
      } else if (f.key === "ctPneumothorax") {
        if (t > 0.85) return;
        const depth = size * (1.2 - t * 0.6);
        const bottom = L.cy - L.ry + depth;
        c.region(box, (x, y) => inside(x, y) && y < bottom + 0.05 * Math.cos((x - L.cx) * 4), -1000, { maskId: id });
      }
    });

    for (let k = 0; k < 10; k++) {
      const a = (k / 9) * Math.PI;
      c.ellipse(Math.cos(a) * (w - 0.08), 0.05 + Math.sin(a) * 0.55 * (k % 2 ? 1 : -0.9), 0.03, 0.03, 650);
    }
    return { wc: -600, ww: 1500, noise: 12 };
  }

  /** Render every slice of a demo case. */
  function render(kase) {
    const frames = [];
    let win = { wc: 40, ww: 400 };
    const air = kase.type === "cxr" ? 0 : -1000;
    for (let i = 0; i < kase.slices; i++) {
      const t = kase.slices === 1 ? 0.5 : i / (kase.slices - 1);
      const c = makeImage(air);
      const caseRand = rng(kase.seed);
      const sliceRand = rng(kase.seed + i * 7919);
      let opts;
      if (kase.type === "cxr") opts = chestXray(c, kase, caseRand);
      else if (kase.type === "cthead") opts = ctHead(c, kase, t, sliceRand);
      else opts = ctThorax(c, kase, t, sliceRand);
      if (opts.blur) blur(c.px, opts.blur);
      noise(c.px, opts.noise, sliceRand);
      win = { wc: opts.wc, ww: opts.ww };
      frames.push({ width: SIZE, height: SIZE, pixels: c.px, mask: c.hasMask() ? c.mask : null });
    }
    return { frames, window: win, invert: false };
  }

  return { render };
})();
