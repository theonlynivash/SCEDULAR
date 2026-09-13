import { useState } from 'react'
import type { Page } from './types'
import { ScopeProvider } from './scope'
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

export default function App() {
  const [page, setPage] = useState<Page>('login')
  const [loggedIn, setLoggedIn] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [lastRunId, setLastRunId] = useState<number | null>(null)

  const navigate = (p: Page) => setPage(p)

  if (!loggedIn) {
    return <LoginPage onLogin={() => { setLoggedIn(true); setPage('dashboard') }} />
  }

  return (
    <ScopeProvider>
      <div className="app-wallpaper"><div className="blob" /></div>
      <div className="relative z-10 flex h-screen overflow-hidden p-3 gap-3">
        <Sidebar page={page} navigate={navigate} open={sidebarOpen} />
        <div className="flex flex-col flex-1 overflow-hidden gap-3 min-w-0">
          <TopBar
            onToggleSidebar={() => setSidebarOpen(o => !o)}
            onLogout={() => setLoggedIn(false)}
            navigate={navigate}
          />
          <main className="glass flex-1 overflow-auto glass-scrollarea rounded-3xl">
            <div className="p-6 pb-24 md:pb-6 min-h-full">
              {page === 'dashboard' && <Dashboard navigate={navigate} />}
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
              {page === 'about' && <About navigate={navigate} />}
            </div>
          </main>
        </div>
      </div>
      <BottomNav page={page} navigate={navigate} />
    </ScopeProvider>
  )
}
