import { useEffect, useRef, useState } from 'react'

export function CountUp({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const from = 0

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / durationMs, 1)
      // ease-out cubic -- starts fast, settles gently, never overshoots
      const eased = 1 - (1 - progress) ** 3
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, durationMs])

  return <span>{display.toLocaleString()}</span>
}
