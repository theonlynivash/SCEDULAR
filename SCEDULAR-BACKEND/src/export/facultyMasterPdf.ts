/**
 * Two more printable sheets, in the same Bookman style as the class timetables:
 *  - a teacher's personal weekly timetable (A4 landscape, one page);
 *  - the MASTER timetable of the department: a cover, then for every semester the subject-teacher allocation of all
 *    its sections, one Day x Period grid per working day with every section as a row, and a teacher-load summary.
 */
import PDFDocument from 'pdfkit'
import type { Assignment, Faculty, ScheduleConfig, Section, SectionSubject, Subject, TeachingAssignment } from '../types.js'
import { createPdf, DEMI, GREY, LG, LIGHT, buildColumns, fmtTime, shortNameOf, type Col } from './classTimetablePdf.js'

type Doc = InstanceType<typeof PDFDocument>
const LAND_W = 841.89, LAND_H = 595.28
const ROMAN_YEAR: Record<string, string> = { I: 'I', II: 'I', III: 'II', IV: 'II', V: 'III', VI: 'III', VII: 'IV', VIII: 'IV' }

export const createLandscapePdf = (title: string): Doc => createPdf('landscape', title)

/** "Mrs.J.ANITHA" -> "J.ANITHA": the title is dropped to save room in a cell. */
export const bareName = (n: string) => n.replace(/^(mrs|mr|ms|dr|prof)\.?\s*/i, '').trim()

function academicYearLabel(now = new Date()): string {
  const y = now.getFullYear()
  return now.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

interface Ctx {
  sections: Section[]; subjects: Subject[]; sectionSubjects: SectionSubject[]; teachingAssignments: TeachingAssignment[]
  faculty: Faculty[]; assignments: Assignment[]; config: ScheduleConfig; academicYear?: string
}

function heading(doc: Doc, lines: [string, number][], top = 24) {
  let y = top
  doc.fillColor('#000')
  for (const [t, size] of lines) { doc.font(DEMI).fontSize(size).text(t, 0, y, { width: LAND_W, align: 'center', lineBreak: false }); y += size + 4 }
  return y
}

function cell(doc: Doc, txt: string, x: number, y: number, w: number, h: number, o: { bold?: boolean; size?: number; fill?: string; align?: 'left' | 'center' } = {}) {
  doc.lineWidth(0.6).rect(x, y, w, h)
  if (o.fill) doc.fillAndStroke(o.fill, '#000'); else doc.stroke('#000')
  if (!txt) return
  const size = o.size ?? 8
  doc.font(o.bold ? DEMI : LIGHT).fontSize(size).fillColor('#000')
  const opt = { width: w - 4, align: o.align ?? 'center', lineGap: LG } as const
  let th = doc.heightOfString(txt, opt)
  let fs = size
  while (th > h - 2 && fs > 4.5) { fs -= 0.5; doc.fontSize(fs); th = doc.heightOfString(txt, opt) }
  doc.text(txt, x + 2, y + Math.max(1, (h - th) / 2), opt)
}

/** Day x period grid used by both sheets. `label` decides what a placed class prints. */
function drawGrid(doc: Doc, o: {
  x: number; y: number; w: number; dayW: number; headH: number; rowH: number; cols: Col[]; days: string[]
  rows: { title: string; items: Assignment[] }[]   // one grid row per entry (a day for a teacher; a section for a master day-sheet)
  label: (a: Assignment) => string; size: number
}) {
  const { x, y, dayW, headH, rowH, cols } = o
  const colW = (o.w - dayW) / cols.length
  cell(doc, 'Day / Time', x, y, dayW, headH, { bold: true, fill: GREY, size: o.size })
  cols.forEach((c, i) => {
    const [a, b] = c.kind === 'period' ? [c.period.start, c.period.end] : [c.from, c.to]
    cell(doc, `${fmtTime(a)}\n-\n${fmtTime(b)}`, x + dayW + i * colW, y, colW, headH, { bold: true, fill: GREY, size: o.size - 0.5 })
  })
  o.rows.forEach((r, ri) => {
    const ry = y + headH + ri * rowH
    cell(doc, r.title, x, ry, dayW, rowH, { bold: true, fill: GREY, align: 'left', size: o.size })
    let ci = 0
    while (ci < cols.length) {
      const c = cols[ci]
      if (c.kind === 'break') { ci++; continue }
      const a = r.items.find(m => m.startPeriod <= c.period.index && m.endPeriod >= c.period.index)
      let span = 1
      if (a && a.startPeriod === c.period.index && a.endPeriod > a.startPeriod) {
        span = 0
        for (let k = ci; k < cols.length; k++) { const ck = cols[k]; if (ck.kind === 'period' && ck.period.index >= a.startPeriod && ck.period.index <= a.endPeriod) span++; else break }
      }
      cell(doc, a ? o.label(a) : '', x + dayW + ci * colW, ry, colW * span, rowH, { size: o.size })
      ci += span
    }
  })
  // tea / lunch columns are one tall merged block with the break written down it
  cols.forEach((c, i) => {
    if (c.kind !== 'break') return
    const bx = x + dayW + i * colW, bh = rowH * o.rows.length
    cell(doc, '', bx, y + headH, colW, bh)
    const word = (c.label === 'TEA' ? 'TEA BREAK' : 'LUNCH BREAK').replace(' ', '').split('')
    const lh = Math.min(10, (bh - 6) / word.length)
    doc.font(DEMI).fontSize(Math.min(9, lh)).fillColor('#000')
    word.forEach((ch, k) => doc.text(ch, bx, y + headH + (bh - word.length * lh) / 2 + k * lh, { width: colW, align: 'center', lineBreak: false }))
  })
}

/* ───────────────────────────── teacher's own timetable ───────────────────────────── */

export function renderFacultyTimetablePdf(c: Ctx & { facultyId: string }, doc: Doc): void {
  const f = c.faculty.find(x => x.id === c.facultyId)!
  const subj = new Map(c.subjects.map(s => [s.id, s]))
  const mine = c.assignments.filter(a => a.facultyId === f.id)
  const cols = buildColumns(c.config)
  const days = c.config.workingDays
  const ay = c.academicYear ?? academicYearLabel()
  const y0 = heading(doc, [['PANIMALAR ENGINEERING COLLEGE, CHENNAI', 14], ['B. TECH – ARTIFICIAL INTELLIGENCE AND DATA SCIENCE', 11.5], [`FACULTY TIMETABLE (${ay})`, 11.5]], 24)
  doc.font(DEMI).fontSize(11.5).text(`${f.name}${f.designation ? '  ·  ' + f.designation : ''}  ·  ${f.id}`, 0, y0 + 2, { width: LAND_W, align: 'center', lineBreak: false })

  const rowH = 54, top = y0 + 26
  drawGrid(doc, {
    x: 30, y: top, w: LAND_W - 60, dayW: 62, headH: 40, rowH, cols, days, size: 10,
    rows: days.map(d => ({ title: d, items: mine.filter(a => a.day === d) })),
    label: a => {
      const s = subj.get(a.subjectId ?? a.courseId)
      const nm = s ? shortNameOf(s) : a.courseId
      return `${a.blockType === 'LAB' && !/\blab\b/i.test(nm) ? nm + ' LAB' : nm}\n${a.sectionId}`
    },
  })

  // subjects handled
  const rows = new Map<string, { code: string; title: string; sections: Set<string>; periods: number }>()
  for (const a of mine) {
    const s = subj.get(a.subjectId ?? a.courseId); const key = s?.id ?? a.courseId
    const r = rows.get(key) ?? { code: s?.code ?? a.courseId, title: s?.name ?? a.courseId, sections: new Set<string>(), periods: 0 }
    r.sections.add(a.sectionId); r.periods += a.endPeriod - a.startPeriod + 1; rows.set(key, r)
  }
  let y = top + 40 + rowH * days.length + 18
  doc.font(DEMI).fontSize(11).text('SUBJECTS HANDLED', 0, y, { width: LAND_W, align: 'center', lineBreak: false })
  y += 16
  const X = [30, 120, 400, 700, LAND_W - 30]
  const head = ['CODE', 'COURSE TITLE', 'SECTIONS', 'PERIODS / WEEK']
  head.forEach((h, i) => cell(doc, h, X[i], y, X[i + 1] - X[i], 20, { bold: true, fill: GREY, size: 9 }))
  y += 20
  const total = [...rows.values()].reduce((n, r) => n + r.periods, 0)
  for (const r of rows.values()) {
    const vals = [r.code, r.title, [...r.sections].sort().join(', '), String(r.periods)]
    vals.forEach((v, i) => cell(doc, v, X[i], y, X[i + 1] - X[i], 20, { size: 9, align: i === 1 || i === 2 ? 'left' : 'center' }))
    y += 20
  }
  doc.font(DEMI).fontSize(10).fillColor('#000').text(`Total: ${total} periods per week`, 30, y + 8, { lineBreak: false })
}

/* ───────────────────────────── master timetable ───────────────────────────── */

export function renderMasterTimetablePdf(c: Ctx & { semesters: string[]; runId: number; generatedAt: string }, doc: Doc): void {
  const subj = new Map(c.subjects.map(s => [s.id, s]))
  const fac = new Map(c.faculty.map(f => [f.id, f]))
  const cols = buildColumns(c.config)
  const days = c.config.workingDays
  const ay = c.academicYear ?? academicYearLabel()
  const ssById = new Map(c.sectionSubjects.map(x => [x.id, x]))
  const secsOf = (sem: string) => c.sections.filter(s => s.semester === sem && s.active !== false).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  const teacherOf = (secId: string, subjectId: string) => {
    const names = new Set<string>()
    for (const t of c.teachingAssignments) {
      const o = ssById.get(t.sectionSubjectId)
      if (o && o.sectionId === secId && o.subjectId === subjectId) { const f = fac.get(t.facultyId); if (f) names.add(bareName(f.name)) }
    }
    return [...names]
  }

  // cover
  heading(doc, [['PANIMALAR ENGINEERING COLLEGE, CHENNAI', 18], ['B. TECH – ARTIFICIAL INTELLIGENCE AND DATA SCIENCE', 13]], 150)
  doc.font(DEMI).fontSize(30).text('MASTER TIMETABLE', 0, 225, { width: LAND_W, align: 'center', lineBreak: false })
  doc.font(LIGHT).fontSize(13).text(`Academic year ${ay}`, 0, 275, { width: LAND_W, align: 'center', lineBreak: false })
  const nSec = c.semesters.reduce((n, s) => n + secsOf(s).length, 0)
  const lines = [`Semesters: ${c.semesters.join(', ')}`, `${nSec} sections  ·  ${c.assignments.length} scheduled periods`, `Generated run #${c.runId} on ${new Date(c.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short', hour12: true })}`,
    'Contents: subject–faculty allocation, day-wise section grids and teacher load for each semester']
  lines.forEach((t, i) => doc.font(LIGHT).fontSize(11).text(t, 0, 320 + i * 20, { width: LAND_W, align: 'center', lineBreak: false }))

  for (const sem of c.semesters) {
    const secs = secsOf(sem)
    if (!secs.length) continue
    const title = `${ROMAN_YEAR[sem]} YEAR / ${sem} SEM – ${['I', 'III', 'V', 'VII'].includes(sem) ? 'ODD' : 'EVEN'} SEM (${ay})`

    // A: subject x section allocation
    doc.addPage()
    const yA = heading(doc, [['MASTER TIMETABLE – SUBJECT & FACULTY ALLOCATION', 13], [title, 11]], 22)
    const subjectIds = [...new Set(c.sectionSubjects.filter(o => secs.some(s => s.id === o.sectionId)).map(o => o.subjectId))]
      .sort((a, b) => (subj.get(a)?.code ?? '').localeCompare(subj.get(b)?.code ?? ''))
    const codeW = 62, titleW = 138, left = 24
    const cw = (LAND_W - 2 * left - codeW - titleW) / secs.length
    const avail = LAND_H - 24 - (yA + 8) - 18
    const rh = Math.max(16, Math.min(34, avail / (subjectIds.length + 1)))
    const fsz = rh >= 28 ? 7.5 : rh >= 22 ? 6.8 : 6
    let y = yA + 8
    cell(doc, 'CODE', left, y, codeW, 18, { bold: true, fill: GREY, size: 8 }); cell(doc, 'COURSE TITLE', left + codeW, y, titleW, 18, { bold: true, fill: GREY, size: 8 })
    secs.forEach((s, i) => cell(doc, s.id.replace(/^Y\d(S\d)?-/, ''), left + codeW + titleW + i * cw, y, cw, 18, { bold: true, fill: GREY, size: 8 }))
    y += 18
    for (const sid of subjectIds) {
      const s = subj.get(sid)
      cell(doc, s?.code ?? sid, left, y, codeW, rh, { size: fsz + 0.5 }); cell(doc, s?.name ?? sid, left + codeW, y, titleW, rh, { size: fsz + 0.5, align: 'left' })
      secs.forEach((sec, i) => cell(doc, teacherOf(sec.id, sid).join(' / '), left + codeW + titleW + i * cw, y, cw, rh, { size: fsz }))
      y += rh
    }

    // B: one grid page per working day, every section a row
    const semAsg = c.assignments.filter(a => secs.some(s => s.id === a.sectionId))
    for (const day of days) {
      doc.addPage()
      const yB = heading(doc, [[`MASTER TIMETABLE – ${day.toUpperCase()}`, 13], [title, 11]], 22)
      const headH = 34, avail2 = LAND_H - 24 - (yB + 8) - headH
      const rowH = Math.min(44, avail2 / secs.length)
      drawGrid(doc, {
        x: 24, y: yB + 8, w: LAND_W - 48, dayW: 52, headH, rowH, cols, days, size: rowH >= 34 ? 8 : 7,
        rows: secs.map(s => ({ title: s.id.replace(/^Y\d(S\d)?-/, 'Sec '), items: semAsg.filter(a => a.sectionId === s.id && a.day === day) })),
        label: a => {
          const s = subj.get(a.subjectId ?? a.courseId)
          const nm = s ? shortNameOf(s) : a.courseId
          const t = fac.get(a.facultyId)
          return `${a.blockType === 'LAB' && !/\blab\b/i.test(nm) ? nm + ' LAB' : nm}\n${t ? bareName(t.name) : ''}`
        },
      })
    }

    // C: teacher load for the semester
    doc.addPage()
    const yC = heading(doc, [['MASTER TIMETABLE – FACULTY LOAD', 13], [title, 11]], 22)
    const load = new Map<string, number>()
    for (const a of semAsg) load.set(a.facultyId, (load.get(a.facultyId) ?? 0) + (a.endPeriod - a.startPeriod + 1))
    const list = [...load.entries()].map(([id, n]) => ({ f: fac.get(id), n })).filter(x => x.f).sort((a, b) => b.n - a.n)
    const colsN = 3, w = (LAND_W - 48) / colsN, per = Math.ceil(list.length / colsN)
    list.forEach((x, i) => {
      const cx = 24 + Math.floor(i / per) * w, cy = yC + 12 + (i % per) * 17
      cell(doc, bareName(x.f!.name), cx, cy, w - 52, 17, { size: 8, align: 'left' }); cell(doc, String(x.n), cx + w - 52, cy, 40, 17, { size: 8, bold: true })
    })
    doc.font(LIGHT).fontSize(8).fillColor('#000').text('Periods per week in this semester. A total above the nominal limit is allowed.', 24, LAND_H - 22, { lineBreak: false })
  }
}
