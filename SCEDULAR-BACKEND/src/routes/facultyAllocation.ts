import { notifyPasswordChanged } from '../mail/notify.js'
import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import {
  getFacultyPreferences,
  saveFacultyPreferences,
  reviewFacultyPreference,
  editFacultyPreference,
  getAllocationSettings,
  saveAllocationSettings,
  getSubjectDemand,
  getFacultySubjectHistory,
  updateFacultyExperience,
  getFaculty,
  getSemesterReadinessStatus,
  listFaculty,
  listSections,
  listLabs,
  listSubjects,
  listSectionSubjects,
  listTeachingAssignments,
  listLabSubjectMappings,
  getScheduleConfig,
  resetWorkflowStateRepo,
  getCurrentAcademicCycle,
  setCurrentAcademicCycle,
  clearAllFacultyAllocationExperience,
  upsertFacultyPasswordHash,
  getFacultyPasswordHash,
} from '../db/repo.js'
import type { Subject, Faculty } from '../types.js'
import { REAL_FACULTY_ROSTER } from '../seed/facultyRoster.js'
import { getAllocationPolicy, type AllocationConfig } from '../utils/allocationPolicy.js'
import {
  ALL_SEMESTERS,
  SEMESTER_TO_YEAR,
  ODD_SEMESTERS,
  EVEN_SEMESTERS,
  isSpecificSemester,
  isAcademicCycle,
  cycleOfSemester,
  semestersForCycle,
  semesterInCycle,
  normalizeCycle,
  type AcademicCycle,
  type SpecificSemester,
} from '../utils/academicCycle.js'
import { createSession, destroySession, extractBearerToken } from '../auth/session.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { verifyFacultyPassword } from '../auth/passwords.js'
import { callLlm as callGrokLlm } from '../ai/llm.js'

export const facultyAllocationRouter = Router()

const RESET_PASSKEY = process.env.SCEDULAR_RESET_PASSKEY?.trim() || 'SCEDULAR_RESET'

function findFacultyByIdOrEmail(input: string): (Faculty & { passwordHash?: string | null }) | undefined {
  const id = String(input || '').trim().toLowerCase()
  const roster = REAL_FACULTY_ROSTER as Array<Faculty & { passwordHash?: string | null }>
  return roster.find(
    f => f.id.toLowerCase() === id || (f.email && String(f.email).toLowerCase() === id)
  )
}

// ── Faculty Subject Allocation (Phase 3) ───────────────────────────────────
// A preference always targets ONE specific semester (I..VIII) taken from the
// canonical subject record. ODD / EVEN / BOTH are first-class academic-cycle
// *contexts* that filter which specific semesters are offered — they are never
// stored as a subject's semester and never duplicate subject data. The current
// cycle is DB-configurable (see getCurrentAcademicCycle); the faculty workflow
// is restricted to the semesters of the current cycle.

// Upper bound for requested section capacity when a semester has no configured
// active sections yet. Prevents impossible/absurd values (Section 8).
const DEFAULT_MAX_REQUESTED_SECTIONS = 12

interface RawPreferenceItem {
  subjectId?: string
  subjectCode?: string
  academicYear?: string
  semester?: string
  preferenceRank?: number
  requestedSections?: number
  labConfirmed?: boolean
  isIntegrated?: boolean
}

interface NormalizedPreferenceItem {
  subjectId: string
  academicYear: string
  semester: string
  preferenceRank: number
  requestedSections: number
  labConfirmed: boolean
}

type ValidationFailure = { ok: false; status: number; error: string; message: string }
type ValidationResult = { ok: true; items: NormalizedPreferenceItem[] } | ValidationFailure

function fail(status: number, error: string, message: string): ValidationFailure {
  return { ok: false, status, error, message }
}

async function maxRequestedSectionsFor(subject: Subject): Promise<number> {
  const sections = await listSections()
  const available = sections.filter(
    s => s.active !== false && s.year === subject.year && s.semester === subject.semester
  ).length
  return available > 0 ? available : DEFAULT_MAX_REQUESTED_SECTIONS
}

/**
 * Server-side enforcement of the Faculty Subject Allocation rules (Section 17).
 * Identity, semester, year, subject validity, policy bands, preference counts,
 * rank, requested-section capacity and integrated-lab confirmation are all
 * validated here — never trusting the client. Subject year/semester are taken
 * from the canonical record, so cross-semester selections are impossible.
 */
async function validatePreferenceBatch(opts: {
  facultyId: string
  items: RawPreferenceItem[]
  forStatus: 'DRAFT' | 'SUBMITTED'
}): Promise<ValidationResult> {
  const { facultyId, items, forStatus } = opts

  if (!Array.isArray(items)) {
    return fail(400, 'INVALID_INPUT', 'items must be an array of preference selections.')
  }

  const fac = await getFaculty(facultyId)
  if (!fac) {
    return fail(404, 'FACULTY_NOT_FOUND', `Faculty ${facultyId} not found.`)
  }

  const allocExp = fac.allocationExperience ?? null
  const config: AllocationConfig = await getAllocationSettings()
  const policy = getAllocationPolicy(allocExp, config)
  const currentCycle = await getCurrentAcademicCycle()

  // An empty batch is only meaningful as "clear my draft".
  if (items.length === 0) {
    if (forStatus === 'SUBMITTED') {
      return fail(400, 'NO_PREFERENCES', 'Select at least one subject before submitting.')
    }
    return { ok: true, items: [] }
  }

  if (allocExp === null) {
    return fail(400, 'ALLOCATION_EXPERIENCE_NOT_CONFIGURED',
      'Allocation experience is not configured. Set your allocation experience before selecting subjects.')
  }

  if (items.length > policy.maxTotalPreferences) {
    return fail(400, 'POLICY_VIOLATION',
      `Maximum ${policy.maxTotalPreferences} preference(s) allowed for ${allocExp} years allocation experience. You submitted ${items.length}.`)
  }

  const subjects = await listSubjects()
  const byId = new Map(subjects.map(s => [s.id, s]))
  const byCode = new Map(subjects.map(s => [s.code, s]))

  const yearCounts: Record<string, number> = {}
  const seenRanks = new Set<number>()
  const seenSubjects = new Set<string>()
  const normalized: NormalizedPreferenceItem[] = []

  for (const item of items) {
    const subject =
      (item.subjectId ? byId.get(item.subjectId) : undefined) ??
      (item.subjectCode ? byCode.get(item.subjectCode) : undefined)

    if (!subject) {
      return fail(400, 'INVALID_SUBJECT', `Subject ${item.subjectId ?? item.subjectCode ?? ''} does not exist in the canonical curriculum.`)
    }
    if ((subject as any).active === false) {
      return fail(400, 'INACTIVE_SUBJECT', `Subject ${subject.code} is inactive and cannot be selected.`)
    }
    if (seenSubjects.has(subject.id)) {
      return fail(400, 'DUPLICATE_SUBJECT', `Subject ${subject.code} is selected more than once.`)
    }
    seenSubjects.add(subject.id)

    const semester = subject.semester
    const year = subject.year
    if (!semester || !year) {
      return fail(400, 'SUBJECT_MISSING_CONTEXT', `Subject ${subject.code} has no canonical year/semester and cannot be offered as a preference.`)
    }
    if (!isSpecificSemester(semester)) {
      return fail(400, 'INVALID_SEMESTER', `Subject ${subject.code} has a non-specific semester (${semester}).`)
    }

    // Academic-cycle enforcement: a subject whose canonical semester lies outside
    // the current cycle cannot enter the allocation workflow. Frontend filtering
    // alone is not trusted — this is the authoritative gate.
    if (!semesterInCycle(semester, currentCycle)) {
      return fail(400, 'CYCLE_MISMATCH',
        `Subject ${subject.code} belongs to Semester ${semester} (${cycleOfSemester(semester)} cycle), which is outside the current ${currentCycle} academic cycle.`)
    }

    // Reject client-supplied semester/year that disagree with the canonical record.
    if (item.semester !== undefined) {
      const claimed = String(item.semester).trim()
      if (!isSpecificSemester(claimed)) {
        return fail(400, 'INVALID_SEMESTER', `Semester "${claimed}" is not a specific semester (I–VIII). ODD/EVEN/BOTH are cycle contexts, not a subject semester.`)
      }
      if (claimed !== semester) {
        return fail(400, 'SEMESTER_MISMATCH', `Subject ${subject.code} belongs to Semester ${semester}, not Semester ${claimed}.`)
      }
    }
    if (item.academicYear !== undefined && String(item.academicYear).trim() !== year) {
      return fail(400, 'YEAR_MISMATCH', `Subject ${subject.code} belongs to ${year}, not ${item.academicYear}.`)
    }

    if (!policy.eligibleYears.includes(year)) {
      const reason = policy.reasons[year] ?? `${year} is not eligible for ${allocExp} years allocation experience.`
      return fail(400, 'POLICY_VIOLATION', reason)
    }

    const rank = item.preferenceRank
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > policy.maxTotalPreferences) {
      return fail(400, 'INVALID_RANK', `Preference rank must be an integer between 1 and ${policy.maxTotalPreferences}.`)
    }
    if (seenRanks.has(rank)) {
      return fail(400, 'INVALID_RANK', `Duplicate preference rank ${rank}.`)
    }
    seenRanks.add(rank)

    // Teachers only choose subjects. The HOD decides how many sections each
    // teacher gets, so requestedSections is optional (kept as 1 for storage).
    const maxSections = await maxRequestedSectionsFor(subject)
    const requested = item.requestedSections ?? 1
    if (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 1 || requested > maxSections) {
      return fail(400, 'INVALID_REQUESTED_SECTIONS',
        `Requested section capacity for ${subject.code} must be a whole number between 1 and ${maxSections}.`)
    }

    // Whoever teaches an integrated subject handles both theory and lab, so
    // the lab responsibility is implicit in choosing it.
    const isIntegrated = subject.deliveryType === 'INTEGRATED'

    yearCounts[year] = (yearCounts[year] || 0) + 1
    if (yearCounts[year] > policy.maxPreferencesPerYear) {
      return fail(400, 'POLICY_VIOLATION',
        `Maximum ${policy.maxPreferencesPerYear} preference per academic year allowed. You selected multiple for ${year}.`)
    }

    normalized.push({
      subjectId: subject.id,
      academicYear: year,
      semester,
      preferenceRank: rank,
      requestedSections: requested,
      labConfirmed: isIntegrated ? true : Boolean(item.labConfirmed),
    })
  }

  return { ok: true, items: normalized }
}

/** True when the faculty already has a preference batch that must not be edited. */
function isPreferenceBatchLocked(existing: Array<{ status: string }>): boolean {
  return existing.some(p => p.status === 'SUBMITTED' || p.status === 'APPROVED')
}

/** Reject a client-supplied facultyId that does not match the authenticated session. */
function identityMismatch(req: Request, sessionFacultyId: string): boolean {
  const supplied =
    (req.body && (req.body.facultyId ?? req.body.faculty_id)) ||
    (req.query && (req.query.facultyId ?? req.query.faculty_id))
  return Boolean(supplied) && String(supplied) !== sessionFacultyId
}

// POST /api/auth/login - authenticate against the canonical faculty table
// FAILSAFE: if listFaculty() is empty on first Vercel cold start (Neon seed
// pending), fall back to the compiled REAL_FACULTY_ROSTER so login works
// immediately on the very first request.
facultyAllocationRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { facultyId, username, password } = req.body ?? {}
  const idInput = String(facultyId || username || '').trim()
  const passInput = String(password || '').trim()

  if (!idInput || !passInput) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Faculty ID and password are required.' })
  }

  // 1. Primary: live DB (Neon / local JSON)
  let found: (Faculty & { passwordHash?: string | null }) | undefined
  let dbHasFaculty = false
  try {
    const allFaculty = await listFaculty()
    dbHasFaculty = allFaculty.length > 0
    found = allFaculty.find(
      f => f.id.toLowerCase() === idInput.toLowerCase() ||
           (f.email && String(f.email).toLowerCase() === idInput.toLowerCase())
    ) as any
  } catch {
    found = undefined
  }

  // 2. Failsafe: compiled roster (critical for first Vercel cold start)
  // Only when the database has no teachers at all (first cold start). A teacher the HOD has deleted must NOT
  // be able to log in through the built-in roster.
  if (!found && !dbHasFaculty) {
    found = findFacultyByIdOrEmail(idInput)
  }

  if (!found) {
    return res.status(401).json({ error: 'AUTHENTICATION_FAILED', message: 'Invalid Faculty ID or password.' })
  }

  // 3. Password verification (per-faculty bcrypt → env master → local default)
  const passwordOk = await verifyFacultyPassword(found.id, passInput)
  if (!passwordOk) {
    return res.status(401).json({ error: 'AUTHENTICATION_FAILED', message: 'Invalid Faculty ID or password.' })
  }

  const role: 'HOD' | 'FACULTY' = found.role || 'FACULTY'
  const token = await createSession(found.id)

  return res.json({
    success: true,
    token,
    user: {
      facultyId: found.id,
      name: found.name,
      designation: found.designation,
      department: found.department,
      role,
    },
  })
})

// POST /api/auth/set-password - (HOD only) set a per-faculty bcrypt password
facultyAllocationRouter.post('/auth/set-password', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const { targetFacultyId, password, confirmPassword } = req.body ?? {}
  const targetId = String(targetFacultyId || '').trim()
  const pw = String(password || '')
  const cpw = String(confirmPassword || '')
  if (!targetId || !pw) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'targetFacultyId and password are required.' })
  }
  if (pw.length < 6) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters.' })
  }
  if (pw !== cpw) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password and confirm password do not match.' })
  }
  const target = await getFaculty(targetId) ?? findFacultyByIdOrEmail(targetId)
  if (!target) {
    return res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Target faculty does not exist.' })
  }
  const hash = await bcrypt.hash(pw, 10)
  await upsertFacultyPasswordHash(targetId, hash)
  await notifyPasswordChanged(target.id, 'set-by-hod')
  return res.json({ success: true, message: `Password set for ${target.name} (${targetId}).` })
})

// POST /api/auth/logout - invalidate the presented session
facultyAllocationRouter.post('/auth/logout', async (req: Request, res: Response) => {
  await destroySession(extractBearerToken(req))
  return res.json({ success: true })
})

// GET /api/auth/me - resolve the current session to a fresh database identity
facultyAllocationRouter.get('/auth/me', requireAuth, async (req: Request, res: Response) => {
  const fac = await getFaculty(req.auth!.facultyId)
  if (!fac) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Session references an unknown faculty member.' })
  }
  return res.json({
    facultyId: fac.id,
    name: fac.name,
    designation: fac.designation,
    department: fac.department,
    role: req.auth!.role,
  })
})

// POST /api/reset-workflow - resets transaction state (preferences, assignments, runs) keeping master data
facultyAllocationRouter.post('/reset-workflow', async (_req: Request, res: Response) => {
  const result = await resetWorkflowStateRepo()
  return res.json({
    success: true,
    message: 'Workflow transaction state reset. Master data preserved.',
    before: result.before,
    after: result.after,
  })
})

// GET /api/readiness - returns readiness status for each year+semester (8 entries)
facultyAllocationRouter.get('/readiness', async (_req: Request, res: Response) => {
  const readiness = await getSemesterReadinessStatus()
  return res.json({ readiness })
})

// GET /api/faculty/me - authenticated faculty profile (identity from session)
facultyAllocationRouter.get('/faculty/me', requireAuth, async (req: Request, res: Response) => {
  const facultyId = req.auth!.facultyId
  if (identityMismatch(req, facultyId)) {
    return res.status(403).json({ error: 'IDENTITY_MISMATCH', message: 'facultyId does not match the authenticated session.' })
  }
  const fac = await getFaculty(facultyId)
  if (!fac) {
    return res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: `Faculty ${facultyId} not found` })
  }
  return res.json(fac)
})

// GET /api/faculty/allocation-policy - authoritative experience policy for the
// authenticated faculty, derived from allocation_settings + the DB record.
facultyAllocationRouter.get('/faculty/allocation-policy', requireAuth, async (req: Request, res: Response) => {
  const facultyId = req.auth!.facultyId
  const fac = await getFaculty(facultyId)
  const config = await getAllocationSettings()
  const allocationExperience = fac?.allocationExperience ?? null
  const policy = getAllocationPolicy(allocationExperience, config)
  const currentCycle = await getCurrentAcademicCycle()
  return res.json({ allocationExperience, policy, config, currentCycle, allowedSemesters: semestersForCycle(currentCycle) })
})

// GET /api/faculty/cycle-context - the DB-configured academic cycle and the
// specific semesters the faculty allocation workflow may expose under it. The
// frontend renders ONLY these semesters; nothing is hardcoded client-side.
facultyAllocationRouter.get('/faculty/cycle-context', requireAuth, async (_req: Request, res: Response) => {
  const currentCycle = await getCurrentAcademicCycle()
  return res.json({
    currentCycle,
    allowedSemesters: semestersForCycle(currentCycle),
    oddSemesters: [...ODD_SEMESTERS],
    evenSemesters: [...EVEN_SEMESTERS],
    allSemesters: [...ALL_SEMESTERS],
    semesterToYear: SEMESTER_TO_YEAR,
  })
})

// GET /api/faculty/subjects?semester=III - canonical subjects for ONE specific
// semester (I..VIII). Explicit specific-semester access is always preserved.
// A cycle value (ODD/EVEN/BOTH) is also accepted and returns every canonical
// subject across that cycle's semesters. Each response carries cycle context so
// the workflow can tell whether a semester belongs to the current cycle.
facultyAllocationRouter.get('/faculty/subjects', requireAuth, async (req: Request, res: Response) => {
  const raw = String(req.query.semester ?? '').trim()
  if (!raw) {
    return res.status(400).json({ error: 'MISSING_SEMESTER', message: 'semester query parameter (I–VIII, or a cycle ODD/EVEN/BOTH) is required.' })
  }

  const currentCycle = await getCurrentAcademicCycle()
  const subjects = await listSubjects()
  const sections = await listSections()

  const mapSubject = (s: Subject) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    category: s.category ?? null,
    deliveryType: s.deliveryType,
    credits: s.credits ?? null,
    theoryPeriods: s.theoryPeriods ?? null,
    labPeriods: s.labPeriods ?? null,
    year: s.year ?? null,
    semester: s.semester ?? null,
  })

  // Cycle-valued request → union of every specific semester in that cycle.
  if (isAcademicCycle(raw)) {
    const cycle = normalizeCycle(raw)
    const sems = semestersForCycle(cycle)
    const matched = subjects.filter(s => s.semester && (sems as string[]).includes(s.semester))
    return res.json({
      cycle,
      currentCycle,
      semesters: sems,
      subjects: matched.map(mapSubject),
    })
  }

  if (!isSpecificSemester(raw)) {
    return res.status(400).json({
      error: 'INVALID_SEMESTER',
      message: `Semester "${raw}" is not valid. Use a specific semester (I, II, III, IV, V, VI, VII, VIII) or an academic cycle (ODD, EVEN, BOTH).`,
    })
  }

  const semester = raw as SpecificSemester
  const matched = subjects.filter(s => s.semester === semester)
  const year = SEMESTER_TO_YEAR[semester]

  const availableSections = sections.filter(
    s => s.active !== false && s.year === year && s.semester === semester
  ).length
  const maxRequestedSections = availableSections > 0 ? availableSections : DEFAULT_MAX_REQUESTED_SECTIONS

  return res.json({
    semester,
    year,
    availableSections,
    maxRequestedSections,
    currentCycle,
    cycle: cycleOfSemester(semester),
    inCurrentCycle: semesterInCycle(semester, currentCycle),
    subjects: matched.map(mapSubject),
  })
})

// GET /api/faculty/preferences - the authenticated faculty's own preferences
facultyAllocationRouter.get('/faculty/preferences', requireAuth, async (req: Request, res: Response) => {
  const facultyId = req.auth!.facultyId
  if (identityMismatch(req, facultyId)) {
    return res.status(403).json({ error: 'IDENTITY_MISMATCH', message: 'facultyId does not match the authenticated session.' })
  }
  const prefs = await getFacultyPreferences(facultyId)
  return res.json({ preferences: prefs })
})

// POST /api/faculty/preferences/draft - persist a DRAFT batch (session identity)
facultyAllocationRouter.post('/faculty/preferences/draft', requireAuth, async (req: Request, res: Response) => {
  const facultyId = req.auth!.facultyId
  if (identityMismatch(req, facultyId)) {
    return res.status(403).json({ error: 'IDENTITY_MISMATCH', message: 'facultyId does not match the authenticated session.' })
  }

  const existing = await getFacultyPreferences(facultyId)
  if (isPreferenceBatchLocked(existing)) {
    return res.status(409).json({ error: 'PREFERENCES_LOCKED', message: 'Your preferences have been submitted or approved and can no longer be edited.' })
  }

  const validation = await validatePreferenceBatch({ facultyId, items: req.body?.items, forStatus: 'DRAFT' })
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error, message: validation.message })
  }

  try {
    const result = await saveFacultyPreferences(facultyId, validation.items, 'DRAFT')
    return res.json({ success: true, status: 'DRAFT', preferences: result })
  } catch (err: any) {
    return res.status(409).json({ error: 'PREFERENCES_LOCKED', message: err?.message || 'Cannot modify locked preferences.' })
  }
})

// POST /api/faculty/preferences/submit - validate every rule, then lock as SUBMITTED
facultyAllocationRouter.post('/faculty/preferences/submit', requireAuth, async (req: Request, res: Response) => {
  const facultyId = req.auth!.facultyId
  if (identityMismatch(req, facultyId)) {
    return res.status(403).json({ error: 'IDENTITY_MISMATCH', message: 'facultyId does not match the authenticated session.' })
  }

  const existing = await getFacultyPreferences(facultyId)
  if (isPreferenceBatchLocked(existing)) {
    return res.status(409).json({ error: 'PREFERENCES_LOCKED', message: 'Your preferences have been submitted or approved and can no longer be edited.' })
  }

  const validation = await validatePreferenceBatch({ facultyId, items: req.body?.items, forStatus: 'SUBMITTED' })
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error, message: validation.message })
  }

  try {
    const result = await saveFacultyPreferences(facultyId, validation.items, 'SUBMITTED')
    return res.json({ success: true, status: 'SUBMITTED', preferences: result })
  } catch (err: any) {
    return res.status(409).json({ error: 'PREFERENCES_LOCKED', message: err?.message || 'Cannot modify locked preferences.' })
  }
})

// GET /api/faculty/subject-demand - aggregate interest counts for the faculty
// view. Private faculty names are stripped: faculty only see how many colleagues
// are interested, never who (Section 7).
facultyAllocationRouter.get('/faculty/subject-demand', requireAuth, async (req: Request, res: Response) => {
  const semester = req.query.semester as string | undefined
  const academicYear = req.query.academicYear as string | undefined
  const demand = await getSubjectDemand(semester, academicYear)
  const sanitized = demand.map(({ interestedFacultyList: _omit, ...rest }) => ({
    ...rest,
    interestCount: rest.facultyInterestedCount,
  }))
  return res.json({ demand: sanitized })
})

// GET /api/faculty/history - the authenticated faculty's teaching history
facultyAllocationRouter.get('/faculty/history', requireAuth, async (req: Request, res: Response) => {
  const facultyId = req.auth!.facultyId
  if (identityMismatch(req, facultyId)) {
    return res.status(403).json({ error: 'IDENTITY_MISMATCH', message: 'facultyId does not match the authenticated session.' })
  }
  const history = await getFacultySubjectHistory(facultyId)
  return res.json({ history })
})

// Band hierarchy for HOD review ordering (Section 4): 13+ first, then 10–<13,
// then 0–9; within a band, higher allocation experience first. Experience comes
// from the faculty allocation_experience field — never inferred from designation.
function experienceBand(exp: number | null | undefined, config: AllocationConfig) {
  if (exp == null) return { minExperience: -1, name: 'Not Configured', order: -1 }
  const band = getAllocationPolicy(exp, config).band
  return { minExperience: band.minExperience, name: band.name, order: band.minExperience }
}

// GET /api/hod/preferences?semester=IV - HOD review of real submitted faculty
// preferences for one specific semester of the CURRENT academic cycle. Returns
// cycle context, band-sorted preferences, a per-faculty Option1/Option2 view and
// an enriched demand summary (required / approved capacity / assigned / shortage).
facultyAllocationRouter.get('/hod/preferences', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const currentCycle = await getCurrentAcademicCycle()
  const allowedSemesters = semestersForCycle(currentCycle)
  const rawSemester = String(req.query.semester ?? '').trim()

  let semester: SpecificSemester | null = null
  if (rawSemester) {
    if (!isSpecificSemester(rawSemester)) {
      return res.status(400).json({
        error: 'INVALID_SEMESTER',
        message: `Semester "${rawSemester}" is not a specific semester (I–VIII). ODD/EVEN/BOTH are cycle contexts, not a semester.`,
      })
    }
    if (!semesterInCycle(rawSemester, currentCycle)) {
      return res.status(400).json({
        error: 'CYCLE_MISMATCH',
        message: `Semester ${rawSemester} (${cycleOfSemester(rawSemester)} cycle) is outside the current ${currentCycle} academic cycle.`,
      })
    }
    semester = rawSemester as SpecificSemester
  }

  const year = semester ? SEMESTER_TO_YEAR[semester] : null

  const [allPrefs, allFaculty, subjects, sectionSubjects, teachingAssignments, config] = await Promise.all([
    getFacultyPreferences(),
    listFaculty(),
    listSubjects(),
    listSectionSubjects(),
    listTeachingAssignments(),
    getAllocationSettings(),
  ])

  const facultyMap = new Map(allFaculty.map(f => [f.id, f]))
  const subjectMap = new Map(subjects.map(s => [s.id, s]))

  const prefs = semester ? allPrefs.filter(p => p.semester === semester) : allPrefs

  // Assigned sections per subject (distinct sections carrying a teaching assignment).
  const ssById = new Map(sectionSubjects.map(ss => [ss.id, ss]))
  const assignedSectionsBySubject = new Map<string, Set<string>>()
  for (const ta of teachingAssignments) {
    const ss = ssById.get(ta.sectionSubjectId)
    if (!ss) continue
    const set = assignedSectionsBySubject.get(ss.subjectId) ?? new Set<string>()
    set.add(ss.sectionId)
    assignedSectionsBySubject.set(ss.subjectId, set)
  }

  const enriched = prefs.map(p => {
    const fac = facultyMap.get(p.facultyId)
    const subj = subjectMap.get(p.subjectId)
    const exp = fac?.allocationExperience ?? null
    return {
      ...p,
      facultyName: fac?.name ?? p.facultyId,
      designation: fac?.designation ?? 'Faculty',
      allocationExperience: exp,
      band: experienceBand(exp, config).name,
      subjectCode: subj?.code ?? p.subjectId,
      subjectName: subj?.name ?? p.subjectId,
      deliveryType: subj?.deliveryType ?? null,
    }
  })

  // Section 4 ordering: senior band first, then higher experience, then rank.
  const bandOrder = (e: number | null) => (e == null ? -1 : experienceBand(e, config).order)
  enriched.sort((a, b) => {
    const bd = bandOrder(b.allocationExperience) - bandOrder(a.allocationExperience)
    if (bd !== 0) return bd
    const ed = (b.allocationExperience ?? -1) - (a.allocationExperience ?? -1)
    if (ed !== 0) return ed
    if (a.facultyId !== b.facultyId) return a.facultyId < b.facultyId ? -1 : 1
    return a.preferenceRank - b.preferenceRank
  })

  // Per-faculty Option1 / Option2 rows (Section 3).
  const STATUS_AGGREGATE = ['APPROVED', 'SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED', 'DRAFT']
  const rowsByFaculty = new Map<string, any>()
  for (const p of enriched) {
    let row = rowsByFaculty.get(p.facultyId)
    if (!row) {
      row = {
        facultyId: p.facultyId,
        facultyName: p.facultyName,
        designation: p.designation,
        allocationExperience: p.allocationExperience,
        band: p.band,
        options: [] as any[],
      }
      rowsByFaculty.set(p.facultyId, row)
    }
    row.options.push({
      preferenceId: p.id,
      rank: p.preferenceRank,
      subjectId: p.subjectId,
      subjectCode: p.subjectCode,
      subjectName: p.subjectName,
      deliveryType: p.deliveryType,
      requestedSections: p.requestedSections,
      labConfirmed: p.labConfirmed,
      status: p.status,
      reviewedBy: p.reviewedBy,
      reviewedAt: p.reviewedAt,
      hodComment: p.hodComment,
    })
  }
  const facultyRows = Array.from(rowsByFaculty.values()).map(row => {
    row.options.sort((a: any, b: any) => a.rank - b.rank)
    const statuses = row.options.map((o: any) => o.status)
    const overall = STATUS_AGGREGATE.find(s => statuses.includes(s)) ?? 'DRAFT'
    return { ...row, status: overall }
  })
  facultyRows.sort((a, b) => {
    const bd = bandOrder(b.allocationExperience) - bandOrder(a.allocationExperience)
    if (bd !== 0) return bd
    return (b.allocationExperience ?? -1) - (a.allocationExperience ?? -1)
  })

  // DB-derived review summary (no hardcoded counts): per-semester faculty
  // workflow coverage for the HOD header cards. The cards distinguish the real
  // lifecycle states (Submitted / Approved / Changes Requested / Rejected / Not
  // Submitted) — an APPROVED preference is never counted as "pending". Each
  // faculty is bucketed by their highest-priority overall status, exactly the
  // same aggregate shown on the row's Status badge (APPROVED > SUBMITTED >
  // CHANGES_REQUESTED > REJECTED > DRAFT), so the header numbers always equal
  // the visible rows.
  const facultyWithPrefs = new Set(prefs.map(p => p.facultyId))
  const overallByFaculty = new Map<string, string>()
  for (const p of prefs) {
    const current = overallByFaculty.get(p.facultyId)
    if (!current || STATUS_AGGREGATE.indexOf(p.status) < STATUS_AGGREGATE.indexOf(current)) {
      overallByFaculty.set(p.facultyId, p.status)
    }
  }
  const countOverall = (status: string) =>
    Array.from(overallByFaculty.values()).filter(v => v === status).length
  const summary = {
    totalFaculty: allFaculty.length,
    submitted: countOverall('SUBMITTED'),
    approved: countOverall('APPROVED'),
    changesRequested: countOverall('CHANGES_REQUESTED'),
    rejected: countOverall('REJECTED'),
    notSubmitted: allFaculty.filter(f => !facultyWithPrefs.has(f.id)).length,
  }

  // Enriched demand (Section 10): required / approved capacity / assigned / shortage.
  const baseDemand = await getSubjectDemand(semester ?? undefined, year ?? undefined)
  const demand = baseDemand.map(d => {
    const assignedSections = assignedSectionsBySubject.get(d.subjectId)?.size ?? 0
    const approvedCapacity = d.approvedSectionTotal
    return {
      ...d,
      approvedCapacity,
      assignedSections,
      shortage: Math.max(0, d.requiredSections - approvedCapacity),
    }
  })

  return res.json({
    currentCycle,
    allowedSemesters,
    semester,
    year,
    summary,
    preferences: enriched,
    facultyRows,
    demand,
  })
})

// GET /api/hod/confirmed-allocation - the real, already-known faculty ->
// subject -> section teaching assignments for a semester (teaching_assignments),
// as opposed to the faculty preference-submission workflow above. This is what
// the HOD reviews/confirms when the institution's teaching allocation for the
// semester is already decided (e.g. from the department's own workload sheet),
// rather than collected fresh from each faculty member.
facultyAllocationRouter.get('/hod/confirmed-allocation', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const currentCycle = await getCurrentAcademicCycle()
  const allowedSemesters = semestersForCycle(currentCycle)
  const rawSemester = String(req.query.semester ?? '').trim()

  let semester: SpecificSemester | null = null
  if (rawSemester) {
    if (!isSpecificSemester(rawSemester)) {
      return res.status(400).json({ error: 'INVALID_SEMESTER', message: `Semester "${rawSemester}" is not a specific semester (I–VIII).` })
    }
    if (!semesterInCycle(rawSemester, currentCycle)) {
      return res.status(400).json({
        error: 'CYCLE_MISMATCH',
        message: `Semester ${rawSemester} (${cycleOfSemester(rawSemester)} cycle) is outside the current ${currentCycle} academic cycle.`,
      })
    }
    semester = rawSemester as SpecificSemester
  }
  const year = semester ? SEMESTER_TO_YEAR[semester] : null

  const [allFaculty, subjects, sections, sectionSubjects, teachingAssignments] = await Promise.all([
    listFaculty(),
    listSubjects(),
    listSections(),
    listSectionSubjects(),
    listTeachingAssignments(),
  ])

  const facultyMap = new Map(allFaculty.map(f => [f.id, f]))
  const subjectMap = new Map(subjects.map(s => [s.id, s]))
  const sectionMap = new Map(sections.map(s => [s.id, s]))
  const ssById = new Map(sectionSubjects.map(ss => [ss.id, ss]))

  // Scope teaching_assignments to the requested semester/year via their section_subject's section.
  const scoped = teachingAssignments.filter(ta => {
    const ss = ssById.get(ta.sectionSubjectId)
    if (!ss) return false
    const sec = sectionMap.get(ss.sectionId)
    if (!sec) return false
    if (semester && sec.semester !== semester) return false
    if (year && sec.year !== year) return false
    return true
  })

  type Row = {
    facultyId: string
    facultyName: string
    designation: string
    allocationExperience: number | null
    subjects: Array<{ subjectId: string; subjectCode: string; subjectName: string; component: string; sectionId: string; sectionName: string }>
  }
  const rowsByFaculty = new Map<string, Row>()
  for (const ta of scoped) {
    const ss = ssById.get(ta.sectionSubjectId)!
    const subj = subjectMap.get(ss.subjectId)
    const sec = sectionMap.get(ss.sectionId)
    const fac = facultyMap.get(ta.facultyId)
    let row = rowsByFaculty.get(ta.facultyId)
    if (!row) {
      row = {
        facultyId: ta.facultyId,
        facultyName: fac?.name ?? ta.facultyId,
        designation: fac?.designation ?? 'Faculty',
        allocationExperience: fac?.allocationExperience ?? null,
        subjects: [],
      }
      rowsByFaculty.set(ta.facultyId, row)
    }
    row.subjects.push({
      subjectId: ss.subjectId,
      subjectCode: subj?.code ?? ss.subjectId,
      subjectName: subj?.name ?? ss.subjectId,
      component: ta.component,
      sectionId: ss.sectionId,
      sectionName: sec?.name ?? ss.sectionId,
    })
  }
  const facultyRows = Array.from(rowsByFaculty.values()).sort((a, b) => a.facultyName.localeCompare(b.facultyName))

  const confirmedFacultyCount = facultyRows.length
  const totalFaculty = allFaculty.length

  return res.json({
    currentCycle,
    allowedSemesters,
    semester,
    year,
    summary: {
      totalFaculty,
      confirmed: confirmedFacultyCount,
      unallocated: totalFaculty - confirmedFacultyCount,
      totalAssignments: scoped.length,
    },
    facultyRows,
  })
})

// PATCH /api/hod/preferences/:id - HOD edit of a submitted preference BEFORE
// approval (Section 6). The subject must stay canonical, belong to the requested
// semester and the current cycle. An APPROVED preference is locked.
facultyAllocationRouter.patch('/hod/preferences/:id', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'INVALID_ID', message: 'Preference id must be an integer.' })
  }

  const existing = (await getFacultyPreferences()).find(p => p.id === id)
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Preference not found.' })
  }
  if (!['SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED'].includes(existing.status)) {
    return res.status(409).json({
      error: 'NOT_EDITABLE',
      message: `Only a SUBMITTED, CHANGES_REQUESTED or REJECTED preference can be edited (current status: ${existing.status}).`,
    })
  }

  const currentCycle = await getCurrentAcademicCycle()
  const { subjectId, preferenceRank, requestedSections, labConfirmed } = req.body ?? {}
  const patch: Record<string, any> = {}

  if (subjectId !== undefined) {
    const subjects = await listSubjects()
    const subj = subjects.find(s => s.id === subjectId)
    if (!subj) {
      return res.status(400).json({ error: 'INVALID_SUBJECT', message: `Subject ${subjectId} is not canonical.` })
    }
    if ((subj as any).active === false) {
      return res.status(400).json({ error: 'INACTIVE_SUBJECT', message: `Subject ${subj.code} is inactive.` })
    }
    if (!subj.semester || !subj.year || !isSpecificSemester(subj.semester)) {
      return res.status(400).json({ error: 'SUBJECT_MISSING_CONTEXT', message: `Subject ${subj.code} has no canonical specific semester.` })
    }
    if (!semesterInCycle(subj.semester, currentCycle)) {
      return res.status(400).json({
        error: 'CYCLE_MISMATCH',
        message: `Subject ${subj.code} (Semester ${subj.semester}) is outside the current ${currentCycle} cycle.`,
      })
    }
    patch.subjectId = subj.id
    patch.semester = subj.semester
    patch.academicYear = subj.year
    if (subj.deliveryType === 'INTEGRATED') patch.labConfirmed = true
  }
  if (preferenceRank !== undefined) {
    if (!Number.isInteger(preferenceRank) || preferenceRank < 1) {
      return res.status(400).json({ error: 'INVALID_RANK', message: 'preferenceRank must be a positive integer.' })
    }
    patch.preferenceRank = preferenceRank
  }
  if (requestedSections !== undefined) {
    if (!Number.isInteger(requestedSections) || requestedSections < 0) {
      return res.status(400).json({ error: 'INVALID_REQUESTED_SECTIONS', message: 'requestedSections must be a non-negative integer.' })
    }
    patch.requestedSections = requestedSections
  }
  if (labConfirmed !== undefined) patch.labConfirmed = Boolean(labConfirmed)

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'NO_CHANGES', message: 'No editable fields supplied.' })
  }

  try {
    const updated = await editFacultyPreference(id, patch)
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: 'Preference not found.' })
    return res.json({ success: true, preference: updated })
  } catch (err: any) {
    return res.status(409).json({ error: 'LOCKED_PREFERENCE', message: err?.message || 'Cannot edit preference.' })
  }
})

// POST /api/hod/preferences/:id/review - APPROVE / REJECT / REQUEST CHANGES.
// Approval means "faculty X may teach subject Y"; it never allocates a section
// (that is Phase 5). The reviewer identity comes from the session, not the client.
facultyAllocationRouter.post('/hod/preferences/:id/review', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const { status, comment } = req.body
  const reviewerId = req.auth!.facultyId

  if (!['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(status)) {
    return res.status(400).json({ error: 'INVALID_STATUS', message: 'Status must be APPROVED, REJECTED, or CHANGES_REQUESTED' })
  }

  try {
    const updated = await reviewFacultyPreference(id, status, comment, reviewerId)
    if (!updated) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Preference not found' })
    }
    return res.json({ success: true, preference: updated })
  } catch (err: any) {
    return res.status(400).json({ error: 'LOCKED_PREFERENCE', message: err?.message || 'Cannot modify preference' })
  }
})

// GET /api/hod/allocation-settings
facultyAllocationRouter.get('/hod/allocation-settings', requireAuth, requireRole('HOD'), async (_req: Request, res: Response) => {
  const config = await getAllocationSettings()
  return res.json({ config })
})

// POST /api/hod/allocation-settings
facultyAllocationRouter.post('/hod/allocation-settings', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const { config } = req.body
  if (!config || !Array.isArray(config.bands)) {
    return res.status(400).json({ error: 'INVALID_CONFIG', message: 'Valid config object with bands array is required' })
  }
  const saved = await saveAllocationSettings(config)
  return res.json({ success: true, config: saved })
})

// GET /api/hod/academic-cycle - read the DB-configured current academic cycle.
facultyAllocationRouter.get('/hod/academic-cycle', requireAuth, requireRole('HOD'), async (_req: Request, res: Response) => {
  const currentCycle = await getCurrentAcademicCycle()
  return res.json({ currentCycle, allowedSemesters: semestersForCycle(currentCycle) })
})

// POST /api/hod/academic-cycle - set the current academic cycle (ODD|EVEN|BOTH).
// This is the explicit HOD/admin academic-cycle context override. It is
// password-gated (same HOD login password re-confirmation as the allocation
// reset) because it directly controls which semester's syllabus faculty see
// when submitting subject preferences -- switching it by accident would let
// teachers pick from the wrong semester's subject list entirely.
facultyAllocationRouter.post('/hod/academic-cycle', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const { cycle, password } = req.body ?? {}
  const passwordOk = await verifyFacultyPassword(req.auth!.facultyId, String(password || ''))
  if (!passwordOk) {
    return res.status(401).json({ error: 'INVALID_PASSWORD', message: 'Incorrect password. Academic cycle was not changed.' })
  }
  if (!isAcademicCycle(cycle)) {
    return res.status(400).json({ error: 'INVALID_CYCLE', message: 'cycle must be one of ODD, EVEN, BOTH.' })
  }
  const currentCycle = await setCurrentAcademicCycle(normalizeCycle(cycle))
  return res.json({ success: true, currentCycle, allowedSemesters: semestersForCycle(currentCycle) })
})

// POST /api/hod/reset-allocation-cycle - HOD-only, explicitly re-authenticated
// (current session + password + a separate reset passkey), closes out the
// current faculty-subject allocation cycle for a fresh round: clears
// preferences/teaching_assignments/generation runs (master data -- faculty,
// subjects, sections, labs, curriculum -- is never touched) and clears every
// faculty's allocationExperience so each teacher must complete their profile
// again before they can submit new preferences. This is deliberately harder
// to trigger than a normal action: wrong password or wrong passkey both fail
// closed, and only a HOD session can call it at all.
facultyAllocationRouter.post('/hod/reset-allocation-cycle', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const { password, passkey } = req.body ?? {}
  const passwordOk = await verifyFacultyPassword(req.auth!.facultyId, String(password || ''))
  if (!passwordOk) {
    return res.status(401).json({ error: 'RESET_CONFIRMATION_FAILED', message: 'Password is incorrect.' })
  }
  if (String(passkey || '') !== RESET_PASSKEY) {
    return res.status(401).json({ error: 'RESET_CONFIRMATION_FAILED', message: 'Reset passkey is incorrect.' })
  }
  const result = await resetWorkflowStateRepo()
  await clearAllFacultyAllocationExperience()
  return res.json({ success: true, message: 'Allocation cycle reset. Faculty must complete their profile experience before submitting new preferences.', ...result })
})

// PATCH /api/hod/faculty/:id - update allocation experience
facultyAllocationRouter.patch('/hod/faculty/:id', requireAuth, requireRole('HOD'), async (req: Request, res: Response) => {
  const facultyId = req.params.id
  const { allocationExperience } = req.body
  if (typeof allocationExperience !== 'number') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'allocationExperience number required' })
  }
  await updateFacultyExperience(facultyId, allocationExperience)
  return res.json({ success: true, facultyId, allocationExperience })
})

// POST /api/ai/explain-generation-failure - cloud LLM explanation of infeasibility report
facultyAllocationRouter.post('/ai/explain-generation-failure', async (req: Request, res: Response) => {
  const { report } = req.body

  const grokPrompt = [
    {
      role: 'system',
      content:
        'You are SCEDULAR AI, an expert timetable infeasibility explainer. Convert the following deterministic scheduling failure report into a clear, concise HOD explanation. Do not invent facts.',
    },
    {
      role: 'user',
      content: JSON.stringify(report || {}),
    },
  ]

  const llmResponse = await callGrokLlm(grokPrompt)

  const explanation = llmResponse
    ? {
        summary: llmResponse,
        rootCauses: ['Analyzed by Groq Cloud LLM based on deterministic solver output.'],
        recommendations: ['Review section count, faculty allocation, or lab room capacity.'],
      }
    : {
        summary: report?.summary || 'Timetable generation could not place all requested assignments based on current constraints.',
        rootCauses: Array.isArray(report?.rootCauses) && report.rootCauses.length > 0
          ? report.rootCauses
          : ['Deterministic solver encountered constraint conflicts during period placement.'],
        recommendations: Array.isArray(report?.recommendations) && report.recommendations.length > 0
          ? report.recommendations
          : ['Review section requirements, faculty subject assignments, and physical lab availability.'],
      }

  return res.json({ success: true, explanation, report, provider: llmResponse ? 'groq' : 'fallback' })
})

// POST /api/ai/chat - intent-routed & role-aware SCEDULAR AI assistant
facultyAllocationRouter.post('/ai/chat', requireAuth, async (req: Request, res: Response) => {
  const { message } = req.body
  const currentRole = req.auth!.role
  const userText = (message || '').trim()

  // HOD-controlled toggle: FACULTY access to SCEDULAR AI can be disabled from
  // Settings. HOD access is never gated by this flag.
  if (currentRole === 'FACULTY') {
    const settings = await getAllocationSettings()
    if (settings.facultyAiEnabled === false) {
      return res.json({
        reply: 'SCEDULAR AI has been disabled for faculty by your HOD. Contact your HOD if you need assistance.',
        role: currentRole,
        provider: 'disabled',
      })
    }
  }

  // ── Gather ALL live data from existing APIs ──
  const [
    allFaculty, allSections, allLabs, currentCycle, readiness, allSubjects,
    allPreferences, allSectionSubjects, allTeachingAssignments, scheduleConfig,
    labSubjectMappings,
  ] = await Promise.all([
    listFaculty(),
    listSections(),
    listLabs(),
    getCurrentAcademicCycle(),
    getSemesterReadinessStatus(),
    listSubjects(),
    getFacultyPreferences(),
    listSectionSubjects(),
    listTeachingAssignments(),
    getScheduleConfig(),
    listLabSubjectMappings(),
  ])

  // Latest timetable run
  let latestRun: any = null
  let latestAssignments: any[] = []
  let latestConflicts: any[] = []
  let latestUnscheduled: any[] = []
  try {
    const repo = await import('../db/repo.js')
    latestRun = await repo.getLatestValidRun()
    if (latestRun) {
      ;[latestAssignments, latestConflicts, latestUnscheduled] = await Promise.all([
        repo.getAssignmentsForRun(latestRun.id),
        repo.getConflictsForRun(latestRun.id),
        repo.getUnscheduledForRun(latestRun.id),
      ])
    }
  } catch { /* timetable data optional */ }

  const dbData = {
    facultyCount: allFaculty.length || 58,
    sectionCount: allSections.filter((s: any) => s.active !== false).length || 28,
    labCount: allLabs.length || 10,
  }

  // Build lookup maps for intent router and system prompt
  const sectionSubjectMap = new Map(allSectionSubjects.map((ss: any) => [ss.id, ss]))
  const sectionMap = new Map(allSections.map((s: any) => [s.id, s]))
  const subjectMap = new Map(allSubjects.map((s: any) => [s.id, s]))
  const facultyMap = new Map(allFaculty.map((f: any) => [f.id, f]))

  // 1. Direct Intent Routing — data-aware intelligent answers without LLM
  const directReply = getKnowledgeResponse(userText, currentRole, {
    facultyCount: dbData.facultyCount, sectionCount: dbData.sectionCount, labCount: dbData.labCount,
    allFaculty, allSections, allSubjects, allPreferences, allSectionSubjects,
    allTeachingAssignments, allLabs, readiness, currentCycle,
    sectionMap, subjectMap, facultyMap, sectionSubjectMap,
    latestAssignments, latestConflicts, latestUnscheduled, latestRun,
    scheduleConfig, labSubjectMappings,
    authFacultyId: req.auth?.facultyId,
  })
  if (directReply) {
    return res.json({ reply: directReply, role: currentRole, provider: 'intent-router' })
  }

  // ── Build all data strings for the system prompt ──
  const readinessLines = readiness.map(r => {
    const s = r.canGenerate ? '✅ READY' : '❌ NOT READY'
    const reasons = r.canGenerate ? '' : ` — ${r.missingItems.slice(0, 3).join('; ')}${r.missingItems.length > 3 ? ` (+${r.missingItems.length - 3})` : ''}`
    return `${r.year} Sem ${r.semester}: ${s}${reasons}`
  }).join('\n')

  const subjectLines = allSubjects.map(s => `${s.code} | ${s.name} | ${s.year ?? '—'} Sem ${s.semester ?? '—'} | ${s.deliveryType} | ${s.category}`).join('\n')

  const sectionSubjectLines = allSectionSubjects.map((ss: any) => {
    const sec = sectionMap.get(ss.sectionId); const subj = subjectMap.get(ss.subjectId)
    return sec && subj ? `${sec.name} | ${subj.code} | T:${ss.theoryPeriods ?? 0}/wk L:${ss.labPeriods ?? 0}/wk` : null
  }).filter(Boolean).join('\n')

  const teachingLines = allTeachingAssignments.map((ta: any) => {
    const ss = sectionSubjectMap.get(ta.sectionSubjectId)
    if (!ss) return null
    const sec = sectionMap.get(ss.sectionId); const subj = subjectMap.get(ss.subjectId); const fac = facultyMap.get(ta.facultyId)
    return sec && subj && fac ? `${fac.name} → ${sec.name} | ${subj.code} | ${ta.component}` : null
  }).filter(Boolean).join('\n')

  const labLines = allLabs.map((l: any) => `${l.id}(${l.name})`).join(', ')
  const labMapLines = labSubjectMappings.map((m: any) => {
    const subj = subjectMap.get(m.subjectId); const sec = m.sectionId ? sectionMap.get(m.sectionId) : null
    return `${m.labId} → ${subj?.code ?? m.subjectId}${sec ? ` (${sec.name})` : ''}`
  }).join('\n')

  const scheduleLines = `Days: ${scheduleConfig.workingDays.join(', ')} | Periods: ${scheduleConfig.periods.map((p: any) => `${p.label}(${p.schedulable ? 'S' : 'B'})`).join(', ')}`

  const activeSections = allSections.filter((s: any) => s.active !== false)
  const sectionLines = activeSections.map(s => `${s.id} | ${s.name} | Y${s.year} S${s.semester} | students=${s.studentCount ?? '—'}`).join('\n')

  const facultyForPrompt = currentRole === 'HOD' ? allFaculty : allFaculty.filter(f => f.id === req.auth!.facultyId)
  const facultyLines = facultyForPrompt.map(f => `${f.id} | ${f.name} | ${f.designation ?? '—'} | exp=${f.allocationExperience ?? 'NOT SET'}`).join('\n')

  const prefsForPrompt = currentRole === 'HOD' ? allPreferences : allPreferences.filter(p => p.facultyId === req.auth!.facultyId)
  const prefLines = prefsForPrompt.map(p => {
    const subj = subjectMap.get(p.subjectId); const fn = facultyForPrompt.find(f => f.id === p.facultyId)?.name ?? p.facultyId
    return `${fn} | ${subj?.code ?? p.subjectId} | rank${p.preferenceRank} | ${p.status} | sec=${p.requestedSections}`
  }).join('\n')
  const noSubmit = currentRole === 'HOD' ? allFaculty.filter(f => !allPreferences.some(p => p.facultyId === f.id)).map(f => f.name).join(', ') : null

  let timetableInfo = 'No timetable generated yet.'
  if (latestRun) {
    timetableInfo = `Run#${latestRun.id}: ${latestRun.status} at ${latestRun.generatedAt}\nScheduled: ${latestAssignments.length} | Conflicts: ${latestConflicts.length} | Unscheduled: ${latestUnscheduled.length}`
    if (latestConflicts.length > 0) timetableInfo += `\nConflicts(first 5): ${latestConflicts.slice(0, 5).map((c: any) => c.type + ': ' + (c.description ?? '')).join('; ')}`
    if (latestUnscheduled.length > 0) timetableInfo += `\nUnscheduled(first 5): ${latestUnscheduled.slice(0, 5).map((u: any) => (u.subjectId ?? '') + ' ' + (u.sectionId ?? '') + ' ' + (u.reason ?? '')).join('; ')}`
  }

  const systemPrompt = `You are SCEDULAR AI for Panimalar Engg College (AI&DS Dept). Answer ANY question about the project using this live data. Be conversational, helpful, and concise. SCEDULAR by KERNUL TECH / Nivash.

WORKFLOW: faculty submit prefs → HOD reviews → HOD assigns sections → readiness check → CSP solver generates timetable.

LABS: ${labLines}
SCHEDULE: ${scheduleLines}
READINESS: ${readinessLines}

SUBJECTS (code|name|sem|type):
${subjectLines.split('\n').slice(0, 50).join('\n')}${subjectLines.split('\n').length > 50 ? '\n...(' + (subjectLines.split('\n').length - 50) + ' more)' : ''}

SECTIONS: ${sectionLines.split('\n').slice(0, 20).join('\n')}${sectionLines.split('\n').length > 20 ? '\n...(' + (sectionLines.split('\n').length - 20) + ' more)' : ''}

FACULTY${currentRole === 'FACULTY' ? '(you)' : ''} (id|name|designation|exp):
${facultyLines.split('\n').slice(0, 25).join('\n')}${facultyLines.split('\n').length > 25 ? '\n...(' + (facultyLines.split('\n').length - 25) + ' more)' : ''}

TEACHING (faculty→section|subject|component):
${teachingLines.split('\n').slice(0, 25).join('\n') || '(none)'}${teachingLines.split('\n').length > 25 ? '\n...(' + (teachingLines.split('\n').length - 25) + ' more)' : ''}

TIMETABLE: ${timetableInfo}

CONSTRAINTS: No faculty/section/lab collisions. Labs must be mapped. Unavailable periods respected. Lab sessions are 3-period contiguous blocks. Deterministic output.

Rules: Answer from data only. Be concise. If data not in prompt, say what IS available. Never invent facts.`

  const grokMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText || 'Hello' },
  ]

  const llmReply = await callGrokLlm(grokMessages)
  if (llmReply) {
    return res.json({ reply: llmReply, role: currentRole, provider: 'groq' })
  }

  // Fallback answer — smart contextual reply when LLM is unavailable
  const lowerQ = (userText || '').toLowerCase()
  let fallbackReply = ''

  if (lowerQ.includes('who is hod') || lowerQ.includes('hod name') || lowerQ.includes('who is the hod')) {
    fallbackReply = 'The HOD (Head of Department) for AI & DS at Panimalar Engineering College manages faculty allocations, reviews preferences, assigns teaching loads, and oversees timetable generation. You are currently logged in as HOD.'
  } else if (lowerQ.includes('what is') || lowerQ.includes('what does') || lowerQ.includes('use of') || lowerQ.includes('purpose')) {
    fallbackReply = 'SCEDULAR is a timetable scheduling and academic resource allocation system for the Department of AI & Data Science at Panimalar Engineering College. It handles:\n- Faculty subject preference collection and review\n- Teaching assignment allocation (faculty → section → subject)\n- Readiness validation for each semester\n- Deterministic CSP-based timetable generation with conflict detection\n- Lab room mapping and scheduling\n\nYou can explore these features from the sidebar navigation.'
  } else if (lowerQ.includes('how to') || lowerQ.includes('how do') || lowerQ.includes('where is') || lowerQ.includes('open') || lowerQ.includes('navigate')) {
    fallbackReply = 'Here are the main pages in SCEDULAR:\n- **Dashboard** — overview of project status and AI summary\n- **Faculty Management** — manage faculty records and experience\n- **Subject Management** — view curriculum and subjects\n- **Faculty Allocation** — submit/review subject preferences\n- **Section Allocation** — assign faculty to sections (HOD only)\n- **Generate Timetable** — run the CSP solver for a semester\n- **View Timetable** — view generated schedules\n- **Settings** — configure schedule, lab rooms, and AI settings\n\nUse the sidebar to navigate between pages.'
  } else if (lowerQ.includes('conflict') || lowerQ.includes('error') || lowerQ.includes('fail')) {
    fallbackReply = 'Timetable generation can fail due to:\n- Missing teaching assignments for some section-subjects\n- Unmapped lab rooms for lab-required subjects\n- Unavailable faculty periods conflicting with required slots\n- Insufficient time slots for all required classes\n\nCheck the Generate Timetable page for readiness status, or ask me a specific question about a semester.'
  } else if (lowerQ.includes('who created') || lowerQ.includes('who made') || lowerQ.includes('who built') || lowerQ.includes('who developed')) {
    fallbackReply = 'SCEDULAR was developed by KERNUL TECH, under the leadership of Nivash, a 2nd-year B.Tech Artificial Intelligence and Data Science student (Section K) at Panimalar Engineering College, in collaboration with Suganya Devi J, Faculty Member at Panimalar Engineering College. KERNUL TECH focuses on developing intelligent, technology-driven solutions that address real-world academic and institutional challenges.'
  } else {
    fallbackReply = `I'm SCEDULAR AI. I can help with questions about:\n- **Faculty** — who teaches what, workload, preferences\n- **Subjects** — curriculum, codes, delivery types\n- **Sections** — which sections exist, their subjects\n- **Timetable** — generation status, conflicts, free slots\n- **Labs** — room mappings, occupancy\n- **Readiness** — what's blocking generation\n- **Project** — what SCEDULAR does, who created it\n\nTry asking something like "Who teaches DBMS?" or "Show me Semester III readiness."`
  }

  return res.json({ reply: fallbackReply, role: currentRole, provider: 'fallback' })
})

function getKnowledgeResponse(query: string, currentRole: string, dbData: {
  facultyCount: number; sectionCount: number; labCount: number;
  allFaculty: any[]; allSections: any[]; allSubjects: any[];
  allPreferences: any[]; allSectionSubjects: any[];
  allTeachingAssignments: any[]; allLabs: any[];
  readiness: any[]; currentCycle: string;
  sectionMap: Map<string, any>; subjectMap: Map<string, any>;
  facultyMap: Map<string, any>; sectionSubjectMap: Map<string, any>;
  latestAssignments: any[]; latestConflicts: any[];
  latestUnscheduled: any[]; latestRun: any;
  scheduleConfig: any; labSubjectMappings: any[];
  authFacultyId?: string;
}): string | null {
  const lower = query.toLowerCase().trim()
  const { allFaculty, allSections, allSubjects, allPreferences, allSectionSubjects,
    allTeachingAssignments, allLabs, readiness, currentCycle,
    sectionMap, subjectMap, facultyMap, sectionSubjectMap,
    latestAssignments, latestConflicts, latestUnscheduled, latestRun,
    scheduleConfig, labSubjectMappings, authFacultyId } = dbData

  // ── IDENTITY ──
  if (lower.includes('who created') || lower.includes('who made') || lower.includes('who built') || lower.includes('who developed') || lower === 'who are you' || lower === 'what are you') {
    return '**SCEDULAR** was developed by **KERNUL TECH**, under the leadership of **Nivash**, a 2nd-year B.Tech AI & DS student (Section K) at Panimalar Engineering College, in collaboration with **Suganya Devi J**, Faculty Member. KERNUL TECH focuses on intelligent, technology-driven solutions for academic and institutional challenges.'
  }

  // ── MY TIMETABLE ──
  if (lower.includes('my timetable') || lower.includes('my schedule') || lower.includes('my classes') || lower.includes('my time table')) {
    if (currentRole === 'FACULTY' && authFacultyId) {
      const myAssignments = latestAssignments.filter((a: any) => a.facultyId === authFacultyId)
      if (myAssignments.length === 0) return 'No timetable has been generated yet, or you have no scheduled classes. Ask the HOD to generate the timetable first.'
      const lines = myAssignments.map((a: any) => {
        const sec = sectionMap.get(a.sectionId) ?? sectionMap.get(a.sectionName)
        const subj = subjectMap.get(a.subjectId) ?? subjectMap.get(a.subjectCode)
        return `- **${a.day ?? '—'}** Period ${a.period ?? '—'}: ${sec?.name ?? a.sectionId ?? '—'} | ${subj?.name ?? a.subjectId ?? '—'} (${a.component ?? '—'})`
      })
      return `**Your Timetable (${myAssignments.length} classes/week):**\n${lines.join('\n')}`
    }
    if (latestAssignments.length === 0) return 'No timetable has been generated yet. Go to Generate Timetable to create one.'
    const secs = [...new Set(latestAssignments.map((a: any) => a.sectionId ?? a.sectionName))].length
    return `**Timetable Overview:** ${latestAssignments.length} total scheduled classes across ${secs} sections. Use **View Timetable** to see the full schedule.`
  }

  // ── SECTION TIMETABLE ──
  if ((lower.includes('show') || lower.includes('view') || lower.includes('list')) && (lower.includes('timetable') || lower.includes('schedule')) && !lower.includes('readiness')) {
    const secMatch = allSections.find((s: any) => {
      const sn = s.name.toLowerCase(); const sid = s.id.toLowerCase()
      if (lower.includes(sn) || lower.includes(sid)) return true
      const m = lower.match(/(?:year|yr|y)\s*(\d)/); const l = lower.match(/\b([a-k])\b/)
      return m && l && (sid === `y${m[1]}-${l[1]}`)
    })
    if (secMatch) {
      const secAssignments = latestAssignments.filter((a: any) => (a.sectionId ?? a.sectionName) === secMatch.id)
      if (secAssignments.length === 0) return `No timetable generated yet for Section **${secMatch.name}**.`
      const lines = secAssignments.map((a: any) => {
        const subj = subjectMap.get(a.subjectId) ?? subjectMap.get(a.subjectCode)
        const fac = facultyMap.get(a.facultyId)
        return `- **${a.day ?? '—'}** P${a.period ?? '—'}: ${subj?.name ?? a.subjectId ?? '—'} — ${fac?.name ?? a.facultyId ?? '—'} (${a.component ?? '—'})`
      })
      return `**${secMatch.name} Timetable (${secAssignments.length} classes):**\n${lines.join('\n')}`
    }
  }

  // ── PREFERENCES STATUS ──
  if (lower.includes('submit') && lower.includes('preference') || lower.includes('submitted their preference') || lower.includes('submitted preference') || lower.includes('preference submitted') || lower.includes('who submitted') || lower.includes('preferences status') || lower.includes('preference status')) {
    const submitted = allPreferences.filter((p: any) => p.status !== 'DRAFT')
    const draft = allPreferences.filter((p: any) => p.status === 'DRAFT')
    const notSubmitted = allFaculty.filter((f: any) => !allPreferences.some((p: any) => p.facultyId === f.id))
    let reply = `**Preference Submission Status:**\n- ✅ Submitted: **${submitted.length}** faculty\n- 📝 Draft: **${draft.length}** faculty\n- ❌ Not submitted: **${notSubmitted.length}** faculty`
    if (notSubmitted.length > 0) reply += `\n\n**Did not submit:** ${notSubmitted.map((f: any) => f.name).join(', ')}`
    return reply
  }
  if (lower.includes('who did not submit') || lower.includes('who hasn') || lower.includes('not submitted') || lower.includes('missing preference')) {
    const notSubmitted = allFaculty.filter((f: any) => !allPreferences.some((p: any) => p.facultyId === f.id))
    if (notSubmitted.length === 0) return '**All faculty have submitted their preferences!** ✅'
    return `**Faculty who have NOT submitted preferences (${notSubmitted.length}):**\n${notSubmitted.map((f: any) => `- **${f.name}** (${f.id}) — ${f.designation ?? 'Faculty'}`).join('\n')}`
  }

  // ── FACULTY LIST ──
  if (lower.includes('how many faculty') || lower.includes('faculty count') || lower.includes('list faculty') || lower.includes('all faculty') || lower.includes('faculty list') || lower.includes('who is the faculty')) {
    const lines = allFaculty.map((f: any) => `- **${f.name}** (${f.id}) — ${f.designation ?? 'Faculty'} | Exp: ${f.allocationExperience ?? 'NOT SET'} yrs`)
    return `**Faculty (${allFaculty.length} total):**\n${lines.join('\n')}`
  }

  // ── WHO TEACHES SUBJECT ──
  if (lower.startsWith('who teach') || lower.startsWith('who teaches') || (lower.includes('teaches ') && !lower.includes('timetable'))) {
    const words = query.replace(/who\s+teach(es)?\s*/i, '').replace(/\?/g, '').trim()
    const match = findSubject(words, allSubjects)
    if (match) {
      const sectionSubjs = allSectionSubjects.filter((ss: any) => ss.subjectId === match.id)
      const assigned = allTeachingAssignments.filter((ta: any) => sectionSubjs.some((ss: any) => ss.id === ta.sectionSubjectId))
      if (assigned.length === 0) return `**${match.name} (${match.code})** — No faculty assigned yet.`
      const lines = assigned.map((ta: any) => {
        const ss = sectionSubjectMap.get(ta.sectionSubjectId)
        const sec = ss ? sectionMap.get(ss.sectionId) : null
        const fac = facultyMap.get(ta.facultyId)
        return `- **${fac?.name ?? ta.facultyId}** → ${sec?.name ?? '—'} (${ta.component})`
      })
      return `**Who teaches ${match.name} (${match.code}):**\n${lines.join('\n')}`
    }
  }

  // ── SECTION COUNT / LIST ──
  if (lower.includes('how many section') || lower.includes('section count') || lower.includes('list section') || lower.includes('all section')) {
    const semMatch = query.match(/(?:sem|semester)\s*(\d+|[ivx]+)/i)
    let sections = allSections.filter((s: any) => s.active !== false)
    if (semMatch) {
      const romanMap: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII' }
      const sem = romanMap[semMatch[1]] || semMatch[1].toUpperCase()
      sections = sections.filter((s: any) => s.semester === sem)
    }
    const lines = sections.map((s: any) => `- **${s.name}** (${s.id}) — Year ${s.year} Sem ${s.semester}`)
    return `**Sections (${sections.length} total):**\n${lines.join('\n')}`
  }

  // ── SUBJECT LIST ──
  if (lower.includes('how many subject') || lower.includes('subject count') || lower.includes('list subject') || lower.includes('all subject') || lower.includes('what subject') || lower.includes('subjects in') || lower.includes('subjects for') || lower.includes('subjects taught')) {
    const semMatch = query.match(/(?:sem|semester)\s*(\d+|[ivx]+)/i)
    const yearMatch = query.match(/(?:year|yr)\s*(\d)/i)
    const typeMatch = query.match(/(lab|integrated|theory|project)/i)
    let subjects = allSubjects
    if (semMatch) {
      const romanMap: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII' }
      const sem = romanMap[semMatch[1]] || semMatch[1].toUpperCase()
      subjects = subjects.filter((s: any) => s.semester === sem)
    } else if (yearMatch) {
      const yearNum = parseInt(yearMatch[1])
      const yearLabel = `Year ${yearNum}`
      const semesters = ['I','II','III','IV','V','VI','VII','VIII']
      const yearSems = semesters.slice((yearNum - 1) * 2, yearNum * 2)
      subjects = subjects.filter((s: any) => yearSems.includes(s.semester))
    } else if (typeMatch) {
      const type = typeMatch[1].toUpperCase()
      subjects = subjects.filter((s: any) => s.deliveryType?.toUpperCase().includes(type))
    }
    const lines = subjects.map((s: any) => `- **${s.code}** — ${s.name} (Sem ${s.semester ?? '—'}, ${s.deliveryType})`)
    return `**Subjects (${subjects.length} total):**\n${lines.join('\n')}`
  }

  // ── LAB LIST ──
  if (lower.includes('lab') && (lower.includes('available') || lower.includes('list') || lower.includes('what') || lower.includes('which') || lower.includes('how many') || lower.includes('show lab'))) {
    const labLines = allLabs.map((l: any) => `- **${l.id}** — ${l.name}`)
    if (labLines.length === 0) return 'No labs configured yet.'
    return `**Labs (${allLabs.length} total):**\n${labLines.join('\n')}`
  }

  // ── TEACHING ASSIGNMENTS ──
  if (lower.includes('teaching assignment') || lower.includes('who teaches what') || lower.includes('all assignment') || lower.includes('show allocation')) {
    if (allTeachingAssignments.length === 0) return 'No teaching assignments have been made yet.'
    const lines = allTeachingAssignments.map((ta: any) => {
      const ss = sectionSubjectMap.get(ta.sectionSubjectId)
      const sec = ss ? sectionMap.get(ss.sectionId) : null
      const subj = ss ? subjectMap.get(ss.subjectId) : null
      const fac = facultyMap.get(ta.facultyId)
      return `- **${fac?.name ?? ta.facultyId}** → ${sec?.name ?? '—'} | ${subj?.code ?? '—'} (${ta.component})`
    })
    return `**Teaching Assignments (${allTeachingAssignments.length} total):**\n${lines.join('\n')}`
  }

  // ── READINESS ──
  if (lower.includes('readiness') || lower.includes('ready') || lower.includes('can generate') || lower.includes('generation status')) {
    const lines = readiness.map((r: any) => {
      const icon = r.canGenerate ? '✅' : '❌'
      return `- ${icon} **${r.year} Sem ${r.semester}:** ${r.canGenerate ? 'READY' : 'NOT READY — ' + r.missingItems.slice(0, 3).join('; ')}`
    })
    return `**Semester Readiness:**\n${lines.join('\n')}`
  }
  if (lower.includes('why') && (lower.includes('not ready') || lower.includes('cannot generate') || lower.includes("can't generate") || lower.includes('block'))) {
    const notReady = readiness.filter((r: any) => !r.canGenerate)
    if (notReady.length === 0) return 'All semesters are ready for generation! ✅'
    const lines = notReady.map((r: any) => `- **${r.year} Sem ${r.semester}:** ${r.missingItems.map((m: string) => '• ' + m).join('\n  ')}`)
    return `**Why generation is blocked:**\n${lines.join('\n')}`
  }

  // ── CONFLICTS ──
  if (lower.includes('conflict') || lower.includes('clash')) {
    if (latestConflicts.length > 0) {
      const lines = latestConflicts.slice(0, 10).map((c: any) => `- **${c.type}:** ${c.description ?? ''}`)
      return `**Conflicts Found (${latestConflicts.length}):**\n${lines.join('\n')}`
    }
    return '✅ No scheduling conflicts detected.'
  }

  // ── UNSCHEDULED ──
  if (lower.includes('unscheduled') || lower.includes('missing class') || lower.includes('not placed')) {
    if (latestUnscheduled.length > 0) {
      const lines = latestUnscheduled.slice(0, 10).map((u: any) => `- ${u.subjectId ?? ''} ${u.sectionId ?? ''} — ${u.reason ?? 'No reason'}`)
      return `**Unscheduled (${latestUnscheduled.length}):**\n${lines.join('\n')}`
    }
    return '✅ All classes have been scheduled.'
  }

  // ── TIMETABLE STATUS ──
  if (lower.includes('timetable') && (lower.includes('generated') || lower.includes('status') || lower.includes('last'))) {
    if (!latestRun) return 'No timetable has been generated yet.'
    return `**Latest Run #${latestRun.id}:** ${latestRun.status} | ${latestAssignments.length} classes | ${latestConflicts.length} conflicts | ${latestUnscheduled.length} unscheduled`
  }

  // ── LAB QUERIES ──
  if (lower.includes('lab') && (lower.includes('room') || lower.includes('list') || lower.includes('how many'))) {
    const lines = allLabs.map((l: any) => `- **${l.id}** — ${l.name}`)
    return `**Lab Rooms (${allLabs.length} total):**\n${lines.join('\n')}`
  }

  // ── EXPERIENCE ──
  if (lower.includes('experience') && (lower.includes('set') || lower.includes('allocation') || lower.includes('which'))) {
    const lines = allFaculty.map((f: any) => `- **${f.name}** — ${f.allocationExperience != null ? f.allocationExperience + ' yrs' : 'NOT SET'}`)
    return `**Faculty Experience:**\n${lines.join('\n')}`
  }

  // ── HOD ──
  if (lower.includes('who is hod') || lower.includes('hod name') || lower.includes('who is the hod')) {
    return 'The **HOD** manages faculty preferences, teaching assignments, section config, lab mapping, and timetable generation. You are logged in as **HOD**.'
  }

  // ── WORKFLOW ──
  if (lower.includes('workflow') || lower.includes('how does') || lower.includes('how is') || lower.includes('how do')) {
    const days = scheduleConfig?.workingDays?.join(', ') ?? 'Monday–Saturday'
    const periodCount = scheduleConfig?.periods?.length ?? 8
    return `**Workflow:**\n1. Seed data → 2. Faculty submit preferences → 3. HOD reviews → 4. HOD assigns sections → 5. Readiness check → 6. CSP solver generates timetable\n\n**Schedule:** ${days}, ${periodCount} periods/day.`
  }

  // ── MY PREFERENCES ──
  if (lower.includes('my preference') || lower.includes('show my pref')) {
    if (currentRole === 'FACULTY' && authFacultyId) {
      const myPrefs = allPreferences.filter((p: any) => p.facultyId === authFacultyId)
      if (myPrefs.length === 0) return 'No preferences submitted yet.'
      const lines = myPrefs.map((p: any) => {
        const subj = subjectMap.get(p.subjectId)
        return `- **${subj?.code ?? p.subjectId}** — ${subj?.name ?? '?'} | Rank ${p.preferenceRank} | ${p.status}`
      })
      return `**Your Preferences:**\n${lines.join('\n')}`
    }
    return null
  }

  // ── ABOUT ──
  if (lower.includes('what is scedular') || lower.includes('about scedular') || lower.includes('what does scedular do') || lower.includes('use of') || lower.includes('purpose')) {
    return '**SCEDULAR** is a timetable scheduling and academic resource allocation system for AI & DS at Panimalar Engineering College. It handles faculty preferences, teaching assignments, readiness validation, and CSP-based timetable generation.'
  }

  // ── FREE SLOTS ──
  if (lower.includes('free') && (lower.includes('teacher') || lower.includes('faculty') || lower.includes('period'))) {
    if (latestAssignments.length === 0) return 'No timetable generated yet.'
    const occupied = new Set(latestAssignments.map((a: any) => `${a.day}-${a.period}`))
    const days = scheduleConfig?.workingDays?.length ?? 6
    const periods = scheduleConfig?.periods?.filter((p: any) => p.schedulable).length ?? 8
    return `**Slot Utilization:** ${occupied.size} occupied / ${days * periods} total = ${days * periods - occupied.size} free slots`
  }

  // ── SUBJECT + SECTION (fuzzy) ──
  if (lower.includes('handling') || lower.includes('handle') || lower.includes('assigned to') ||
      lower.includes('for section') || lower.includes('in section') || lower.includes('for y') || lower.includes('in y')) {
    const words = query.replace(/\?/g, '').trim()
    const wordsLower = words.toLowerCase()
    const subjMatch = findSubject(words, allSubjects)
    const secMatch = allSections.find((s: any) => {
      const sid = s.id.toLowerCase()
      if (wordsLower.includes(sid)) return true
      const m = wordsLower.match(/(?:year|yr|y)\s*(\d)/); const l = wordsLower.match(/\b([a-k])\b/)
      return m && l && (sid === `y${m[1]}-${l[1]}`)
    })
    if (subjMatch && secMatch) {
      const ss = allSectionSubjects.find((s: any) => s.subjectId === subjMatch.id && s.sectionId === secMatch.id)
      if (!ss) return `**${subjMatch.name} (${subjMatch.code})** is not mapped to Section **${secMatch.name}**.`
      const assigned = allTeachingAssignments.filter((ta: any) => ta.sectionSubjectId === ss.id)
      if (assigned.length === 0) return `**${subjMatch.name} (${subjMatch.code})** in **${secMatch.name}** — ❌ No faculty assigned.`
      const lines = assigned.map((ta: any) => {
        const fac = facultyMap.get(ta.facultyId)
        return `- **${fac?.name ?? ta.facultyId}** (${ta.component})`
      })
      return `**${subjMatch.name} (${subjMatch.code})** → **${secMatch.name}:**\n${lines.join('\n')}`
    }
    if (subjMatch) {
      const sectionSubjs = allSectionSubjects.filter((ss: any) => ss.subjectId === subjMatch.id)
      const assigned = allTeachingAssignments.filter((ta: any) => sectionSubjs.some((ss: any) => ss.id === ta.sectionSubjectId))
      if (assigned.length === 0) return `**${subjMatch.name} (${subjMatch.code})** — No faculty assigned.`
      const lines = assigned.map((ta: any) => {
        const ss = sectionSubjectMap.get(ta.sectionSubjectId)
        const sec = ss ? sectionMap.get(ss.sectionId) : null
        const fac = facultyMap.get(ta.facultyId)
        return `- **${fac?.name ?? ta.facultyId}** → ${sec?.name ?? '—'} (${ta.component})`
      })
      return `**${subjMatch.name} (${subjMatch.code})** assignments:\n${lines.join('\n')}`
    }
    if (secMatch) {
      const sectionSubjs = allSectionSubjects.filter((ss: any) => ss.sectionId === secMatch.id)
      if (sectionSubjs.length === 0) return `Section **${secMatch.name}** has no subjects.`
      const lines = sectionSubjs.map((ss: any) => {
        const subj = subjectMap.get(ss.subjectId)
        const assigned = allTeachingAssignments.filter((ta: any) => ta.sectionSubjectId === ss.id)
        const facNames = assigned.map((ta: any) => facultyMap.get(ta.facultyId)?.name ?? ta.facultyId).join(', ') || '❌ Unassigned'
        return `- **${subj?.code ?? ss.subjectId}** — ${subj?.name ?? '?'} | ${facNames}`
      })
      return `**${secMatch.name} — Subjects & Faculty:**\n${lines.join('\n')}`
    }
  }

  // ── CSP / SOLVER / UNAVAILABLE / GENERAL KNOWLEDGE ──
  if (lower.includes('csp') || lower.includes('solver') || lower.includes('constraint')) {
    return '**CSP (Constraint Satisfaction Problem) Solver** is the timetable generation engine:\n1. Takes teaching assignments, lab mappings, schedule config as input\n2. Assigns TIME slots and ROOM/LAB to each class\n3. Enforces: no faculty/section/lab collisions, respects unavailable periods\n4. Lab sessions: 3-period contiguous blocks, no crossing lunch\n5. Deterministic: same input always gives same output\n6. Reports unschedulable items with reasons on failure'
  }
  if (lower.includes('unavailable') || lower.includes('not available') || lower.includes('leave')) {
    return '**Faculty Unavailability:** Faculty can declare periods they are unavailable (e.g., on leave, other duties). The CSP solver respects these and never schedules them during those periods. Check Faculty Management to view/edit unavailability records.'
  }
  if (lower.includes('period') && (lower.includes('how many') || lower.includes('count') || lower.includes('per day'))) {
    const periodCount = scheduleConfig?.periods?.filter((p: any) => p.schedulable).length ?? 8
    const days = scheduleConfig?.workingDays?.join(', ') ?? 'Mon–Fri'
    return `**Schedule:** ${periodCount} schedulable periods per day, working days: ${days}. Total weekly slots: ${scheduleConfig?.workingDays?.length ?? 5} × ${periodCount} = ${(scheduleConfig?.workingDays?.length ?? 5) * periodCount}.`
  }
  if (lower.includes('lab session') || lower.includes('lab block') || lower.includes('contiguous')) {
    return '**Lab Sessions** are scheduled as contiguous blocks of 3 periods (configurable). They cannot be split across time slots or cross the lunch break. Each lab session needs a mapped lab room (CC15–CC46).'
  }
  if (lower.includes('experience band') || lower.includes('allocation experience') || lower.includes('years eligible')) {
    return '**Experience Band Policy:**\n- 0–9 yrs: Eligible for Year 1/2 subjects, max 1 preference\n- 10–<13 yrs: Eligible for Year 2/3/4, max 2 preferences (max 1 per year)\n- 13+ yrs: Eligible for Year 3/4, max 2 preferences (max 1 per year)\n\nThis determines which subjects a faculty can submit preferences for.'
  }
  if (lower.includes('what is') && (lower.includes('section') || lower.includes('subject') || lower.includes('teaching'))) {
    return '**Section-Subject mapping** defines which subjects are taught to which sections, with weekly theory and lab period counts. **Teaching assignments** link a specific faculty member to a section-subject pair (e.g., Dr. X teaches DBMS to Section Y2-A). Both must be configured before timetable generation.'
  }
  if (lower.includes('project') && (lower.includes('what is') || lower.includes('tell me') || lower.includes('about'))) {
    return '**SCEDULAR** is a timetable scheduling and academic resource allocation system for the Dept of AI & Data Science at Panimalar Engineering College. Developed by **KERNUL TECH** (led by Nivash). It handles faculty preferences, teaching assignments, CSP-based timetable generation, conflict detection, and lab scheduling.'
  }
  if (lower.includes('indegrated') || lower.includes('integrated') || lower.includes('lab subject') || lower.includes('lab required')) {
    const labSubjects = allSubjects.filter((s: any) => s.deliveryType === 'INTEGRATED' || s.deliveryType === 'LAB')
    if (labSubjects.length === 0) return 'No lab subjects found.'
    const lines = labSubjects.map((s: any) => `- **${s.code}** — ${s.name} (Sem ${s.semester ?? '—'}, ${s.deliveryType})`)
    return `**Lab/Integrated Subjects (${labSubjects.length}):**\n${lines.join('\n')}`
  }
  if (lower.includes('how to') || lower.includes('how do') || lower.includes('where is') || lower.includes('navigate')) {
    return '**SCEDULAR Pages:**\n- **Dashboard** — overview & AI summary\n- **Faculty Management** — manage faculty records\n- **Subject Management** — view curriculum\n- **Faculty Allocation** — submit/review preferences\n- **Section Allocation** — assign faculty to sections (HOD)\n- **Generate Timetable** — run CSP solver\n- **View Timetable** — view schedules\n- **Settings** — configure schedule, labs, AI'
  }
  if (lower.includes('conflict') || lower.includes('clash') || lower.includes('collision')) {
    if (latestConflicts.length > 0) {
      const lines = latestConflicts.slice(0, 10).map((c: any) => `- **${c.type}:** ${c.description ?? ''}`)
      return `**Conflicts Found (${latestConflicts.length}):**\n${lines.join('\n')}`
    }
    return '**No conflicts** currently. Conflicts detected during generation:\n- Faculty collision (same teacher, 2 classes at same time)\n- Section collision (same section, 2 classes at same time)\n- Lab collision (same lab room, 2 classes at same time)\n- Unavailable period violation'
  }

  return null
}

// ── Helper: fuzzy subject match ──
function findSubject(query: string, allSubjects: any[]): any {
  const q = query.toLowerCase().replace(/\?/g, '').trim()
  const abbrevMap: Record<string, string> = { 'oops': 'object oriented', 'dbms': 'database', 'os': 'operating system', 'cn': 'computer network', 'se': 'software engineering', 'ml': 'machine learning', 'dl': 'deep learning', 'ai': 'artificial intelligence', 'ds': 'data structure', 'aies': 'ai & ethics', 'java': 'java', 'python': 'python', 'coi': 'computer organization' }
  const stopWords = new Set(['the', 'a', 'an', 'for', 'in', 'of', 'to', 'and', 'or', 'is', 'my', 'i', 'we', 'you', 'do', 'did', 'does', 'has', 'have', 'had', 'was', 'were', 'will', 'can', 'may', 'all', 'any', 'each', 'who', 'what', 'which', 'how', 'when', 'where', 'why', 'section', 'sections', 'subject', 'subjects', 'faculty', 'teacher', 'teach', 'teaches', 'handling', 'handle', 'assigned', 'semester', 'sem', 'year'])

  // First pass: try abbreviation matches (highest confidence)
  for (const qw of q.split(/\s+/)) {
    if (abbrevMap[qw]) {
      const match = allSubjects.find((s: any) => s.name.toLowerCase().includes(abbrevMap[qw]))
      if (match) return match
    }
  }

  // Second pass: exact code/name match
  const exactMatch = allSubjects.find((s: any) => {
    const sl = s.name.toLowerCase(); const sc = s.code.toLowerCase()
    return q.includes(sc) || q.includes(sl) || sl.includes(q) || q.includes(sl)
  })
  if (exactMatch) return exactMatch

  // Third pass: word-level fuzzy match (skip stop words)
  return allSubjects.find((s: any) => {
    const sl = s.name.toLowerCase()
    const nameWords = sl.split(/\s+/)
    for (const qw of q.split(/\s+/)) {
      if (qw.length < 3 || stopWords.has(qw)) continue
      for (const nw of nameWords) {
        if (nw.length < 3) continue
        if (nw.startsWith(qw) || qw.startsWith(nw)) return true
      }
    }
    return false
  })
}
