import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAusgaben } from '@/hooks/useAusgaben'
import { useBeitraege } from '@/hooks/useBeitraege'
import { formatCurrency } from '@/lib/format'

const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export function MonatsdiagrammChart({ jahr }: { jahr: number }) {
  const { ausgaben } = useAusgaben()
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

  if (!hasData) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Noch keine Daten fur {jahr} vorhanden
      </div>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              padding: '8px 12px',
            }}
            formatter={(value) => [formatCurrency(Number(value)), undefined]}
            cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }}
          />
          <Legend wrapperStyle={{ fontSize: '0.875rem', paddingTop: '8px' }} />
          <Bar dataKey="Einnahmen" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Ausgaben" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
