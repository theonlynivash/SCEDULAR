import type { Page } from './types'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, BookOpen, CalendarDays, Database, FlaskConical, House, Info, Sparkles, Users } from 'lucide-react'

export interface NavItem {
  label: string
  shortLabel: string
  page: Page
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', shortLabel: 'Home', page: 'dashboard', icon: House },
  { label: 'Faculty Management', shortLabel: 'Faculty', page: 'faculty', icon: Users },
  { label: 'Subject Management', shortLabel: 'Subjects', page: 'subjects', icon: BookOpen },
  { label: 'Data & Import Hub', shortLabel: 'Data', page: 'data-hub', icon: Database },
  { label: 'Lab Management', shortLabel: 'Labs', page: 'lab-management', icon: FlaskConical },
  { label: 'Generate Timetable', shortLabel: 'Generate', page: 'generate', icon: Sparkles },
  { label: 'View Timetable', shortLabel: 'Timetable', page: 'view-timetable', icon: CalendarDays },
  { label: 'Reports', shortLabel: 'Reports', page: 'reports', icon: BarChart3 },
  { label: 'About', shortLabel: 'About', page: 'about', icon: Info },
]
