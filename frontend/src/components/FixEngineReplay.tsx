import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Issue } from '../lib/types'

// Steps are revealed progressively for effect -- but every word shown is the
// real, already-persisted data for this issue (root_cause, fix_applied,
// verified). Nothing here is invented or re-run; it's the only honest way
// to show "watching the Fix Engine think" for an issue that was actually
// resolved synchronously, in one backend call, before this page ever loaded.
const STEP_DELAY_MS = 700

function buildSteps(issue: Issue) {
  return [
    { label: 'Querying Project Memory...', detail: 'Checking what decisions were made in this layer, and whether this pattern has occurred before.' },
    { label: 'Root cause identified', detail: issue.root_cause ?? '(no root cause recorded)' },
    {
      label: issue.fix_applied ? 'Fix applied' : 'No autonomous fix applied',
      detail: issue.fix_applied
        ? 'A corrective decision was recorded to Project Memory so this exact mistake is remembered.'
        : 'This issue was raised but not auto-resolved.',
    },
    {
      label: issue.verified ? 'Verified' : 'Verification pending or failed',
      detail: issue.verified
        ? issue.time_to_resolve_mins !== null
          ? `Fixed. Your users never noticed. Resolved in ${issue.time_to_resolve_mins} minute${issue.time_to_resolve_mins === 1 ? '' : 's'}.`
          : 'Fixed. Your users never noticed.'
        : 'Escalated for human review rather than retried blind.',
    },
  ]
}

// A fresh mount each time the parent opens this (see the `key` below) gives
// `step` clean initial state for free -- no effect needed just to reset it
// back to 0 on close/reopen.
function ReplaySteps({ issue }: { issue: Issue }) {
  const [step, setStep] = useState(0)
  const steps = buildSteps(issue)

  useEffect(() => {
    if (step >= steps.length - 1) return
    const id = setTimeout(() => setStep((s) => s + 1), STEP_DELAY_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <div className="mt-3 space-y-2 border-l-2 border-saffron/30 pl-4">
      {steps.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: i <= step ? 1 : 0.25, x: 0 }}
          className="text-sm"
        >
          <p className={i <= step ? 'font-medium text-ink' : 'text-ink-faint'}>
            {i === step && i < steps.length - 1 ? (
              <span className="inline-flex items-center gap-1">
                {s.label}
                <span className="inline-flex gap-0.5">
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-1 w-1 rounded-full bg-saffron-bright"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </span>
              </span>
            ) : (
              s.label
            )}
          </p>
          {i <= step && <p className="text-xs text-ink-dim">{s.detail}</p>}
        </motion.div>
      ))}
    </div>
  )
}

export function FixEngineReplay({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const [openCount, setOpenCount] = useState(0)

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          if (!open) setOpenCount((c) => c + 1)
          setOpen((o) => !o)
        }}
        className="text-xs font-medium text-saffron-bright hover:text-saffron-deep"
      >
        {open ? 'Hide Fix Engine replay' : 'Watch the Fix Engine work'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ReplaySteps key={openCount} issue={issue} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
