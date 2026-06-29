// Content-shaped loading placeholder, reusing the same gradient-pulse
// treatment Spinner already uses for "this is loading" -- just sized to the
// shape of what's about to render instead of a small dot, for list/grid
// views where a spinner alone leaves too much blank space.
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-edge bg-card p-5">
      <div className="gradient-pulse mb-3 h-4 w-2/3 rounded-full" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="gradient-pulse mb-2 h-3 w-full rounded-full" />
      ))}
    </div>
  )
}
