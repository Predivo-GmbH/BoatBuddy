function parseLocalDate(date: string | Date): Date {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(date)
}

export function formatDate(date: string | Date): string {
  return parseLocalDate(date).toLocaleDateString('de-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function formatDateLong(date: string | Date): string {
  return parseLocalDate(date).toLocaleDateString('de-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency', currency: 'CHF', minimumFractionDigits: 2
  }).format(amount)
}

export function formatMonat(date: string | Date): string {
  return parseLocalDate(date).toLocaleDateString('de-CH', {
    month: 'long', year: 'numeric'
  })
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
