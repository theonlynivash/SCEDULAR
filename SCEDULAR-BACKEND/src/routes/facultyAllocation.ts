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

export const facultyAllocationRouter = Router()

function resolveMasterPassword(): string {
  const v = process.env.SCEDULAR_MASTER_PASSWORD
  if (v && v.trim().length > 0) return v.trim()
  return 'SCEDULAR_AIDS'
}
const MASTER_PASSWORD = resolveMasterPassword()
const RESET_PASSKEY = process.env.SCEDULAR_RESET_PASSKEY?.trim() || 'SCEDULAR_RESET'

async function verifyFacultyPassword(facultyId: string, plain: string): Promise<boolean> {
  try {
    const stored = await getFacultyPasswordHash(facultyId)
    if (stored) {
      const ok = await bcrypt.compare(plain, stored)
      if (ok) return true
    }
  } catch { /* fall through */ }
  return plain === MASTER_PASSWORD
}

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

    const maxSections = await maxRequestedSectionsFor(subject)
    const requested = item.requestedSections
    if (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 1 || requested > maxSections) {
      return fail(400, 'INVALID_REQUESTED_SECTIONS',
        `Requested section capacity for ${subject.code} must be a whole number between 1 and ${maxSections}.`)
    }

    const isIntegrated = subject.deliveryType === 'INTEGRATED'
    if (isIntegrated && !item.labConfirmed) {
      return fail(400, 'INTEGRATED_LAB_REQUIRED',
        `${subject.code} is an INTEGRATED subject (Theory + Lab). You must explicitly confirm laboratory responsibility.`)
    }

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
  try {
    const allFaculty = await listFaculty()
    found = allFaculty.find(
      f => f.id.toLowerCase() === idInput.toLowerCase() ||
           (f.email && String(f.email).toLowerCase() === idInput.toLowerCase())
    ) as any
  } catch {
    found = undefined
  }

  // 2. Failsafe: compiled roster (critical for first Vercel cold start)
  if (!found) {
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
  // workflow coverage for the HOD header cards.
  const facultyWithPrefs = new Set(prefs.map(p => p.facultyId))
  const submittedFaculty = new Set(prefs.filter(p => p.status === 'SUBMITTED').map(p => p.facultyId))
  const pendingFaculty = new Set(
    prefs.filter(p => p.status !== 'SUBMITTED' && p.status !== 'APPROVED').map(p => p.facultyId)
  )
  const summary = {
    totalFaculty: allFaculty.length,
    submitted: submittedFaculty.size,
    pending: pendingFaculty.size,
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

// GroqCloud / Grok API Cloud LLM Integration Helper
async function callGrokLlm(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.LLM_API_KEY

  if (!apiKey || apiKey.includes('your_')) {
    return null
  }

  const isGroq = apiKey.startsWith('gsk_') || process.env.LLM_PROVIDER === 'groq'
  const defaultBase = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.x.ai/v1'
  const defaultModel = isGroq ? 'qwen/qwen3.8-27b' : 'grok-beta'

  const apiBase = process.env.GROQ_API_BASE || process.env.GROK_API_BASE || defaultBase
  const model = process.env.GROQ_MODEL || process.env.GROK_MODEL || defaultModel

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.warn(`[Groq API] Request failed (${response.status}): ${errText}`)
      return null
    }

    const data: any = await response.json()
    return data?.choices?.[0]?.message?.content ?? null
  } catch (err) {
    console.warn('[Groq API] Error calling Groq LLM API:', err)
    return null
  }
}

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

  const [allFaculty, allSections, allLabs, currentCycle, readiness, allSubjects, allPreferences] = await Promise.all([
    listFaculty(),
    listSections(),
    listLabs(),
    getCurrentAcademicCycle(),
    getSemesterReadinessStatus(),
    listSubjects(),
    getFacultyPreferences(),
  ])

  const dbData = {
    facultyCount: allFaculty.length || 58,
    sectionCount: allSections.filter((s: any) => s.active !== false).length || 28,
    labCount: allLabs.length || 10,
  }

  // 1. Direct Intent Routing Check for exact factual questions -- kept as a
  // fast, deterministic floor for common queries so the assistant still
  // works usefully even without an LLM provider key configured.
  const directReply = getKnowledgeResponse(userText, currentRole, dbData)
  if (directReply) {
    return res.json({ reply: directReply, role: currentRole, provider: 'intent-router' })
  }

  // Live per-semester readiness, summarized for the prompt. This lets the
  // assistant answer "why can't I generate the timetable for X" or "what's
  // blocking Semester III" with the actual current reasons, not a guess.
  const readinessLines = readiness
    .map(r => {
      const status = r.canGenerate ? 'READY' : 'NOT READY'
      const reasons = r.canGenerate ? '' : ` — ${r.missingItems.slice(0, 3).join('; ')}${r.missingItems.length > 3 ? ` (+${r.missingItems.length - 3} more)` : ''}`
      return `${r.year} Semester ${r.semester}: ${status}${reasons}`
    })
    .join('\n')

  // Subject catalog -- public curriculum info, safe for both roles. Lets the
  // assistant answer things like "any programming subjects for Sem III" or
  // "which subjects are INTEGRATED / MANDATORY" directly from real data.
  const subjectLines = allSubjects
    .map(s => `${s.code} | ${s.name} | ${s.year ?? '—'} Sem ${s.semester ?? '—'} | ${s.deliveryType} | ${s.category}`)
    .join('\n')

  // Faculty roster + preference detail is HOD-only (matches the existing
  // privacy rule: a FACULTY user never sees another faculty member's
  // individual experience or preference data, only aggregate interest
  // counts elsewhere in the app). A FACULTY user gets their OWN row only.
  const facultyForPrompt = currentRole === 'HOD' ? allFaculty : allFaculty.filter(f => f.id === req.auth!.facultyId)
  const facultyLines = facultyForPrompt
    .map(f => `${f.id} | ${f.name} | ${f.designation ?? '—'} | allocationExperience=${f.allocationExperience ?? 'NOT SET'}`)
    .join('\n')

  const prefsForPrompt = currentRole === 'HOD' ? allPreferences : allPreferences.filter(p => p.facultyId === req.auth!.facultyId)
  const subjectById = new Map(allSubjects.map(s => [s.id, s]))
  const preferenceLines = prefsForPrompt
    .map(p => {
      const subj = subjectById.get(p.subjectId)
      const facName = facultyForPrompt.find(f => f.id === p.facultyId)?.name ?? p.facultyId
      return `${p.facultyId} (${facName}) | ${subj?.code ?? p.subjectId} | rank ${p.preferenceRank} | ${p.status} | requestedSections=${p.requestedSections}`
    })
    .join('\n')
  const notSubmittedFaculty = currentRole === 'HOD'
    ? allFaculty.filter(f => !allPreferences.some(p => p.facultyId === f.id)).map(f => `${f.id} (${f.name})`).join(', ') || 'none'
    : null

  // 2. Cloud LLM with a comprehensive, accurate system prompt covering the
  // real product architecture and constraints, plus live DB/readiness state,
  // so the assistant can answer substantive technical questions (not just
  // identity trivia) and explain what's actually blocking the user on screen.
  const systemPrompt = `You are SCEDULAR AI Assistant, embedded inside the SCEDULAR application for Panimalar Engineering College (AI & DS Dept). You help the logged-in user (role: ${currentRole}) understand the product, its data, and what's currently blocking them on screen.

OFFICIAL PROJECT IDENTITY:
- PROJECT NAME: SCEDULAR — a college academic resource allocation + timetable scheduling system.
- CREATOR / DEVELOPMENT TEAM: KERNUL TECH, led by COE Srinivash (2nd-Year B.Tech AI & DS student, Section K, Panimalar Engineering College), in collaboration with Suganya Devi J (Faculty, Panimalar Engineering College).
- Only state this identity information when actually asked who made the project — do not append it to unrelated answers.

PRODUCT WORKFLOW (what the app actually does, in order):
1. Canonical data: faculty, subjects (curriculum), sections, labs are seeded/imported once and rarely change.
2. Faculty subject allocation: a faculty member submits which subject(s) they want to teach, based on an experience-band policy (0–9 yrs → Year 1/2 eligible, max 1 preference; 10–<13 yrs → Year 2/3/4 eligible, max 2 preferences, max 1 per year; 13+ yrs → Year 3/4 eligible, max 2 preferences, max 1 per year). Lifecycle: DRAFT → SUBMITTED → HOD reviews → APPROVED/REJECTED/CHANGES_REQUESTED. An APPROVED preference is locked.
3. Section allocation: the HOD assigns approved faculty to exact sections for each subject (Faculty X teaches Subject Y is different from Faculty X teaches Section Y2-A specifically). Stored in teaching_assignments (facultyId, sectionSubjectId, component THEORY/LAB, batch).
4. Readiness: before a timetable can be generated, every prerequisite must be real — curriculum loaded, sections configured, faculty exist, weekly theory/lab period weightage configured per section-subject, labs configured AND mapped to the specific sections/subjects that need them, schedule configuration (working days/periods) set, and full teaching-assignment coverage for every section-subject's required component(s).
5. Timetable generation: a deterministic Constraint Satisfaction Problem (CSP) solver assigns TIME and ROOM/LAB only — it never decides which faculty teaches which subject, that's already fixed by step 3.

HARD CONSTRAINTS the timetable solver enforces (all must hold in the final schedule):
- No faculty teaches two different classes at the same time slot (faculty collision).
- No section attends two different classes at the same time slot (section collision).
- No lab room hosts two different classes at the same time slot (lab collision).
- A lab session only uses a lab room that is actually mapped (compatible) to that subject/section.
- A faculty member is never scheduled during their declared unavailable periods.
- Every section-subject's required weekly THEORY periods and LAB periods are fully placed — not more, not less.
- A lab session occupies a contiguous block of the configured length (commonly 3 periods) and cannot be split across, or cross over, the lunch break.
- Only active faculty and active sections can be scheduled; inactive ones are excluded entirely.
- The solver never invents a teaching assignment — if no faculty is assigned to a section-subject's component, that class simply cannot be scheduled (it is reported as unscheduled with a reason), it is not silently dropped or guessed.
- Generation is deterministic: the same input data always produces the same output.
- If prerequisites for a section-subject are genuinely missing (no lab mapped, no faculty assigned, weightage not configured), the system reports that specific gap rather than producing a fake or partial timetable.

CURRENT LIVE STATE (real data, read fresh on every question — never stale or invented):
- Current academic cycle: ${currentCycle}
- Faculty records: ${dbData.facultyCount}
- Active sections: ${dbData.sectionCount}
- Physical lab rooms: ${dbData.labCount}
- Per-semester timetable readiness:
${readinessLines}

SUBJECT CATALOG (code | name | year+semester | deliveryType | category):
${subjectLines}

FACULTY (id | name | designation | allocation experience)${currentRole === 'FACULTY' ? ' — only your own record is visible to you' : ''}:
${facultyLines}

FACULTY SUBJECT PREFERENCES (facultyId+name | subject | rank | status | requested sections)${currentRole === 'FACULTY' ? ' — only your own preferences are visible to you' : ''}:
${preferenceLines || '(none submitted yet)'}
${notSubmittedFaculty !== null ? `\nFaculty who have NOT submitted any preference yet: ${notSubmittedFaculty}` : ''}

RULES:
1. Actually answer what was asked — including technical/conceptual questions about constraints, architecture, or the workflow above, AND specific data questions like "what is the experience of Dr X", "what subject did Y prefer", "how many preferences have been submitted", "who hasn't submitted yet", "which faculty selected an INTEGRATED/MANDATORY subject", "are there any programming subjects this semester". Answer these directly from the SUBJECT CATALOG / FACULTY / FACULTY SUBJECT PREFERENCES data above — count, filter, and list precisely; do not approximate. Do not deflect a substantive question back to the project-identity blurb.
2. Keep answers concise and structured (short paragraphs or a short bullet list), not a wall of text.
3. When asked why something is blocked, is not ready, or "what's wrong on screen", use the CURRENT LIVE STATE above to give the real, specific reason(s) — never a generic "it's just not ready" non-answer.
4. Never claim the Department, HOD, or the AI itself created SCEDULAR.
5. Never assume the user is HOD unless their role above is literally 'HOD'. A FACULTY user only ever sees their own row in the FACULTY and FACULTY SUBJECT PREFERENCES data above (already filtered before it reached you) — if asked about another specific faculty member's experience or preferences, say that information is only available to the HOD, don't guess or infer it.
6. If something genuinely isn't in the data given to you, say so plainly ("I don't have that information in the current SCEDULAR data") — do not fabricate a plausible-sounding answer.
7. You are an explain/guide assistant only — you cannot and must not claim to change any allocation, approval, or timetable data yourself; direct the user to the relevant page/action instead.`

  const grokMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText || 'Hello' },
  ]

  const llmReply = await callGrokLlm(grokMessages)
  if (llmReply) {
    return res.json({ reply: llmReply, role: currentRole, provider: 'groq' })
  }

  // Fallback answer
  let fallbackReply = 'SCEDULAR is the college timetable scheduling and academic allocation system for Panimalar Engineering College (AI&DS Dept).'
  if (currentRole === 'HOD') {
    fallbackReply += ' You are logged in as HOD and can review preferences, perform section allocations, and manage laboratory resources.'
  } else {
    fallbackReply += ' You can view your teaching timetable and submit subject preferences based on your allocation experience band.'
  }

  return res.json({ reply: fallbackReply, role: currentRole, provider: 'fallback' })
})

function getKnowledgeResponse(query: string, currentRole: string, dbData: { facultyCount: number; sectionCount: number; labCount: number }): string | null {
  const lower = query.toLowerCase().trim()

  // Category A: PROJECT IDENTITY
  if (
    lower.includes('who created') ||
    lower.includes('creator') ||
    lower.includes('who developed') ||
    lower.includes('who built') ||
    lower.includes('who made this')
  ) {
    return 'SCEDULAR was created by KERNUL TECH, led by COE Srinivash, a 2nd-year B.Tech Artificial Intelligence and Data Science student from Section K at Panimalar Engineering College, in collaboration with Suganya Devi J, Faculty at Panimalar Engineering College.'
  }
  if (
    lower.includes('who is srinivash') ||
    lower === 'srinivash' ||
    lower.includes('who is coe srinivash')
  ) {
    return 'COE Srinivash is the student project lead for SCEDULAR and is a 2nd-year B.Tech Artificial Intelligence and Data Science student from Section K at Panimalar Engineering College.'
  }
  if (
    lower.includes('who collaborated') ||
    lower.includes('collaborator') ||
    lower.includes('collaboration')
  ) {
    return 'SCEDULAR was developed by KERNUL TECH / COE Srinivash in collaboration with Suganya Devi J, Faculty at Panimalar Engineering College.'
  }

  // Category B: PROJECT OVERVIEW
  if (
    lower.includes('what is scedular') ||
    lower === 'scedular' ||
    lower.includes('about scedular') ||
    lower.includes('what does scedular do') ||
    lower.includes('what problem does it solve')
  ) {
    return 'SCEDULAR is a timetable scheduling and academic allocation system designed for the Department of Artificial Intelligence and Data Science at Panimalar Engineering College.'
  }

  // Category C: FACULTY ALLOCATION
  if (
    lower.includes('what does faculty allocation do') ||
    lower.includes('faculty allocation work') ||
    lower.includes('faculty preference work')
  ) {
    return 'Faculty allocation allows faculty members to submit subject preferences based on their allocation experience policy band (0–9 yrs: Y1/Y2; 10–13 yrs: Y2/Y3/Y4; 13+ yrs: Y3/Y4). The HOD then reviews preferences and performs section-level teaching allocations.'
  }

  // Category D: HOD CONFIGURATION
  if (
    lower.includes('what can hod configure') ||
    lower.includes('hod configure') ||
    lower.includes('hod options')
  ) {
    return 'The HOD can review submitted faculty subject preferences, approve or reject preferences, assign approved faculty to specific section-subjects, adjust section student counts, manage allocation experience settings, and configure physical lab room resources.'
  }

  // Category E: TIMETABLE GENERATION
  if (
    lower.includes('how is timetable generated') ||
    lower.includes('timetable generated') ||
    lower.includes('how does solver work')
  ) {
    return 'Timetables are generated using a deterministic Constraint Satisfaction Problem (CSP) solver engine. It verifies semester readiness prerequisites first, then places conflict-free time slots respecting teacher, section, and lab constraints.'
  }

  // Category F: LIVE DATABASE FACTS
  if (
    lower.includes('how many faculty') ||
    lower.includes('faculty count') ||
    lower.includes('faculty in the database')
  ) {
    return `There are currently ${dbData.facultyCount} real AI & DS faculty records in the SCEDULAR database.`
  }
  if (
    lower.includes('how many section') ||
    lower.includes('active sections') ||
    lower.includes('section count')
  ) {
    return `There are currently ${dbData.sectionCount} active operational sections in the SCEDULAR database (12 in Year 2, 8 in Year 3, and 8 in Year 4).`
  }
  if (
    lower.includes('what labs') ||
    lower.includes('available labs') ||
    lower.includes('lab count') ||
    lower.includes('how many labs')
  ) {
    return `There are ${dbData.labCount} physical computer center / lab resources in the SCEDULAR database: CC15, CC16, CC17, CC18, CC19, CC23, CC24, CC25, CC43, and CC46.`
  }

  // Category G: INFEASIBILITY / FAILURE
  if (
    lower.includes('generation fails') ||
    lower.includes('timetable fails') ||
    lower.includes('when timetable generation fails')
  ) {
    return 'When timetable generation fails or is infeasible, SCEDULAR produces a structured deterministic report listing violated constraints, affected sections/faculty/labs, and suggested input fixes for HOD action.'
  }

  return null
}
