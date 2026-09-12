import 'dotenv/config'
// Seeds a representative, real-world slice of the department's actual
// Year II / Semester III workload sheet (faculty names, subjects and
// section allocations taken from the department's faculty workload PDF),
// restricted to sections II-A .. II-D -- the same sections used as the
// worked example throughout the SCEDULAR project report. This is NOT the
// full college dataset; it exists to exercise the pipeline end-to-end
// against real names, real subjects and a real global-lab collision
// (OOP and DBMS share one physical lab, exactly as in Section 7's example).

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

async function main() {
  await ensureInitialized()

  const SECTIONS = ['II-A', 'II-B', 'II-C', 'II-D']

  for (const s of SECTIONS) {
    await upsertSection({ id: s, name: s, year: 'II', semester: 'III' })
  }

  await upsertCourse({ id: 'INT', code: '23AD1XXX', name: 'Internals of Computer Systems', componentType: 'NON_INTEGRATED', labBlockLength: 3 })
  await upsertCourse({ id: 'AIES', code: '23AD1311', name: 'Artificial Intelligence and Expert Systems', componentType: 'INTEGRATED', labBlockLength: 3 })
  await upsertCourse({ id: 'OOP', code: '23AD1312', name: 'Object Oriented Programming Paradigm', componentType: 'INTEGRATED', labBlockLength: 3 })
  await upsertCourse({ id: 'DBMS', code: '23CS1312', name: 'Database Management Systems', componentType: 'INTEGRATED', labBlockLength: 3 })

  await upsertLab({ id: 'LAB_AIES', name: 'AIES Lab' })
  await upsertLab({ id: 'LAB_OOP_DBMS', name: 'OOP + DBMS Shared Lab' })
  await upsertLab({ id: 'LAB_TSP', name: 'TSP Lab' })
  await setLabCourseMapping('LAB_AIES', 'AIES')
  await setLabCourseMapping('LAB_OOP_DBMS', 'OOP')
  await setLabCourseMapping('LAB_OOP_DBMS', 'DBMS')

  const faculty = [
    { id: 'FAC_ANNAPOORANI', name: 'Mrs. C. Annapoorani', designation: 'Asst. Professor' },
    { id: 'FAC_VETRISELVAN', name: 'Mr. M. Vetriselvan', designation: 'Asst. Professor' },
    { id: 'FAC_RAVEENA', name: 'Dr. S. Raveena', designation: 'Assoc. Professor' },
    { id: 'FAC_SELVABANUPRIYA', name: 'Dr. T. Selva Banu Priya', designation: 'Asst. Prof G1' },
    { id: 'FAC_BABISHA', name: 'Mrs. Babisha A', designation: 'Asst. Professor' },
    { id: 'FAC_KALIAPPAN', name: 'Mr. P. Kaliappan', designation: 'Asst. Professor' },
    { id: 'FAC_SARANYA', name: 'Mrs. K. Saranya', designation: 'Asst. Professor' },
    { id: 'FAC_SHYAMALA', name: 'Ms. P. Shyamala', designation: 'Asst. Professor' },
    { id: 'FAC_SANDHIYA', name: 'Ms. S. Sandhiya', designation: 'Asst. Professor' },
    { id: 'FAC_MAHAVAISHNAVI', name: 'Dr. V. Maha Vaishnavi', designation: 'Asst. Prof G1' },
  ]
  for (const f of faculty) {
    await upsertFaculty({ id: f.id, name: f.name, designation: f.designation, maxDailyPeriods: 6, maxWeeklyPeriods: 24 })
  }

  interface SectionCourseTeacher {
    section: string
    course: string
    faculty: string
    theory: number
    lab: number
  }

  const plan: SectionCourseTeacher[] = [
    { section: 'II-A', course: 'INT', faculty: 'FAC_ANNAPOORANI', theory: 4, lab: 0 },
    { section: 'II-B', course: 'INT', faculty: 'FAC_ANNAPOORANI', theory: 4, lab: 0 },
    { section: 'II-C', course: 'INT', faculty: 'FAC_ANNAPOORANI', theory: 4, lab: 0 },
    { section: 'II-D', course: 'INT', faculty: 'FAC_VETRISELVAN', theory: 4, lab: 0 },

    { section: 'II-A', course: 'AIES', faculty: 'FAC_RAVEENA', theory: 5, lab: 3 },
    { section: 'II-B', course: 'AIES', faculty: 'FAC_RAVEENA', theory: 5, lab: 3 },
    { section: 'II-C', course: 'AIES', faculty: 'FAC_SELVABANUPRIYA', theory: 5, lab: 3 },
    { section: 'II-D', course: 'AIES', faculty: 'FAC_BABISHA', theory: 5, lab: 3 },

    { section: 'II-A', course: 'OOP', faculty: 'FAC_KALIAPPAN', theory: 5, lab: 3 },
    { section: 'II-B', course: 'OOP', faculty: 'FAC_SARANYA', theory: 5, lab: 3 },
    { section: 'II-C', course: 'OOP', faculty: 'FAC_SHYAMALA', theory: 5, lab: 3 },
    { section: 'II-D', course: 'OOP', faculty: 'FAC_KALIAPPAN', theory: 5, lab: 3 },

    { section: 'II-A', course: 'DBMS', faculty: 'FAC_SANDHIYA', theory: 5, lab: 3 },
    { section: 'II-B', course: 'DBMS', faculty: 'FAC_SANDHIYA', theory: 5, lab: 3 },
    { section: 'II-C', course: 'DBMS', faculty: 'FAC_MAHAVAISHNAVI', theory: 5, lab: 3 },
    { section: 'II-D', course: 'DBMS', faculty: 'FAC_MAHAVAISHNAVI', theory: 5, lab: 3 },
  ]

  for (const p of plan) {
    await upsertTeacherAssignment({ facultyId: p.faculty, courseId: p.course, sectionId: p.section })
    await upsertCourseRequirement({
      courseId: p.course,
      sectionId: p.section,
      weeklyTheoryPeriods: p.theory,
      weeklyLabPeriods: p.lab,
    })
  }

  console.log(`Seeded ${SECTIONS.length} sections, 4 courses, 3 labs, ${faculty.length} faculty, ${plan.length} teacher assignments.`)
  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
