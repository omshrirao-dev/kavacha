import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConnectProjectStep } from '../components/onboarding/ConnectProjectStep'
import { type CreatedProject, ProjectDetailsForm } from '../components/onboarding/ProjectDetailsForm'

// Same form as onboarding Step 2, minus the prior framework-picker step --
// reuses the exact same components (ProjectDetailsForm, ConnectProjectStep)
// so the create-project and SDK-connect experience is identical whether a
// user gets here via first-time onboarding or "+ Add New Project" later.
export function ProjectNewPage() {
  const [created, setCreated] = useState<CreatedProject | null>(null)

  return (
    <div>
      <Link to="/dashboard" className="text-sm text-ink-faint hover:text-ink-dim">
        &larr; Back to dashboard
      </Link>
      <div className="mx-auto mt-6 max-w-lg">
        {!created ? (
          <div>
            <h1 className="mb-1 text-xl font-semibold text-ink">Add a new project</h1>
            <p className="mb-6 text-sm text-ink-dim">Tell us about it, then connect the SDK.</p>
            <ProjectDetailsForm onCreated={setCreated} />
          </div>
        ) : (
          <ConnectProjectStep
            projectId={created.projectId}
            apiKey={created.apiKey}
            framework={created.framework}
            doneLabel="Go to Dashboard →"
          />
        )}
      </div>
    </div>
  )
}
