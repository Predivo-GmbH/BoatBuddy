import { AKTIVITAET_TYPEN, AKTIVITAET_LABELS, type AktivitaetTyp } from '@/lib/fahrer'
import type { Aktivitaet } from '@/types'
import { Plus, Trash2 } from 'lucide-react'

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
        <div key={index} className="flex items-center gap-2">
          <select
            value={aktivitaet.typ}
            onChange={e => updateRow(index, { typ: e.target.value as AktivitaetTyp })}
            className="min-h-[44px] flex-1 rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {AKTIVITAET_TYPEN.map(t => (
              <option key={t} value={t}>{AKTIVITAET_LABELS[t]}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={aktivitaet.dauer_min}
            onChange={e => updateRow(index, { dauer_min: parseInt(e.target.value) || 0 })}
            placeholder="Min."
            className="min-h-[44px] w-24 rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">Min.</span>
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="rounded-md p-1 text-muted-foreground hover:text-destructive"
            aria-label="Aktivitat entfernen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-ring hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Aktivitat hinzufugen
      </button>
    </div>
  )
}
