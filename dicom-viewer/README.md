# Findings Trainer

A prototype of a free platform where medical students and junior doctors learn to find findings on imaging through repetition. It has no dependencies and no build step: open `index.html` in a browser.

## How it works

1. Pick a **study type** (chest X-ray, CT head or CT thorax) and press **Random case** (or N).
2. Look at the images first. **Show findings** (F) reveals the labelled findings and the report. **Overlay** (O) shows where each finding is.
3. Use **Drill finding** to practise one finding, for example pneumothorax or subarachnoid haemorrhage, across many cases. **Unseen only** skips cases you've already opened. **Search** matches case IDs, findings and report text.
4. Use the **Outline** tool (D) to draw where you think the finding is:
   - **Verified overlay:** **Check outline** scores your outline against the expert mask using a Dice score. A score of 30% or more counts as found.
   - **Label only** (the dataset has a label but no overlay): reveal the findings, then **Submit as label**. Your outline is saved as a community label, weighted by your accuracy on verified cases. The first submission asks you to accept the draft contributor terms.
5. **Rate this label** (Good / Poor) sends low-rated overlays to a radiologist review queue. **I can't see it** flags the case, which helps catch wrong labels, and reveals the answer.

CTPA and CT abdomen-pelvis appear as "soon". No open dataset covers them yet (see **Data sources**).

The viewer has window/level, pan, zoom and slice-scroll tools, CT window presets, invert and cine playback. **Open DICOM…** (or drag-and-drop) loads your own uncompressed DICOM files. These are for viewing only; they aren't scored.

## Data

Every case is **synthetic**. `cases.js` defines the case bank (80 cases, with finding parameters and reports). `phantoms.js` draws the images in the browser, together with an exact per-slice mask for each finding. No patient data is included.

Which findings are "verified" and which are "label only" mirrors what each planned dataset provides:
- CT head: all verified, as with CQ500/BHX boxes and CT-ICH masks.
- CT thorax: nodules verified (LIDC-IDRI); other findings partly label-only (NLST has no outlines).
- Chest X-ray: mostly label-only (ChestX-ray14).

The first case of every finding is always verified, so early learners get real feedback.

Progress, flags, ratings and community labels are stored in this browser's `localStorage`. A real deployment needs a backend to pool labels across users.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Layout: filter bar, case list, viewer, findings panel |
| `app.js` | Case selection, drilling, overlays, outlining and scoring, trust weighting |
| `cases.js` | Study types, finding definitions, synthetic case bank |
| `phantoms.js` | Procedural images and ground-truth masks |
| `dicom.js` | Minimal parser for uncompressed DICOM files (implicit/explicit VR little endian) |
