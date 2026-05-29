import { useState, useEffect, useRef } from 'react'

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

interface UseCountUpOptions {
  end: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  separator?: string
}

export function useCountUp({
  end,
  duration = 1200,
  decimals = 0,
  prefix = '',
  suffix = '',
  separator = "'",
}: UseCountUpOptions) {
  const [display, setDisplay] = useState(prefix + formatNumber(0, decimals, separator) + suffix)
  const prevEnd = useRef(0)

  useEffect(() => {
    const start = prevEnd.current
    const diff = end - start
    if (diff === 0) return

    let startTime: number | null = null
    let raf: number

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutExpo(progress)
      const current = start + diff * easedProgress

      setDisplay(prefix + formatNumber(current, decimals, separator) + suffix)

      if (progress < 1) {
        raf = requestAnimationFrame(step)
      } else {
        prevEnd.current = end
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [end, duration, decimals, prefix, suffix, separator])

  return display
}

function formatNumber(value: number, decimals: number, separator: string): string {
  const fixed = value.toFixed(decimals)
  const [intPart, decPart] = fixed.split('.')
  const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  return decPart !== undefined ? `${withSeparator}.${decPart}` : withSeparator
}
