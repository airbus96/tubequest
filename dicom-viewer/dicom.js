// Minimal DICOM Part 10 parser. Supports uncompressed little-endian
// transfer syntaxes (implicit and explicit VR), 8/16-bit greyscale,
// multi-frame and MONOCHROME1. Compressed (JPEG, RLE, ...) pixel data is
// rejected.

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


  return { parse };
})();
