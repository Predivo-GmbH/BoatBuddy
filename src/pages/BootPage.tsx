import { useState, useRef, useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useEigentuemer } from '@/hooks/useEigentuemer'
import { useAbrechnung } from '@/hooks/useAbrechnung'
import { useWartung } from '@/hooks/useWartung'
import { useGentlemanRules } from '@/hooks/useGentlemanRules'
import { useBootStats } from '@/hooks/useBootStats'
import { useTabKeyboard } from '@/hooks/useTabKeyboard'
import { FAHRER_LABELS, FAHRER_FARBEN, FAHRER_TEXT_FARBEN, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Users,
  Calculator,
  Wrench,
  ScrollText,
  Pencil,
  Check,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from 'lucide-react'

const TABS = ['Eigentümer', 'Abrechnung', 'Wartung', 'Gentleman-Rules'] as const
type Tab = (typeof TABS)[number]
const TAB_ICONS = [Users, Calculator, Wrench, ScrollText] as const

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export default function BootPage() {
  const [tab, setTab] = useState<Tab>('Eigentümer')
  const tabKeyDown = useTabKeyboard(TABS, tab, setTab)

  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const updateIndicator = () => {
      const idx = TABS.indexOf(tab)
      const el = tabsRef.current[idx]
      if (el) {
        setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth })
      }
    }
    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [tab])

  return (
    <>
      <PageHeader title="Boot & Eigentümer" subtitle="Anteile, Abrechnung, Wartung & Regeln" />

      <div className="relative mb-6 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1 scrollbar-none" role="tablist" aria-label="Boot-Tabs">
        <div
          className="absolute top-1 bottom-1 rounded-lg bg-card shadow-sm transition-all duration-300 ease-out"
          style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        />
        {TABS.map((t, i) => {
          const Icon = TAB_ICONS[i]
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              ref={(el) => {
                tabsRef.current[i] = el
              }}
              onClick={() => setTab(t)}
              onKeyDown={tabKeyDown}
              className={cn(
                'relative z-10 flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                tab === t ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 hidden sm:block" />
              {t}
            </button>
          )
        })}
      </div>

      {tab === 'Eigentümer' && <EigentuemerTab />}
      {tab === 'Abrechnung' && <AbrechnungTab />}
      {tab === 'Wartung' && <WartungTab />}
      {tab === 'Gentleman-Rules' && <GentlemanRulesTab />}
    </>
  )
}

// ─── Eigentümer Tab ──────────────────────────────────────────────

function EigentuemerTab() {
  const { eigentuemer, isLoading, updateEigentuemer } = useEigentuemer()
  const { config: abrechnungConfig } = useAbrechnung()
  const bootWert = Number(abrechnungConfig?.boot_marktwert ?? 55000)
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { anteil: string; datum: string }>>({})

  const startEditing = () => {
    const d: Record<string, { anteil: string; datum: string }> = {}
    for (const e of eigentuemer) {
      d[e.id] = { anteil: String(e.anteil_prozent), datum: e.einstieg_datum ?? '' }
    }
    setDrafts(d)
    setEditing(true)
  }

  const saveAll = async () => {
    for (const e of eigentuemer) {
      const draft = drafts[e.id]
      if (!draft) continue
      const anteil = parseFloat(draft.anteil)
      if (isNaN(anteil) || anteil < 0 || anteil > 100) {
        toast.error(`Ungültiger Anteil für ${FAHRER_LABELS[e.fahrer as AlleFahrer] ?? e.fahrer}`)
        return
      }
    }

    for (const e of eigentuemer) {
      const draft = drafts[e.id]
      if (!draft) continue
      await updateEigentuemer.mutateAsync({
        id: e.id,
        anteil_prozent: parseFloat(draft.anteil),
        einstieg_datum: draft.datum || null,
      })
    }
    toast.success('Anteile gespeichert')
    setEditing(false)
  }

  const totalPct = eigentuemer.reduce((s, e) => s + Number(e.anteil_prozent), 0)

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="section-fade-in space-y-6">
      <div className="card-premium rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            Eigentumsanteile
          </h3>
          {editing ? (
            <button
              onClick={saveAll}
              disabled={updateEigentuemer.isPending}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 disabled:opacity-50"
            >
              {updateEigentuemer.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Speichern
            </button>
          ) : (
            <button
              onClick={startEditing}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </button>
          )}
        </div>

        {/* Visual pie-like display */}
        <div className="grid gap-4 sm:grid-cols-2 mb-4">
          {eigentuemer.map((e) => {
            const label = FAHRER_LABELS[e.fahrer as AlleFahrer] ?? e.fahrer
            return (
              <div key={e.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('h-3 w-3 rounded-full', FAHRER_FARBEN[e.fahrer as AlleFahrer])} />
                  <span className={cn('font-semibold', FAHRER_TEXT_FARBEN[e.fahrer as AlleFahrer])}>{label}</span>
                </div>
                {editing ? (
                  <fieldset disabled={updateEigentuemer.isPending} className="contents">
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Anteil (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={drafts[e.id]?.anteil ?? ''}
                          onChange={(ev) =>
                            setDrafts((d) => ({ ...d, [e.id]: { ...d[e.id], anteil: ev.target.value } }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Einstieg</label>
                        <input
                          type="date"
                          value={drafts[e.id]?.datum ?? ''}
                          onChange={(ev) =>
                            setDrafts((d) => ({ ...d, [e.id]: { ...d[e.id], datum: ev.target.value } }))
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </fieldset>
                ) : (
                  <>
                    <p className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
                      {formatCurrency(Math.round((Number(e.anteil_prozent) / 100) * bootWert))}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {Number(e.anteil_prozent).toFixed(1)}% von {formatCurrency(bootWert)}
                    </p>
                    {e.einstieg_datum && (
                      <p className="text-xs text-muted-foreground mt-1">Seit {formatDate(e.einstieg_datum)}</p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Total check */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
            Math.abs(totalPct - 100) < 0.1
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          )}
        >
          {Math.abs(totalPct - 100) < 0.1 ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          Total: {totalPct.toFixed(2)}%
          {Math.abs(totalPct - 100) >= 0.1 && ' (sollte 100% sein)'}
        </div>
      </div>
    </div>
  )
}

// ─── Abrechnung Tab ──────────────────────────────────────────────

function AbrechnungTab() {
  const { config, isLoading, updateConfig } = useAbrechnung()
  const { stats } = useBootStats()
  const [editing, setEditing] = useState(false)
  const [marktwert, setMarktwert] = useState('')
  const [kuendigung, setKuendigung] = useState('')
  const [beitrag, setBeitrag] = useState('')

  const startEditing = () => {
    if (!config) return
    setMarktwert(String(config.boot_marktwert))
    setKuendigung(String(config.kuendigungsfrist_monate))
    setBeitrag(String(config.beitrag_pro_monat))
    setEditing(true)
  }

  const save = () => {
    updateConfig.mutate(
      {
        boot_marktwert: parseFloat(marktwert) || 0,
        kuendigungsfrist_monate: parseInt(kuendigung) || 6,
        beitrag_pro_monat: parseFloat(beitrag) || 400,
        bewertung_datum: new Date().toISOString().slice(0, 10),
      },
      {
        onSuccess: () => {
          toast.success('Abrechnungs-Konfiguration gespeichert')
          setEditing(false)
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  const currentValue = useMemo(() => {
    if (!config) return 0
    return Number(config.boot_marktwert)
  }, [config])

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="section-fade-in space-y-6">
      {/* Settlement Config */}
      <div className="card-premium rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Bewertung & Austrittsregeln
          </h3>
          {editing ? (
            <button
              onClick={save}
              disabled={updateConfig.isPending}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 disabled:opacity-50"
            >
              {updateConfig.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Speichern
            </button>
          ) : (
            <button
              onClick={startEditing}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </button>
          )}
        </div>

        {editing ? (
          <fieldset disabled={updateConfig.isPending} className="contents">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Aktueller Marktwert (CHF)
                </label>
                <input
                  type="number"
                  step="100"
                  value={marktwert}
                  onChange={(e) => setMarktwert(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Kündigungsfrist (Monate)
                </label>
                <input
                  type="number"
                  value={kuendigung}
                  onChange={(e) => setKuendigung(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Beitrag / Monat (CHF)
                </label>
                <input
                  type="number"
                  step="50"
                  value={beitrag}
                  onChange={(e) => setBeitrag(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </fieldset>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Marktwert</p>
              <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(currentValue)}
              </p>
              {config?.bewertung_datum && (
                <p className="text-[11px] text-muted-foreground">Stand {formatDate(config.bewertung_datum)}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Kündigungsfrist</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {config?.kuendigungsfrist_monate ?? 6} Monate
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Beitrag / Monat</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(Number(config?.beitrag_pro_monat ?? 400))}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Boot Info Summary */}
      {stats && (
        <div className="card-premium rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">Boot-Info</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Modell</p>
              <p className="text-sm font-semibold text-foreground">{stats.modell ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Kaufdatum</p>
              <p className="text-sm font-semibold text-foreground">
                {stats.kaufdatum ? formatDate(stats.kaufdatum) : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Betriebsstunden</p>
              <p className="text-sm font-semibold text-foreground">{Number(stats.gesamtstunden)} h</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Wartung Tab ──────────────────────────────────────────────────

function WartungTab() {
  const { wartungen, isLoading, addWartung, toggleWartung, deleteWartung } = useWartung()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDatum, setNewDatum] = useState('')
  const [newIntervall, setNewIntervall] = useState('')
  const [newZustaendig, setNewZustaendig] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const handleAdd = () => {
    if (!newName.trim()) {
      toast.error('Bezeichnung ist Pflicht')
      return
    }
    addWartung.mutate(
      {
        bezeichnung: newName.trim(),
        naechstes_datum: newDatum || null,
        intervall_monate: newIntervall ? parseInt(newIntervall) : null,
        zustaendig: newZustaendig || null,
        notiz: null,
      },
      {
        onSuccess: () => {
          toast.success('Wartungsaufgabe hinzugefügt')
          setNewName('')
          setNewDatum('')
          setNewIntervall('')
          setNewZustaendig('')
          setShowAdd(false)
        },
      },
    )
  }

  const pendingTasks = wartungen.filter((w) => !w.erledigt)
  const completedTasks = wartungen.filter((w) => w.erledigt)
  const overdueTasks = pendingTasks.filter((w) => w.naechstes_datum && w.naechstes_datum < today)

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="section-fade-in space-y-6">
      {/* Overdue Warning */}
      {overdueTasks.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          {overdueTasks.length} überfällige {overdueTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          Neue Aufgabe
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card-premium rounded-xl border border-border bg-card p-5">
          <fieldset disabled={addWartung.isPending} className="contents">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Bezeichnung *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} placeholder="z.B. Ölwechsel" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nächstes Datum</label>
                <input type="date" value={newDatum} onChange={(e) => setNewDatum(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Intervall (Monate)</label>
                <input type="number" value={newIntervall} onChange={(e) => setNewIntervall(e.target.value)} className={inputClass} placeholder="z.B. 12" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Zuständig</label>
                <input value={newZustaendig} onChange={(e) => setNewZustaendig(e.target.value)} className={inputClass} placeholder="z.B. Roger" />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="min-h-[44px] rounded-lg border border-input px-4 text-sm text-muted-foreground hover:bg-muted/50">
                Abbrechen
              </button>
              <button onClick={handleAdd} disabled={addWartung.isPending} className="min-h-[44px] rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50">
                {addWartung.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Hinzufügen'}
              </button>
            </div>
          </fieldset>
        </div>
      )}

      {/* Pending Tasks */}
      <div className="card-premium rounded-xl border border-border bg-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Anstehende Wartung ({pendingTasks.length})
        </h3>
        {pendingTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Alle Aufgaben erledigt</p>
        ) : (
          <div className="space-y-2">
            {pendingTasks.map((w) => {
              const overdue = w.naechstes_datum && w.naechstes_datum < today
              return (
                <div
                  key={w.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-4 py-3',
                    overdue ? 'border-red-500/30 bg-red-500/5' : 'border-border',
                  )}
                >
                  <button
                    onClick={() => toggleWartung.mutate({ id: w.id, erledigt: true }, { onSuccess: () => toast.success('Erledigt!') })}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-emerald-500"
                    aria-label={`${w.bezeichnung} als erledigt markieren`}
                  >
                    <Circle className="h-5 w-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{w.bezeichnung}</p>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {w.naechstes_datum && (
                        <span className={cn('text-xs', overdue ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                          {overdue ? 'Überfällig: ' : 'Fällig: '}
                          {formatDate(w.naechstes_datum)}
                        </span>
                      )}
                      {w.intervall_monate && (
                        <span className="text-xs text-muted-foreground">
                          Alle {w.intervall_monate} Monate
                        </span>
                      )}
                      {w.zustaendig && (
                        <span className="text-xs text-muted-foreground">
                          → {w.zustaendig}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteId(w.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-red-500"
                    aria-label={`${w.bezeichnung} löschen`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="card-premium rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
            Erledigt ({completedTasks.length})
          </h3>
          <div className="space-y-2">
            {completedTasks.map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 opacity-70 dark:opacity-60 dark:text-muted-foreground">
                <button
                  onClick={() => toggleWartung.mutate({ id: w.id, erledigt: false })}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-emerald-500 hover:text-muted-foreground"
                  aria-label={`${w.bezeichnung} als offen markieren`}
                >
                  <CheckCircle2 className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-through">{w.bezeichnung}</p>
                  {w.erledigt_am && (
                    <p className="text-xs text-muted-foreground">Erledigt am {formatDate(w.erledigt_am)}</p>
                  )}
                </div>
                <button
                  onClick={() => setDeleteId(w.id)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-red-500"
                  aria-label={`${w.bezeichnung} löschen`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          open
          title="Wartungsaufgabe löschen"
          description="Soll diese Aufgabe wirklich gelöscht werden?"
          onConfirm={() => {
            deleteWartung.mutate(deleteId, { onSuccess: () => toast.success('Gelöscht') })
            setDeleteId(null)
          }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

// ─── Gentleman-Rules Tab ──────────────────────────────────────────

function GentlemanRulesTab() {
  const { rules, isLoading, addRule, updateRule, deleteRule } = useGentlemanRules()
  const [newRegel, setNewRegel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleAdd = () => {
    if (!newRegel.trim()) return
    const maxSort = rules.reduce((max, r) => Math.max(max, r.sortierung), 0)
    addRule.mutate(
      { regel: newRegel.trim(), sortierung: maxSort + 1 },
      {
        onSuccess: () => {
          toast.success('Regel hinzugefügt')
          setNewRegel('')
        },
      },
    )
  }

  const startEdit = (id: string, text: string) => {
    setEditingId(id)
    setEditText(text)
  }

  const saveEdit = () => {
    if (!editingId || !editText.trim()) return
    updateRule.mutate(
      { id: editingId, regel: editText.trim() },
      {
        onSuccess: () => {
          toast.success('Regel aktualisiert')
          setEditingId(null)
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const activeRules = rules.filter((r) => r.aktiv)

  return (
    <div className="section-fade-in space-y-6">
      <div className="card-premium rounded-xl border border-border bg-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-4 flex items-center gap-2">
          <ScrollText className="h-4 w-4" />
          Gentleman-Rules ({activeRules.length})
        </h3>

        <div className="space-y-2 mb-4">
          {activeRules.map((r, idx) => (
            <div key={r.id} className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                {editingId === r.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={cn(inputClass, 'flex-1')}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                    />
                    <button
                      onClick={saveEdit}
                      disabled={updateRule.isPending}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-foreground leading-relaxed">{r.regel}</p>
                )}
              </div>
              {editingId !== r.id && (
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(r.id, r.regel)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={`Regel ${idx + 1} bearbeiten`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(r.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-red-500"
                    aria-label={`Regel ${idx + 1} löschen`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new rule */}
        <div className="flex gap-2">
          <input
            value={newRegel}
            onChange={(e) => setNewRegel(e.target.value)}
            placeholder="Neue Regel hinzufügen..."
            className={cn(inputClass, 'flex-1')}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={!newRegel.trim() || addRule.isPending}
            className="min-h-[44px] rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 disabled:opacity-50"
          >
            {addRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {deleteId && (
        <ConfirmDialog
          open
          title="Regel löschen"
          description="Soll diese Regel wirklich gelöscht werden?"
          onConfirm={() => {
            deleteRule.mutate(deleteId, { onSuccess: () => toast.success('Regel gelöscht') })
            setDeleteId(null)
          }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
