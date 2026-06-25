import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PipelineVisual } from '../components/PipelineVisual'

const DIFFERENTIATORS = [
  { title: 'Project Memory Engine', tag: 'We remember WHY', body: 'Every architectural decision, tagged by stage and layer, searchable by meaning -- not just by keyword.' },
  { title: 'Cross-Project Learning', tag: 'Smarter every project', body: 'A fix learned on one project is reused automatically the next time any project hits the same failure.' },
  { title: 'CEO Review Agent', tag: 'Your toughest critic', body: 'The AI switches roles entirely -- becomes the demanding client comparing promise against delivery.' },
  { title: 'Autonomous Fixing', tag: 'Root cause, not guesses', body: 'Diagnosis cites the specific memory entries behind it -- never a vague "something broke."' },
  { title: 'Cost Intelligence', tag: 'Never get surprised', body: 'Real token cost tracked against the budget you approved, flagged the moment the trend crosses it.' },
  { title: 'Compliance Reports', tag: 'Audit-ready, on demand', body: 'GDPR / DPDP / SOC2-style evidence generated from your actual audit trail, not a static template.' },
]

const LOOP_STEPS = [
  'Issue detected',
  'Memory queried',
  'Root cause found',
  'Fix applied',
  'Verified',
  'Developer notified',
]

function NavBar() {
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <span className="text-lg font-semibold text-ink">Kavacha</span>
      <div className="flex items-center gap-4 text-sm">
        <Link to="/demo" className="text-ink-dim hover:text-ink">
          Live Demo
        </Link>
        <a
          href="https://github.com/omshrirao-dev/kavacha"
          target="_blank"
          rel="noreferrer"
          className="text-ink-dim hover:text-ink"
        >
          Docs
        </a>
        <Link
          to="/login"
          className="rounded-md border border-edge px-3 py-1.5 text-ink hover:border-saffron hover:text-saffron-bright"
        >
          Sign in
        </Link>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <div className="relative overflow-hidden">
      <div
        className="animate-gradient-mesh absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, var(--saffron-glow), transparent 40%), radial-gradient(circle at 80% 0%, var(--saffron-glow), transparent 45%), radial-gradient(circle at 50% 80%, var(--saffron-glow), transparent 50%)',
        }}
      />
      <NavBar />
      <div className="mx-auto max-w-4xl px-6 pb-20 pt-12 text-center sm:pt-20">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl font-bold tracking-tight text-ink sm:text-5xl"
        >
          Every AI product deserves a permanent engineer that never sleeps
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-5 max-w-2xl text-lg text-ink-dim"
        >
          The world's first autonomous AI maintenance infrastructure. Kavacha monitors, detects, diagnoses, and fixes
          your AI product before your users ever notice.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 flex justify-center gap-3"
        >
          <Link
            to="/demo"
            className="rounded-md bg-saffron px-5 py-2.5 text-sm font-semibold text-surface shadow-[0_0_24px_-4px_var(--saffron-glow)] hover:bg-saffron-bright"
          >
            See Live Demo
          </Link>
          <a
            href="https://github.com/omshrirao-dev/kavacha/blob/master/README.md"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-edge px-5 py-2.5 text-sm font-semibold text-ink hover:border-saffron-bright"
          >
            Read the Docs
          </a>
        </motion.div>
      </div>
    </div>
  )
}

function PipelineSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="text-center text-2xl font-semibold text-ink">The 7-stage lifecycle</h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-ink-dim">
        From a rough idea to a permanent engineer that lives inside your product forever. Click any stage.
      </p>
      <div className="mt-10">
        <PipelineVisual />
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section className="border-y border-edge bg-surface-2 px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-semibold text-ink">Watch it actually happen</h2>
        <p className="mt-2 text-sm text-ink-dim">
          This is the Stage 7 loop, running on every monitored project, every day.
        </p>
      </div>
      <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-3">
        {LOOP_STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0.3 }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * (2 / LOOP_STEPS.length) }}
              className="rounded-full border border-saffron/40 bg-card px-4 py-2 text-sm text-ink"
            >
              {step}
            </motion.div>
            {i < LOOP_STEPS.length - 1 && <span className="text-saffron-deep">&rarr;</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

function DifferentiatorsSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="text-center text-2xl font-semibold text-ink">What makes us different</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DIFFERENTIATORS.map((d) => (
          <motion.div
            key={d.title}
            whileHover={{ y: -2 }}
            className="rounded-xl border border-edge bg-card p-5 transition-shadow hover:shadow-[0_0_24px_-4px_var(--saffron-glow)]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-saffron-bright">{d.tag}</p>
            <h3 className="mt-2 font-semibold text-ink">{d.title}</h3>
            <p className="mt-2 text-sm text-ink-dim">{d.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Hero />
      <PipelineSection />
      <HowItWorksSection />
      <DifferentiatorsSection />
      <footer className="border-t border-edge px-6 py-8 text-center text-xs text-ink-faint">
        <div className="flex justify-center gap-4">
          <Link to="/privacy" className="hover:text-ink-dim">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink-dim">
            Terms of Service
          </Link>
          <a href="https://github.com/omshrirao-dev/kavacha" target="_blank" rel="noreferrer" className="hover:text-ink-dim">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
