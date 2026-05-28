import { describe, it, expect } from 'vitest'
import { formatDate, formatDateLong, formatCurrency, formatMonat, todayISO } from '../format'

describe('formatDate', () => {
  it('formats ISO date string as dd.MM.yyyy', () => {
    const result = formatDate('2026-05-28')
    expect(result).toBe('28.05.2026')
  })

  it('handles Date object', () => {
    const result = formatDate(new Date(2026, 0, 1))
    expect(result).toBe('01.01.2026')
  })

  it('handles single-digit day/month', () => {
    const result = formatDate('2026-03-05')
    expect(result).toBe('05.03.2026')
  })
})

describe('formatDateLong', () => {
  it('formats with weekday, day, month name, year in German', () => {
    const result = formatDateLong('2026-05-28')
    // Thursday 28 May 2026 in German
    expect(result).toContain('28')
    expect(result).toContain('Mai')
    expect(result).toContain('2026')
  })
})

describe('formatCurrency', () => {
  it('formats positive amount as CHF', () => {
    const result = formatCurrency(1234.56)
    // de-CH locale uses different formats across Node versions
    expect(result).toContain('1')
    expect(result).toContain('234')
    expect(result).toContain('56')
    expect(result).toMatch(/CHF/)
  })

  it('formats zero', () => {
    const result = formatCurrency(0)
    expect(result).toMatch(/CHF/)
    expect(result).toContain('0.00')
  })

  it('formats negative amount', () => {
    const result = formatCurrency(-500)
    expect(result).toMatch(/CHF/)
    expect(result).toContain('500')
  })
})

describe('formatMonat', () => {
  it('formats as month + year in German', () => {
    const result = formatMonat('2026-05-01')
    expect(result).toContain('Mai')
    expect(result).toContain('2026')
  })

  it('formats December correctly', () => {
    const result = formatMonat('2026-12-15')
    expect(result).toContain('Dezember')
    expect(result).toContain('2026')
  })
})

describe('todayISO', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayISO()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches current date', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})
