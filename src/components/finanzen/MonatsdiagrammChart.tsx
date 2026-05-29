import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAusgaben } from '@/hooks/useAusgaben'
import { useBeitraege } from '@/hooks/useBeitraege'
import { formatCurrency } from '@/lib/format'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export function MonatsdiagrammChart() {
  const { ausgaben } = useAusgaben()

  // Fetch all beitraege months to detect latest year
  const { data: beitraegeMonths = [] } = useQuery({
    queryKey: ['beitraege-months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beitraege')
        .select('monat')
        .order('monat', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      return data as { monat: string }[]
    },
  })

  const detectedYear = useMemo(() => {
    const currentYear = new Date().getFullYear()
    let latest = currentYear
    for (const a of ausgaben) {
      const y = parseInt(a.datum.slice(0, 4), 10)
      if (y > latest) latest = y
    }
    for (const b of beitraegeMonths) {
      const y = parseInt(b.monat.slice(0, 4), 10)
      if (y > latest) latest = y
    }
    return latest
  }, [ausgaben, beitraegeMonths])

  const [jahrOverride, setJahrOverride] = useState<number | null>(null)
  const jahr = jahrOverride ?? detectedYear
  const { beitraege } = useBeitraege(jahr)

  const data = useMemo(() => {
    return MONATE.map((name, i) => {
      const monatStr = `${jahr}-${String(i + 1).padStart(2, '0')}`
      const einnahmen = beitraege
        .filter(b => b.monat.startsWith(monatStr))
        .reduce((sum, b) => sum + Number(b.betrag), 0)
      const kosten = ausgaben
        .filter(a => a.datum.startsWith(monatStr))
        .reduce((sum, a) => sum + Number(a.betrag), 0)
      return { name, Einnahmen: einnahmen, Ausgaben: kosten }
    })
  }, [ausgaben, beitraege, jahr])

  const hasData = data.some(d => d.Einnahmen > 0 || d.Ausgaben > 0)

  const totalEinnahmen = data.reduce((sum, d) => sum + d.Einnahmen, 0)
  const totalAusgaben = data.reduce((sum, d) => sum + d.Ausgaben, 0)
  const saldo = totalEinnahmen - totalAusgaben

  const yearNav = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setJahrOverride(jahr - 1)}
        className="rounded-lg p-2 transition-colors hover:bg-muted"
        aria-label="Vorjahr"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="min-w-[4rem] text-center text-lg font-semibold tabular-nums">{jahr}</span>
      <button
        onClick={() => setJahrOverride(jahr + 1)}
        className="rounded-lg p-2 transition-colors hover:bg-muted"
        aria-label="Nächstes Jahr"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )

  if (!hasData) {
    return (
      <div className="space-y-4">
        {yearNav}
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Noch keine Daten für {jahr} vorhanden
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {yearNav}
      <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="gradEinnahmen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.9} />
              <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="gradAusgaben" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.9} />
              <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '0.75rem',
              fontSize: '0.875rem',
              boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)',
              padding: '10px 14px',
              color: 'var(--color-foreground)',
            }}
            formatter={(value, name) => [formatCurrency(Number(value)), name]}
            cursor={{ fill: 'var(--color-muted)', opacity: 0.15 }}
          />
          <Legend wrapperStyle={{ fontSize: '0.875rem', paddingTop: '8px', color: 'var(--color-muted-foreground)' }} />
          <Bar dataKey="Einnahmen" fill="url(#gradEinnahmen)" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
          <Bar dataKey="Ausgaben" fill="url(#gradAusgaben)" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 rounded-xl bg-muted/30 p-3 text-sm border border-border/50">
        <div className="min-w-0 text-center">
          <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5">Einnahmen</p>
          <p className="font-bold tabular-nums text-success text-sm sm:text-base">{formatCurrency(totalEinnahmen)}</p>
        </div>
        <div className="min-w-0 text-center border-x border-border/50">
          <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5">Ausgaben</p>
          <p className="font-bold tabular-nums text-destructive text-sm sm:text-base">{formatCurrency(totalAusgaben)}</p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5">Saldo</p>
          <p className={`font-bold tabular-nums text-sm sm:text-base ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
            {saldo >= 0 ? '+' : ''}{formatCurrency(saldo)}
          </p>
        </div>
      </div>
    </div>
  )
}
