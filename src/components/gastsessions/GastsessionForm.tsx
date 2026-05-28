import { useState, useRef, useEffect, useMemo } from 'react'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER, FAHRER_LABELS, type Fahrer } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export function GastsessionForm() {
  const [selectedGuests, setSelectedGuests] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [betrag, setBetrag] = useState('25')
  const [bezahltAn, setBezahltAn] = useState<Fahrer>('roger')
  const [datum, setDatum] = useState(todayISO())
  const { sessions, createGastsession } = useGastsessions()
  const isSaving = createGastsession.isPending
  const containerRef = useRef<HTMLDivElement>(null)

  // Extract unique individual guest names from all historical sessions
  const historicalNames = useMemo(() => {
    const names = new Set<string>()
    for (const s of sessions) {
      if (s.gast_name) {
        s.gast_name.split(',').forEach(n => {
          const trimmed = n.trim()
          if (trimmed) names.add(trimmed)
        })
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [sessions])

  // Suggestions: match input, exclude already-selected, max 8
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return []
    const lower = inputValue.toLowerCase()
    return historicalNames
      .filter(n => n.toLowerCase().includes(lower) && !selectedGuests.includes(n))
      .slice(0, 8)
  }, [inputValue, historicalNames, selectedGuests])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addGuest = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || selectedGuests.includes(trimmed)) return
    setSelectedGuests(prev => [...prev, trimmed])
    setInputValue('')
    setDropdownOpen(false)
  }

  const removeGuest = (name: string) => {
    setSelectedGuests(prev => prev.filter(g => g !== name))
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inputValue.trim()) {
        addGuest(inputValue)
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedGuests.length > 0) {
      setSelectedGuests(prev => prev.slice(0, -1))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedGuests.length === 0) {
      toast.error('Bitte mindestens einen Gast auswählen')
      return
    }
    const betragNum = parseFloat(betrag)
    if (isNaN(betragNum) || betragNum <= 0) {
      toast.error('Bitte Name und Betrag ausfüllen')
      return
    }

    createGastsession.mutate(
      { gast_name: selectedGuests.join(', '), betrag: betragNum, bezahlt_an: bezahltAn, datum },
      {
        onSuccess: () => {
          toast.success('Session gespeichert')
          setSelectedGuests([])
          setInputValue('')
          setBetrag('25')
          setDatum(todayISO())
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card-premium rounded-xl border border-border bg-card p-5">
    <fieldset disabled={isSaving} className="contents">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Neue Session erfassen
      </h3>

      {/* Guest name field — full width, own row */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Gast-Name *</label>
        <div ref={containerRef} className="relative">
          <div
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 flex flex-wrap gap-1.5 items-center cursor-text"
            onClick={() => containerRef.current?.querySelector('input')?.focus()}
          >
            {selectedGuests.map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-md bg-accent/15 border border-accent/30 px-2 py-0.5 text-xs font-medium text-accent"
              >
                {name}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeGuest(name) }}
                  className="ml-0.5 rounded hover:bg-accent/20 p-0.5 transition-colors"
                  aria-label={`${name} entfernen`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setDropdownOpen(true) }}
              onKeyDown={handleInputKeyDown}
              onFocus={() => { if (inputValue.trim()) setDropdownOpen(true) }}
              placeholder={selectedGuests.length === 0 ? 'Name eingeben...' : ''}
              className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded={dropdownOpen && suggestions.length > 0}
              aria-autocomplete="list"
              aria-label="Gast-Name suchen"
            />
          </div>

          {/* Suggestions dropdown */}
          {dropdownOpen && suggestions.length > 0 && (
            <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
              {suggestions.map(name => (
                <li key={name}>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); addGuest(name) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent/10 transition-colors"
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Remaining fields */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Betrag (CHF)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={betrag}
            onChange={e => setBetrag(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bezahlt an</label>
          <select
            value={bezahltAn}
            onChange={e => setBezahltAn(e.target.value as Fahrer)}
            className={inputClass}
          >
            {FAHRER.map(f => (
              <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={createGastsession.isPending}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50 sm:w-auto"
        >
          {createGastsession.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Erfassen
        </button>
      </div>
    </fieldset>
    </form>
  )
}
