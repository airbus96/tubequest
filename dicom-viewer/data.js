// Sample worklist. All patients, identifiers and reports are fictional and
// exist only to demonstrate the viewer. Images are generated procedurally
// from the `phantom` key (see dicom.js) — no real patient data is included.

const STUDIES = [
  {
    id: "S1001",
    accession: "ACC-24-0001",
    patient: { name: "DOE^JANE", id: "MRN-100231", sex: "F", age: 54 },
    date: "2026-09-28",
    modality: "CT",
    bodyPart: "Head",
    description: "CT Head without contrast",
    phantom: "head",
    slices: 24,
    status: "Final",
    priority: "Urgent",
    radiologist: "Dr A. Example",
    report: {
      clinical: "Sudden onset headache. Exclude intracranial haemorrhage.",
      technique: "Non-contrast axial CT of the head, 5 mm reconstructions.",
      findings:
        "No acute intracranial haemorrhage, mass effect or midline shift. Grey-white matter differentiation is preserved. The ventricles and sulci are of normal size for age. Basal cisterns are patent. No calvarial fracture. Visualised paranasal sinuses and mastoid air cells are clear.",
      impression: "No acute intracranial abnormality."
    }
  },
  {
    id: "S1002",
    accession: "ACC-24-0002",
    patient: { name: "SMITH^JOHN", id: "MRN-100488", sex: "M", age: 67 },
    date: "2026-09-27",
    modality: "CT",
    bodyPart: "Chest",
    description: "CT Chest with contrast",
    phantom: "chest",
    slices: 30,
    status: "Final",
    priority: "Routine",
    radiologist: "Dr B. Sample",
    report: {
      clinical: "Persistent cough, 40 pack-year smoking history.",
      technique: "Axial CT of the chest following IV contrast, 3 mm reconstructions.",
      findings:
        "A 14 mm spiculated nodule in the right upper lobe. No further pulmonary nodules. No pleural effusion or pneumothorax. No mediastinal or hilar lymphadenopathy. Heart size is normal. No pericardial effusion. Mild centrilobular emphysema in both upper lobes.",
      impression:
        "14 mm spiculated right upper lobe nodule, suspicious for malignancy. Recommend respiratory MDT referral and PET-CT."
    }
  },
  {
    id: "S1003",
    accession: "ACC-24-0003",
    patient: { name: "PATEL^PRIYA", id: "MRN-100512", sex: "F", age: 38 },
    date: "2026-09-26",
    modality: "MR",
    bodyPart: "Head",
    description: "MRI Brain T2",
    phantom: "brainMR",
    slices: 20,
    status: "Preliminary",
    priority: "Routine",
    radiologist: "Dr C. Placeholder",
    report: {
      clinical: "Intermittent visual disturbance. Query demyelination.",
      technique: "Multiplanar multisequence MRI brain. Axial T2 shown.",
      findings:
        "Several small T2 hyperintense foci in the periventricular white matter, the largest measuring 6 mm, oriented perpendicular to the lateral ventricles. No mass lesion. Normal flow voids. No restricted diffusion.",
      impression:
        "Periventricular white matter lesions; appearances could represent demyelination. Correlate clinically and consider post-contrast imaging."
    }
  },
  {
    id: "S1004",
    accession: "ACC-24-0004",
    patient: { name: "GARCIA^LUIS", id: "MRN-100777", sex: "M", age: 45 },
    date: "2026-09-25",
    modality: "CT",
    bodyPart: "Abdomen",
    description: "CT Abdomen/Pelvis with contrast",
    phantom: "abdomen",
    slices: 32,
    status: "Final",
    priority: "Urgent",
    radiologist: "Dr A. Example",
    report: {
      clinical: "Right iliac fossa pain, raised inflammatory markers.",
      technique: "Portal venous phase CT of the abdomen and pelvis.",
      findings:
        "The appendix is dilated to 11 mm with periappendiceal fat stranding. No appendicolith seen. No free gas or drainable collection. Liver, spleen, pancreas and kidneys are unremarkable. No hydronephrosis. Bladder is unremarkable.",
      impression: "Acute uncomplicated appendicitis."
    }
  },
  {
    id: "S1005",
    accession: "ACC-24-0005",
    patient: { name: "NGUYEN^MAI", id: "MRN-100803", sex: "F", age: 72 },
    date: "2026-09-24",
    modality: "CR",
    bodyPart: "Chest",
    description: "Chest X-ray PA",
    phantom: "cxr",
    slices: 1,
    status: "Final",
    priority: "Routine",
    radiologist: "Dr B. Sample",
    report: {
      clinical: "Shortness of breath. Known heart failure.",
      technique: "Single PA chest radiograph.",
      findings:
        "Cardiothoracic ratio is increased. Upper lobe venous diversion. Small bilateral pleural effusions with blunting of the costophrenic angles. No pneumothorax. No focal consolidation.",
      impression: "Appearances in keeping with cardiac failure with small bilateral pleural effusions."
    }
  },
  {
    id: "S1006",
    accession: "ACC-24-0006",
    patient: { name: "OKAFOR^EMEKA", id: "MRN-100915", sex: "M", age: 29 },
    date: "2026-09-22",
    modality: "CT",
    bodyPart: "Head",
    description: "CT Head trauma",
    phantom: "head",
    slices: 24,
    status: "Unreported",
    priority: "Stat",
    radiologist: "",
    report: null
  },
  {
    id: "S1007",
    accession: "ACC-24-0007",
    patient: { name: "BROWN^SARAH", id: "MRN-101024", sex: "F", age: 61 },
    date: "2026-09-20",
    modality: "MR",
    bodyPart: "Head",
    description: "MRI Brain follow-up",
    phantom: "brainMR",
    slices: 20,
    status: "Final",
    priority: "Routine",
    radiologist: "Dr C. Placeholder",
    report: {
      clinical: "Follow-up of known meningioma.",
      technique: "Axial T2 and post-contrast T1 MRI brain.",
      findings:
        "Stable 18 mm extra-axial lesion along the left frontal convexity, unchanged from prior. No surrounding oedema. No new lesion. Ventricles normal in size.",
      impression: "Stable left frontal convexity meningioma. Routine follow-up in 12 months."
    }
  },
  {
    id: "S1008",
    accession: "ACC-24-0008",
    patient: { name: "WILSON^TOM", id: "MRN-101187", sex: "M", age: 58 },
    date: "2026-09-18",
    modality: "CT",
    bodyPart: "Chest",
    description: "CTPA",
    phantom: "chest",
    slices: 30,
    status: "Final",
    priority: "Urgent",
    radiologist: "Dr A. Example",
    report: {
      clinical: "Pleuritic chest pain, tachycardia, raised D-dimer.",
      technique: "CT pulmonary angiogram.",
      findings:
        "Filling defects in the right lower lobe segmental pulmonary arteries consistent with pulmonary emboli. RV:LV ratio less than 1. No pleural effusion. Lungs are otherwise clear.",
      impression: "Right lower lobe segmental pulmonary emboli. No CT evidence of right heart strain."
    }
  },
  {
    id: "S1009",
    accession: "ACC-24-0009",
    patient: { name: "KIM^JIWOO", id: "MRN-101233", sex: "F", age: 47 },
    date: "2026-09-15",
    modality: "CT",
    bodyPart: "Abdomen",
    description: "CT KUB",
    phantom: "abdomen",
    slices: 32,
    status: "Preliminary",
    priority: "Routine",
    radiologist: "Dr B. Sample",
    report: {
      clinical: "Left loin to groin pain. Query renal calculus.",
      technique: "Low-dose non-contrast CT of the kidneys, ureters and bladder.",
      findings:
        "A 4 mm calculus at the left vesicoureteric junction with mild proximal hydroureteronephrosis. No other urinary tract calculi. Right kidney is unremarkable.",
      impression: "4 mm obstructing left VUJ calculus with mild hydronephrosis."
    }
  },
  {
    id: "S1010",
    accession: "ACC-24-0010",
    patient: { name: "MULLER^ANNA", id: "MRN-101306", sex: "F", age: 83 },
    date: "2026-09-12",
    modality: "CR",
    bodyPart: "Chest",
    description: "Chest X-ray AP portable",
    phantom: "cxr",
    slices: 1,
    status: "Unreported",
    priority: "Routine",
    radiologist: "",
    report: null
  }
];
