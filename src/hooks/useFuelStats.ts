import { useMemo } from 'react'
import { useAusgaben } from './useAusgaben'

/**
 * Single source of truth for "Treibstoff" figures across the app.
 * Fuel is derived from expenses categorised as 'treibstoff' (the actual fuel
 * receipts), NOT from per-trip litre entries — so the Dashboard and the Nutzung
 * page always show the same numbers.
 */
export function useFuelStats(year: number | string) {
  const { ausgaben, isLoading } = useAusgaben()

  const stats = useMemo(() => {
    const yearStr = String(year)
    const fuel = ausgaben.filter(a => a.kategorie === 'treibstoff')
    const seasonFuel = fuel.filter(a => a.datum.startsWith(yearStr))
    return {
      seasonFuelCost: seasonFuel.reduce((sum, a) => sum + Number(a.betrag), 0),
      seasonFuelCount: seasonFuel.length,
      seasonFuelLiters: seasonFuel.reduce((sum, a) => sum + Number(a.treibstoff_liter ?? 0), 0),
      totalFuelCost: fuel.reduce((sum, a) => sum + Number(a.betrag), 0),
      totalFuelCount: fuel.length,
      totalFuelLiters: fuel.reduce((sum, a) => sum + Number(a.treibstoff_liter ?? 0), 0),
    }
  }, [ausgaben, year])

  return { ...stats, isLoading }
}
