import { AKTIVITAET_TYPEN, AKTIVITAET_LABELS, type AktivitaetTyp } from '@/lib/fahrer'
import type { Aktivitaet } from '@/types'
import { Plus, X } from 'lucide-react'

interface AktivitaetenEditorProps {
  value: Aktivitaet[]
  onChange: (aktivitaeten: Aktivitaet[]) => void
}

export function AktivitaetenEditor({ value, onChange }: AktivitaetenEditorProps) {
  const addRow = () => {
    onChange([...value, { typ: 'wakesurfen', dauer_min: 30 }])
  }

  const updateRow = (index: number, fields: Partial<Aktivitaet>) => {
    const updated = value.map((a, i) => (i === index ? { ...a, ...fields } : a))
    onChange(updated)
  }

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {value.map((aktivitaet, index) => (
        <div
          key={index}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5"
        >
          <select
            value={aktivitaet.typ}
            onChange={e => updateRow(index, { typ: e.target.value as AktivitaetTyp })}
            className="min-h-[36px] rounded-md border-0 bg-transparent px-1 text-sm font-medium text-foreground focus:outline-none focus:ring-0"
          >
            {AKTIVITAET_TYPEN.map(t => (
              <option key={t} value={t}>{AKTIVITAET_LABELS[t]}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground/60">|</span>
          <input
            type="number"
            min="1"
            value={aktivitaet.dauer_min}
            onChange={e => updateRow(index, { dauer_min: parseInt(e.target.value) || 0 })}
            className="h-[36px] w-16 rounded-md border-0 bg-transparent px-1 text-center text-sm tabular-nums text-foreground focus:outline-none focus:ring-0"
          />
          <span className="text-xs text-muted-foreground">Min.</span>
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Aktivitaet entfernen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-dashed border-input px-3 text-sm text-muted-foreground transition-colors hover:border-accent hover:bg-accent/5 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Aktivitaet hinzufuegen
      </button>
    </div>
  )
}
