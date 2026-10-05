// Canonical client-side session. The authenticated identity is obtained from
// the backend (/api/auth/login) and persisted here so it survives navigation
// and page refresh. No identity is ever invented on the client.

export type UserRole = 'HOD' | 'FACULTY'

export interface SessionUser {
  facultyId: string
  name: string
  designation: string | null
  department?: string | null
  role: UserRole
}

export interface Session {
  token: string
  user: SessionUser
}

const STORAGE_KEY = 'scedular_session'

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function getSession(): Session | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.token || !parsed?.user?.facultyId) return null
    return parsed
  } catch {
    return null
  }
}

export function setSession(session: Session): void {
  const store = storage()
  if (store) store.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  const store = storage()
  if (store) store.removeItem(STORAGE_KEY)
}

export function getSessionToken(): string | null {
  return getSession()?.token ?? null
}

export function getSessionFacultyId(): string | null {
  return getSession()?.user?.facultyId ?? null
}
