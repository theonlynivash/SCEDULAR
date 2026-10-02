/**
 * Runs before every test file. Gives the suite a PRIVATE copy of the live database so that:
 *  - tests can reset / wipe workflow data without touching the real one, and
 *  - every account logs in with the default password, whatever personal passwords the HOD has issued since.
 * Tests that need their own file (blank dataset, teacher extras) set SCEDULAR_DB_FILE themselves afterwards.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const live = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/scedular_local_db.json')
const copy = path.join(os.tmpdir(), `scedular-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`)
const db = JSON.parse(fs.readFileSync(live, 'utf-8'))
db.facultyPasswords = {}
db.sessions = []
fs.writeFileSync(copy, JSON.stringify(db))
process.env.SCEDULAR_DB_FILE = copy
// counts of the master data in the snapshot, for tests that check "reset keeps master data"
process.env.SCEDULAR_TEST_SNAPSHOT = JSON.stringify({ faculty: db.faculty.length, sections: db.sections.length, subjects: db.subjects.length, labs: db.labs.length })
process.on('exit', () => { for (const f of [copy, `${copy}.tmp`]) try { fs.unlinkSync(f) } catch { /* already gone */ } })

// tests must never send real mail, whatever .env says
process.env.MAIL_TRANSPORT ??= 'json'
