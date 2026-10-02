/** Short label for a subject on timetables: the stored short name (ARVR, NLP…), else the initials of its main words. */
export function shortNameOf(s: { name: string; shortName?: string | null }): string {
  if (s.shortName && s.shortName.trim()) return s.shortName.trim()
  const skip = new Set(['and', 'of', 'the', 'for', 'in', 'with', 'to', 'a', 'an', 'on', 'at', 'laboratory', 'lab'])
  const words = s.name.replace(/\(.*?\)/g, ' ').split(/[\s\-/&,]+/).filter(w => w && !skip.has(w.toLowerCase()))
  const initials = words.map(w => w[0].toUpperCase()).join('')
  return initials.length >= 2 ? initials.slice(0, 6) : s.name.slice(0, 6).toUpperCase()
}

/** What a timetable cell shows: "ARVR", or "ARVR LAB" for a lab block. */
export function cellLabel(s: { name: string; shortName?: string | null } | undefined, fallback: string, isLab: boolean): string {
  const sn = s ? shortNameOf(s) : fallback
  return isLab && !/\blab\b/i.test(sn) ? `${sn} LAB` : sn
}
