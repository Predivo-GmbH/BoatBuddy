import type { Reservierung } from '@/types'

// Human label for a reservation slot, e.g. "10:00 – 13:00" or "Ganzer Tag",
// optionally suffixed with its note. Shared by the trip-log forms and the
// usage-log table so a linked reservation reads the same everywhere.
export function reservierungLabel(r: Reservierung): string {
  const time =
    r.von_zeit && r.bis_zeit ? `${r.von_zeit.slice(0, 5)} – ${r.bis_zeit.slice(0, 5)}` : 'Ganzer Tag'
  return r.notiz ? `${time} · ${r.notiz}` : time
}
