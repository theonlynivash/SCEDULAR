/**
 * Class timetable sheets in the department's printed format: college heading, the Day x Period grid with the
 * tea / lunch break columns, then "SUBJECT HANDLING THEORY" and "PRACTICALS" tables (code, title, L T P C, hours
 * allocated, staff) and the class in-charge. One A4 page per section.
 */
import PDFDocument from 'pdfkit'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Assignment, Faculty, Period, ScheduleConfig, Section, SectionSubject, Subject, TeachingAssignment } from '../types.js'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const SEM_NUM: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 }
export const GREY = '#d9d9d9'
/** Bookman's own line height is airy; the printed sheets set it tighter. */
export const LG = -2.2

// The printed sheets are set in URW Bookman (Light for body, Demi for headings); fall back to Times if the files are missing.
const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts')
const HAVE_BOOKMAN = existsSync(join(FONT_DIR, 'URWBookman-Light.otf')) && existsSync(join(FONT_DIR, 'URWBookman-Demi.otf'))
export const LIGHT = HAVE_BOOKMAN ? 'Bookman-Light' : 'Times-Roman'
export const DEMI = HAVE_BOOKMAN ? 'Bookman-Demi' : 'Times-Bold'

/** x-boundaries (pt) of the day column and the period / break columns, as printed. */
const GRID_X = [33.6, 82.7, 138.0, 187.6, 237.1, 288.1, 337.6, 387.2, 439.3, 491.9, 541.6, 585.5]

interface Profile {
  /** [text key, top, size, face] for the four heading lines */
  title: [string, number, number, 'D' | 'L'][]
  gridTop: number
  rowH: number
  theoryTop: number
  /** 9 x-boundaries of the CODE | TITLE | L | T | P | C | HOURS | STAFF tables */
  tableX: number[]
}
const T4 = [26.1, 105, 245, 283, 320, 351, 385, 437, 585.1]
const PROFILES: Record<number, Profile> = {
  2: { title: [['L1', 25, 12, 'D'], ['L2', 39, 11, 'D'], ['L3', 54, 11, 'D'], ['L4', 68, 11, 'D']], gridTop: 76.5, rowH: 41, theoryTop: 327, tableX: [29.3, 112, 276, 306, 336, 364, 394, 450, 581.9] },
  3: { title: [['L1', 27, 14, 'D'], ['L2', 44, 12, 'D'], ['L3', 58, 12, 'D'], ['L4', 73, 12, 'D']], gridTop: 94, rowH: 41, theoryTop: 342, tableX: T4 },
  4: { title: [['L1', 42, 14, 'D'], ['L2', 59, 12, 'D'], ['L3', 74, 12, 'D'], ['L4', 88, 12, 'D']], gridTop: 112.4, rowH: 38.2, theoryTop: 371, tableX: T4 },
}

export interface SheetInput {
  semester: string
  sections: Section[]
  subjects: Subject[]
  sectionSubjects: SectionSubject[]
  teachingAssignments: TeachingAssignment[]
  faculty: Faculty[]
  assignments: Assignment[]
  config: ScheduleConfig
  /** e.g. "2026-2027". Defaults to the academic year containing today. */
  academicYear?: string
}

/** Short label for a subject on the grid: the stored short name, else the initials of its main words. */
export function shortNameOf(s: Subject): string {
  if (s.shortName && s.shortName.trim()) return s.shortName.trim()
  const skip = new Set(['and', 'of', 'the', 'for', 'in', 'with', 'to', 'a', 'an', 'on', 'at', 'laboratory', 'lab'])
  const words = s.name.replace(/\(.*?\)/g, ' ').split(/[\s\-/&,]+/).filter(w => w && !skip.has(w.toLowerCase()))
  const initials = words.map(w => w[0].toUpperCase()).join('')
  return initials.length >= 2 ? initials.slice(0, 6) : s.name.slice(0, 6).toUpperCase()
}

/** Variant codes such as "23CS1908-FSD" (two subjects sharing one printed code) print as the base code. */
const printCode = (code: string) => (/^\d{2}[A-Z]{2}\d{4}-[A-Z]+$/.test(code) ? code.split('-')[0] : code)

/** Title of the lab row of an integrated subject: "<name> Lab", unless the name already says "Lab Integrated". */
const labRowTitle = (name: string) => (/integrated|lab/i.test(name) ? name : `${name} Lab`)

/** Printed L-T-P-C for a subject. */
function ltpc(s: Subject): [number, number, number, number] {
  const c = s.credits ?? 0
  if (s.ltp) return [s.ltp[0], s.ltp[1], s.ltp[2], c]
  if (s.deliveryType === 'LAB') return [0, 0, 4, c]
  if (s.deliveryType === 'INTEGRATED') return [Math.max(0, c - 1), 0, 2, c]
  return [c, 0, 0, c]
}

export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h > 12 ? h - 12 : h}.${String(m).padStart(2, '0')}`
}
export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

function academicYearLabel(now = new Date()): string {
  const y = now.getFullYear()
  return now.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export type Col = { kind: 'period'; period: Period } | { kind: 'break'; from: string; to: string; label: 'TEA' | 'LUNCH' }

export function buildColumns(config: ScheduleConfig): Col[] {
  const ps = config.periods.filter(p => p.schedulable !== false).sort((a, b) => a.index - b.index)
  const cols: Col[] = []
  ps.forEach((p, i) => {
    if (i > 0) {
      const prev = ps[i - 1]
      if (toMin(p.start) > toMin(prev.end)) cols.push({ kind: 'break', from: prev.end, to: p.start, label: toMin(p.start) - toMin(prev.end) >= 30 ? 'LUNCH' : 'TEA' })
    }
    cols.push({ kind: 'period', period: p })
  })
  return cols
}

export function renderClassTimetablesPdf(input: SheetInput, doc: InstanceType<typeof PDFDocument>): number {
  const { semester, subjects, sectionSubjects, teachingAssignments, faculty, assignments, config } = input
  const n = SEM_NUM[semester]
  const yearRoman = ROMAN[Math.ceil(n / 2)]
  const ay = input.academicYear ?? academicYearLabel()
  const subjectById = new Map(subjects.map(s => [s.id, s]))
  const facultyName = new Map(faculty.map(f => [f.id, f.name]))
  const cols = buildColumns(config)
  const days = config.workingDays

  const sections = [...input.sections].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  let pages = 0

  for (const section of sections) {
    if (pages > 0) doc.addPage()
    pages++
    const letter = section.id.slice(-1)
    const mine = assignments.filter(a => a.sectionId === section.id)
    const offered = sectionSubjects.filter(ss => ss.sectionId === section.id).sort((a, b) => a.id - b.id)
    const staff = (ssId: number, comp: 'THEORY' | 'LAB') => {
      const names = teachingAssignments.filter(t => t.sectionSubjectId === ssId && t.component === comp).map(t => facultyName.get(t.facultyId)).filter(Boolean) as string[]
      return [...new Set(names)].join('/')
    }

    // ── rows of the two tables ──
    type Row = { code: string; title: string; ltpc: (number | string)[]; hours: number | string; staff: string }
    const theory: Row[] = [], practical: Row[] = []
    for (const ss of offered) {
      const s = subjectById.get(ss.subjectId)
      if (!s) continue
      const isLibrary = (s.shortName ?? '').toUpperCase() === 'LIB'
      const lt: (number | string)[] = isLibrary ? ['', '', '', ''] : ltpc(s)   // the printed Library row has no code or L-T-P-C
      const asPractical = s.printAs === 'PRACTICAL' || (s.deliveryType === 'LAB' && s.printAs !== 'THEORY')
      if (asPractical) {
        const comp = ss.labPeriods > 0 && ss.theoryPeriods === 0 ? 'LAB' : 'THEORY'
        practical.push({ code: isLibrary ? '' : s.code, title: s.name, ltpc: lt, hours: ss.labPeriods || ss.theoryPeriods, staff: staff(ss.id, comp) || staff(ss.id, 'LAB') || staff(ss.id, 'THEORY') })
        continue
      }
      if (ss.theoryPeriods > 0) theory.push({ code: s.code, title: s.name, ltpc: lt, hours: ss.theoryPeriods, staff: staff(ss.id, 'THEORY') })
      if (ss.labPeriods > 0 && s.deliveryType === 'INTEGRATED') practical.push({ code: s.code, title: labRowTitle(s.name), ltpc: lt, hours: ss.labPeriods, staff: staff(ss.id, 'LAB') })
    }

    // ── geometry (measured from the printed II / III / IV year sheets) ──
    const P = PROFILES[Math.ceil(n / 2)] ?? PROFILES[4]
    const gx = GRID_X[0], gw = GRID_X[GRID_X.length - 1] - GRID_X[0]
    const headH = 45.2, rowH = P.rowH
    // The measured positions are only a starting point: the grid must start BELOW the last heading line ("SECTION A") and the
    // theory heading must start BELOW the grid, whatever the font and the number of working days are.
    const lastTitle = P.title[P.title.length - 1]
    const gy = Math.max(P.gridTop, lastTitle[1] + lastTitle[2] * 1.3 + 5)
    const gridBottom = gy + headH + rowH * days.length
    const theoryTop = Math.max(P.theoryTop, gridBottom + 12)
    const edges = P.tableX
    const heads = ['CODE', 'COURSE TITLE', 'L', 'T', 'P', 'C', 'HOURS\nALLOC\nATED', 'STAFF NAME']
    const fits = (fs: number, minRow: number) => {
      const lh = fs * 1.22
      const rh = (r: Row) => Math.max(minRow, Math.max(doc.font(LIGHT).fontSize(fs).heightOfString(r.title, { width: edges[2] - edges[1] - 8, lineGap: LG }), doc.heightOfString(r.staff, { width: edges[8] - edges[7] - 8, lineGap: LG })) + 6 + 0 * lh)
      const total = (rows: Row[]) => 40 + rows.reduce((a, r) => a + rh(r), 0)
      return { rh, bottom: theoryTop + 14 + total(theory) + 16 + 14 + total(practical) + 22 + 14 }
    }
    let fs = 11, minRow = 33
    let fit = fits(fs, minRow)
    while (fit.bottom > 842 - 14 && (fs > 7 || minRow > 16)) { if (minRow > 22) minRow -= 1; else { fs = Math.max(7, fs - 0.5); minRow = Math.max(16, minRow - 1) } fit = fits(fs, minRow) }
    const rowHeight = fit.rh

    // ── heading ──
    doc.fillColor('#000')
    P.title.forEach(([txt, top, size, face], i) => {
      doc.font(face === 'D' ? DEMI : LIGHT).fontSize(size)
      const t = txt === 'L1' ? 'PANIMALAR ENGINEERING COLLEGE, CHENNAI'
        : txt === 'L2' ? 'B. TECH – ARTIFICIAL INTELLIGENCE AND DATA SCIENCE'
        : txt === 'L3' ? `${yearRoman} YEAR / ${semester} SEM – ${n % 2 ? 'ODD' : 'EVEN'} SEM (${ay})` : `SECTION ${letter}`
      doc.text(t, 0, top, { width: 595.28, align: 'center', lineBreak: false })
      void i
    })

    doc.lineWidth(0.75).strokeColor('#000')
    const box = (x: number, y: number, w: number, h: number, fill?: string) => {
      if (fill) doc.rect(x, y, w, h).fillAndStroke(fill, '#000')
      else doc.rect(x, y, w, h).stroke('#000')
    }
    const textIn = (txt: string, x: number, y: number, w: number, h: number, o: { bold?: boolean; size?: number; align?: 'left' | 'center'; pad?: number } = {}) => {
      const size = o.size ?? 11
      doc.font(o.bold ? DEMI : LIGHT).fontSize(size).fillColor('#000')
      const pad = o.pad ?? 3
      const th = doc.heightOfString(txt, { width: w - 2 * pad, align: o.align ?? 'center', lineGap: LG })
      doc.text(txt, x + pad, y + Math.max(1, (h - th) / 2), { width: w - 2 * pad, align: o.align ?? 'center', lineGap: LG })
    }

    // ── grid: columns are the 11 fixed x-boundaries of the printed sheet (day | 4 periods | tea | 2 | lunch | 3) ──
    const dayW = GRID_X[1] - GRID_X[0]
    const colX = (i: number) => GRID_X[i + 1]
    const colWd = (i: number, span = 1) => GRID_X[i + 1 + span] - GRID_X[i + 1]
    void gw
    box(gx, gy, dayW, headH, GREY)
    textIn('Time', gx, gy + 5, dayW, 12, { bold: true, align: 'left', pad: 5 })
    textIn('Day', gx, gy + headH - 19, dayW, 12, { bold: true, align: 'left', pad: 5 })
    cols.forEach((c, i) => {
      box(colX(i), gy, colWd(i), headH, GREY)
      const [a, b] = c.kind === 'period' ? [c.period.start, c.period.end] : [c.from, c.to]
      textIn(`${fmtTime(a)}\n-\n${fmtTime(b)}`, colX(i), gy, colWd(i), headH, { bold: true })
    })

    days.forEach((day, di) => {
      const y = gy + headH + di * rowH
      box(gx, y, dayW, rowH, GREY)
      textIn(day, gx, y, dayW, rowH, { bold: true, align: 'left', pad: 5 })
      let ci = 0
      while (ci < cols.length) {
        const c = cols[ci]
        if (c.kind === 'break') { ci++; continue }
        const a = mine.find(m => m.day === day && m.startPeriod <= c.period.index && m.endPeriod >= c.period.index)
        let span = 1
        if (a && a.startPeriod === c.period.index && a.endPeriod > a.startPeriod) {
          span = 0
          for (let k = ci; k < cols.length; k++) {
            const ck = cols[k]
            if (ck.kind === 'period' && ck.period.index >= a.startPeriod && ck.period.index <= a.endPeriod) span++
            else break
          }
        }
        let label = ''
        if (a) {
          const subj = subjectById.get(a.subjectId ?? a.courseId)
          const sn = subj ? shortNameOf(subj) : a.courseId
          label = a.blockType === 'LAB' && !/\blab\b/i.test(sn) ? `${sn} LAB` : sn
        }
        box(colX(ci), y, colWd(ci, span), rowH)
        if (label) textIn(label, colX(ci), y, colWd(ci, span), rowH, { size: 11 })
        ci += span
      }
    })
    cols.forEach((c, i) => {
      if (c.kind !== 'break') return
      box(colX(i), gy + headH, colWd(i), rowH * days.length)
      const letters = (c.label === 'TEA' ? 'TEA BREAK' : 'LUNCH BREAK').split('').map(ch => (ch === ' ' ? '' : ch))
      const lh = Math.min(12, (rowH * days.length - 10) / letters.length)
      const total = letters.length * lh
      doc.font(DEMI).fontSize(11).fillColor('#000')
      letters.forEach((ch, k) => doc.text(ch, colX(i), gy + headH + (rowH * days.length - total) / 2 + k * lh, { width: colWd(i), align: 'center', lineBreak: false }))
    })

    // ── footer tables ──
    const drawTable = (y0: number, rows: Row[]) => {
      const hh = 40
      heads.forEach((h, i) => { box(edges[i], y0, edges[i + 1] - edges[i], hh, GREY); textIn(h, edges[i], y0, edges[i + 1] - edges[i], hh, { bold: true, size: fs }) })
      let y = y0 + hh
      for (const r of rows) {
        const h = rowHeight(r)
        const vals = [printCode(r.code), r.title, String(r.ltpc[0]), String(r.ltpc[1]), String(r.ltpc[2]), String(r.ltpc[3]), String(r.hours), r.staff]
        vals.forEach((v, i) => { box(edges[i], y, edges[i + 1] - edges[i], h); textIn(v, edges[i], y, edges[i + 1] - edges[i], h, { size: fs, align: i === 1 || i === 7 || i === 0 ? 'left' : 'center', pad: 4 }); })
        y += h
      }
      return y
    }
    let y = theoryTop
    doc.font(DEMI).fontSize(11).fillColor('#000').text('SUBJECT HANDLING THEORY', 0, y, { width: 595.28, align: 'center', lineBreak: false })
    y = drawTable(y + 14, theory) + 14
    doc.font(DEMI).fontSize(11).text('PRACTICALS', 0, y, { width: 595.28, align: 'center', lineBreak: false })
    y = drawTable(y + 14, practical) + 20
    const incharge = section.classIncharge ? facultyName.get(section.classIncharge) : undefined
    doc.font(DEMI).fontSize(11)
    doc.text('CLASS INCHARGE', edges[0] + 4, y, { lineBreak: false })
    doc.text(`:${incharge ?? ''}`, edges[0] + 130, y, { lineBreak: false })
  }
  return pages
}

export function createPdf(layout: 'portrait' | 'landscape' = 'portrait', title = 'Class Timetable'): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ size: 'A4', layout, margin: 0, autoFirstPage: true, info: { Title: title, Author: 'SCEDULAR' } })
  if (HAVE_BOOKMAN) {
    doc.registerFont(LIGHT, join(FONT_DIR, 'URWBookman-Light.otf'))
    doc.registerFont(DEMI, join(FONT_DIR, 'URWBookman-Demi.otf'))
  }
  return doc
}
