import { createContext, useContext, useState, type ReactNode } from 'react'

// Global scope selector: which slice of the department this session is
// looking at / generating for. "All" on year or semester means
// department-wide (every year, every semester) rather than one slice --
// the auto-generator can run for a single section, a whole year, or the
// entire department in one pass.
export const YEARS = ['I', 'II', 'III', 'IV'] as const
export const SEMESTERS_BY_YEAR: Record<(typeof YEARS)[number], string[]> = {
  I: ['I', 'II'],
  II: ['III', 'IV'],
  III: ['V', 'VI'],
  IV: ['VII', 'VIII'],
}

export interface Scope {
  year: (typeof YEARS)[number] | 'ALL'
  semester: string | 'ALL'
}

interface ScopeContextValue {
  scope: Scope
  setScope: (s: Scope) => void
}

const ScopeContext = createContext<ScopeContextValue | null>(null)

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<Scope>({ year: 'ALL', semester: 'ALL' })
  return <ScopeContext.Provider value={{ scope, setScope }}>{children}</ScopeContext.Provider>
}

export function useScope() {
  const ctx = useContext(ScopeContext)
  if (!ctx) throw new Error('useScope must be used within ScopeProvider')
  return ctx
}

export function matchesScope(scope: Scope, sectionYear: string | null, sectionSemester: string | null): boolean {
  if (scope.year !== 'ALL' && sectionYear !== scope.year) return false
  if (scope.semester !== 'ALL' && sectionSemester !== scope.semester) return false
  return true
}
