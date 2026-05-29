import { cn } from '@/lib/utils'

interface BoatIconProps {
  className?: string
}

export function BoatIcon({ className }: BoatIconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-5 w-5', className)}
    >
      {/* Wake tower */}
      <path d="M18 12 L24 6 L30 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="24" y1="6" x2="24" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Hull */}
      <path d="M6 28 L10 20 L38 20 L42 28 Z" fill="currentColor" opacity="0.85" />
      {/* Windshield */}
      <path d="M16 20 L18 15 L26 15 L28 20" fill="currentColor" opacity="0.4" />
      {/* Hull bottom curve */}
      <path d="M6 28 C6 28 10 34 24 34 C38 34 42 28 42 28" fill="currentColor" opacity="0.6" />
      {/* Water waves */}
      <path d="M2 40 Q8 36 14 40 Q20 44 26 40 Q32 36 38 40 Q44 44 48 40" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
      <path d="M0 44 Q6 41 12 44 Q18 47 24 44 Q30 41 36 44 Q42 47 48 44" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />
    </svg>
  )
}
