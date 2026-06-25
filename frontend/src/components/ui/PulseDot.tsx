const COLORS = {
  saffron: 'bg-saffron',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  idle: 'bg-edge',
} as const

export function PulseDot({ color = 'saffron', live = true }: { color?: keyof typeof COLORS; live?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {live && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${COLORS[color]} opacity-60`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${COLORS[color]}`} />
    </span>
  )
}
