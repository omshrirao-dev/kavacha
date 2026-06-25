import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const OUTCOMES = [
  {
    title: 'Nothing is ever forgotten',
    body: 'Every decision behind your product is remembered permanently -- so when someone asks "why did we do it this way," there is always a real answer.',
  },
  {
    title: 'Problems are caught before your users are',
    body: 'Issues are found, explained, and addressed quietly in the background -- not discovered three days later in a support ticket.',
  },
  {
    title: 'Every fix comes with a reason',
    body: 'No black boxes. When something is wrong, you get a plain-language explanation of what happened and why -- never just "fixed it."',
  },
  {
    title: 'Confidence, on demand',
    body: 'Audit-ready evidence of how your product is maintained, available the moment you need to show it to anyone.',
  },
]

const STAGES = [
  { name: 'Idea', outcome: 'Describe what you want, however roughly. That alone is enough to begin.' },
  { name: 'Architect', outcome: 'A rough idea becomes a complete, fully-reasoned plan -- nothing left to chance.' },
  { name: 'Builder', outcome: 'The plan becomes real, with the reasoning behind every choice preserved as it happens.' },
  { name: 'Auditor', outcome: 'Everything is scrutinized with a critical eye before it is allowed to ship.' },
  { name: 'CEO Review', outcome: 'The most demanding client imaginable reviews the result -- and refuses to approve anything that falls short.' },
  { name: 'Deploy', outcome: 'The product enters the world, fully documented and ready for real users.' },
  { name: 'Permanent Engineer', outcome: 'It stays inside the product forever -- watching, catching problems, fixing them, and explaining what happened, without ever being asked.' },
]

const DIFFERENTIATORS = [
  {
    title: 'It remembers WHY, not just what',
    body: "Most tools show you what's happening right now. Kavacha remembers the reasoning behind every decision ever made, so a fix made months later is informed by real history -- not a guess.",
  },
  {
    title: 'It gets smarter with every product it watches',
    body: 'A lesson learned solving one problem quietly improves how every other product under its watch is protected.',
  },
  {
    title: 'It holds itself to an impossible standard',
    body: 'Nothing ships without surviving review from the most demanding critic imaginable -- one built specifically to never be satisfied.',
  },
  {
    title: 'It never stops',
    body: 'Most tools hand you a dashboard and wait for you to look at it. Kavacha keeps working on its own, permanently, long after everyone else has gone home.',
  },
]

function NavBar() {
  const { session } = useAuth()
  return (
    <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
      <Link to="/" className="gradient-text text-lg font-bold">
        Kavacha
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link to="/demo" className="text-ink-dim hover:text-ink">
          Live Demo
        </Link>
        <Link
          to={session ? '/dashboard' : '/login'}
          className="rounded-md border border-edge px-3 py-1.5 text-ink hover:border-saffron hover:text-saffron-bright"
        >
          {session ? 'Go to Dashboard' : 'Sign in'}
        </Link>
      </div>
    </header>
  )
}

export function OverviewPage() {
  const { session } = useAuth()

  return (
    <div className="min-h-screen bg-surface">
      <div className="relative overflow-hidden">
        <div
          className="animate-gradient-mesh absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, var(--saffron-glow), transparent 40%), radial-gradient(circle at 80% 0%, var(--saffron-glow), transparent 45%), radial-gradient(circle at 50% 80%, var(--saffron-glow), transparent 50%)',
          }}
        />
        <NavBar />
        <div className="mx-auto max-w-3xl px-6 pb-16 pt-10 text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-saffron-bright"
          >
            The Vision
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-4xl font-bold tracking-tight text-ink sm:text-5xl"
          >
            The world's first <span className="gradient-text">autonomous AI maintenance infrastructure</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-dim"
          >
            Kavacha is a system that takes care of an AI product the way a permanent engineer would -- remembering
            every decision ever made about it, watching it continuously, catching what's wrong before anyone else
            does, and fixing it without being asked. Not a dashboard you have to watch. An engineer that never
            stops.
          </motion.p>
        </div>
      </div>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-ink">The problem</h2>
        <p className="mx-auto mt-6 max-w-2xl text-center leading-relaxed text-ink-dim">
          Every AI product breaks the same silent way. It says something wrong, and nobody notices until a user
          complains. Its behavior quietly drifts over weeks, until the damage is already done. A fix gets applied
          under pressure, and the reasoning behind it is never written down -- so six months later, the same problem
          comes back, and whoever's on call has to solve it from scratch all over again. This happens to every AI
          product in the world, from a solo developer's side project to the largest deployments on earth. Kavacha
          exists to close that gap permanently.
        </p>
      </section>

      <section className="border-y border-edge bg-surface-2 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold text-ink">What it means for you</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {OUTCOMES.map((o) => (
              <motion.div
                key={o.title}
                whileHover={{ y: -2 }}
                className="gradient-border rounded-xl border border-edge bg-card p-6"
              >
                <h3 className="font-semibold text-ink">{o.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{o.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-ink">The seven stages</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-ink-dim">
          From a rough idea to a permanent engineer that lives inside your product forever.
        </p>
        <div className="mt-10 space-y-3">
          {STAGES.map((s, i) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="flex items-center gap-4 rounded-xl border border-edge bg-card p-4"
            >
              <span className="gradient-bg flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold text-surface">
                {i + 1}
              </span>
              <div>
                <span className="font-semibold text-ink">{s.name}</span>
                <span className="mx-2 text-ink-faint">--</span>
                <span className="text-sm text-ink-dim">{s.outcome}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-y border-edge bg-surface-2 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold text-ink">Why it's unique</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {DIFFERENTIATORS.map((d) => (
              <motion.div
                key={d.title}
                whileHover={{ y: -2 }}
                className="gradient-border rounded-xl border border-edge bg-card p-6"
              >
                <h3 className="font-semibold text-ink">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{d.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold text-ink">The scale of the idea</h2>
        <p className="mt-4 leading-relaxed text-ink-dim">
          Every AI product. Every team. Every country. Kavacha is built to be the layer underneath all of them --
          the one piece of infrastructure that makes sure an AI product can take care of itself, long after the
          people who built it have moved on to something else.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/demo"
            className="gradient-bg rounded-md px-5 py-2.5 text-sm font-semibold text-surface shadow-[0_0_24px_-4px_var(--saffron-glow)]"
          >
            See Live Demo
          </Link>
          <Link
            to={session ? '/dashboard' : '/login'}
            className="rounded-md border border-edge px-5 py-2.5 text-sm font-semibold text-ink hover:border-saffron-bright"
          >
            {session ? 'Go to Dashboard' : 'Sign in'}
          </Link>
        </div>
      </section>

      <footer className="border-t border-edge px-6 py-8 text-center text-xs text-ink-faint">
        <div className="flex justify-center gap-4">
          <Link to="/" className="hover:text-ink-dim">
            Home
          </Link>
          <Link to="/privacy" className="hover:text-ink-dim">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink-dim">
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  )
}
