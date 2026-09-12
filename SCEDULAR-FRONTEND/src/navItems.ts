import type { Page } from './types'

export interface NavItem {
  label: string
  shortLabel: string
  page: Page
  icon: string
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', shortLabel: 'Home', page: 'dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Faculty Management', shortLabel: 'Faculty', page: 'faculty', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Subject Management', shortLabel: 'Subjects', page: 'subjects', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { label: 'Data & Import Hub', shortLabel: 'Data', page: 'data-hub', icon: 'M4 7v10c0 1.66 3.58 3 8 3s8-1.34 8-3V7M4 7c0 1.66 3.58 3 8 3s8-1.34 8-3M4 7c0-1.66 3.58-3 8-3s8 1.34 8 3m0 5c0 1.66-3.58 3-8 3s-8-1.34-8-3' },
  { label: 'Generate Timetable', shortLabel: 'Generate', page: 'generate', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { label: 'View Timetable', shortLabel: 'Timetable', page: 'view-timetable', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Reports', shortLabel: 'Reports', page: 'reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: 'About', shortLabel: 'About', page: 'about', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
]
