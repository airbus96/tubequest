# DICOM Viewer

A simple, dependency-free DICOM viewer. It has a worklist, an image viewer and a report panel, with filter bars along the top.

Open `index.html` in a browser. There is no build step.

## Features

- **Filter bar:** free-text search across patient name, MRN, accession number, description and report text, plus filters for modality, body part, report status, priority and a date range.
- **Viewer:**
  - Window/level, pan, zoom and slice-scroll tools.
  - CT window presets, invert and cine playback.
  - Mouse wheel scrolls slices; Ctrl/⌘ + wheel zooms. Right-drag adjusts W/L, middle-drag pans.
  - Keyboard: ↑/↓ change slice, R resets the view, I inverts, Space plays cine.
- **Report panel:** shows the selected study's report (clinical details, technique, findings, impression). It has its own find box; when that box is empty, it highlights the top-bar search terms instead.
- **Local files:** "Open DICOM…" (or drag-and-drop onto the viewer) loads uncompressed DICOM files. It supports implicit and explicit VR little endian, 8/16-bit greyscale, multi-frame and MONOCHROME1. Several files are stacked into one series by instance number. Compressed transfer syntaxes (JPEG, RLE, …) are rejected with a message.

## Sample data

`data.js` holds 10 sample studies. All patients and reports are **fictional**. Their images are generated procedurally in `dicom.js`, so no real patient data is included. Files you open locally stay in the browser and are never uploaded.
