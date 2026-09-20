import { useEffect, useState } from 'react'
import type { Page, UserRole } from './types'
import { ScopeProvider } from './scope'
import { api } from './api'
import { getSession, clearSession, type SessionUser } from './session'
import { rollSessionQuote } from './quotes'
import LoginPage from './components/LoginPage'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import TopBar from './components/TopBar'
import Dashboard from './components/Dashboard'
import FacultyManagement from './components/FacultyManagement'
import SubjectManagement from './components/SubjectManagement'
import DataHub from './components/DataHub'
import LabManagement from './components/LabManagement'
import { UploadCurriculum, UploadWorkload, ConstraintManagement } from './components/UploadPages'
import { GenerateTimetable, TimetableResult, ViewTimetable, EditTimetable } from './components/TimetablePages'
import { Reports } from './components/ReportsSettings'
import About from './components/About'
import FacultyProfile from './components/FacultyProfile'
import HodSettings from './components/HodSettings'

// New Faculty Allocation System Components
import FacultySubjectAllocation from './components/FacultySubjectAllocation'
import HodAllocationReview from './components/HodAllocationReview'
import HodFacultyManagement from './components/HodFacultyManagement'
import ScedularAiAssistant from './components/ScedularAiAssistant'

export default function App() {
  // Identity comes only from the authenticated session — no hardcoded defaults.
  const existing = getSession()
  const [page, setPage] = useState<Page>(existing ? 'dashboard' : 'login')
  const [user, setUser] = useState<SessionUser | null>(existing?.user ?? null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [lastRunId, setLastRunId] = useState<number | null>(null)

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

  const handleLogin = (userCtx: { role: UserRole; facultyId: string; name: string; designation: string }) => {
    // Session already persisted by LoginPage from the backend response.
    rollSessionQuote()
    setUser({
      facultyId: userCtx.facultyId,
      name: userCtx.name,
      designation: userCtx.designation,
      role: userCtx.role,
    })
    // Role-based landing: both HOD and FACULTY arrive at the Dashboard.
    setPage('dashboard')
  }

  const handleLogout = () => {
    api.auth.logout().catch(() => {})
    clearSession()
    setUser(null)
    setPage('login')
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
      <div className="relative z-10 flex h-screen overflow-hidden p-3 gap-3">
        <Sidebar
          page={page}
          navigate={navigate}
          open={sidebarOpen}
          role={role}
          userName={user.name}
          userDesignation={user.designation || 'Faculty'}
        />
        <div className="flex flex-col flex-1 overflow-hidden gap-3 min-w-0">
          <TopBar
            onToggleSidebar={() => setSidebarOpen(o => !o)}
            onLogout={handleLogout}
            navigate={navigate}
            role={role}
          />
          <main className="glass flex-1 overflow-auto glass-scrollarea rounded-3xl">
            <div key={page} className="page-transition p-6 pb-24 md:pb-6 min-h-full">
              {page === 'dashboard' && <Dashboard navigate={navigate} role={role} userName={user.name} />}
              {page === 'faculty-allocation' && <FacultySubjectAllocation facultyId={facultyId} />}
              {page === 'hod-allocation-review' && <HodAllocationReview />}
              {page === 'hod-faculty-management' && <HodFacultyManagement />}
              {page === 'profile' && <FacultyProfile facultyId={facultyId} />}
              {page === 'faculty' && <FacultyManagement navigate={navigate} />}
              {page === 'subjects' && <SubjectManagement navigate={navigate} />}
              {page === 'data-hub' && <DataHub navigate={navigate} />}
              {page === 'lab-management' && <LabManagement navigate={navigate} />}
              {page === 'upload-curriculum' && <UploadCurriculum navigate={navigate} />}
              {page === 'upload-workload' && <UploadWorkload navigate={navigate} />}
              {page === 'constraints' && <ConstraintManagement navigate={navigate} />}
              {page === 'generate' && <GenerateTimetable navigate={navigate} onGenerated={setLastRunId} />}
              {page === 'timetable-result' && <TimetableResult navigate={navigate} runId={lastRunId} />}
              {page === 'view-timetable' && <ViewTimetable navigate={navigate} />}
              {page === 'edit-timetable' && <EditTimetable navigate={navigate} />}
              {page === 'reports' && <Reports navigate={navigate} />}
              {page === 'settings' && role === 'HOD' && <HodSettings />}
              {page === 'about' && <About navigate={navigate} />}
            </div>
          </main>
        </div>
      </div>
      <BottomNav page={page} navigate={navigate} role={role} />
      <ScedularAiAssistant role={role} />
    </ScopeProvider>
  )
}
