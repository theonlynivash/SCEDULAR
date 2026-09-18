import assert from 'node:assert/strict'
import { solve } from '../src/solver/csp.ts'
import { expandRequirements } from '../src/solver/expand.ts'
import { independentValidate } from '../src/solver/validator.ts'
import { defaultScheduleConfig } from '../src/utils/grid.ts'

const config = defaultScheduleConfig()
const faculty = [
  {id:'F1',name:'Theory',designation:null,maxDailyPeriods:8,maxWeeklyPeriods:40},
  {id:'F2',name:'Lab',designation:null,maxDailyPeriods:8,maxWeeklyPeriods:40},
]
const sections = [{id:'Y2A',name:'II-A',year:'2',semester:'3',studentCount:30}]
const subjects = [{id:'DBMS',code:'DBMS',name:'Database',deliveryType:'INTEGRATED',category:'CORE'}]
const sectionSubjects = [{id:1,sectionId:'Y2A',subjectId:'DBMS',theoryPeriods:2,labPeriods:3,labBlockLength:3}]
const teachingAssignments = [
  {id:1,facultyId:'F1',sectionSubjectId:1,component:'THEORY',batch:null},
  {id:2,facultyId:'F2',sectionSubjectId:1,component:'LAB',batch:null},
]
const labs = [{id:'LAB1',name:'DBMS Lab',capacity:40}]
const labsBySubject = new Map([['DBMS',['LAB1']]])

// 1. Expansion preserves integrated theory/lab demand and distinct faculty.
const units = expandRequirements({sectionSubjects,subjects:new Map(subjects.map(s=>[s.id,s])),teachingAssignments,faculty:new Map(faculty.map(f=>[f.id,f])),labsBySubject})
assert.equal(units.filter(u=>u.blockType==='THEORY').length,2)
assert.equal(units.filter(u=>u.blockType==='LAB').length,1)
assert.deepEqual(new Set(units.filter(u=>u.blockType==='THEORY').flatMap(u=>u.facultyIds ?? [])), new Set(['F1']))
assert.deepEqual(new Set(units.filter(u=>u.blockType==='LAB').flatMap(u=>u.facultyIds ?? [])), new Set(['F2']))

// 2. Solver can produce a complete integrated timetable.
const solved = solve(units,faculty,[],config,labsBySubject)
assert.equal(solved.unscheduled.length,0)
assert.equal(solved.assignments.length,3)
const lab = solved.assignments.find(a=>a.blockType==='LAB')
assert.equal(lab.endPeriod-lab.startPeriod+1,3)
assert.equal(lab.labId,'LAB1')

// 3. Independent validator accepts the generated schedule.
const conflicts = independentValidate({assignments:solved.assignments,sections,subjects,sectionSubjects,teachingAssignments,faculty,unavailability:[],labs,config,labsBySubject})
assert.equal(conflicts.length,0, JSON.stringify(conflicts,null,2))

// 4. Validator catches a faculty collision.
const theory = solved.assignments.find(a=>a.blockType==='THEORY')
const badFaculty = [...solved.assignments]
badFaculty.push({...theory})
const facultyConflicts = independentValidate({assignments:badFaculty,sections,subjects,sectionSubjects,teachingAssignments,faculty,unavailability:[],labs,config,labsBySubject})
assert.ok(facultyConflicts.some(c=>c.type==='TEACHER_COLLISION'))

// 5. Validator catches lab crossing a real-time break (P3 -> P4).
const crossing = solved.assignments.map(a=>a.blockType==='LAB' ? {...a,day:'MON',startPeriod:3,endPeriod:5} : a)
const crossingConflicts = independentValidate({assignments:crossing,sections,subjects,sectionSubjects,teachingAssignments,faculty,unavailability:[],labs,config,labsBySubject})
assert.ok(crossingConflicts.some(c=>c.type==='LAB_CONFLICT' || c.type==='INVALID_INPUT'))

// 6. Unavailable faculty is rejected.
const unavailableConflicts = independentValidate({assignments:solved.assignments,sections,subjects,sectionSubjects,teachingAssignments,faculty,unavailability:[{facultyId:lab.facultyId,day:lab.day,period:lab.startPeriod}],labs,config,labsBySubject})
assert.ok(unavailableConflicts.some(c=>c.type==='TEACHER_UNAVAILABLE'))

// 7. Impossible faculty capacity is rejected by pre-solver semantics via no slots.
const impossibleFaculty = [{...faculty[0],maxWeeklyPeriods:1},faculty[1]]
const impossible = solve(units,impossibleFaculty,[],config,labsBySubject)
assert.ok(impossible.unscheduled.length>0 || impossible.assignments.length<units.length)

console.log('STAGE6 TESTS: PASS')
