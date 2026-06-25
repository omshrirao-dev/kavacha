export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-dim">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-saffron" />
      {label && <span>{label}</span>}
    </div>
  )
}
