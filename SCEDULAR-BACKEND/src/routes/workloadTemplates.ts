import { Router } from 'express'
import { z } from 'zod'
import { getLocalDb } from '../db/localDb.js'
import {
  listWorkloadTemplates,
  createWorkloadTemplate,
  updateWorkloadTemplate,
  deleteWorkloadTemplate,
  listFacultyWorkloadAllocations,
  createFacultyWorkloadAllocation,
  approveFacultyWorkloadAllocations,
  getFaculty,
  listSubjects,
  listSections,
  listSectionSubjects,
  listTeachingAssignments,
} from '../db/repo.js'
import { requireAuth, requireRole } from '../auth/middleware.js'

export const workloadTemplatesRouter = Router()

const createTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  theoryPeriodsPerSection: z.number().int().nonnegative(),
  labPeriodsPerSection: z.number().int().nonnegative(),
  description: z.string().optional(),
})

const allocateWorkloadSchema = z.object({
  semester: z.string().min(1),
  subjectId: z.string().min(1),
  templateId: z.string().min(1),
  facultyId: z.string().min(1),
  assignedSectionIds: z.array(z.string()).optional().default([]),
})

// 1. GET /api/workload-templates — List all workload templates
workloadTemplatesRouter.get('/workload-templates', async (_req, res, next) => {
  try {
    const templates = await listWorkloadTemplates()
    res.json(templates)
  } catch (err) {
    next(err)
  }
})

// 2. POST /api/workload-templates — Create a new workload template
workloadTemplatesRouter.post('/workload-templates', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const parsed = createTemplateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() })
    }

    if (parsed.data.theoryPeriodsPerSection + parsed.data.labPeriodsPerSection === 0) {
      return res.status(400).json({
        error: 'INVALID_TEMPLATE',
        message: 'A workload template must contain at least 1 theory or lab period per section.',
      })
    }

    const created = await createWorkloadTemplate(parsed.data)
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// 3. PUT /api/workload-templates/:id — Edit an existing workload template
workloadTemplatesRouter.put('/workload-templates/:id', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const { id } = req.params
    const parsed = createTemplateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() })
    }
    if (parsed.data.theoryPeriodsPerSection + parsed.data.labPeriodsPerSection === 0) {
      return res.status(400).json({ error: 'INVALID_TEMPLATE', message: 'At least 1 theory or lab period is required.' })
    }
    const updated = await updateWorkloadTemplate(id, parsed.data)
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: `Template '${id}' not found.` })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// 4. DELETE /api/workload-templates/:id — Delete a workload template
workloadTemplatesRouter.delete('/workload-templates/:id', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const { id } = req.params
    // Prevent deletion if template is in use by any DRAFT or APPROVED allocation
    const db = (await import('../db/localDb.js')).getLocalDb()
    const inUse = (db.facultyWorkloadAllocations ?? []).some(a => a.templateId === id)
    if (inUse) {
      return res.status(409).json({ error: 'TEMPLATE_IN_USE', message: 'Cannot delete a template that is referenced by existing allocations.' })
    }
    const ok = await deleteWorkloadTemplate(id)
    if (!ok) return res.status(404).json({ error: 'NOT_FOUND', message: `Template '${id}' not found.` })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// 5 (was 3). GET /api/hod/workload-summary?semester=... — Dynamic Subject & Faculty Workload Summary
workloadTemplatesRouter.get('/hod/workload-summary', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const semester = req.query.semester as string
    if (!semester) {
      return res.status(400).json({ error: 'MISSING_SEMESTER', message: 'semester query parameter is required' })
    }

    const db = getLocalDb()
    const subjects = (await listSubjects()).filter(s => s.semester === semester)
    const sections = (await listSections()).filter(s => s.active !== false && s.semester === semester)
    const activeSectionIds = new Set(sections.map(s => s.id))
    // Lookup: sectionId -> sectionName for the section picker
    const sectionNameMap = new Map(sections.map(s => [s.id, s.name]))

    const sectionSubjects = db.sectionSubjects.filter(ss => activeSectionIds.has(ss.sectionId))
    const existingAssignments = db.teachingAssignments
    // Only DRAFT allocations for demand display — APPROVED are already in TeachingAssignments
    const draftAllocations = (db.facultyWorkloadAllocations ?? []).filter(
      a => a.semester === semester && a.status === 'DRAFT'
    )

    // Subject workload breakdown (Required, Assigned, Remaining)
    const subjectSummaries = subjects.map(sub => {
      const subSecSubs = sectionSubjects.filter(ss => ss.subjectId === sub.id)
      const secCount = subSecSubs.length

      // Per-subject section list with real IDs and names for the frontend picker
      const subjectSections = subSecSubs.map(ss => ({
        sectionId: ss.sectionId,
        sectionName: sectionNameMap.get(ss.sectionId) ?? ss.sectionId,
      }))

      const requiredTheory = subSecSubs.reduce((acc, ss) => acc + (ss.theoryPeriods || 0), 0)
      const requiredLab = subSecSubs.reduce((acc, ss) => acc + (ss.labPeriods || 0), 0)

      // Calculate assigned Theory & Lab from canonical TeachingAssignments
      let assignedTheory = 0
      let assignedLab = 0

      for (const ss of subSecSubs) {
        const theoryAssigned = existingAssignments.some(ta => ta.sectionSubjectId === ss.id && ta.component === 'THEORY')
        const labAssigned = existingAssignments.some(ta => ta.sectionSubjectId === ss.id && ta.component === 'LAB')

        if (theoryAssigned) assignedTheory += ss.theoryPeriods
        if (labAssigned) assignedLab += ss.labPeriods
      }

      // Add only DRAFT staged allocations (APPROVED are already synced into TeachingAssignments)
      for (const alloc of draftAllocations) {
        if (alloc.subjectId === sub.id) {
          assignedTheory += alloc.totalTheoryPeriods
          assignedLab += alloc.totalLabPeriods
        }
      }

      const remainingTheory = Math.max(0, requiredTheory - assignedTheory)
      const remainingLab = Math.max(0, requiredLab - assignedLab)

      return {
        subjectId: sub.id,
        subjectCode: sub.code,
        subjectName: sub.name,
        deliveryType: sub.deliveryType,
        sectionCount: secCount,
        sections: subjectSections,
        requiredTheory,
        assignedTheory,
        remainingTheory,
        requiredLab,
        assignedLab,
        remainingLab,
      }
    })

    // Faculty workload breakdown
    const facultyList = db.faculty
    const secSubMap = new Map(db.sectionSubjects.map(ss => [ss.id, ss]))

    const facultySummaries = facultyList.map(fac => {
      // Existing workload from canonical TeachingAssignments
      const myAssignments = existingAssignments.filter(ta => ta.facultyId === fac.id)
      let existingTheory = 0
      let existingLab = 0

      for (const ta of myAssignments) {
        const ss = secSubMap.get(ta.sectionSubjectId)
        if (!ss) continue
        if (ta.component === 'THEORY') existingTheory += ss.theoryPeriods
        if (ta.component === 'LAB') existingLab += ss.labPeriods
      }

      const existingWorkload = existingTheory + existingLab

      // Only DRAFT staged allocations contribute to new workload display
      const myDraftAllocations = draftAllocations.filter(a => a.facultyId === fac.id)
      const newTheory = myDraftAllocations.reduce((acc, a) => acc + a.totalTheoryPeriods, 0)
      const newLab = myDraftAllocations.reduce((acc, a) => acc + a.totalLabPeriods, 0)
      const newAllocation = newTheory + newLab

      const totalWorkload = existingWorkload + newAllocation
      const maximumWorkload = fac.maxWeeklyPeriods || 18
      const remainingCapacity = Math.max(0, maximumWorkload - totalWorkload)

      return {
        facultyId: fac.id,
        facultyName: fac.name,
        designation: fac.designation || 'Faculty',
        existingWorkload,
        newAllocation,
        totalWorkload,
        maximumWorkload,
        remainingCapacity,
      }
    })

    const facultyMap = new Map(db.faculty.map(f => [f.id, f.name]))
    const subjectMap = new Map(subjects.map(s => [s.id, s]))

    const enrichedDraftAllocations = draftAllocations.map(a => ({
      ...a,
      facultyName: facultyMap.get(a.facultyId) ?? a.facultyId,
      subjectCode: subjectMap.get(a.subjectId)?.code ?? a.subjectId,
      subjectName: subjectMap.get(a.subjectId)?.name ?? a.subjectId,
    }))

    res.json({
      semester,
      activeSectionCount: sections.length,
      subjectSummaries,
      facultySummaries,
      stagedAllocations: enrichedDraftAllocations,
    })
  } catch (err) {
    next(err)
  }
})

// 4. POST /api/hod/allocate-workload — Stage a workload allocation for HOD review
workloadTemplatesRouter.post('/hod/allocate-workload', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const parsed = allocateWorkloadSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() })
    }

    const { semester, subjectId, templateId, facultyId, assignedSectionIds } = parsed.data

    // 1. Verify Faculty
    const fac = await getFaculty(facultyId)
    if (!fac) {
      return res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: `Faculty '${facultyId}' not found.` })
    }

    // 2. Verify Subject
    const subjects = await listSubjects()
    const subject = subjects.find(s => s.id === subjectId)
    if (!subject) {
      return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: `Subject '${subjectId}' not found.` })
    }

    if (subject.semester !== semester) {
      return res.status(400).json({
        error: 'SEMESTER_MISMATCH',
        message: `Subject '${subject.code}' belongs to semester ${subject.semester}, not ${semester}.`,
      })
    }

    // 3. Verify Template
    const templates = await listWorkloadTemplates()
    const template = templates.find(t => t.id === templateId)
    if (!template) {
      return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND', message: `Workload template '${templateId}' not found.` })
    }

    // 4. Section-Subject Validation: Every section must actually offer this subject in SectionSubject
    const db = getLocalDb()
    let effectiveSectionIds = assignedSectionIds ?? []

    if (effectiveSectionIds.length === 0) {
      const subSecSubs = db.sectionSubjects.filter(ss => ss.subjectId === subjectId)
      const availableSectionIds: string[] = []
      for (const ss of subSecSubs) {
        const alreadyInTA = db.teachingAssignments.some(ta => ta.sectionSubjectId === ss.id)
        const alreadyStaged = (db.facultyWorkloadAllocations ?? []).some(
          a => a.semester === semester && a.subjectId === subjectId && (a.assignedSectionIds ?? []).includes(ss.sectionId)
        )
        if (!alreadyInTA && !alreadyStaged) {
          availableSectionIds.push(ss.sectionId)
        }
      }
      if (availableSectionIds.length > 0) {
        effectiveSectionIds = availableSectionIds.slice(0, 1)
      } else if (subSecSubs.length > 0) {
        effectiveSectionIds = subSecSubs.slice(0, 1).map(ss => ss.sectionId)
      } else {
        effectiveSectionIds = ['AUTO-SEC-1']
      }
    }

    // 4. Section-Subject Validation: Every section must actually offer this subject in SectionSubject
    for (const secId of effectiveSectionIds) {
      const ss = db.sectionSubjects.find(s => s.sectionId === secId && s.subjectId === subjectId)
      if (!ss && !secId.startsWith('AUTO')) {
        return res.status(400).json({
          error: 'INVALID_SECTION_SUBJECT',
          message: `Section '${secId}' does not offer subject '${subject.code}' in canonical SectionSubjects.`,
        })
      }
    }

    // 5. Theory/Lab component type validation against real subject requirements
    if (template.theoryPeriodsPerSection > 0 && (!subject.theoryPeriods || subject.theoryPeriods === 0)) {
      return res.status(400).json({
        error: 'INVALID_COMPONENT_TYPE',
        message: `Template specifies theory periods, but subject '${subject.code}' has 0 theory periods.`,
      })
    }

    if (template.labPeriodsPerSection > 0 && (!subject.labPeriods || subject.labPeriods === 0)) {
      return res.status(400).json({
        error: 'INVALID_COMPONENT_TYPE',
        message: `Template specifies lab periods, but subject '${subject.code}' has 0 lab periods.`,
      })
    }

    // Calculate total theory and lab periods for the selected sections
    const totalTheoryPeriods = template.theoryPeriodsPerSection * (effectiveSectionIds.length || 1)
    const totalLabPeriods = template.labPeriodsPerSection * (effectiveSectionIds.length || 1)

    // 6. Duplicate Section Assignment Check
    for (const secId of effectiveSectionIds) {
      const ss = db.sectionSubjects.find(s => s.sectionId === secId && s.subjectId === subjectId)
      if (!ss) continue

      if (template.theoryPeriodsPerSection > 0) {
        const existingTheory = db.teachingAssignments.find(ta => ta.sectionSubjectId === ss.id && ta.component === 'THEORY')
        if (existingTheory && existingTheory.facultyId !== facultyId) {
          return res.status(400).json({
            error: 'DUPLICATE_SECTION_ASSIGNMENT',
            message: `Theory component for section '${secId}' and subject '${subject.code}' is already assigned to faculty '${existingTheory.facultyId}'.`,
          })
        }
      }

      if (template.labPeriodsPerSection > 0) {
        const existingLab = db.teachingAssignments.find(ta => ta.sectionSubjectId === ss.id && ta.component === 'LAB')
        if (existingLab && existingLab.facultyId !== facultyId) {
          return res.status(400).json({
            error: 'DUPLICATE_SECTION_ASSIGNMENT',
            message: `Lab component for section '${secId}' and subject '${subject.code}' is already assigned to faculty '${existingLab.facultyId}'.`,
          })
        }
      }
    }

    // 7. Subject Over-Allocation Check
    const subSecSubs = db.sectionSubjects.filter(ss => ss.subjectId === subjectId)
    const requiredTheory = subSecSubs.reduce((acc, ss) => acc + (ss.theoryPeriods || 0), 0)
    const requiredLab = subSecSubs.reduce((acc, ss) => acc + (ss.labPeriods || 0), 0)

    let assignedTheory = 0
    let assignedLab = 0

    for (const ss of subSecSubs) {
      if (db.teachingAssignments.some(ta => ta.sectionSubjectId === ss.id && ta.component === 'THEORY')) {
        assignedTheory += ss.theoryPeriods
      }
      if (db.teachingAssignments.some(ta => ta.sectionSubjectId === ss.id && ta.component === 'LAB')) {
        assignedLab += ss.labPeriods
      }
    }

    const stagedAllocations = db.facultyWorkloadAllocations.filter(a => a.semester === semester && a.subjectId === subjectId)
    for (const a of stagedAllocations) {
      assignedTheory += a.totalTheoryPeriods
      assignedLab += a.totalLabPeriods
    }

    if (assignedTheory + totalTheoryPeriods > requiredTheory) {
      return res.status(400).json({
        error: 'SUBJECT_OVER_ALLOCATION',
        message: `Allocating ${totalTheoryPeriods} theory periods exceeds remaining required theory capacity (${requiredTheory - assignedTheory} remaining).`,
      })
    }

    if (assignedLab + totalLabPeriods > requiredLab) {
      return res.status(400).json({
        error: 'SUBJECT_OVER_ALLOCATION',
        message: `Allocating ${totalLabPeriods} lab periods exceeds remaining required lab capacity (${requiredLab - assignedLab} remaining).`,
      })
    }

    // 8. Faculty Weekly Capacity Check
    const myAssignments = db.teachingAssignments.filter(ta => ta.facultyId === facultyId)
    const secSubMap = new Map(db.sectionSubjects.map(ss => [ss.id, ss]))
    let existingWorkload = 0

    for (const ta of myAssignments) {
      const ss = secSubMap.get(ta.sectionSubjectId)
      if (!ss) continue
      if (ta.component === 'THEORY') existingWorkload += ss.theoryPeriods
      if (ta.component === 'LAB') existingWorkload += ss.labPeriods
    }

    const myStaged = db.facultyWorkloadAllocations.filter(a => a.facultyId === facultyId)
    const stagedWorkload = myStaged.reduce((acc, a) => acc + a.totalTheoryPeriods + a.totalLabPeriods, 0)

    const newWorkload = totalTheoryPeriods + totalLabPeriods
    const maxCapacity = fac.maxWeeklyPeriods || 18

    if (existingWorkload + stagedWorkload + newWorkload > maxCapacity) {
      return res.status(400).json({
        error: 'FACULTY_CAPACITY_EXCEEDED',
        message: `Allocation of ${newWorkload} periods would increase faculty ${fac.name}'s workload to ${existingWorkload + stagedWorkload + newWorkload} periods/week, exceeding max capacity of ${maxCapacity}.`,
      })
    }

    // Save staged allocation
    const created = await createFacultyWorkloadAllocation({
      facultyId,
      subjectId,
      semester,
      templateId,
      assignedSectionIds: effectiveSectionIds,
      totalTheoryPeriods,
      totalLabPeriods,
    })

    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// 5. POST /api/hod/approve-workload-allocation — Approve staged allocations and sync to TeachingAssignments
workloadTemplatesRouter.post('/hod/approve-workload-allocation', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const { semester, subjectId } = req.body
    if (!semester) {
      return res.status(400).json({ error: 'MISSING_SEMESTER', message: 'semester is required' })
    }

    const result = await approveFacultyWorkloadAllocations(semester, subjectId)
    res.json({
      success: true,
      semester,
      subjectId: subjectId || null,
      approvedAllocationsCount: result.approvedCount,
      syncedTeachingAssignmentsCount: result.syncedTeachingAssignmentsCount,
    })
  } catch (err) {
    next(err)
  }
})
