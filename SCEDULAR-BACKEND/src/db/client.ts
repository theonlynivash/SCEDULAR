import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultScheduleConfig } from '../utils/grid.js'
import { REAL_FACULTY_ROSTER } from '../seed/facultyRoster.js'
import { REGULATION_2024_CURRICULUM } from '../seed/curriculumRoster.js'
import { KNOWN_SECTIONS_ROSTER, KNOWN_LABS_ROSTER, KNOWN_LAB_MAPPINGS } from '../seed/resourceRoster.js'
import type { Section, Subject } from '../types.js'

import { initLocalDb, deriveCanonicalSectionSubjects } from './localDb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const isLocalDbMode = process.env.USE_LOCAL_DB === 'true' || !process.env.DATABASE_URL

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/scedular'

// Neon (and most managed Postgres) requires TLS; local Postgres/Docker
// usually doesn't offer it, so only force it when the connection string
// doesn't already opt out and isn't obviously local.
const needsSsl = /sslmode=require/.test(connectionString) || /neon\.tech/.test(connectionString)

export const pool = !isLocalDbMode
  ? new pg.Pool({
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_POOL_MAX) || 5,
    })
  : ({
      query: async () => {
        throw new Error('Using local database mode')
      },
      // Must also throw, not silently resolve with empty rows -- callers
      // that use pool.connect() (saveAssignments/saveConflicts/saveUnscheduled)
      // rely on this rejecting so they fall through to their in-memory (mem)
      // fallback path. A stub that resolves "successfully" here looks like a
      // real INSERT that silently persists nothing, so every run appears
      // GREEN with real assignments in the immediate response, but every
      // later read (View Timetable, /timetable/master, /timetable/section/...)
      // comes back empty because the rows were never actually stored anywhere.
      connect: async () => {
        throw new Error('Using local database mode')
      },
    } as unknown as pg.Pool)

// Serverless functions cold-start often; guard so the schema (idempotent
// CREATE TABLE IF NOT EXISTS) and the default schedule-grid row are only
// applied once per warm process, not on every request.
let initPromise: Promise<void> | null = null

export function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (isLocalDbMode) {
        initLocalDb()
        console.log('[DB] Running in 100% LOCAL DATABASE mode (data/scedular_local_db.json). Cloud DB bypassed.')
        return
      }
      try {
        const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf-8')
        await pool.query(schema)

        const existing = await pool.query('SELECT id FROM schedule_config WHERE id = 1')
        if (existing.rows.length === 0) {
          const cfg = defaultScheduleConfig()
          await pool.query(
            'INSERT INTO schedule_config (id, working_days, periods) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING',
            [JSON.stringify(cfg.workingDays), JSON.stringify(cfg.periods)]
          )
        }

        // 1. Seed real faculty roster if table empty
        const facultyCountRes = await pool.query('SELECT COUNT(*) FROM faculty')
        if (Number(facultyCountRes.rows[0]?.count || 0) === 0) {
          for (const f of REAL_FACULTY_ROSTER) {
            await pool.query(
              `INSERT INTO faculty (id, name, designation, department, role, max_daily_periods, max_weekly_periods)
               VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
              [f.id, f.name, f.designation, f.department || 'AI & DS', f.role || 'FACULTY', f.maxDailyPeriods, f.maxWeeklyPeriods]
            )
          }
        }

        // 2. Seed Regulation 2024 Curriculum into subjects table
        const subjectCountRes = await pool.query('SELECT COUNT(*) FROM subjects')
        if (Number(subjectCountRes.rows[0]?.count || 0) === 0) {
          for (const s of REGULATION_2024_CURRICULUM) {
            await pool.query(
              `INSERT INTO subjects (id, code, name, delivery_type, category, credits, year, semester, theory_periods, lab_periods, vertical)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO UPDATE SET
               code = EXCLUDED.code, name = EXCLUDED.name, delivery_type = EXCLUDED.delivery_type, category = EXCLUDED.category,
               credits = EXCLUDED.credits, year = EXCLUDED.year, semester = EXCLUDED.semester, theory_periods = EXCLUDED.theory_periods,
               lab_periods = EXCLUDED.lab_periods, vertical = EXCLUDED.vertical`,
              [s.id, s.code, s.name, s.deliveryType, s.category, s.credits, s.year, s.semester, s.theoryPeriods, s.labPeriods, s.vertical || null]
            )
          }
        }

        // 3. Seed Known Sections roster
        const sectionCountRes = await pool.query('SELECT COUNT(*) FROM sections')
        if (Number(sectionCountRes.rows[0]?.count || 0) === 0) {
          for (const sec of KNOWN_SECTIONS_ROSTER) {
            await pool.query(
              `INSERT INTO sections (id, name, year, semester, department, student_count, active)
               VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
              [sec.id, sec.name, sec.year, sec.semester, sec.department, sec.studentCount, sec.active]
            )
          }
        }

        // 4. Seed Known Labs
        const labCountRes = await pool.query('SELECT COUNT(*) FROM labs')
        if (Number(labCountRes.rows[0]?.count || 0) === 0) {
          for (const l of KNOWN_LABS_ROSTER) {
            await pool.query(
              `INSERT INTO labs (id, name, room, department, capacity, capacity_source, active, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
              [l.id, l.name, l.room, l.department, l.capacity, l.capacitySource, l.active, l.notes || null]
            )
          }
        }

        // 5. Seed Known Lab Mappings
        const mappingCountRes = await pool.query('SELECT COUNT(*) FROM lab_mapping')
        if (Number(mappingCountRes.rows[0]?.count || 0) === 0) {
          for (const m of KNOWN_LAB_MAPPINGS) {
            await pool.query(
              `INSERT INTO lab_mapping (lab_id, subject_id, section_id)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [m.labId, m.subjectCode, m.sectionId]
            )
          }
        }

        // 6. Seed courses from subjects if courses table is empty
        const coursesCountRes = await pool.query('SELECT COUNT(*) FROM courses')
        if (Number(coursesCountRes.rows[0]?.count || 0) === 0) {
          const subjectsRes = await pool.query('SELECT * FROM subjects')
          for (const s of subjectsRes.rows) {
            if (s.delivery_type === 'INTEGRATED') {
              await pool.query(
                `INSERT INTO courses (id, code, name, component_type, lab_block_length)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
                [s.code, s.code, s.name, 'INTEGRATED_THEORY', s.lab_periods || 3]
              )
              await pool.query(
                `INSERT INTO courses (id, code, name, component_type, lab_block_length)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
                [`${s.code}_LAB`, `${s.code}_LAB`, `${s.name} Laboratory`, 'INTEGRATED_LAB', s.lab_periods || 3]
              )
            } else if (s.delivery_type === 'LAB') {
              await pool.query(
                `INSERT INTO courses (id, code, name, component_type, lab_block_length)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
                [s.code, s.code, s.name, 'LAB_ONLY', s.lab_periods || 3]
              )
            } else {
              const comp = s.category === 'MANDATORY' ? 'MANDATORY' : s.category === 'ADDITIONAL' ? 'ADDITIONAL' : 'THEORY_ONLY'
              await pool.query(
                `INSERT INTO courses (id, code, name, component_type, lab_block_length)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
                [s.code, s.code, s.name, comp, 3]
              )
            }
          }
        }

        // 7. Seed canonical section_subjects deterministically from the master
        //    tables. Same rule as the local JSON DB: every active section is
        //    paired with every subject sharing its year+semester. Idempotent —
        //    identity is UNIQUE(section_id, subject_id), so re-running never
        //    duplicates. Skipped naturally when master tables are empty.
        const [sectionsRes, subjectsForOfferingRes, existingOfferingsRes] = await Promise.all([
          pool.query('SELECT id, year, semester, active FROM sections'),
          pool.query('SELECT id, year, semester, theory_periods, lab_periods FROM subjects'),
          pool.query('SELECT section_id, subject_id FROM section_subjects'),
        ])

        const sectionsForDerive = sectionsRes.rows.map(r => ({
          id: r.id,
          year: r.year ?? undefined,
          semester: r.semester ?? undefined,
          active: r.active ?? true,
        })) as unknown as Section[]
        const subjectsForDerive = subjectsForOfferingRes.rows.map(r => ({
          id: r.id,
          year: r.year ?? undefined,
          semester: r.semester ?? undefined,
          theoryPeriods: r.theory_periods ?? 0,
          labPeriods: r.lab_periods ?? 0,
        })) as unknown as Subject[]

        const canonicalOfferings = deriveCanonicalSectionSubjects(sectionsForDerive, subjectsForDerive)
        const existingOfferings = new Set(
          existingOfferingsRes.rows.map(r => `${r.section_id}::${r.subject_id}`)
        )

        let insertedOfferings = 0
        for (const o of canonicalOfferings) {
          const key = `${o.sectionId}::${o.subjectId}`
          if (existingOfferings.has(key)) continue
          await pool.query(
            `INSERT INTO section_subjects
               (section_id, subject_id, theory_periods, lab_periods, lab_block_length)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (section_id, subject_id) DO NOTHING`,
            [o.sectionId, o.subjectId, o.theoryPeriods, o.labPeriods, o.labBlockLength ?? null]
          )
          insertedOfferings++
        }
        console.log(
          `[DB] section_subjects canonical bootstrap: ${canonicalOfferings.length} derived, ` +
          `${existingOfferings.size} pre-existing, ${insertedOfferings} inserted`
        )
      } catch (err: any) {
        console.warn(`[DB] Database initialization failed (${err?.message || err}). Operating in in-memory fallback mode.`)
      }
    })()
  }
  return initPromise
}
