/**
 * The substitution arrangement of one day, as a notice-board sheet (A4 landscape, the department's bordered style):
 * which teacher is absent, who takes the class in place, for which section, subject, period and room; a column for the substitute's
 * signature; and a second table for any class that still has no substitute.
 */
import PDFDocument from 'pdfkit'
import type { Period } from '../types.js'
import type { SheetRow } from '../leave/service.js'
import { DEMI, GREY, LIGHT, fmtTime } from './classTimetablePdf.js'

type Doc = InstanceType<typeof PDFDocument>
const W = 841.89, H = 595.28, MX = 30, BOTTOM = 44
const ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' }

export interface SubstitutionSheetData {
  date: string
  covered: SheetRow[]
  uncovered: SheetRow[]
  teachersOnLeave: number
  periods: Period[]
  labName: (id: string | null) => string | null
  preparedBy: string
  generatedAt: Date
}

type Column = { title: string; w: number; align?: 'left' | 'center' }

function cell(doc: Doc, txt: string, x: number, y: number, w: number, h: number, o: { bold?: boolean; fill?: string; size?: number; align?: 'left' | 'center' } = {}) {
  doc.lineWidth(0.6).rect(x, y, w, h)
  if (o.fill) doc.fillAndStroke(o.fill, '#000'); else doc.stroke('#000')
  if (!txt) return
  doc.font(o.bold ? DEMI : LIGHT).fontSize(o.size ?? 9).fillColor('#000')
  const opt = { width: w - 8, align: o.align ?? 'left', lineGap: -1.5 } as const
  const th = doc.heightOfString(txt, opt)
  doc.text(txt, x + 4, y + Math.max(3, (h - th) / 2), opt)
}

function rowHeight(doc: Doc, cols: Column[], cells: string[]): number {
  let h = 22
  cells.forEach((c, i) => { if (c) { doc.font(LIGHT).fontSize(9); h = Math.max(h, doc.heightOfString(c, { width: cols[i].w - 8, lineGap: -1.5 }) + 10) } })
  return h
}

/** a bordered table that continues on a new page (with its header again) when it runs out of room; returns where it ended */
function table(doc: Doc, y: number, cols: Column[], rows: string[][], onNewPage: () => number): number {
  const headH = (() => { doc.font(DEMI).fontSize(8.5); return Math.max(24, ...cols.map(c => doc.heightOfString(c.title, { width: c.w - 8, lineGap: -1.5 }) + 12)) })()
  const head = (at: number) => { let x = MX; for (const c of cols) { cell(doc, c.title, x, at, c.w, headH, { bold: true, fill: GREY, align: 'center', size: 8.5 }); x += c.w } return at + headH }
  y = head(y)
  for (const r of rows) {
    const h = rowHeight(doc, cols, r)
    if (y + h > H - BOTTOM) { doc.addPage(); y = head(onNewPage()) }
    let x = MX
    r.forEach((c, i) => { cell(doc, c, x, y, cols[i].w, h, { align: cols[i].align ?? 'left' }); x += cols[i].w })
    y += h
  }
  return y
}

export function renderSubstitutionSheetPdf(d: SubstitutionSheetData, doc: Doc): void {
  const dateLine = new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const centered = (t: string, y: number, size: number, bold = true) => { doc.font(bold ? DEMI : LIGHT).fontSize(size).fillColor('#000').text(t, 0, y, { width: W, align: 'center', lineBreak: false }) }
  const timeOf = (a: number, b: number) => {
    const s = d.periods.find(p => p.index === a), e = d.periods.find(p => p.index === b)
    return s && e ? `${fmtTime(s.start)} – ${fmtTime(e.end)}` : ''
  }
  const period = (r: SheetRow) => (r.startPeriod === r.endPeriod ? `P${r.startPeriod}` : `P${r.startPeriod}–P${r.endPeriod}`)
  const section = (r: SheetRow) => `${r.sectionId}\n${r.year ? ROMAN[r.year.replace(/\D/g, '')] + ' Year' : ''}${r.semester ? ` · ${r.semester} Sem` : ''}`
  const subject = (r: SheetRow) => `${r.subjectCode}\n${r.subjectName}${r.blockType === 'LAB' ? ' (Lab)' : ''}`
  const venue = (r: SheetRow) => (r.blockType === 'LAB' ? d.labName(r.labId) ?? 'Lab' : 'Classroom')

  const pageHead = (continued: boolean): number => {
    centered('PANIMALAR ENGINEERING COLLEGE, CHENNAI', 24, 14)
    centered('B. TECH – ARTIFICIAL INTELLIGENCE AND DATA SCIENCE', 42, 11.5)
    centered(`SUBSTITUTION ARRANGEMENT${continued ? ' (continued)' : ''}`, 60, 12.5)
    centered(dateLine, 78, 11, false)
    return 100
  }

  let y = pageHead(false)
  doc.font(LIGHT).fontSize(9.5).fillColor('#000')
  const summary = `Faculty on leave: ${d.teachersOnLeave}      Classes arranged: ${d.covered.length}      Classes still without a substitute: ${d.uncovered.length}`
  doc.text(summary, MX, y, { width: W - 2 * MX, align: 'left', lineBreak: false })
  y += 18

  if (d.covered.length > 0) {
    const cols: Column[] = [
      { title: 'S.No', w: 28, align: 'center' }, { title: 'PERIOD', w: 50, align: 'center' }, { title: 'TIME', w: 78, align: 'center' }, { title: 'SECTION', w: 92 },
      { title: 'SUBJECT', w: 176 }, { title: 'FACULTY ABSENT', w: 112 }, { title: 'SUBSTITUTE FACULTY', w: 112 }, { title: 'VENUE', w: 56, align: 'center' }, { title: 'SIGNATURE', w: 78, align: 'center' },
    ]
    y = table(doc, y, cols, d.covered.map((r, i) => [String(i + 1), period(r), timeOf(r.startPeriod, r.endPeriod), section(r), subject(r), r.absentName, r.substituteName ?? '', venue(r), '']), () => pageHead(true))
  }

  if (d.uncovered.length > 0) {
    if (y + 90 > H - BOTTOM) { doc.addPage(); y = pageHead(true) } else y += 20
    doc.font(DEMI).fontSize(10.5).fillColor('#000').text('CLASSES STILL WITHOUT A SUBSTITUTE', MX, y, { lineBreak: false })
    y += 16
    const cols: Column[] = [
      { title: 'S.No', w: 28, align: 'center' }, { title: 'PERIOD', w: 50, align: 'center' }, { title: 'TIME', w: 78, align: 'center' }, { title: 'SECTION', w: 92 },
      { title: 'SUBJECT', w: 200 }, { title: 'FACULTY ABSENT', w: 130 }, { title: 'VENUE', w: 70, align: 'center' }, { title: 'SUBSTITUTE TO BE ARRANGED', w: 134, align: 'center' },
    ]
    y = table(doc, y, cols, d.uncovered.map((r, i) => [String(i + 1), period(r), timeOf(r.startPeriod, r.endPeriod), section(r), subject(r), r.absentName, venue(r), '']), () => pageHead(true))
  }

  // the signature of the head and who prepared the sheet
  if (y + 70 > H - 20) { doc.addPage(); y = pageHead(true) }
  const sigY = Math.max(y + 36, H - 80)
  doc.lineWidth(0.6).moveTo(W - MX - 190, sigY).lineTo(W - MX, sigY).stroke('#000')
  doc.font(DEMI).fontSize(10).text('Head of the Department', W - MX - 190, sigY + 4, { width: 190, align: 'center', lineBreak: false })
  doc.font(LIGHT).fontSize(8).fillColor('#444')
  doc.text('Substitute faculty are requested to sign against the periods arranged for them.', MX, H - 34, { width: W - 2 * MX - 210, lineBreak: false })
  doc.text(`Prepared by ${d.preparedBy} · ${d.generatedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short', hour12: true })} IST · SCEDULAR`, MX, H - 22, { width: W - 2 * MX - 210, lineBreak: false })
}
