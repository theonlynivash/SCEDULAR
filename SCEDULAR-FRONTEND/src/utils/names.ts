/**
 * Names come from the department's records in capitals and without spaces ("Dr.S.MALATHI"). On screen they read better as
 * "Dr. S. Malathi". Only the way a name is DISPLAYED changes, never the stored name.
 */
export function prettyName(raw: string): string {
  return (raw ?? '')
    .replace(/\./g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => (/^[A-Z.]+$/.test(w) && w.replace(/\./g, '').length > 1 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ')
}

/** the same without the title: "Dr.V.MAHA VAISHNAVI" -> "V. Maha Vaishnavi" */
export function shortName(raw: string): string {
  return prettyName(raw).replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '')
}
