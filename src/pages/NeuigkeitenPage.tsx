import { useState, useMemo, useEffect } from 'react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageSkeleton } from '@/components/shared/PageSkeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useChangelog } from '@/hooks/useChangelog'
import { FilterBar } from '@/components/changelog/FilterBar'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Sparkles,
  Wrench,
  Bug,
  Database,
  Plus,
  Pencil,
  Trash2,
  Check,
  Loader2,
  Newspaper,
} from 'lucide-react'

const KATEGORIE_CONFIG = {
  neu: { label: 'Neu', icon: Sparkles, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', dot: 'border-emerald-500' },
  verbesserung: { label: 'Update', icon: Wrench, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', dot: 'border-blue-500' },
  fix: { label: 'Fix', icon: Bug, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'border-amber-500' },
  daten: { label: 'Daten', icon: Database, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', dot: 'border-purple-500' },
} as const

type Kategorie = keyof typeof KATEGORIE_CONFIG

const KATEGORIEN: Kategorie[] = ['neu', 'verbesserung', 'fix', 'daten']

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

// The date an entry occupies in the timeline: its real-world EVENT date (datum) once it has
// happened — so a trip logged late shows on the day it happened — but its ENTRY date
// (erstellt_am) while still in the future, so upcoming vacations/reservations surface when
// they were announced instead of jumping ahead of recent activity.
const timelineDate = (e: { datum: string; erstellt_am: string }) => {
  const today = new Date().toISOString().slice(0, 10)
  return e.datum <= today ? e.datum : e.erstellt_am
}

export default function NeuigkeitenPage() {
  useDocumentTitle('Neuigkeiten')
  const { entries, isLoading, addEntry, updateEntry, deleteEntry } = useChangelog()

  const [showAdd, setShowAdd] = useState(false)
  const [newTitel, setNewTitel] = useState('')
  const [newBeschreibung, setNewBeschreibung] = useState('')
  const [newKategorie, setNewKategorie] = useState<Kategorie>('neu')
  const [newDatum, setNewDatum] = useState(new Date().toISOString().slice(0, 10))

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitel, setEditTitel] = useState('')
  const [editBeschreibung, setEditBeschreibung] = useState('')
  const [editKategorie, setEditKategorie] = useState<Kategorie>('neu')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Filter state: default to show all categories
  const [selectedCategories, setSelectedCategories] = useState<Set<Kategorie>>(() => {
    const saved = localStorage.getItem('neuigkeiten-filters')
    if (saved) {
      try {
        return new Set(JSON.parse(saved) as Kategorie[])
      } catch {
        return new Set(['neu', 'verbesserung', 'fix', 'daten'])
      }
    }
    return new Set(['neu', 'verbesserung', 'fix', 'daten'])
  })

  // Persist filter selection to localStorage
  useEffect(() => {
    localStorage.setItem('neuigkeiten-filters', JSON.stringify(Array.from(selectedCategories)))
  }, [selectedCategories])

  // Filter entries by selected categories
  const filteredEntries = useMemo(
    () => entries.filter(e => selectedCategories.has(e.kategorie as Kategorie)),
    [entries, selectedCategories]
  )

  // Order + group by the timeline date (see timelineDate): event date for things that have
  // happened, entry date for still-upcoming ones.
  const grouped = useMemo(() => {
    const groups: { label: string; key: string; items: typeof filteredEntries }[] = []
    const map = new Map<string, typeof filteredEntries>()

    // Sort by timeline date descending, tie-break by erstellt_am (newest entered first)
    const sorted = [...filteredEntries].sort((a, b) => {
      const byDate = new Date(timelineDate(b)).getTime() - new Date(timelineDate(a)).getTime()
      if (byDate !== 0) return byDate
      return new Date(b.erstellt_am).getTime() - new Date(a.erstellt_am).getTime()
    })

    for (const entry of sorted) {
      const key = timelineDate(entry).slice(0, 7) // YYYY-MM from the timeline date
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }

    for (const [key, items] of map) {
      const [year, month] = key.split('-')
      const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
      const label = `${monthNames[parseInt(month) - 1]} ${year}`
      groups.push({ label, key, items })
    }

    return groups
  }, [filteredEntries])

  const handleAdd = () => {
    if (!newTitel.trim()) {
      toast.error('Titel ist Pflicht')
      return
    }
    addEntry.mutate(
      { titel: newTitel.trim(), beschreibung: newBeschreibung.trim() || undefined, kategorie: newKategorie, datum: newDatum },
      {
        onSuccess: () => {
          toast.success('Eintrag hinzugefügt')
          setNewTitel('')
          setNewBeschreibung('')
          setNewKategorie('neu')
          setNewDatum(new Date().toISOString().slice(0, 10))
          setShowAdd(false)
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  const startEdit = (entry: typeof entries[0]) => {
    setEditingId(entry.id)
    setEditTitel(entry.titel)
    setEditBeschreibung(entry.beschreibung ?? '')
    setEditKategorie(entry.kategorie as Kategorie)
  }

  const saveEdit = () => {
    if (!editingId || !editTitel.trim()) return
    updateEntry.mutate(
      { id: editingId, titel: editTitel.trim(), beschreibung: editBeschreibung.trim() || null, kategorie: editKategorie },
      {
        onSuccess: () => {
          toast.success('Eintrag aktualisiert')
          setEditingId(null)
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Neuigkeiten" subtitle="Was gibt's Neues?" />
        <PageSkeleton cards={3} />
      </div>
    )
  }

  return (
    <div className="section-fade-in">
      <PageHeader title="Neuigkeiten" subtitle="Was gibt's Neues?" />

      {/* Add button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          Neuer Eintrag
        </button>
      </div>

      {/* Filter bar */}
      <FilterBar
        entries={entries}
        selectedCategories={selectedCategories}
        onSelectedCategoriesChange={setSelectedCategories}
      />

      {/* Add form */}
      {showAdd && (
        <div className="card-premium rounded-xl border border-border bg-card p-5 mb-6 slide-up">
          <fieldset disabled={addEntry.isPending} className="contents">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="changelog-titel" className="mb-1 block text-xs font-medium text-muted-foreground">Titel *</label>
                <input id="changelog-titel" value={newTitel} onChange={(e) => setNewTitel(e.target.value)} className={inputClass} placeholder="z.B. Ferien-Kalender hinzugefügt" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="changelog-beschreibung" className="mb-1 block text-xs font-medium text-muted-foreground">Beschreibung</label>
                <textarea
                  id="changelog-beschreibung"
                  value={newBeschreibung}
                  onChange={(e) => setNewBeschreibung(e.target.value)}
                  className={cn(inputClass, 'min-h-[66px] py-2')}
                  placeholder="Optional: kurze Beschreibung der Änderung"
                  rows={2}
                />
              </div>
              <div>
                <label htmlFor="changelog-kategorie" className="mb-1 block text-xs font-medium text-muted-foreground">Kategorie</label>
                <select id="changelog-kategorie" value={newKategorie} onChange={(e) => setNewKategorie(e.target.value as Kategorie)} className={inputClass}>
                  {KATEGORIEN.map((k) => (
                    <option key={k} value={k}>{KATEGORIE_CONFIG[k].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="changelog-datum" className="mb-1 block text-xs font-medium text-muted-foreground">Datum</label>
                <input id="changelog-datum" type="date" value={newDatum} onChange={(e) => setNewDatum(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="min-h-[44px] rounded-lg border border-input px-4 text-sm text-muted-foreground hover:bg-muted/50">
                Abbrechen
              </button>
              <button onClick={handleAdd} disabled={addEntry.isPending} className="min-h-[44px] rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50 inline-flex items-center gap-2">
                {addEntry.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Hinzufügen
              </button>
            </div>
          </fieldset>
        </div>
      )}

      {/* Timeline */}
      {selectedCategories.size === 0 ? (
        <div className="card-premium rounded-xl border border-border bg-card p-12 text-center">
          <Newspaper className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Wählen Sie mindestens eine Kategorie</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="card-premium rounded-xl border border-border bg-card p-12 text-center">
          <Newspaper className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Keine Einträge in den ausgewählten Kategorien</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.key}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                {group.label}
              </h2>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[9px] top-3 bottom-3 w-px bg-border" />

                <div className="space-y-3">
                  {group.items.map((entry) => {
                    const config = KATEGORIE_CONFIG[entry.kategorie as Kategorie] ?? KATEGORIE_CONFIG.neu
                    const Icon = config.icon
                    const isEditing = editingId === entry.id

                    return (
                      <div key={entry.id} className="flex gap-4 relative group">
                        {/* Timeline dot */}
                        <div className={cn(
                          'relative z-10 mt-1.5 flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full bg-card border-2',
                          config.dot,
                        )}>
                          <Icon className="h-2.5 w-2.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 card-premium rounded-xl border border-border bg-card p-4">
                          {isEditing ? (
                            <fieldset disabled={updateEntry.isPending} className="contents">
                              <div className="space-y-2">
                                <input value={editTitel} onChange={(e) => setEditTitel(e.target.value)} className={inputClass} />
                                <textarea
                                  value={editBeschreibung}
                                  onChange={(e) => setEditBeschreibung(e.target.value)}
                                  className={cn(inputClass, 'min-h-[66px] py-2')}
                                  rows={2}
                                />
                                <select value={editKategorie} onChange={(e) => setEditKategorie(e.target.value as Kategorie)} className={inputClass}>
                                  {KATEGORIEN.map((k) => (
                                    <option key={k} value={k}>{KATEGORIE_CONFIG[k].label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="mt-2 flex justify-end gap-2">
                                <button onClick={() => setEditingId(null)} className="min-h-[44px] rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-muted/50">
                                  Abbrechen
                                </button>
                                <button onClick={saveEdit} disabled={updateEntry.isPending} className="min-h-[44px] rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50 inline-flex items-center gap-1.5">
                                  {updateEntry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  Speichern
                                </button>
                              </div>
                            </fieldset>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', config.color)}>
                                      <Icon className="h-3 w-3" />
                                      {config.label}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">{formatDate(timelineDate(entry))}</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground mt-1.5">{entry.titel}</p>
                                  {entry.beschreibung && (
                                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{entry.beschreibung}</p>
                                  )}
                                </div>
                                <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => startEdit(entry)}
                                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                                    aria-label="Eintrag bearbeiten"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteId(entry.id)}
                                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-red-500"
                                    aria-label="Eintrag löschen"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          open
          title="Eintrag löschen"
          description="Soll dieser Eintrag wirklich gelöscht werden?"
          onConfirm={() => {
            deleteEntry.mutate(deleteId, { onSuccess: () => toast.success('Eintrag gelöscht') })
            setDeleteId(null)
          }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
