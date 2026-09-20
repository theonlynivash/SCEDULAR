import type { Page, UserRole } from './types'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Database,
  FlaskConical,
  House,
  Info,
  Sparkles,
  Users,
  UserCheck,
} from 'lucide-react'

export interface NavItem {
  label: string
  shortLabel: string
  page: Page
  icon: LucideIcon
  role?: UserRole
}

export const facultyNavItems: NavItem[] = [
  { label: 'Dashboard', shortLabel: 'Home', page: 'dashboard', icon: House },
  { label: 'Faculty Subject Allocation', shortLabel: 'Allocation', page: 'faculty-allocation', icon: BookOpen },
  { label: 'Timetable', shortLabel: 'Timetable', page: 'view-timetable', icon: CalendarDays },
  { label: 'My Profile', shortLabel: 'Profile', page: 'profile', icon: UserCheck },
  { label: 'About', shortLabel: 'About', page: 'about', icon: Info },
]

export const hodNavItems: NavItem[] = [
  { label: 'Dashboard', shortLabel: 'Home', page: 'dashboard', icon: House },
  { label: 'Faculty Subject Review', shortLabel: 'Review', page: 'hod-allocation-review', icon: CheckSquare },
  { label: 'Faculty Management', shortLabel: 'Faculty', page: 'faculty', icon: Users },
  { label: 'Subject Management', shortLabel: 'Subjects', page: 'subjects', icon: BookOpen },
  { label: 'View Timetable', shortLabel: 'Timetable', page: 'view-timetable', icon: CalendarDays },
  { label: 'Reports', shortLabel: 'Reports', page: 'reports', icon: BarChart3 },
  { label: 'My Profile', shortLabel: 'Profile', page: 'profile', icon: UserCheck },
  { label: 'About', shortLabel: 'About', page: 'about', icon: Info },
]

export const navItems: NavItem[] = hodNavItems
