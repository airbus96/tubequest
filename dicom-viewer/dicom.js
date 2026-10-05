// Minimal DICOM Part 10 parser plus a procedural image generator for the
// sample studies. Supports uncompressed little-endian transfer syntaxes
// (implicit and explicit VR), 8/16-bit greyscale, multi-frame and
// MONOCHROME1. Compressed (JPEG, RLE, ...) pixel data is rejected.

const Dicom = (function () {
  "use strict";

  const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
  const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
  const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
  const TS_DEFLATED = "1.2.840.10008.1.2.1.99";

  const LONG_VRS = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "SQ", "SV", "UC", "UN", "UR", "UT", "UV"]);

  // Tags the viewer reads, with the VR to assume under implicit VR.
  const TAGS = {
    "00020010": ["transferSyntax", "UI"],
    "00080020": ["studyDate", "DA"],
    "00080060": ["modality", "CS"],
    "00081030": ["studyDescription", "LO"],
    "0008103E": ["seriesDescription", "LO"],
    "00100010": ["patientName", "PN"],
    "00100020": ["patientId", "LO"],
    "00180015": ["bodyPart", "CS"],
    "00200013": ["instanceNumber", "IS"],
    "00201041": ["sliceLocation", "DS"],
    "00280002": ["samplesPerPixel", "US"],
    "00280004": ["photometric", "CS"],
    "00280008": ["numberOfFrames", "IS"],
    "00280010": ["rows", "US"],
    "00280011": ["columns", "US"],
    "00280100": ["bitsAllocated", "US"],
    "00280103": ["pixelRepresentation", "US"],
    "00281050": ["windowCenter", "DS"],
    "00281051": ["windowWidth", "DS"],
    "00281052": ["rescaleIntercept", "DS"],
    "00281053": ["rescaleSlope", "DS"]
  };

  function hex4(n) {
    return n.toString(16).toUpperCase().padStart(4, "0");
  }

  function readString(view, offset, length) {
    let s = "";
    for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s.replace(/\0/g, "").trim();
  }

  function firstNumber(s) {
    const n = parseFloat(String(s).split("\\")[0]);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * Parse a DICOM file into one image per frame.
   * @param {ArrayBuffer} buffer
   * @returns {{meta: object, frames: Array<{width:number,height:number,pixels:Float32Array}>}}
   */
  function parse(buffer) {
    const view = new DataView(buffer);
    const len = buffer.byteLength;
    let offset = 0;
    if (len > 132 && readString(view, 128, 4) === "DICM") offset = 132;

    const meta = {};
    let explicit = true;
    let pixelOffset = -1;
    let pixelLength = 0;

    // Without a preamble, sniff whether the first element looks explicit.
    if (offset === 0) {
      const vr = readString(view, 4, 2);
      explicit = /^[A-Z]{2}$/.test(vr);
    }

    function readElement(isExplicit) {
      const group = view.getUint16(offset, true);
      const element = view.getUint16(offset + 2, true);
      offset += 4;
      let vr = null;
      let length;
      if (isExplicit && group !== 0xfffe) {
        vr = readString(view, offset, 2);
        offset += 2;
        if (LONG_VRS.has(vr)) {
          offset += 2;
          length = view.getUint32(offset, true);
          offset += 4;
        } else {
          length = view.getUint16(offset, true);
          offset += 2;
        }
      } else {
        length = view.getUint32(offset, true);
        offset += 4;
      }
      return { group, element, vr, length, tag: hex4(group) + hex4(element) };
    }

    // Skip an undefined-length sequence (or item) by walking its contents.
    function skipUndefined(isExplicit, endElement) {
      while (offset < len) {
        const el = readElement(isExplicit);
        if (el.group === 0xfffe && el.element === endElement) return;
        if (el.length === 0xffffffff) {
          skipUndefined(isExplicit, el.group === 0xfffe && el.element === 0xe000 ? 0xe00d : 0xe0dd);
        } else {
          offset += el.length;
        }
      }
    }

    while (offset + 8 <= len) {
      const isExplicit = view.getUint16(offset, true) === 0x0002 ? true : explicit;
      const el = readElement(isExplicit);

      if (el.tag === "7FE00010") {
        if (el.length === 0xffffffff) {
          throw new Error("Compressed (encapsulated) pixel data is not supported.");
        }
        pixelOffset = offset;
        pixelLength = el.length;
        break;
      }

      if (el.length === 0xffffffff) {
        skipUndefined(isExplicit, 0xe0dd);
        continue;
      }

      const known = TAGS[el.tag];
      if (known) {
        const [name, implicitVr] = known;
        const vr = el.vr || implicitVr;
        if (vr === "US") meta[name] = view.getUint16(offset, true);
        else meta[name] = readString(view, offset, el.length);
      }
      offset += el.length;

      if (el.tag === "00020010") {
        const ts = meta.transferSyntax;
        if (ts === TS_EXPLICIT_BE) throw new Error("Big-endian transfer syntax is not supported.");
        if (ts === TS_DEFLATED) throw new Error("Deflated transfer syntax is not supported.");
        if (ts !== TS_IMPLICIT_LE && ts !== TS_EXPLICIT_LE) {
          throw new Error("Compressed transfer syntax (" + ts + ") is not supported.");
        }
        explicit = ts === TS_EXPLICIT_LE;
      }
    }

    if (pixelOffset < 0) throw new Error("No pixel data found — is this a DICOM image?");

    const rows = meta.rows;
    const cols = meta.columns;
    if (!rows || !cols) throw new Error("Missing image dimensions.");
    const bits = meta.bitsAllocated || 16;
    const signed = meta.pixelRepresentation === 1;
    const spp = meta.samplesPerPixel || 1;
    const slope = firstNumber(meta.rescaleSlope) ?? 1;
    const intercept = firstNumber(meta.rescaleIntercept) ?? 0;
    const frameCount = Math.max(1, firstNumber(meta.numberOfFrames) || 1);
    const bytesPerSample = bits / 8;
    const frameBytes = rows * cols * spp * bytesPerSample;
    if (pixelOffset + frameBytes > len) throw new Error("Pixel data is truncated.");

    const frames = [];
    for (let f = 0; f < frameCount; f++) {
      const base = pixelOffset + f * frameBytes;
      if (base + frameBytes > len) break;
      const pixels = new Float32Array(rows * cols);
      for (let i = 0; i < rows * cols; i++) {
        let sum = 0;
        for (let s = 0; s < spp; s++) {
          const p = base + (i * spp + s) * bytesPerSample;
          let v;
          if (bits === 8) v = signed ? view.getInt8(p) : view.getUint8(p);
          else if (bits === 16) v = signed ? view.getInt16(p, true) : view.getUint16(p, true);
          else if (bits === 32) v = signed ? view.getInt32(p, true) : view.getUint32(p, true);
          else throw new Error("Unsupported bits allocated: " + bits);
          sum += v;
        }
        pixels[i] = (sum / spp) * slope + intercept;
      }
      frames.push({ width: cols, height: rows, pixels });
    }

    meta.windowCenterValue = firstNumber(meta.windowCenter);
    meta.windowWidthValue = firstNumber(meta.windowWidth);
    meta.invert = meta.photometric === "MONOCHROME1";
    return { meta, frames };
  }

  // ---------- procedural sample images ----------

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function makeCanvas(size, fill) {
    const px = new Float32Array(size * size);
    px.fill(fill);
    // Ellipse in normalised coords: centre (cx, cy), radii (rx, ry), [-1, 1].
    function ellipse(cx, cy, rx, ry, value, add) {
      if (rx <= 0 || ry <= 0) return;
      const x0 = Math.max(0, Math.floor(((cx - rx + 1) / 2) * size));
      const x1 = Math.min(size - 1, Math.ceil(((cx + rx + 1) / 2) * size));
      const y0 = Math.max(0, Math.floor(((cy - ry + 1) / 2) * size));
      const y1 = Math.min(size - 1, Math.ceil(((cy + ry + 1) / 2) * size));
      for (let y = y0; y <= y1; y++) {
        const ny = ((y + 0.5) / size) * 2 - 1;
        for (let x = x0; x <= x1; x++) {
          const nx = ((x + 0.5) / size) * 2 - 1;
          const d = ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2;
          if (d <= 1) {
            const i = y * size + x;
            px[i] = add ? px[i] + value : value;
          }
        }
      }
    }
    return { px, ellipse };
  }

  function blur(px, size, passes) {
    const tmp = new Float32Array(px.length);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          let s = 0, n = 0;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < size) { s += px[y * size + xx]; n++; }
          }
          tmp[y * size + x] = s / n;
        }
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy >= 0 && yy < size) { s += tmp[yy * size + x]; n++; }
          }
          px[y * size + x] = s / n;
        }
    }
  }

  function noise(px, amount, rand) {
    for (let i = 0; i < px.length; i++) px[i] += (rand() + rand() + rand() - 1.5) * amount;
  }

  // Each generator draws one slice at depth t in [0, 1].
  const PHANTOMS = {
    head(c, t) {
      const s = Math.sqrt(Math.max(0, 1 - ((t - 0.45) * 1.9) ** 2));
      c.ellipse(0, 0, 0.78 * s, 0.9 * s, 40);           // scalp
      c.ellipse(0, 0, 0.74 * s, 0.86 * s, 1200);        // skull
      c.ellipse(0, 0, 0.68 * s, 0.8 * s, 32);           // brain
      if (t > 0.3 && t < 0.75) {
        const v = Math.sin(((t - 0.3) / 0.45) * Math.PI);
        c.ellipse(-0.1, -0.05, 0.06 * v, 0.28 * v, 5);  // lateral ventricles
        c.ellipse(0.1, -0.05, 0.06 * v, 0.28 * v, 5);
      }
      c.ellipse(0, 0.82 * s, 0.05 * s, 0.03 * s, 40);   // falx notch
      return { wc: 40, ww: 80, noise: 4 };
    },
    chest(c, t) {
      const w = 0.92 - Math.abs(t - 0.5) * 0.2;
      c.ellipse(0, 0.05, w, 0.66, -100);                // subcutaneous fat
      c.ellipse(0, 0.05, w - 0.06, 0.6, 40);            // soft tissue
      const lung = 0.42 * Math.sqrt(Math.max(0.05, 1 - ((t - 0.55) * 1.6) ** 2));
      c.ellipse(-0.42, 0, 0.32, lung + 0.08, -850);     // right lung (image left)
      c.ellipse(0.42, 0, 0.3, lung + 0.08, -850);       // left lung
      if (t > 0.35) {
        const h = Math.min(1, (t - 0.35) * 3);
        c.ellipse(0.08, 0.05, 0.26 * h, 0.22 * h, 45);  // heart
      }
      c.ellipse(0.06, -0.12, 0.07, 0.07, 220);          // aorta (contrast)
      c.ellipse(0, 0.48, 0.1, 0.09, 700);               // vertebral body
      c.ellipse(0, 0.48, 0.05, 0.04, 30);
      for (let k = 0; k < 10; k++) {                    // ribs
        const a = (k / 9) * Math.PI;
        c.ellipse(Math.cos(a) * (w - 0.08), 0.05 + Math.sin(a) * 0.55 * (k % 2 ? 1 : -0.9), 0.03, 0.03, 650);
      }
      if (t > 0.25 && t < 0.4) c.ellipse(-0.5, -0.15, 0.045, 0.04, 30); // nodule
      return { wc: -600, ww: 1500, noise: 12 };
    },
    abdomen(c, t) {
      c.ellipse(0, 0.05, 0.94, 0.7, -100);              // fat
      c.ellipse(0, 0.05, 0.86, 0.62, 40);               // soft tissue
      if (t < 0.6) c.ellipse(-0.35, -0.05, 0.42 * (1 - t), 0.4 * (1 - t), 60); // liver
      if (t < 0.45) c.ellipse(0.55, 0.05, 0.16, 0.2, 50); // spleen
      if (t > 0.2 && t < 0.7) {
        c.ellipse(-0.3, 0.32, 0.12, 0.15, 160);         // kidneys
        c.ellipse(0.3, 0.32, 0.12, 0.15, 160);
      }
      c.ellipse(0.05, 0.15, 0.06, 0.06, 190);           // aorta
      c.ellipse(-0.08, 0.17, 0.06, 0.05, 120);          // IVC
      c.ellipse(0, 0.5, 0.12, 0.1, 700);                // vertebra
      c.ellipse(0, 0.5, 0.06, 0.05, 30);
      const r = rng(Math.floor(t * 100) + 7);
      for (let k = 0; k < 6; k++) {                     // bowel gas
        c.ellipse(r() * 1 - 0.4, r() * 0.6 - 0.4, 0.04 + r() * 0.05, 0.03 + r() * 0.04, -900);
      }
      if (t > 0.8) {                                    // pelvis
        c.ellipse(-0.55, 0.25, 0.14, 0.22, 600);
        c.ellipse(0.55, 0.25, 0.14, 0.22, 600);
        c.ellipse(0, 0.05, 0.16, 0.14, 10);             // bladder
      }
      return { wc: 50, ww: 400, noise: 10 };
    },
    brainMR(c, t) {
      const s = Math.sqrt(Math.max(0, 1 - ((t - 0.45) * 1.9) ** 2));
      c.ellipse(0, 0, 0.8 * s, 0.92 * s, 700);          // scalp fat
      c.ellipse(0, 0, 0.75 * s, 0.87 * s, 30);          // skull (dark)
      c.ellipse(0, 0, 0.7 * s, 0.82 * s, 950);          // CSF rim
      c.ellipse(0, 0, 0.66 * s, 0.78 * s, 520);         // grey matter
      c.ellipse(0, 0, 0.52 * s, 0.64 * s, 380);         // white matter
      if (t > 0.3 && t < 0.75) {
        const v = Math.sin(((t - 0.3) / 0.45) * Math.PI);
        c.ellipse(-0.1, -0.05, 0.06 * v, 0.28 * v, 1000);
        c.ellipse(0.1, -0.05, 0.06 * v, 0.28 * v, 1000);
        c.ellipse(-0.22, -0.2, 0.03 * v, 0.03 * v, 820); // white matter foci
        c.ellipse(0.21, 0.1, 0.025 * v, 0.03 * v, 820);
      }
      return { wc: 500, ww: 1000, noise: 18 };
    },
    cxr(c) {
      c.ellipse(0, 0.15, 0.95, 0.95, 260);              // body
      c.ellipse(-0.38, -0.05, 0.3, 0.6, -160, true);    // lungs (darker)
      c.ellipse(0.38, -0.05, 0.28, 0.6, -160, true);
      c.ellipse(0.1, 0.25, 0.32, 0.3, 180, true);       // heart
      c.ellipse(0, 0.1, 0.06, 0.95, 260, true);         // spine
      for (let k = 0; k < 8; k++) {                     // ribs
        const y = -0.55 + k * 0.14;
        c.ellipse(-0.38, y, 0.32, 0.018, 90, true);
        c.ellipse(0.38, y, 0.3, 0.018, 90, true);
      }
      c.ellipse(-0.35, -0.7, 0.3, 0.025, 160, true);    // clavicles
      c.ellipse(0.35, -0.7, 0.3, 0.025, 160, true);
      c.ellipse(-0.55, 0.55, 0.14, 0.06, 120, true);    // costophrenic fluid
      c.ellipse(0.55, 0.55, 0.12, 0.05, 120, true);
      return { wc: 300, ww: 600, noise: 6, blur: 3 };
    }
  };

  /** Generate a series of synthetic slices for a sample study. */
  function generateSeries(study, size) {
    size = size || 256;
    const gen = PHANTOMS[study.phantom];
    const frames = [];
    let window = { wc: 40, ww: 400 };
    const air = study.modality === "CT" ? -1000 : 0;
    for (let i = 0; i < study.slices; i++) {
      const t = study.slices === 1 ? 0.5 : i / (study.slices - 1);
      const c = makeCanvas(size, air);
      const opts = gen(c, t);
      if (opts.blur) blur(c.px, size, opts.blur);
      noise(c.px, opts.noise, rng(hash(study.id + ":" + i)));
      window = { wc: opts.wc, ww: opts.ww };
      frames.push({ width: size, height: size, pixels: c.px });
    }
    return { frames, window, invert: false };
  }

  return { parse, generateSeries };
})();
