import { useEffect, useState } from 'react'
import type { Page, UserRole } from './types'
import { ScopeProvider } from './scope'
import { api } from './api'
import { getSession, clearSession, type SessionUser } from './session'
import { fetchSessionQuote } from './quotes'
import LoginPage from './components/LoginPage'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import TopBar from './components/TopBar'
import Dashboard from './components/Dashboard'
import TeachersPage from './components/TeachersPage'
import MailCompose from './components/MailCompose'
import MobileDrawer from './components/MobileDrawer'
import DataHub from './components/DataHub'
import LabManagement from './components/LabManagement'
import { UploadCurriculum, UploadWorkload, ConstraintManagement } from './components/UploadPages'
import { GenerateTimetable, TimetableResult, ViewTimetable, EditTimetable } from './components/TimetablePages'
import { ReportsPage } from './components/ReportsPage'
import About from './components/About'
import FacultyProfile from './components/FacultyProfile'
import HodSettings from './components/HodSettings'

// New Faculty Allocation System Components
import FacultySubjectAllocation from './components/FacultySubjectAllocation'
import HodAssignBoard from './components/HodAssignBoard'
import HodFacultyManagement from './components/HodFacultyManagement'
import ScedularAiAssistant from './components/ScedularAiAssistant'

const PAGES: Page[] = ['dashboard', 'profile', 'faculty-allocation', 'hod-allocation-review', 'hod-faculty-management', 'faculty', 'subjects', 'data-hub', 'lab-management', 'upload-curriculum', 'upload-workload', 'constraints', 'generate', 'timetable-result', 'view-timetable', 'edit-timetable', 'reports', 'settings', 'mail', 'about']
/** The page named in the address bar (#/reports), so links, reload and the browser's Back button work. */
const pageFromHash = (): Page | null => { const p = window.location.hash.replace(/^#\/?/, '') as Page; return PAGES.includes(p) ? p : null }

export default function App() {
  // Identity comes only from the authenticated session — no hardcoded defaults.
  const existing = getSession()
  const [page, setPage] = useState<Page>(existing ? (pageFromHash() ?? 'dashboard') : 'login')
  const [user, setUser] = useState<SessionUser | null>(existing?.user ?? null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [lastRunId, setLastRunId] = useState<number | null>(null)
  const [mailTarget, setMailTarget] = useState<string>('')

  // On load, re-validate any persisted session against the backend so a stale
  // or logged-out token cannot keep a previous identity active.
  useEffect(() => {
    if (!existing) return
    api.auth
      .me()
      .then(me => setUser({ ...me, designation: me.designation ?? null }))
      .catch(() => {
        clearSession()
        setUser(null)
        setPage('login')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navigate = (p: Page) => setPage(p)

  // keep the address bar and the page in step (deep links, reload, Back / Forward)
  useEffect(() => {
    if (user && page !== 'login' && window.location.hash !== `#/${page}`) window.history.pushState(null, '', `#/${page}`)
  }, [page, user])
  useEffect(() => {
    const onHash = () => { const p = pageFromHash(); if (p && getSession()) setPage(p) }
    window.addEventListener('hashchange', onHash); window.addEventListener('popstate', onHash)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash) }
  }, [])

  const handleLogin = (userCtx: { role: UserRole; facultyId: string; name: string; designation: string }) => {
    // Session already persisted by LoginPage from the backend response.
    fetchSessionQuote() // async — caches in sessionStorage for the session
    setUser({
      facultyId: userCtx.facultyId,
      name: userCtx.name,
      designation: userCtx.designation,
      role: userCtx.role,
    })
    // Role-based landing: both HOD and FACULTY arrive at the Dashboard.
    setPage('dashboard')
  }

  const [drawerOpen, setDrawerOpen] = useState(false)
  const handleLogout = () => {
    api.auth.logout().catch(() => {})
    clearSession()
    setUser(null)
    setPage('login')
    window.history.replaceState(null, '', window.location.pathname)
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />
  }

  const role = user.role
  const facultyId = user.facultyId

  return (
    <ScopeProvider>
      <div className="app-wallpaper">
        <div className="blob" />
        <div className="fx-grid" aria-hidden="true" />
        <div className="fx-particles" aria-hidden="true" />
      </div>
      <div className="relative z-10 flex h-screen overflow-hidden p-2.5 gap-2.5">
        <Sidebar
          page={page}
          navigate={navigate}
          open={sidebarOpen}
          role={role}
          userName={user.name}
          userDesignation={user.designation || 'Faculty'}
        />
        <div className="flex flex-col flex-1 overflow-hidden gap-2.5 min-w-0">
          <TopBar
            onToggleSidebar={() => (window.matchMedia('(min-width: 768px)').matches ? setSidebarOpen(o => !o) : setDrawerOpen(true))}
            onLogout={handleLogout}
            navigate={navigate}
            role={role}
          />
          <main className="glass-main flex-1 overflow-auto glass-scrollarea rounded-2xl">
            <div key={page} className="page-transition p-5 pb-24 md:pb-5 min-h-full">
              {page === 'dashboard' && <Dashboard navigate={navigate} role={role} userName={user.name} />}
              {page === 'faculty-allocation' && <FacultySubjectAllocation facultyId={facultyId} />}
              {page === 'hod-allocation-review' && <HodAssignBoard />}
              {page === 'hod-faculty-management' && <HodFacultyManagement />}
              {page === 'profile' && <FacultyProfile facultyId={facultyId} />}
              {page === 'faculty' && <TeachersPage onMail={id => { setMailTarget(id); setPage('mail') }} />}
              {page === 'mail' && role === 'HOD' && <MailCompose facultyId={mailTarget} onBack={() => setPage('faculty')} />}
              {page === 'data-hub' && <DataHub navigate={navigate} />}
              {page === 'lab-management' && <LabManagement navigate={navigate} />}
              {page === 'upload-curriculum' && <UploadCurriculum navigate={navigate} />}
              {page === 'upload-workload' && <UploadWorkload navigate={navigate} />}
              {page === 'constraints' && <ConstraintManagement navigate={navigate} />}
              {page === 'generate' && <GenerateTimetable navigate={navigate} onGenerated={setLastRunId} />}
              {page === 'timetable-result' && <TimetableResult navigate={navigate} runId={lastRunId} />}
              {page === 'view-timetable' && <ViewTimetable navigate={navigate} role={role} />}
              {page === 'edit-timetable' && <EditTimetable navigate={navigate} />}
              {page === 'reports' && <ReportsPage navigate={navigate} />}
              {page === 'settings' && role === 'HOD' && <HodSettings navigate={navigate} />}
              {page === 'about' && <About navigate={navigate} />}
            </div>
          </main>
        </div>
      </div>
      <BottomNav page={page} navigate={navigate} role={role} onMore={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} page={page} navigate={navigate} role={role} userName={user.name} userDesignation={user.designation || 'Faculty'} onLogout={handleLogout} />
      <ScedularAiAssistant role={role} />
    </ScopeProvider>
  )
}
