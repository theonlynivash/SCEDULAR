import type { Period, ScheduleConfig } from '../types.js'

// Default grid matches Section 5 of the SCEDULAR report exactly:
// P1-P3, BREAK, P4-P5, LUNCH, P6-P8. Non-schedulable slots are omitted
// from the `periods` list — schedulability is expressed purely by which
// period indices exist and whether consecutive indices are contiguous
// in real time (see isContiguous below).
export const DEFAULT_PERIODS: Period[] = [
  { index: 1, label: 'P1', start: '08:00', end: '08:50', schedulable: true },
  { index: 2, label: 'P2', start: '08:50', end: '09:40', schedulable: true },
  { index: 3, label: 'P3', start: '09:40', end: '10:30', schedulable: true },
  { index: 4, label: 'P4', start: '10:45', end: '11:40', schedulable: true },
  { index: 5, label: 'P5', start: '11:40', end: '12:40', schedulable: true },
  { index: 6, label: 'P6', start: '13:15', end: '13:55', schedulable: true },
  { index: 7, label: 'P7', start: '13:55', end: '14:35', schedulable: true },
  { index: 8, label: 'P8', start: '14:35', end: '15:15', schedulable: true },
]

export const DEFAULT_WORKING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

// Periods that sit back-to-back on the real clock, grouped so that a lab
// block can only be placed inside one group (never crossing BREAK or LUNCH).
// With the default grid this is [1,2,3], [4,5], [6,7,8].
export function contiguousGroups(periods: Period[]): number[][] {
  const sorted = [...periods].filter(p => p.schedulable).sort((a, b) => a.index - b.index)
  const groups: number[][] = []
  let current: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    const prev = sorted[i - 1]
    if (prev && p.index === prev.index + 1 && isAdjacentInTime(prev, p)) {
      current.push(p.index)
    } else {
      if (current.length) groups.push(current)
      current = [p.index]
    }
  }
  if (current.length) groups.push(current)
  return groups
}

function isAdjacentInTime(a: Period, b: Period): boolean {
  return a.end === b.start
}

export function defaultScheduleConfig(): ScheduleConfig {
  return { workingDays: DEFAULT_WORKING_DAYS, periods: DEFAULT_PERIODS }
}
