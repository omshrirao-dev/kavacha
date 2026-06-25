import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to Kavacha
        </Link>
        <h1 className="mb-2 mt-4 text-2xl font-semibold text-gray-900">Privacy Policy</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: June 2026</p>

        <div className="space-y-8 text-sm leading-6 text-gray-700">
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">What we collect</h2>
            <p>
              Your email address (for login, via Supabase Auth), the project data you give Kavacha (project names, the
              idea you describe, architectural decisions, discovery answers), and AI-specific metadata generated while
              monitoring your product -- timestamps, latency, success/failure of calls observed through the SDK, token
              counts and costs, and issue/fix records. We do <strong>not</strong> collect the raw prompts or responses
              your AI product sends or receives -- the SDK only ever transmits call metadata, never content.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">How it's stored</h2>
            <p>
              In Postgres (hosted by Supabase) and ChromaDB (semantic memory, on a persistent volume), reached only over
              encrypted connections. Secrets and credential-shaped content are stripped before anything is stored or
              sent to an LLM. See{' '}
              <a
                href="https://github.com/omshrirao-dev/kavacha/blob/master/SECURITY.md"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                SECURITY.md
              </a>{' '}
              for the full implementation.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">Who we share it with</h2>
            <p>
              Nobody. Zero-knowledge by design: your project data is isolated to your account, never used to train
              anything, never sold, and never shared with any third party. The only outbound transmission is the LLM
              provider call needed to run Kavacha's own agents (Architect, CEO Review, Monitor, Fix Engine) on your
              behalf, and the email notification provider (SendGrid) used to alert you about issues -- both receive only
              what's strictly necessary to do that one job.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">How to delete your data</h2>
            <p>
              Email us at the address below and we will delete your account and all associated project data. This is a
              manual process in this version of Kavacha -- there's no self-service delete button yet, and we'd rather
              tell you that honestly than pretend otherwise.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">Your rights (GDPR)</h2>
            <p>
              If you're in the EU/EEA, you have the right to access, correct, export, or delete your personal data, and
              to object to or restrict its processing. Contact us using the email below to exercise any of these.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">India DPDP Act</h2>
            <p>
              We process personal data only for the purpose you provided it (operating your Kavacha account and
              monitoring the AI product you registered), retain it only as long as your account is active, and apply
              reasonable security safeguards as described in SECURITY.md. You may request access to, correction of, or
              erasure of your personal data at any time.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">Contact</h2>
            <p>
              Privacy questions:{' '}
              <a href="mailto:omshrirao78@gmail.com" className="underline">
                omshrirao78@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
