import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function BentoCard({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -2, boxShadow: '0 0 24px -4px var(--saffron-glow)' }}
      transition={{ duration: 0.2 }}
      className={`rounded-xl border border-edge bg-card p-5 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </motion.div>
  )
}
