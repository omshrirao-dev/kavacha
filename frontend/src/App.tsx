import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { ProjectIssuesPage } from './pages/ProjectIssuesPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectMemoryPage } from './pages/ProjectMemoryPage'

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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
