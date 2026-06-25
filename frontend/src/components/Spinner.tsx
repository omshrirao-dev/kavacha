export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-dim">
      <span className="gradient-pulse h-3 w-3 rounded-full" />
      {label && <span>{label}</span>}
    </div>
  )
}
