import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { ProjectIssuesPage } from './pages/ProjectIssuesPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectMemoryPage } from './pages/ProjectMemoryPage'
import { ProjectMonitorPage } from './pages/ProjectMonitorPage'
import { ProjectReviewPage } from './pages/ProjectReviewPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/projects/:projectId/memory" element={<ProjectMemoryPage />} />
        <Route path="/projects/:projectId/issues" element={<ProjectIssuesPage />} />
        <Route path="/projects/:projectId/review" element={<ProjectReviewPage />} />
        <Route path="/projects/:projectId/monitor" element={<ProjectMonitorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
