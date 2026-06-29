import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { HomeRoute } from './components/HomeRoute'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AccountSettingsPage } from './pages/AccountSettingsPage'
import { DashboardHomePage } from './pages/DashboardHomePage'
import { DemoPage } from './pages/DemoPage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { OverviewPage } from './pages/OverviewPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ProjectIssuesPage } from './pages/ProjectIssuesPage'
import { ProjectMemoryPage } from './pages/ProjectMemoryPage'
import { ProjectMonitorPage } from './pages/ProjectMonitorPage'
import { ProjectNewPage } from './pages/ProjectNewPage'
import { ProjectOverviewPage } from './pages/ProjectOverviewPage'
import { ProjectReviewPage } from './pages/ProjectReviewPage'
import { ProjectSdkSetupPage } from './pages/ProjectSdkSetupPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { TermsPage } from './pages/TermsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/dashboard" element={<DashboardHomePage />} />
        <Route path="/settings" element={<AccountSettingsPage />} />
        <Route path="/projects/new" element={<ProjectNewPage />} />
        <Route path="/projects/:projectId/overview" element={<ProjectOverviewPage />} />
        <Route path="/projects/:projectId/memory" element={<ProjectMemoryPage />} />
        <Route path="/projects/:projectId/issues" element={<ProjectIssuesPage />} />
        <Route path="/projects/:projectId/review" element={<ProjectReviewPage />} />
        <Route path="/projects/:projectId/monitor" element={<ProjectMonitorPage />} />
        <Route path="/projects/:projectId/sdk-setup" element={<ProjectSdkSetupPage />} />
        <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
