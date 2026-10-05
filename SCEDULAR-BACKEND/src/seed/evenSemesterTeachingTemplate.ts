// EVEN SEMESTER Teaching Assignment Templates
// Subject catalog extracted from curriculumRoster.ts for Semesters IV, VI, VIII.
//
// INSTRUCTIONS:
// 1. For each subject below, create rows in the format:
//    { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23xxx', component: 'THEORY'|'LAB', batch: null }
// 2. One row per (section, subject, component) combination.
// 3. Set the sectionId to match your actual section IDs (e.g. 'Y2S4-A' or 'Y2-A').
// 4. After filling in all rows, rename this file to confirmedTeachingAssignmentsEven.ts
//    and import it in localDb.ts alongside CONFIRMED_TEACHING_ASSIGNMENTS_ODD.
//
// Faculty roster: Use IDs from facultyRoster.ts (FAC-001 through FAC-067).

export interface EvenSemesterTeachingTemplate {
  facultyId: string       // FAC-xxx from facultyRoster.ts
  sectionId: string       // Section ID (must match a section in resourceRoster.ts)
  subjectCode: string     // Subject code from curriculumRoster.ts
  component: 'THEORY' | 'LAB'
  batch: string | null    // null for single-batch, or 'A'/'B' for parallel batches
}

// ============================================================
// YEAR 2 / SEMESTER IV — Subjects from curriculumRoster.ts
// ============================================================
// Subjects requiring assignments (INTEGRATED = THEORY + LAB, LAB = LAB only):
//   23MA1405  Probability & Statistical Techniques for DS (THEORY, 3 periods)
//   23AD1401  Machine Learning (THEORY, 3 periods)
//   23AD1402  Basics of Data Science (THEORY, 3 periods)
//   23AD1403  Software Development and Practices (THEORY, 3 periods)
//   23AD1404  System Software and Operating Systems (INTEGRATED, theory 3 + lab 2)
//   23AD1411  Machine Learning Laboratory (LAB, 3 periods) ← needs LAB mapping
//   23AD1412  Data Science Laboratory (LAB, 3 periods) ← needs LAB mapping
//   23ES1411  Technical Skill Practices III (THEORY, 3 periods)
//   23HS1401  Skills for Career Building and Development II (THEORY, 3 periods)
//   23HS1402  Quantitative Aptitude Practices IV (THEORY, 3 periods)

export const SEM_IV_SUBJECTS = [
  { code: '23MA1405', name: 'Probability and Statistical Techniques for Data Science', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23AD1401', name: 'Machine Learning', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23AD1402', name: 'Basics of Data Science', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23AD1403', name: 'Software Development and Practices', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23AD1404', name: 'System Software and Operating Systems', type: 'INTEGRATED', theory: 3, lab: 2 },
  { code: '23AD1411', name: 'Machine Learning Laboratory', type: 'LAB', theory: 0, lab: 3 },
  { code: '23AD1412', name: 'Data Science Laboratory', type: 'LAB', theory: 0, lab: 3 },
  { code: '23ES1411', name: 'Technical Skill Practices III', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23HS1401', name: 'Skills for Career Building and Development II', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23HS1402', name: 'Quantitative Aptitude Practices IV', type: 'THEORY', theory: 3, lab: 0 },
] as const

// TODO: Fill in your real teaching assignments below.
// Example for one section (Y2S4-A):
export const SEM_IV_TEACHING_ASSIGNMENTS: EvenSemesterTeachingTemplate[] = [
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23MA1405', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23AD1401', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23AD1402', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23AD1403', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23AD1404', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23AD1404', component: 'LAB', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23AD1411', component: 'LAB', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23AD1412', component: 'LAB', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23ES1411', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23HS1401', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y2S4-A', subjectCode: '23HS1402', component: 'THEORY', batch: null },
  // ... repeat for Y2S4-B through Y2S4-L
]

// ============================================================
// YEAR 3 / SEMESTER VI — Subjects from curriculumRoster.ts
// ============================================================
// Subjects requiring assignments:
//   23AD1601  Deep Learning (THEORY, 3 periods)
//   23AD1603  Business Analytics (THEORY, 3 periods)
//   23AD1605  Computer Vision (INTEGRATED, theory 3 + lab 2) ← needs LAB mapping
//   23AD1606  AI in Robotics (INTEGRATED, theory 3 + lab 2) ← needs LAB mapping
//   23AD1611  Deep Learning Laboratory (LAB, 3 periods) ← needs LAB mapping
//   23ES1611  Technical Skill Practices V (THEORY, 3 periods)

export const SEM_VI_SUBJECTS = [
  { code: '23AD1601', name: 'Deep Learning', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23AD1603', name: 'Business Analytics', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23AD1605', name: 'Computer Vision', type: 'INTEGRATED', theory: 3, lab: 2 },
  { code: '23AD1606', name: 'AI in Robotics', type: 'INTEGRATED', theory: 3, lab: 2 },
  { code: '23AD1611', name: 'Deep Learning Laboratory', type: 'LAB', theory: 0, lab: 3 },
  { code: '23ES1611', name: 'Technical Skill Practices V', type: 'THEORY', theory: 3, lab: 0 },
] as const

export const SEM_VI_TEACHING_ASSIGNMENTS: EvenSemesterTeachingTemplate[] = [
  // TODO: Fill in real teaching assignments for Y3S6-A through Y3S6-H
  // Example:
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23AD1601', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23AD1603', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23AD1605', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23AD1605', component: 'LAB', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23AD1606', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23AD1606', component: 'LAB', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23AD1611', component: 'LAB', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y3S6-A', subjectCode: '23ES1611', component: 'THEORY', batch: null },
  // ... repeat for Y3S6-B through Y3S6-H
]

// ============================================================
// YEAR 4 / SEMESTER VIII — Subjects from curriculumRoster.ts
// ============================================================
// NOTE: Sem VIII is primarily Project Work + Professional Electives.
// The core structure below covers the standard subjects. Your actual
// elective choices will vary per student vertical/stream.
//
// Subjects requiring assignments:
//   23AD1811  Project Work (PROJECT, 0 theory + 0 lab — typically no timetable slot)
//   23HS1701  Climate Change and Sustainability (THEORY, 3 periods) — if offered this sem
//   Professional Elective 1 (THEORY, 3 periods) — pick from vertical
//   Professional Elective 2 (THEORY, 3 periods) — pick from vertical
//   Open Elective (THEORY, 3 periods) — cross-departmental
//   23MC1001  Environmental Science (MC — mandatory course, THEORY delivery, 3 periods)
//   23MC1003  Human Values (MC — mandatory course, THEORY delivery, 3 periods)
//   23IT1908  Project Management and Agile Technologies (EEC, THEORY, 3 periods)

export const SEM_VIII_SUBJECTS = [
  { code: '23AD1811', name: 'Project Work', type: 'PROJECT', theory: 0, lab: 0 },
  { code: '23IT1908', name: 'Project Management and Agile Technologies', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23MC1001', name: 'Environmental Science', type: 'THEORY', theory: 3, lab: 0 },
  { code: '23MC1003', name: 'Human Values', type: 'THEORY', theory: 3, lab: 0 },
  // TODO: Add your chosen Professional Elective(s) and Open Elective from the curriculum
  // { code: '23AD1901', name: 'Data Warehousing and Data Mining', type: 'THEORY', theory: 3, lab: 0 },
  // { code: '23AD1902', name: 'Exploratory Data Analysis', type: 'THEORY', theory: 3, lab: 0 },
] as const

export const SEM_VIII_TEACHING_ASSIGNMENTS: EvenSemesterTeachingTemplate[] = [
  // TODO: Fill in real teaching assignments for Y4S8-A through Y4S8-H
  // Note: PROJECT-type subjects (23AD1811) typically don't need timetable slots.
  // Example:
  // { facultyId: 'FAC-xxx', sectionId: 'Y4S8-A', subjectCode: '23IT1908', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y4S8-A', subjectCode: '23MC1001', component: 'THEORY', batch: null },
  // { facultyId: 'FAC-xxx', sectionId: 'Y4S8-A', subjectCode: '23MC1003', component: 'THEORY', batch: null },
  // ... repeat for Y4S8-B through Y4S8-H
]

// ============================================================
// EVEN SEMESTER Lab Mapping Templates
// ============================================================
// Only INTEGRATED and LAB subjects need lab room mappings.
// Fill in the real lab room IDs from the department's lab timetable.
// Available lab rooms: CC15, CC16, CC17, CC18, CC19, CC23, CC24, CC25, CC43, CC46

export interface EvenSemesterLabMapping {
  labId: string           // Lab room ID from resourceRoster.ts
  subjectCode: string     // Subject code
  sectionId: string       // Section ID
}

// Sem IV lab subjects that need mappings:
//   23AD1404 (INTEGRATED — System Software & OS) → needs lab mapping for theory+lab
//   23AD1411 (LAB — Machine Learning Lab) → needs lab mapping
//   23AD1412 (LAB — Data Science Lab) → needs lab mapping

export const SEM_IV_LAB_MAPPINGS: EvenSemesterLabMapping[] = [
  // TODO: Fill in real lab room assignments
  // { labId: 'CC17', subjectCode: '23AD1411', sectionId: 'Y2S4-A' },
  // { labId: 'CC18', subjectCode: '23AD1412', sectionId: 'Y2S4-A' },
  // { labId: 'CC23', subjectCode: '23AD1404', sectionId: 'Y2S4-A' },
  // ... repeat for all sections
]

// Sem VI lab subjects that need mappings:
//   23AD1605 (INTEGRATED — Computer Vision) → needs lab mapping
//   23AD1606 (INTEGRATED — AI in Robotics) → needs lab mapping
//   23AD1611 (LAB — Deep Learning Lab) → needs lab mapping

export const SEM_VI_LAB_MAPPINGS: EvenSemesterLabMapping[] = [
  // TODO: Fill in real lab room assignments
  // { labId: 'CC17', subjectCode: '23AD1611', sectionId: 'Y3S6-A' },
  // { labId: 'CC18', subjectCode: '23AD1605', sectionId: 'Y3S6-A' },
  // { labId: 'CC19', subjectCode: '23AD1606', sectionId: 'Y3S6-A' },
  // ... repeat for all sections
]

// Sem VIII: No INTEGRATED or LAB subjects (Project Work has 0 lab periods).
// No lab mappings needed unless your electives include a lab component.
export const SEM_VIII_LAB_MAPPINGS: EvenSemesterLabMapping[] = [
  // Typically empty for Sem VIII. Add only if electives have lab components.
]
