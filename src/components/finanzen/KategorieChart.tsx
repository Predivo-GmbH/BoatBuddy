import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useAusgaben } from '@/hooks/useAusgaben'
import { KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'

const COLORS: Record<string, string> = {
  bootsplatz: '#0EA5E9',
  versicherung: '#2D9E6B',
  verkehrssteuer: '#F59E0B',
  winterlager: '#6366F1',
  fruehlingslager: '#10B981',
  vorfuehren: '#64748B',
  treibstoff: '#E09B3D',
  material: '#06B6D4',
  reparatur: '#D93F3F',
  service: '#0077B6',
  sonstiges: '#8AAEC6',
}

export function KategorieChart() {
  const { ausgaben } = useAusgaben()

  const data = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const a of ausgaben) {
      grouped[a.kategorie] = (grouped[a.kategorie] || 0) + Number(a.betrag)
    }
    return Object.entries(grouped).map(([kategorie, betrag]) => ({
      name: KATEGORIE_LABELS[kategorie as Kategorie] ?? kategorie,
      value: betrag,
      key: kategorie,
    }))
  }, [ausgaben])

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Noch keine Ausgaben erfasst
      </div>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={COLORS[entry.key] ?? '#8AAEC6'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
            formatter={(value) => [`CHF ${Number(value).toFixed(2)}`, undefined]}
          />
          <Legend wrapperStyle={{ fontSize: '0.875rem' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
