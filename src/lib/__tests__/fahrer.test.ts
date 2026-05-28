import { describe, it, expect } from 'vitest'
import {
  FAHRER, ALLE_FAHRER, FAHRER_LABELS, FAHRER_FARBEN,
  FAHRER_TEXT_FARBEN, FAHRER_BORDER_FARBEN,
  KATEGORIEN, KATEGORIE_LABELS,
  AKTIVITAET_TYPEN, AKTIVITAET_LABELS,
} from '../fahrer'

describe('FAHRER', () => {
  it('contains exactly 3 active fahrers', () => {
    expect(FAHRER).toHaveLength(3)
    expect(FAHRER).toEqual(['roger', 'dani', 'jan'])
  })
})

describe('ALLE_FAHRER', () => {
  it('contains 4 fahrers including historical pedro', () => {
    expect(ALLE_FAHRER).toHaveLength(4)
    expect(ALLE_FAHRER).toContain('pedro')
  })

  it('includes all active fahrers', () => {
    for (const f of FAHRER) {
      expect(ALLE_FAHRER).toContain(f)
    }
  })
})

describe('FAHRER_LABELS', () => {
  it('has label for every fahrer in ALLE_FAHRER', () => {
    for (const f of ALLE_FAHRER) {
      expect(FAHRER_LABELS[f]).toBeDefined()
      expect(typeof FAHRER_LABELS[f]).toBe('string')
      expect(FAHRER_LABELS[f].length).toBeGreaterThan(0)
    }
  })

  it('capitalizes first letter', () => {
    for (const f of ALLE_FAHRER) {
      expect(FAHRER_LABELS[f][0]).toBe(FAHRER_LABELS[f][0].toUpperCase())
    }
  })
})

describe('color maps', () => {
  it('FAHRER_FARBEN has bg- prefix for all fahrers', () => {
    for (const f of ALLE_FAHRER) {
      expect(FAHRER_FARBEN[f]).toMatch(/^bg-/)
    }
  })

  it('FAHRER_TEXT_FARBEN has text- prefix for all fahrers', () => {
    for (const f of ALLE_FAHRER) {
      expect(FAHRER_TEXT_FARBEN[f]).toMatch(/^text-/)
    }
  })

  it('FAHRER_BORDER_FARBEN has border- prefix for all fahrers', () => {
    for (const f of ALLE_FAHRER) {
      expect(FAHRER_BORDER_FARBEN[f]).toMatch(/^border-/)
    }
  })
})

describe('KATEGORIEN', () => {
  it('has at least 10 categories', () => {
    expect(KATEGORIEN.length).toBeGreaterThanOrEqual(10)
  })

  it('every category has a label', () => {
    for (const k of KATEGORIEN) {
      expect(KATEGORIE_LABELS[k]).toBeDefined()
      expect(KATEGORIE_LABELS[k].length).toBeGreaterThan(0)
    }
  })

  it('includes essential categories', () => {
    expect(KATEGORIEN).toContain('treibstoff')
    expect(KATEGORIEN).toContain('versicherung')
    expect(KATEGORIEN).toContain('reparatur')
    expect(KATEGORIEN).toContain('sonstiges')
  })
})

describe('AKTIVITAET_TYPEN', () => {
  it('contains wakesurfen as primary activity', () => {
    expect(AKTIVITAET_TYPEN[0]).toBe('wakesurfen')
  })

  it('every type has a label', () => {
    for (const a of AKTIVITAET_TYPEN) {
      expect(AKTIVITAET_LABELS[a]).toBeDefined()
    }
  })
})
