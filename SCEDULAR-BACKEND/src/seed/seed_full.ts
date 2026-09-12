import 'dotenv/config'
// Full Year II / Semester III dataset -- all 12 sections (II-A .. II-L) --
// transcribed directly from the department's own printed weekly timetables
// ("II YEAR TT 29.06.26.pdf", one page per section, each with its own
// "SUBJECT HANDLING THEORY" / "PRACTICALS" staff tables). This supersedes
// the earlier reconstruction from the AI&DS workload-only PDF, which had
// no data at all for Mathematical Foundations for AI, Constitution of
// India, Skills for Career Development and Quantitative Aptitude (those
// are Math/Humanities/Placement-cell load, outside that sheet's scope).
// This file gives the real per-section teacher for every one of the 10
// subjects, so no placeholder teacher is used anywhere below.
//
// Known simplifications (documented, not hidden -- Section 10's principle):
// - Several lab rows list two co-teaching staff for one section (parallel
//   batches), e.g. II-K's AIES lab is "Ms.Vaishnavi/Mr.R.Selvam". The
//   current data model seats one faculty per lab block, so only the first
//   ("lead") name printed is kept; the second is the co-teacher for the
//   other batch.
// - The department's demo resource list ("one shared OOP+DBMS lab") is
//   only sized for a handful of sections. Scheduling all 12 sections' real
//   weekly lab demand (12 AIES + 12 OOP + 12 DBMS three-period blocks)
//   needs more than one physical room per course, so this seed configures
//   2 rooms per lab course -- still a hard, shared, collision-checked
//   resource, just sized for the real section count.
// - Spelling is normalized across sections for the same person (e.g. "Dr.
//   R. Sudharani" appears as "SUDAHRANII"/"SUDHARANI"/"SUDHARANII" on
//   different pages; "Mrs. Geriyashakthi" vs "Mrs. Giriyasakthi").

import { ensureInitialized, pool } from '../db/client.js'
import {
  setLabCourseMapping,
  upsertCourse,
  upsertCourseRequirement,
  upsertFaculty,
  upsertLab,
  upsertSection,
  upsertTeacherAssignment,
} from '../db/repo.js'

interface CourseDef {
  id: string
  code: string
  name: string
  componentType: 'INTEGRATED' | 'NON_INTEGRATED' | 'MANDATORY' | 'LAB_ONLY'
  theory: number
  lab: number
  labBlockLength: number
}

interface SectionPlan {
  MFAI: string; INT: string
  AIES: string; AIES_LAB?: string
  OOP: string; OOP_LAB?: string
  DBMS: string; DBMS_LAB?: string
  COI: string; QAP: string; SCD: string; TSP: string; LIB: string
}

async function main() {
  await ensureInitialized()

  await pool.query(`
    DELETE FROM unscheduled;
    DELETE FROM conflicts;
    DELETE FROM assignments;
    DELETE FROM generation_runs;
    DELETE FROM teacher_assignments;
    DELETE FROM course_requirements;
    DELETE FROM lab_course_mapping;
    DELETE FROM labs;
    DELETE FROM courses;
    DELETE FROM faculty_unavailability;
    DELETE FROM faculty;
    DELETE FROM sections;
  `)

  const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  for (const l of SECTION_LETTERS) {
    await upsertSection({ id: `II-${l}`, name: `II-${l}`, year: 'II', semester: 'III' })
  }

  // -- Courses -------------------------------------------------------------
  // weeklyTheory / weeklyLab / labBlockLength are constant across all 12
  // sections (confirmed identical "Hours Allocated" on every section's page).
  const COURSES: CourseDef[] = [
    { id: 'MFAI', code: '23MA1304', name: 'Mathematical Foundations for Artificial Intelligence', componentType: 'NON_INTEGRATED', theory: 5, lab: 0, labBlockLength: 3 },
    { id: 'INT', code: '23AD1301', name: 'Internals of Computer Systems', componentType: 'NON_INTEGRATED', theory: 4, lab: 0, labBlockLength: 3 },
    { id: 'AIES', code: '23AD1311', name: 'Artificial Intelligence and Expert Systems', componentType: 'INTEGRATED', theory: 5, lab: 3, labBlockLength: 3 },
    { id: 'OOP', code: '23AD1312', name: 'Object Oriented Programming Paradigm', componentType: 'INTEGRATED', theory: 5, lab: 3, labBlockLength: 3 },
    { id: 'DBMS', code: '23CS1312', name: 'Database Management Systems', componentType: 'INTEGRATED', theory: 5, lab: 3, labBlockLength: 3 },
    { id: 'COI', code: '23MC1002', name: 'Constitution of India', componentType: 'MANDATORY', theory: 1, lab: 0, labBlockLength: 3 },
    { id: 'QAP', code: '23HS1302', name: 'Quantitative Aptitude Practices III', componentType: 'MANDATORY', theory: 1, lab: 0, labBlockLength: 3 },
    { id: 'SCD', code: '23HS1301', name: 'Skills for Career Building and Development I', componentType: 'MANDATORY', theory: 2, lab: 0, labBlockLength: 3 },
    { id: 'LIB', code: 'LIBRARY', name: 'Library', componentType: 'MANDATORY', theory: 1, lab: 0, labBlockLength: 3 },
    { id: 'TSP', code: '23ES1311', name: 'Technical Skill Practices II', componentType: 'LAB_ONLY', theory: 0, lab: 2, labBlockLength: 2 },
  ]
  for (const c of COURSES) {
    await upsertCourse({ id: c.id, code: c.code, name: c.name, componentType: c.componentType, labBlockLength: c.labBlockLength })
  }

  // -- Labs ------------------------------------------------------------------
  await upsertLab({ id: 'LAB_AIES_1', name: 'AIES Lab 1' })
  await upsertLab({ id: 'LAB_AIES_2', name: 'AIES Lab 2' })
  await upsertLab({ id: 'LAB_OOP_1', name: 'OOP Lab 1' })
  await upsertLab({ id: 'LAB_OOP_2', name: 'OOP Lab 2' })
  await upsertLab({ id: 'LAB_DBMS_1', name: 'DBMS Lab 1' })
  await upsertLab({ id: 'LAB_DBMS_2', name: 'DBMS Lab 2' })
  await upsertLab({ id: 'LAB_TSP', name: 'TSP Lab' })
  for (const l of ['LAB_AIES_1', 'LAB_AIES_2']) await setLabCourseMapping(l, 'AIES')
  for (const l of ['LAB_OOP_1', 'LAB_OOP_2']) await setLabCourseMapping(l, 'OOP')
  for (const l of ['LAB_DBMS_1', 'LAB_DBMS_2']) await setLabCourseMapping(l, 'DBMS')
  await setLabCourseMapping('LAB_TSP', 'TSP')

  // -- Faculty ----------------------------------------------------------------
  const FACULTY: Record<string, string> = {
    ANNAPOORANI: 'Mrs. C. Annapoorani',
    VETRISELVAN: 'Mr. M. Vetriselvan',
    BALAABIRAMI: 'Mrs. B. Bala Abirami',
    SUGANYADEVI: 'Ms. J. Suganya Devi',
    SELVABANUPRIYA: 'Dr. T. Selva Banu Priya',
    BABISHA: 'Mrs. Babisha A',
    SELVAM: 'Mr. R. Selvam',
    PADMAPRIYA: 'Mrs. S. Padma Priya',
    VAISHNAVI: 'Ms. R. Vaishnavi',
    RAVEENA: 'Dr. S. Raveena',
    SARANYA: 'Mrs. K. Saranya',
    SHYAMALA: 'Ms. P. Shyamala',
    KALIAPPAN: 'Mr. P. Kaliappan',
    SRINIDHI: 'Dr. S. Srinidhi',
    NIVEDHA: 'Ms. Nivedha',
    GIRIYASAKTHI: 'Mrs. D. K. Giriyasakthi',
    MAHAVAISHNAVI: 'Dr. V. Maha Vaishnavi',
    KALAICHELVI: 'Dr. T. Kalaichelvi',
    SANDHIYA: 'Ms. S. Sandhiya',
    KALAIMANI: 'Mrs. D. Kalaimani',
    ANGELINE: 'Ms. T. Angeline',
    SHAJI: 'Dr. D. S. Shaji',
    VIVEK: 'Dr. C. Vivek',
    JEGAN: 'Dr. R. Jegan',
    SUDHARANI: 'Dr. R. Sudharani',
    JANAKI: 'Dr. E. Janaki',
    VALARMATHI: 'Mrs. Valarmathi',
    SANGEETHA: 'Mrs. Sangeetha',
    SELVAKUMARI: 'Dr. Selvakumari',
    ANITHAFLORENCE: 'Mrs. Anitha Florence',
    DEBBISHARON: 'Mrs. Debbi Sharon',
    KAVITHA_MATH: 'Dr. M. Kavitha', // Math dept -- distinct from Mrs. T. Kavitha (OOP)
  }
  for (const [key, name] of Object.entries(FACULTY)) {
    await upsertFaculty({ id: `FAC_${key}`, name, designation: 'Faculty', maxDailyPeriods: 8, maxWeeklyPeriods: 24 })
  }

  // -- Per-section teacher table, transcribed directly from each section's
  // printed "SUBJECT HANDLING THEORY" / "PRACTICALS" tables. Lab teacher
  // only given where it differs from the theory teacher; co-teacher (the
  // name after "/") is dropped -- see file-header simplification note.
  const PLAN: Record<string, SectionPlan> = {
    A: { MFAI: 'JEGAN', INT: 'ANNAPOORANI', AIES: 'RAVEENA', OOP: 'KALIAPPAN', DBMS: 'SANDHIYA', COI: 'VALARMATHI', QAP: 'JEGAN', SCD: 'ANITHAFLORENCE', TSP: 'ANNAPOORANI', LIB: 'VIVEK' },
    B: { MFAI: 'SUDHARANI', INT: 'ANNAPOORANI', AIES: 'RAVEENA', OOP: 'SARANYA', DBMS: 'SANDHIYA', COI: 'VALARMATHI', QAP: 'SUDHARANI', SCD: 'ANITHAFLORENCE', TSP: 'ANNAPOORANI', LIB: 'VETRISELVAN' },
    C: { MFAI: 'JANAKI', INT: 'ANNAPOORANI', AIES: 'SELVABANUPRIYA', OOP: 'SHYAMALA', DBMS: 'MAHAVAISHNAVI', COI: 'SANGEETHA', QAP: 'JANAKI', SCD: 'ANITHAFLORENCE', TSP: 'ANNAPOORANI', LIB: 'SHAJI' },
    D: { MFAI: 'JANAKI', INT: 'VETRISELVAN', AIES: 'BABISHA', AIES_LAB: 'RAVEENA', OOP: 'KALIAPPAN', DBMS: 'MAHAVAISHNAVI', COI: 'SANGEETHA', QAP: 'JANAKI', SCD: 'ANITHAFLORENCE', TSP: 'KALIAPPAN', LIB: 'GIRIYASAKTHI' },
    E: { MFAI: 'JEGAN', INT: 'BALAABIRAMI', AIES: 'SELVABANUPRIYA', OOP: 'SHYAMALA', DBMS: 'MAHAVAISHNAVI', DBMS_LAB: 'ANGELINE', COI: 'SANGEETHA', QAP: 'JEGAN', SCD: 'ANITHAFLORENCE', TSP: 'VETRISELVAN', LIB: 'SELVABANUPRIYA' },
    F: { MFAI: 'SUDHARANI', INT: 'VETRISELVAN', AIES: 'PADMAPRIYA', OOP: 'SARANYA', DBMS: 'SANDHIYA', DBMS_LAB: 'KALAIMANI', COI: 'SANGEETHA', QAP: 'SUDHARANI', SCD: 'ANITHAFLORENCE', TSP: 'VETRISELVAN', LIB: 'SHYAMALA' },
    G: { MFAI: 'JEGAN', INT: 'BALAABIRAMI', AIES: 'PADMAPRIYA', OOP: 'SRINIDHI', DBMS: 'KALAIMANI', COI: 'VALARMATHI', QAP: 'JEGAN', SCD: 'ANITHAFLORENCE', TSP: 'SRINIDHI', LIB: 'SELVABANUPRIYA' },
    H: { MFAI: 'JANAKI', INT: 'VETRISELVAN', AIES: 'BABISHA', OOP: 'SRINIDHI', DBMS: 'KALAIMANI', COI: 'VALARMATHI', QAP: 'JANAKI', SCD: 'ANITHAFLORENCE', TSP: 'BALAABIRAMI', LIB: 'PADMAPRIYA' },
    I: { MFAI: 'KAVITHA_MATH', INT: 'SUGANYADEVI', AIES: 'SELVAM', OOP: 'NIVEDHA', DBMS: 'KALAICHELVI', COI: 'SELVAKUMARI', QAP: 'KAVITHA_MATH', SCD: 'DEBBISHARON', TSP: 'SUGANYADEVI', LIB: 'PADMAPRIYA' },
    J: { MFAI: 'KAVITHA_MATH', INT: 'SUGANYADEVI', AIES: 'SELVAM', OOP: 'NIVEDHA', DBMS: 'KALAICHELVI', COI: 'SELVAKUMARI', QAP: 'KAVITHA_MATH', SCD: 'DEBBISHARON', TSP: 'SUGANYADEVI', LIB: 'VETRISELVAN' },
    K: { MFAI: 'KAVITHA_MATH', INT: 'SUGANYADEVI', AIES: 'VAISHNAVI', OOP: 'GIRIYASAKTHI', DBMS: 'ANGELINE', COI: 'SELVAKUMARI', QAP: 'KAVITHA_MATH', SCD: 'DEBBISHARON', TSP: 'SUGANYADEVI', LIB: 'SHAJI' },
    L: { MFAI: 'SUDHARANI', INT: 'BALAABIRAMI', AIES: 'VAISHNAVI', OOP: 'GIRIYASAKTHI', DBMS: 'ANGELINE', COI: 'SELVAKUMARI', QAP: 'SUDHARANI', SCD: 'DEBBISHARON', TSP: 'BALAABIRAMI', LIB: 'GIRIYASAKTHI' },
  }

  const courseById = new Map(COURSES.map(c => [c.id, c]))

  async function assign(section: string, courseId: string, facultyKey: string, theory: number, lab: number) {
    await upsertTeacherAssignment({ facultyId: `FAC_${facultyKey}`, courseId, sectionId: section })
    await upsertCourseRequirement({ courseId, sectionId: section, weeklyTheoryPeriods: theory, weeklyLabPeriods: lab })
  }

  // A handful of sections (II-D AIES, II-E DBMS, II-F DBMS) have their lab
  // taught by someone other than the theory teacher. The data model seats
  // one faculty per (course, section), so representing that split honestly
  // -- rather than collapsing both onto one already-busy teacher, which
  // makes their week artificially tighter than reality -- means giving that
  // section's lab its own LAB_ONLY sibling course, sharing the same physical
  // lab pool as the parent integrated course.
  await upsertCourse({ id: 'AIES_LAB_ONLY', code: '23AD1311L', name: 'Artificial Intelligence and Expert Systems Laboratory', componentType: 'LAB_ONLY', labBlockLength: 3 })
  await upsertCourse({ id: 'DBMS_LAB_ONLY', code: '23CS1312L', name: 'Database Management Systems Laboratory', componentType: 'LAB_ONLY', labBlockLength: 3 })
  await setLabCourseMapping('LAB_AIES_1', 'AIES_LAB_ONLY')
  await setLabCourseMapping('LAB_AIES_2', 'AIES_LAB_ONLY')
  await setLabCourseMapping('LAB_DBMS_1', 'DBMS_LAB_ONLY')
  await setLabCourseMapping('LAB_DBMS_2', 'DBMS_LAB_ONLY')

  for (const letter of SECTION_LETTERS) {
    const section = `II-${letter}`
    const p = PLAN[letter]
    const mfai = courseById.get('MFAI')!, int = courseById.get('INT')!
    const aies = courseById.get('AIES')!, oop = courseById.get('OOP')!, dbms = courseById.get('DBMS')!
    const coi = courseById.get('COI')!, qap = courseById.get('QAP')!, scd = courseById.get('SCD')!
    const tsp = courseById.get('TSP')!, lib = courseById.get('LIB')!

    await assign(section, 'MFAI', p.MFAI, mfai.theory, 0)
    await assign(section, 'INT', p.INT, int.theory, 0)

    if (p.AIES_LAB) {
      await assign(section, 'AIES', p.AIES, aies.theory, 0)
      await assign(section, 'AIES_LAB_ONLY', p.AIES_LAB, 0, aies.lab)
    } else {
      await assign(section, 'AIES', p.AIES, aies.theory, aies.lab)
    }

    await assign(section, 'OOP', p.OOP_LAB ?? p.OOP, oop.theory, oop.lab) // no section has an OOP theory/lab split

    if (p.DBMS_LAB) {
      await assign(section, 'DBMS', p.DBMS, dbms.theory, 0)
      await assign(section, 'DBMS_LAB_ONLY', p.DBMS_LAB, 0, dbms.lab)
    } else {
      await assign(section, 'DBMS', p.DBMS, dbms.theory, dbms.lab)
    }

    await assign(section, 'COI', p.COI, coi.theory, 0)
    await assign(section, 'QAP', p.QAP, qap.theory, 0)
    await assign(section, 'SCD', p.SCD, scd.theory, 0)
    await assign(section, 'TSP', p.TSP, 0, tsp.lab)
    await assign(section, 'LIB', p.LIB, lib.theory, 0)
  }

  console.log(`Seeded ${SECTION_LETTERS.length} sections, ${COURSES.length + 2} courses, 7 lab rooms, ${Object.keys(FACULTY).length} faculty.`)
  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
