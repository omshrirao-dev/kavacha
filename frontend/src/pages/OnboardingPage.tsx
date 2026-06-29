import { useState } from 'react'
import { ConnectProjectStep } from '../components/onboarding/ConnectProjectStep'
import { FRAMEWORKS } from '../components/onboarding/frameworks'
import { type CreatedProject, ProjectDetailsForm } from '../components/onboarding/ProjectDetailsForm'

function ProgressBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-8 flex gap-2">
      {[1, 2, 3].map((s) => (
        <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'gradient-bg' : 'bg-edge'}`} />
      ))}
    </div>
  )
}

function StepFramework({ onSelect }: { onSelect: (framework: string) => void }) {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">What are you building?</h1>
      <p className="mb-6 text-sm text-ink-dim">What AI framework does your project use?</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw}
            type="button"
            onClick={() => onSelect(fw)}
            className="rounded-lg border border-edge bg-card p-4 text-sm font-medium text-ink transition-colors hover:border-saffron-bright hover:text-saffron-bright"
          >
            {fw}
          </button>
        ))}
      </div>
    </div>
  )
}

export function OnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [framework, setFramework] = useState('')
  const [created, setCreated] = useState<CreatedProject | null>(null)

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <div className="w-full max-w-lg">
        <ProgressBar step={step} />
        {step === 1 && (
          <StepFramework
            onSelect={(fw) => {
              setFramework(fw)
              setStep(2)
            }}
          />
        )}
        {step === 2 && (
          <div>
            <h1 className="mb-1 text-xl font-semibold text-ink">Tell us about your project</h1>
            <p className="mb-6 text-sm text-ink-dim">Two minutes, then you're connected.</p>
            <ProjectDetailsForm
              initialFramework={framework}
              onCreated={(result) => {
                setCreated(result)
                setStep(3)
              }}
            />
          </div>
        )}
        {step === 3 && created && (
          <ConnectProjectStep projectId={created.projectId} apiKey={created.apiKey} framework={created.framework} />
        )}
      </div>
    </div>
  )
}
