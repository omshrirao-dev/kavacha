import { useState } from 'react'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-edge px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-saffron-bright hover:text-ink"
    >
      {copied ? 'Copied!' : label}
    </button>
  )
}
