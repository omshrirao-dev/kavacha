import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ProjectIssuesPage } from './pages/ProjectIssuesPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectMemoryPage } from './pages/ProjectMemoryPage'
import { ProjectMonitorPage } from './pages/ProjectMonitorPage'
import { ProjectReviewPage } from './pages/ProjectReviewPage'
import { TermsPage } from './pages/TermsPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
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
