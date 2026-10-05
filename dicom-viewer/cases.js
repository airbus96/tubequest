// Study types, findings and the demo case bank.
//
// Every case here is synthetic: images are drawn procedurally in dicom.js
// from the parameters below, so the ground truth is exact and no patient
// data is shipped. `plannedSource` records which open dataset would supply
// the real cases for each study type (see the data sources dialog).

const STUDY_TYPES = [
  {
    key: "cxr",
    name: "Chest X-ray",
    available: true,
    prefix: "CXR",
    plannedSource: "NIH ChestX-ray14 (finding labels; boxes on a subset)",
    findings: ["pneumothorax", "effusion", "consolidation", "nodule", "cardiomegaly"]
  },
  {
    key: "cthead",
    name: "CT head",
    available: true,
    prefix: "CTH",
    plannedSource: "CQ500 with BHX boxes, PhysioNet CT-ICH, CPAISD",
    findings: ["sdh", "edh", "sah", "iph", "infarct"]
  },
  {
    key: "ctthorax",
    name: "CT thorax",
    available: true,
    prefix: "CTT",
    plannedSource: "LIDC-IDRI (nodule outlines), NLST (no outlines)",
    findings: ["ctNodule", "ctEffusion", "ctPneumothorax"]
  },
  {
    key: "ctpa",
    name: "CTPA",
    available: false,
    note: "No open dataset yet. Awaiting permission for RSNA PE."
  },
  {
    key: "ctap",
    name: "CT abdomen-pelvis",
    available: false,
    note: "No open acute dataset yet. Awaiting permission for Merlin or RSNA abdominal trauma."
  }
];

const FINDINGS = {
  // Chest X-ray
  pneumothorax: {
    name: "Pneumothorax",
    sentence: (p) => `${cap(p.side)} pneumothorax with a visible lung edge and absent lung markings peripherally.`,
    impression: (p) => `${cap(p.side)} pneumothorax.`
  },
  effusion: {
    name: "Pleural effusion",
    sentence: (p) => `${cap(p.side)} pleural effusion with a meniscus, blunting the costophrenic angle.`,
    impression: (p) => `${cap(p.side)} pleural effusion.`
  },
  consolidation: {
    name: "Consolidation",
    sentence: (p) => `Airspace opacification in the ${p.side} ${p.zone} zone, in keeping with consolidation.`,
    impression: (p) => `${cap(p.side)} ${p.zone} zone consolidation.`
  },
  nodule: {
    name: "Pulmonary nodule",
    sentence: (p) => `A ${p.mm} mm rounded opacity in the ${p.side} ${p.zone} zone.`,
    impression: (p) => `${cap(p.side)} ${p.zone} zone nodule. CT is recommended.`
  },
  cardiomegaly: {
    name: "Cardiomegaly",
    sentence: () => "The cardiothoracic ratio is increased.",
    impression: () => "Cardiomegaly."
  },
  // CT head
  sdh: {
    name: "Subdural haemorrhage",
    sentence: (p) => `Crescentic hyperdense extra-axial collection over the ${p.side} cerebral convexity, in keeping with acute subdural haematoma.`,
    impression: (p) => `Acute ${p.side} subdural haematoma.`
  },
  edh: {
    name: "Extradural haemorrhage",
    sentence: (p) => `Biconvex hyperdense extra-axial collection over the ${p.side} hemisphere, in keeping with acute extradural haematoma.`,
    impression: (p) => `Acute ${p.side} extradural haematoma.`
  },
  sah: {
    name: "Subarachnoid haemorrhage",
    sentence: () => "Hyperdensity within the basal cisterns and Sylvian fissures, in keeping with subarachnoid haemorrhage.",
    impression: () => "Acute subarachnoid haemorrhage. CT angiography is recommended."
  },
  iph: {
    name: "Intraparenchymal haemorrhage",
    sentence: (p) => `A ${p.mm} mm hyperdense intraparenchymal haematoma in the ${p.side} cerebral hemisphere.`,
    impression: (p) => `Acute ${p.side} intraparenchymal haemorrhage.`
  },
  infarct: {
    name: "Acute infarct",
    sentence: (p) => `Wedge-shaped hypodensity with loss of grey-white differentiation in the ${p.side} MCA territory.`,
    impression: (p) => `Acute ${p.side} MCA territory infarct.`
  },
  // CT thorax
  ctNodule: {
    name: "Lung nodule",
    sentence: (p) => `A ${p.mm} mm solid nodule in the ${p.side} ${p.lobe} lobe.`,
    impression: (p) => `${p.mm} mm ${p.side} ${p.lobe} lobe nodule. Follow-up per nodule guidelines.`
  },
  ctEffusion: {
    name: "Pleural effusion",
    sentence: (p) => `A ${p.size} ${p.side} pleural effusion layering dependently.`,
    impression: (p) => `${cap(p.size)} ${p.side} pleural effusion.`
  },
  ctPneumothorax: {
    name: "Pneumothorax",
    sentence: (p) => `A ${p.size} anterior ${p.side} pneumothorax.`,
    impression: (p) => `${cap(p.size)} ${p.side} pneumothorax.`
  }
};

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CASES = (function () {
  "use strict";

  let seed = 20261005;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const NORMAL = {
    cxr: { findings: "The lungs are clear. No pleural effusion or pneumothorax. Heart size is normal.", impression: "Normal chest radiograph." },
    cthead: { findings: "No intracranial haemorrhage, mass effect or established infarct. Ventricles and sulci are normal.", impression: "No acute intracranial abnormality." },
    ctthorax: { findings: "The lungs are clear with no nodule. No pleural effusion or pneumothorax.", impression: "Normal CT thorax." }
  };
  const CLINICAL = {
    cxr: ["Shortness of breath.", "Pleuritic chest pain.", "Cough and fever.", "Pre-operative assessment.", "Fall, chest wall pain."],
    cthead: ["Fall from standing, GCS 14.", "Sudden severe headache.", "Acute onset left-sided weakness.", "Road traffic collision.", "Confusion, on anticoagulation."],
    ctthorax: ["Persistent cough.", "Breathlessness.", "Smoker, weight loss.", "Chest pain after procedure."]
  };
  const TECHNIQUE = {
    cxr: "Single PA chest radiograph.",
    cthead: "Non-contrast axial CT of the head.",
    ctthorax: "Axial CT of the thorax, lung windows."
  };
  const COUNT = { cxr: 30, cthead: 30, ctthorax: 20 };
  const SLICES = { cxr: 1, cthead: 24, ctthorax: 30 };

  function params(key) {
    const side = rand() < 0.5 ? "right" : "left";
    switch (key) {
      case "consolidation": return { side, zone: pick(["upper", "middle", "lower"]) };
      case "nodule": return { side, zone: pick(["upper", "middle", "lower"]), mm: 12 + Math.floor(rand() * 14) };
      case "iph": return { side, mm: 20 + Math.floor(rand() * 20) };
      case "ctNodule": return { side, lobe: pick(["upper", "lower"]), mm: 8 + Math.floor(rand() * 14) };
      case "ctEffusion":
      case "ctPneumothorax": return { side, size: pick(["small", "moderate", "large"]) };
      default: return { side };
    }
  }

  // Whether a finding has an expert-verified overlay or only a label,
  // mirroring what each planned dataset provides. The first case of every
  // finding is always verified so learners get real feedback from day one.
  function overlayKind(type, key, isFirst) {
    if (isFirst || type === "cthead") return "verified";
    if (type === "ctthorax" && key === "ctNodule") return "verified";
    return rand() < 0.4 ? "verified" : "label";
  }

  const out = [];
  STUDY_TYPES.filter((t) => t.available).forEach((type) => {
    const seen = new Set();
    let k = 0;
    for (let i = 0; i < COUNT[type.key]; i++) {
      const findings = [];
      if (i % 5 !== 4) {
        const keys = [type.findings[k++ % type.findings.length]];
        if (rand() < 0.25) {
          const extra = pick(type.findings.filter((f) => f !== keys[0]));
          keys.push(extra);
        }
        keys.forEach((key) => {
          findings.push({ key, params: params(key), overlay: overlayKind(type.key, key, !seen.has(key)) });
          seen.add(key);
        });
      }
      const report = findings.length
        ? {
            findings: findings.map((f) => FINDINGS[f.key].sentence(f.params)).join(" ") + " No other abnormality.",
            impression: findings.map((f) => FINDINGS[f.key].impression(f.params)).join(" ")
          }
        : NORMAL[type.key];
      out.push({
        id: `${type.prefix}-${String(i + 1).padStart(3, "0")}`,
        type: type.key,
        seed: Math.floor(rand() * 1e9),
        slices: SLICES[type.key],
        findings,
        clinical: pick(CLINICAL[type.key]),
        technique: TECHNIQUE[type.key],
        report
      });
    }
  });
  return out;
})();
