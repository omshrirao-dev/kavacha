import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/" className="text-sm text-ink-faint hover:text-ink-dim">
          &larr; Back to Kavacha
        </Link>
        <h1 className="mb-2 mt-4 text-2xl font-semibold text-ink">Terms of Service</h1>
        <p className="mb-8 text-sm text-ink-faint">Last updated: June 2026</p>

        <div className="space-y-8 text-sm leading-6 text-ink-dim">
          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">What Kavacha is</h2>
            <p>
              Kavacha is autonomous AI maintenance infrastructure: it remembers the architectural decisions behind your
              AI product, monitors it for hallucination, cost overruns, and behavior drift, and helps diagnose and
              describe a fix when something goes wrong. This is V1 -- a working proof of concept, not a mature
              enterprise platform. See{' '}
              <a
                href="https://github.com/omshrirao-dev/kavacha/blob/master/ARCHITECTURE.md"
                className="text-saffron-bright underline"
                target="_blank"
                rel="noreferrer"
              >
                ARCHITECTURE.md
              </a>{' '}
              for exactly what's built today versus planned.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">What Kavacha isn't</h2>
            <p>
              Kavacha does not write code into your repository, deploy anything on your behalf, or make changes to your
              production systems autonomously. In this version, the Fix Engine produces a root-cause diagnosis and a
              specific fix description for a human to act on -- it does not have, and is not granted, write access to
              your actual codebase or infrastructure.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">No uptime guarantee</h2>
            <p>
              This is a V1 release. We do not guarantee any specific uptime, response time, or availability for the
              Kavacha dashboard, API, or monitoring jobs. We take reliability seriously and document known limitations
              honestly (see ARCHITECTURE.md), but there is no SLA at this stage.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Data ownership</h2>
            <p>
              You own your data. The project information, decisions, and history you put into Kavacha belong to you,
              not to us. We store and process it to provide the service; we don't claim any ownership over it.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">We never sell data. Ever.</h2>
            <p>
              Not to advertisers, not to data brokers, not to anyone. This isn't a pricing-tier feature -- it's a
              permanent policy. See our{' '}
              <Link to="/privacy" className="text-saffron-bright underline">
                Privacy Policy
              </Link>{' '}
              for what we do collect and why.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Acceptable use</h2>
            <p>
              Don't use Kavacha to monitor or store data you don't have the right to hold, attempt to circumvent rate
              limits or authentication, probe the system for vulnerabilities without authorization, or use the service
              in a way that disrupts it for other users. We reserve the right to suspend accounts that violate this.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href="mailto:omshrirao78@gmail.com" className="text-saffron-bright underline">
                omshrirao78@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
