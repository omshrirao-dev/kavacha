import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

interface Stage {
  n: number
  name: string
  description: string
  built: boolean
  core?: boolean
}

const STAGES: Stage[] = [
  { n: 1, name: 'Idea Intake', description: "Plain language input. Rough, incomplete. Doesn't matter.", built: true },
  {
    n: 2,
    name: 'AI Architect',
    description: 'Interrogates the idea, fills every gap, produces a complete spec across 8 layers -- and logs every decision to permanent memory.',
    built: true,
  },
  {
    n: 3,
    name: 'AI Builder',
    description: 'Directs the build layer by layer from the spec. Not built in this version -- out of scope for a 21-day V1.',
    built: false,
  },
  {
    n: 4,
    name: 'AI Auditor',
    description: 'Reviews every layer for security, data, and performance issues. Folded into Stage 5 for V1.',
    built: false,
  },
  {
    n: 5,
    name: 'AI CEO Client',
    description: 'Switches role entirely -- becomes the demanding client, comparing what was promised against what was delivered. Nothing ships without approval.',
    built: true,
  },
  {
    n: 6,
    name: 'Deploy',
    description: 'Manages deployment, generates documentation. Done manually for this release.',
    built: false,
  },
  {
    n: 7,
    name: 'Permanent Engineer',
    description: 'Lives inside the product forever. Monitors, detects, diagnoses, fixes, verifies, notifies. Never stops. This is the core innovation.',
    built: true,
    core: true,
  },
]

// Shared <defs> for the connector lines -- one gradient definition, referenced
// by every "energized" segment via url(#kavacha-pipeline-gradient), so the
// signature purple->saffron gradient is the thing that visibly flows through
// the pipeline, not just a flat saffron line with a moving dash.
function PipelineGradientDefs() {
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="kavacha-pipeline-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--gradient-start)" />
          <stop offset="25%" stopColor="var(--gradient-mid1)" />
          <stop offset="50%" stopColor="var(--gradient-mid2)" />
          <stop offset="75%" stopColor="var(--gradient-mid3)" />
          <stop offset="100%" stopColor="var(--gradient-end)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function PipelineVisual() {
  const [active, setActive] = useState<number | null>(null)

  return (
    <div className="w-full">
      <PipelineGradientDefs />
      <div className="flex items-center">
        {STAGES.map((stage, i) => (
          <div key={stage.n} className="flex flex-1 items-center last:flex-initial">
            <button
              type="button"
              onClick={() => setActive(active === stage.n ? null : stage.n)}
              className="group flex flex-col items-center gap-2 outline-none"
            >
              <motion.div
                whileHover={{ scale: 1.08 }}
                className={`gradient-border flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors sm:h-14 sm:w-14 ${
                  stage.built
                    ? 'border-saffron bg-saffron/10 text-saffron-bright shadow-[0_0_18px_-2px_var(--saffron-glow)]'
                    : 'border-edge bg-card text-ink-faint'
                } ${active === stage.n ? 'ring-2 ring-saffron-bright' : ''} ${stage.core ? 'animate-saffron-pulse' : ''}`}
              >
                {stage.n}
              </motion.div>
              <span className="hidden text-center text-xs text-ink-dim group-hover:text-ink sm:block sm:max-w-[5.5rem]">
                {stage.name}
              </span>
            </button>
            {i < STAGES.length - 1 && (
              <svg className="mx-1 h-2 flex-1 sm:mx-2" preserveAspectRatio="none" viewBox="0 0 100 2">
                <line
                  x1="0"
                  y1="1"
                  x2="100"
                  y2="1"
                  stroke="var(--border)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                {stage.built && STAGES[i + 1].built && (
                  <line
                    x1="0"
                    y1="1"
                    x2="100"
                    y2="1"
                    stroke="url(#kavacha-pipeline-gradient)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="animate-flow"
                  />
                )}
              </svg>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {active !== null && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mt-6 rounded-lg border border-edge bg-card p-4 text-sm text-ink-dim"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-xs text-saffron-bright">Stage {active}</span>
              <span className="font-semibold text-ink">{STAGES[active - 1].name}</span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
                  STAGES[active - 1].built ? 'bg-ok/10 text-ok' : 'bg-edge text-ink-faint'
                }`}
              >
                {STAGES[active - 1].built ? 'Built in V1' : 'Roadmap'}
              </span>
            </div>
            <p>{STAGES[active - 1].description}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
