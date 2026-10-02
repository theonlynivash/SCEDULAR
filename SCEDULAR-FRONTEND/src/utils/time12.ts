/** "13:15" -> "1:15" (12-hour clock, no AM/PM, as on the printed timetables). */
export function time12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '')
  if (!m) return hhmm
  const h = Number(m[1])
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m[2]}`
}
