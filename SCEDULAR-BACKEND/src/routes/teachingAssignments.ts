import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  addTeachingAssignment,
  listTeachingAssignments,
  removeTeachingAssignment,
  listSectionSubjects,
  listSubjects,
  listSections,
  listFaculty,
  getFacultyPreferences,
  bulkReplaceTeachingAssignments,
  getCurrentAcademicCycle,
} from '../db/repo.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import {
  SEMESTER_TO_YEAR,
  isSpecificSemester,
  semesterInCycle,
  cycleOfSemester,
} from '../utils/academicCycle.js'

export const teachingAssignmentsRouter = Router()

const schema = z.object({
  facultyId: z.string().min(1),
  sectionSubjectId: z.number().int().positive(),
  component: z.enum(['THEORY', 'LAB']),
  batch: z.string().nullable().optional(),
})

// Components a subject delivery type may be allocated as (Section 5, rules 10/11).
function allowedComponents(deliveryType: string): Array<'THEORY' | 'LAB'> {
  if (deliveryType === 'INTEGRATED') return ['THEORY', 'LAB']
  if (deliveryType === 'LAB') return ['LAB']
  return ['THEORY']
}

// A section counts as covered for a subject only when every component its
// delivery type requires has been assigned (used for NOT_STARTED/PARTIAL/FULL).
function isCovered(deliveryType: string, components: Set<string>): boolean {
  if (deliveryType === 'INTEGRATED') return components.has('THEORY') && components.has('LAB')
  if (deliveryType === 'LAB') return components.has('LAB')
  return components.has('THEORY')
}

/**
 * Resolve and validate the (year, semester) context for a section-allocation
 * request. The semester must be a specific semester inside the CURRENT academic
 * cycle, and the year must be its canonical mapping — this blocks cross-semester
 * and stale year/semester combinations server-side (Section 12).
 */
async function resolveContext(year: string, semester: string): Promise<
  | { ok: false; status: number; code: string; message: string }
  | { ok: true; currentCycle: string; semester: string; year: string }
> {
  const currentCycle = await getCurrentAcademicCycle()
  if (!isSpecificSemester(semester)) {
    return { ok: false, status: 400, code: 'INVALID_SEMESTER', message: `Semester "${semester}" is not a specific semester (I–VIII).` }
  }
  if (!semesterInCycle(semester, currentCycle)) {
    return {
      ok: false,
      status: 400,
      code: 'CYCLE_MISMATCH',
      message: `Semester ${semester} (${cycleOfSemester(semester)} cycle) is outside the current ${currentCycle} academic cycle.`,
    }
  }
  const canonicalYear = SEMESTER_TO_YEAR[semester]
  if (year && year !== canonicalYear) {
    return {
      ok: false,
      status: 400,
      code: 'YEAR_MISMATCH',
      message: `Semester ${semester} belongs to ${canonicalYear}, not ${year}.`,
    }
  }
  return { ok: true, currentCycle, semester, year: canonicalYear }
}

teachingAssignmentsRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    res.json(await listTeachingAssignments())
  } catch (err) {
    next(err)
  }
})

// GET /api/teaching-assignments/section-allocation?year=Year 2&semester=IV
// HOD-only. Returns the approved-faculty pool, per-section offerings with their
// current assignments, and DB-derived coverage (required / approved / assigned /
// shortage / status) for one semester of the current academic cycle.
teachingAssignmentsRouter.get('/section-allocation', requireAuth, requireRole('HOD'), async (req: Request, res: Response, next) => {
  try {
    const ctx = await resolveContext(String(req.query.year || ''), String(req.query.semester || ''))
    if (!ctx.ok) {
      return res.status(ctx.status).json({ error: ctx.code, message: ctx.message })
    }
    const { year, semester, currentCycle } = ctx

    const [allSections, allSubjects, allSectionSubjects, allFaculty, allPrefs, allAssignments] = await Promise.all([
      listSections(),
      listSubjects(),
      listSectionSubjects(),
      listFaculty(),
      getFacultyPreferences(),
      listTeachingAssignments(),
    ])

    const targetSections = allSections.filter(s => s.year === year && s.semester === semester && s.active !== false)
    const sectionIds = new Set(targetSections.map(s => s.id))
    const targetSubjects = allSubjects.filter(s => s.year === year && s.semester === semester)
    const targetSectionSubjects = allSectionSubjects.filter(ss => sectionIds.has(ss.sectionId))
    const targetSSIds = new Set(targetSectionSubjects.map(ss => ss.id))

    const targetAssignments = allAssignments.filter(ta => targetSSIds.has(ta.sectionSubjectId))
    const approvedPrefs = allPrefs.filter(p => p.academicYear === year && p.semester === semester && p.status === 'APPROVED')

    const subjectDetails = targetSubjects.map(subj => {
      const offerings = targetSectionSubjects.filter(ss => ss.subjectId === subj.id)
      const approvedFacultyForSubj = approvedPrefs
        .filter(p => p.subjectId === subj.id)
        .map(p => {
          const fac = allFaculty.find(f => f.id === p.facultyId)
          const assignedSections = new Set(
            targetAssignments
              .filter(ta => {
                const ss = targetSectionSubjects.find(x => x.id === ta.sectionSubjectId)
                return ss?.subjectId === subj.id && ta.facultyId === p.facultyId
              })
              .map(ta => targetSectionSubjects.find(x => x.id === ta.sectionSubjectId)!.sectionId)
          )
          return {
            facultyId: p.facultyId,
            facultyName: fac?.name || p.facultyId,
            approvedSectionsCapacity: p.requestedSections,
            assignedSections: assignedSections.size,
            remainingCapacity: Math.max(0, p.requestedSections - assignedSections.size),
            labConfirmed: p.labConfirmed,
            allocationExperience: fac?.allocationExperience ?? 0,
          }
        })

      const totalApprovedCapacity = approvedFacultyForSubj.reduce((sum, f) => sum + f.approvedSectionsCapacity, 0)
      const requiredSections = offerings.length

      // Coverage: a section is covered when all required components are assigned.
      const componentsBySection = new Map<string, Set<string>>()
      for (const off of offerings) {
        for (const ta of targetAssignments.filter(x => x.sectionSubjectId === off.id)) {
          const set = componentsBySection.get(off.sectionId) ?? new Set<string>()
          set.add(ta.component)
          componentsBySection.set(off.sectionId, set)
        }
      }
      const assignedSections = offerings.filter(off =>
        isCovered(subj.deliveryType, componentsBySection.get(off.sectionId) ?? new Set())
      ).length

      const status = assignedSections === 0 ? 'NOT_STARTED' : assignedSections >= requiredSections ? 'FULL' : 'PARTIAL'
      const shortage = Math.max(0, requiredSections - assignedSections)

      return {
        subjectId: subj.id,
        code: subj.code,
        name: subj.name,
        deliveryType: subj.deliveryType,
        requiredSections,
        totalApprovedCapacity,
        assignedSections,
        shortage,
        status,
        approvedFacultyPool: approvedFacultyForSubj,
        offerings: offerings.map(ss => ({
          sectionSubjectId: ss.id,
          sectionId: ss.sectionId,
          theoryPeriods: ss.theoryPeriods,
          labPeriods: ss.labPeriods,
          currentAssignments: targetAssignments.filter(ta => ta.sectionSubjectId === ss.id),
        })),
      }
    })

    return res.json({
      year,
      semester,
      currentCycle,
      sections: targetSections,
      subjects: subjectDetails,
      assignments: targetAssignments,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/teaching-assignments/commit-section-allocation
// HOD-only. Deterministic backend enforcement of the full Section-5 rule set.
// The frontend state is never trusted: every rule below is re-verified here.
teachingAssignmentsRouter.post('/commit-section-allocation', requireAuth, requireRole('HOD'), async (req: Request, res: Response, next) => {
  try {
    const { year, semester, allocations } = req.body

    if (!semester || !Array.isArray(allocations)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'semester and allocations array are required' })
    }

    const ctx = await resolveContext(String(year || ''), String(semester))
    if (!ctx.ok) {
      return res.status(ctx.status).json({ error: ctx.code, message: ctx.message })
    }
    const resolvedYear = ctx.year

    const [allSections, allSubjects, allSectionSubjects, allFaculty, allPrefs] = await Promise.all([
      listSections(),
      listSubjects(),
      listSectionSubjects(),
      listFaculty(),
      getFacultyPreferences(),
    ])

    const subjectMap = new Map(allSubjects.map(s => [s.id, s]))
    const facultyMap = new Map(allFaculty.map(f => [f.id, f]))
    const activeSections = allSections.filter(s => s.year === resolvedYear && s.semester === semester && s.active !== false)
    const activeSectionIds = new Set(activeSections.map(s => s.id))
    const targetSectionSubjects = allSectionSubjects.filter(ss => activeSectionIds.has(ss.sectionId))
    const targetSSMap = new Map(targetSectionSubjects.map(ss => [ss.id, ss]))
    const targetSSIds = Array.from(targetSSMap.keys())
    const approvedPrefs = allPrefs.filter(p => p.academicYear === resolvedYear && p.semester === semester && p.status === 'APPROVED')

    // Rule 10: component must be THEORY or LAB.
    for (const alloc of allocations) {
      if (alloc.component !== 'THEORY' && alloc.component !== 'LAB') {
        return res.status(400).json({ error: 'INVALID_COMPONENT', message: `Component must be THEORY or LAB (received "${alloc.component}").` })
      }
    }

    // Rule 3: no duplicate (faculty + sectionSubject + component + batch).
    const seenKeys = new Set<string>()
    for (const alloc of allocations) {
      const key = `${alloc.facultyId}:${alloc.sectionSubjectId}:${alloc.component}:${alloc.batch || ''}`
      if (seenKeys.has(key)) {
        return res.status(400).json({
          error: 'DUPLICATE_ALLOCATION',
          message: `Duplicate allocation for faculty ${alloc.facultyId} on section-subject ${alloc.sectionSubjectId} (${alloc.component}).`,
        })
      }
      seenKeys.add(key)
    }

    // Rules 4–9, 11, 12: per-allocation structural checks.
    for (const alloc of allocations) {
      const ss = targetSSMap.get(alloc.sectionSubjectId)
      // Rule 9 + 6 + 7: sectionSubject must exist and belong to an active section
      // in the selected semester/year (inactive or cross-semester sections are
      // absent from targetSSMap).
      if (!ss) {
        const anySs = allSectionSubjects.find(x => x.id === alloc.sectionSubjectId)
        const sec = anySs ? allSections.find(s => s.id === anySs.sectionId) : undefined
        if (anySs && sec && sec.active === false) {
          return res.status(400).json({ error: 'INACTIVE_SECTION', message: `Section ${sec.name || sec.id} is inactive and cannot be allocated.` })
        }
        return res.status(400).json({
          error: 'INVALID_SECTION_SUBJECT',
          message: `SectionSubject ${alloc.sectionSubjectId} does not belong to an active ${resolvedYear} Semester ${semester} section.`,
        })
      }

      // Rule 5: faculty must exist (active roster member).
      const fac = facultyMap.get(alloc.facultyId)
      if (!fac) {
        return res.status(400).json({ error: 'INACTIVE_FACULTY', message: `Faculty ${alloc.facultyId} is not an active roster member.` })
      }

      const subj = subjectMap.get(ss.subjectId)
      if (!subj) {
        return res.status(400).json({ error: 'INVALID_SUBJECT', message: `Subject ${ss.subjectId} is not canonical.` })
      }
      // Rule 8: subject must belong to the selected semester/year.
      if (subj.semester !== semester || subj.year !== resolvedYear) {
        return res.status(400).json({
          error: 'CROSS_SEMESTER',
          message: `Subject ${subj.code} belongs to ${subj.year} Semester ${subj.semester}, not ${resolvedYear} Semester ${semester}.`,
        })
      }

      // Rule 11: component must be valid for the subject's delivery type.
      if (!allowedComponents(subj.deliveryType).includes(alloc.component)) {
        return res.status(400).json({
          error: 'INVALID_COMPONENT_FOR_SUBJECT',
          message: `${subj.code} is a ${subj.deliveryType} subject and cannot be allocated a ${alloc.component} component.`,
        })
      }

      // Rule 4: faculty must be HOD-approved for this subject.
      const approval = approvedPrefs.find(p => p.facultyId === alloc.facultyId && p.subjectId === ss.subjectId)
      if (!approval) {
        return res.status(400).json({
          error: 'FACULTY_NOT_APPROVED',
          message: `Faculty ${fac.name} is NOT HOD-approved to teach ${subj.name}.`,
        })
      }

      // Rule 12: LAB responsibility requires an explicit lab confirmation.
      if (alloc.component === 'LAB' && !approval.labConfirmed) {
        return res.status(400).json({
          error: 'LAB_NOT_CONFIRMED',
          message: `Faculty ${fac.name} has not confirmed laboratory responsibility for ${subj.code}; cannot assign the LAB component.`,
        })
      }
    }

    // Rules 1 & 2: capacity and required-section ceilings.
    const assignmentsByFacultySubject = new Map<string, Set<string>>()
    const assignmentsBySubjectSections = new Map<string, Set<string>>()

    for (const alloc of allocations) {
      const ss = targetSSMap.get(alloc.sectionSubjectId)!
      const fsKey = `${alloc.facultyId}:${ss.subjectId}`
      const secSet = assignmentsByFacultySubject.get(fsKey) ?? new Set<string>()
      secSet.add(ss.sectionId)
      assignmentsByFacultySubject.set(fsKey, secSet)

      const subjSecSet = assignmentsBySubjectSections.get(ss.subjectId) ?? new Set<string>()
      subjSecSet.add(ss.sectionId)
      assignmentsBySubjectSections.set(ss.subjectId, subjSecSet)
    }

    for (const [fsKey, secSet] of assignmentsByFacultySubject.entries()) {
      const [facId, subjId] = fsKey.split(':')
      const pref = approvedPrefs.find(p => p.facultyId === facId && p.subjectId === subjId)
      const approvedCap = pref ? pref.requestedSections : 0
      const fac = facultyMap.get(facId)
      const subj = subjectMap.get(subjId)
      if (secSet.size > approvedCap) {
        return res.status(400).json({
          error: 'FACULTY_CAPACITY_EXCEEDED',
          message: `Faculty ${fac?.name || facId} is assigned ${secSet.size} section(s) for ${subj?.name || subjId}, exceeding the approved capacity of ${approvedCap}.`,
        })
      }
    }

    for (const [subjId, secSet] of assignmentsBySubjectSections.entries()) {
      const requiredSectionsCount = targetSectionSubjects.filter(ss => ss.subjectId === subjId).length
      const subj = subjectMap.get(subjId)
      if (secSet.size > requiredSectionsCount) {
        return res.status(400).json({
          error: 'REQUIRED_SECTIONS_EXCEEDED',
          message: `Assigned section count (${secSet.size}) for ${subj?.name || subjId} exceeds the required section count (${requiredSectionsCount}).`,
        })
      }
    }

    const createdIds = await bulkReplaceTeachingAssignments(
      targetSSIds,
      allocations.map(a => ({
        facultyId: a.facultyId,
        sectionSubjectId: a.sectionSubjectId,
        component: a.component,
        batch: a.batch || null,
      }))
    )

    return res.json({
      success: true,
      message: `Successfully saved ${createdIds.length} section allocation(s) for ${resolvedYear} Semester ${semester}.`,
      assignedCount: createdIds.length,
    })
  } catch (err) {
    next(err)
  }
})

teachingAssignmentsRouter.post('/', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const p = schema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: p.error.flatten() })
    const id = await addTeachingAssignment({ ...p.data, batch: p.data.batch ?? null })
    res.status(201).json({ id, ...p.data, batch: p.data.batch ?? null })
  } catch (err) {
    next(err)
  }
})

teachingAssignmentsRouter.delete('/:id', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid assignment id' })
    await removeTeachingAssignment(id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
