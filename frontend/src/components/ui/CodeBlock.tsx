import { CopyButton } from './CopyButton'

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative rounded-md border border-edge bg-surface-2 p-3 pr-16">
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-ink">{code}</pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  )
}
