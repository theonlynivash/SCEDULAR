import { generateTimetable } from './src/solver/pipeline.js'
import { listSections, listSectionSubjects } from './src/db/repo.js'

async function main() {
  const sections = await listSections()
  const sss = await listSectionSubjects()
  for (const scope of [
    { year: 'Year 2', semester: 'III' },
    { year: 'Year 3', semester: 'V' },
    { year: 'Year 4', semester: 'VII' },
  ]) {
    const res = await generateTimetable(scope)
    console.log(`\n=== ${scope.semester} (${scope.year}) ===`)
    console.log(`status: ${res.status} | assignments: ${res.assignments.length} | conflicts: ${res.conflicts.length} | unscheduled: ${res.unscheduled.length}`)
    if (res.warnings.length) console.log('warnings:', JSON.stringify(res.warnings.slice(0, 5)))
    if (res.infeasibilityReport) console.log('infeasibility:', res.infeasibilityReport.summary)
    for (const c of res.conflicts.slice(0, 10)) console.log('  conflict:', c.type, c.message)

    // Per-section slot fill: demand = sum(theory + lab) from sectionSubjects; assigned slots = sum(end-start+1)
    const secs = sections.filter(s => s.year === scope.year && s.semester === scope.semester && s.active !== false)
    for (const sec of secs) {
      const offered = sss.filter(ss => ss.sectionId === sec.id)
      let demand = 0
      for (const ss of offered) { demand += (ss.theoryPeriods ?? 0) + (ss.labPeriods ?? 0) }
      let assigned = 0
      let coiCount = 0
      for (const a of res.assignments) {
        if (a.sectionId !== sec.id) continue
        assigned += a.endPeriod - a.startPeriod + 1
        if (a.subjectId === 'SUB-23MC1002' || a.courseId === '23MC1002') coiCount++
      }
      const unsched = res.unscheduled.filter(u => (u as any).sectionId === sec.id).length
      console.log(`  ${sec.id}: demand=${demand} slots assigned=${assigned} unscheduled=${unsched} COI=${coiCount}`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })