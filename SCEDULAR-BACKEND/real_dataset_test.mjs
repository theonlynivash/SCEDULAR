import fs from 'node:fs'
import path from 'node:path'
import { defaultScheduleConfig } from './src/utils/grid.js'
import { preValidate } from './src/solver/preValidate.js'
import { expandRequirements } from './src/solver/expand.js'
import { solve, diagnoseUnscheduled } from './src/solver/csp.js'
import { independentValidate } from './src/solver/validator.js'
import { previewWorkbook } from './src/import/index.js'

const excelPath = path.resolve(process.cwd(), '../SCEDULAR_REAL_DATA_FROM_PDFS_STAGE8.xlsx')
const buf = fs.readFileSync(excelPath)
const preview = previewWorkbook(buf)
if (preview.errors.length) {
  console.error('Import validation errors:', preview.errors)
  process.exit(1)
}
const data = preview.dataset

const config = defaultScheduleConfig()
const facultyMap = new Map(data.faculty.map(x=>[x.id,x]))
const subjectsMap = new Map(data.subjects.map(x=>[x.id,x]))

const sectionSubjects = data.sectionSubjects.map((ss, i) => ({ id: i + 1, ...ss }))
const ssMap = new Map()
for (const ss of sectionSubjects) {
  ssMap.set(`${ss.sectionId}::${ss.subjectId}`, ss.id)
}

const teachingAssignments = data.teachingAssignments.map((ta, i) => ({
  id: i + 1,
  facultyId: ta.facultyId,
  sectionSubjectId: ssMap.get(`${ta.sectionId}::${ta.subjectId}`) || i + 1,
  component: ta.component,
  batch: ta.batch ?? null,
}))

const labsBySubject = new Map()
const labsBySectionSubject = new Map()
for (const m of data.labMappings) {
  if (m.sectionId) {
    const k = `${m.sectionId}::${m.subjectId}`
    labsBySectionSubject.set(k, [...(labsBySectionSubject.get(k) || []), m.labId])
  } else {
    labsBySubject.set(m.subjectId, [...(labsBySubject.get(m.subjectId) || []), m.labId])
  }
}

console.log('REAL DATA SUMMARY')
for (const [k,v] of [
  ['sections',data.sections.length],
  ['subjects',data.subjects.length],
  ['sectionSubjects',sectionSubjects.length],
  ['faculty',data.faculty.length],
  ['teachingAssignments',teachingAssignments.length],
  ['labs',data.labs.length],
  ['labMappings',data.labMappings.length]
]) console.log(k,v)

const pre = preValidate({
  faculty:data.faculty,
  sections:data.sections,
  subjects:data.subjects,
  sectionSubjects,
  teachingAssignments,
  unavailability:data.facultyUnavailability || [],
  config,
  labsBySubject,
  labsBySectionSubject,
})
console.log('\nPRE-VALIDATE', pre.length)
for (const c of pre.slice(0,30)) console.log(c.type, c.message)
if (pre.length) process.exit(2)

const units = expandRequirements({
  sectionSubjects,
  subjects:subjectsMap,
  teachingAssignments,
  faculty:facultyMap,
  labsBySubject,
  labsBySectionSubject,
})
console.log('EXPANDED UNITS', units.length)
console.log('THEORY UNITS', units.filter(u=>u.blockType==='THEORY').length, 'LAB UNITS', units.filter(u=>u.blockType==='LAB').length)

const unavailability = data.facultyUnavailability || []
const labCapacityById = new Map(data.labs.map(l=>[l.id, l.capacity ?? 1]))
const t0=Date.now()
const solved = solve(units,data.faculty,unavailability,config,labsBySubject,labsBySectionSubject,labCapacityById)
console.log('SOLVER ms',Date.now()-t0,'assignments',solved.assignments.length,'unscheduled',solved.unscheduled.length,'budgetExceeded',solved.budgetExceeded)
if (solved.unscheduled.length) {
  const dx=diagnoseUnscheduled(solved.unscheduled,data.faculty,unavailability,units,labsBySubject,labsBySectionSubject)
  console.log('DIAGNOSTICS',dx.slice(0,20))
}

const conflicts = independentValidate({
  assignments:solved.assignments,
  sections:data.sections,
  subjects:data.subjects,
  sectionSubjects,
  teachingAssignments,
  faculty:data.faculty,
  unavailability,
  labs:data.labs,
  config,
  labsBySubject,
  labsBySectionSubject,
})
console.log('VALIDATOR CONFLICTS', conflicts.length)
for (const c of conflicts.slice(0,40)) console.log(c.type, c.message)

const bySec = new Map()
for (const a of solved.assignments) bySec.set(a.sectionId,(bySec.get(a.sectionId)||0)+1)
console.log('ASSIGNMENTS BY SECTION')
for (const s of data.sections) console.log(s.id, bySec.get(s.id)||0)

const labAssignments = solved.assignments.filter(a=>a.blockType==='LAB')
console.log('LAB ASSIGNMENTS', labAssignments.length)
for (const a of labAssignments.slice(0,20)) console.log(`${a.sectionId} ${a.subjectId} ${a.day} P${a.startPeriod}-P${a.endPeriod} ${a.facultyId} ${a.labId}`)

process.exit(solved.unscheduled.length || conflicts.length ? 1 : 0)

