import { useCallback } from 'react'

/**
 * Returns an onKeyDown handler for tab navigation with arrow keys.
 * Tabs must have role="tab" and be siblings inside a role="tablist" container.
 */
export function useTabKeyboard<T extends string>(
  tabs: readonly T[],
  current: T,
  setCurrent: (tab: T) => void,
) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      const idx = tabs.indexOf(current)
      let next: number

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (idx + 1) % tabs.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = (idx - 1 + tabs.length) % tabs.length
      } else if (e.key === 'Home') {
        next = 0
      } else if (e.key === 'End') {
        next = tabs.length - 1
      } else {
        return
      }

      e.preventDefault()
      setCurrent(tabs[next])

      // Focus the new tab button
      const tablist = (e.target as HTMLElement).closest('[role="tablist"]')
      const buttons = tablist?.querySelectorAll<HTMLElement>('[role="tab"]')
      buttons?.[next]?.focus()
    },
    [tabs, current, setCurrent],
  )
}
