import { useState } from 'react'
import type { Page } from './types'
import LoginPage from './components/LoginPage'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Dashboard from './components/Dashboard'
import FacultyManagement from './components/FacultyManagement'
import SubjectManagement from './components/SubjectManagement'
import { UploadCurriculum, UploadWorkload, ConstraintManagement } from './components/UploadPages'
import { GenerateTimetable, TimetableResult, ViewTimetable, EditTimetable } from './components/TimetablePages'
import { Reports } from './components/ReportsSettings'
import FacultyAllocation from './components/FacultyAllocation'

export default function App() {
  const [page, setPage] = useState<Page>('login')
  const [loggedIn, setLoggedIn] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const navigate = (p: Page) => setPage(p)

  if (!loggedIn) {
    return <LoginPage onLogin={() => { setLoggedIn(true); setPage('dashboard') }} />
  }

  return (
    <div className="flex h-screen bg-[#f8faff] overflow-hidden">
      <Sidebar page={page} navigate={navigate} open={sidebarOpen} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar
          onToggleSidebar={() => setSidebarOpen(o => !o)}
          onLogout={() => setLoggedIn(false)}
          navigate={navigate}
        />
        <main className="flex-1 overflow-auto p-6">
          {page === 'dashboard' && <Dashboard navigate={navigate} />}
          {page === 'faculty' && <FacultyManagement navigate={navigate} />}
          {page === 'subjects' && <SubjectManagement navigate={navigate} />}
          {page === 'upload-curriculum' && <UploadCurriculum navigate={navigate} />}
          {page === 'upload-workload' && <UploadWorkload navigate={navigate} />}
          {page === 'constraints' && <ConstraintManagement navigate={navigate} />}
          {page === 'generate' && <GenerateTimetable navigate={navigate} />}
          {page === 'timetable-result' && <TimetableResult navigate={navigate} />}
          {page === 'view-timetable' && <ViewTimetable navigate={navigate} />}
          {page === 'edit-timetable' && <EditTimetable navigate={navigate} />}
          {page === 'reports' && <Reports navigate={navigate} />}
          {page === 'faculty-allocation' && <FacultyAllocation navigate={navigate} />}
        </main>
      </div>
    </div>
  )
}
