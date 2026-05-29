import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useAusgaben } from '@/hooks/useAusgaben'
import { KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

const COLORS: Record<string, string> = {
  bootsplatz: '#0EA5E9',
  versicherung: '#2D9E6B',
  verkehrssteuer: '#F59E0B',
  winterlager: '#6366F1',
  fruehlingslager: '#F472B6',
  vorfuehren: '#64748B',
  treibstoff: '#E09B3D',
  material: '#06B6D4',
  reparatur: '#D93F3F',
  service: '#0077B6',
  sonstiges: '#8AAEC6',
}

export function KategorieChart() {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const { ausgaben } = useAusgaben()

  const filtered = useMemo(() => {
    if (selectedYear === null) return ausgaben
    return ausgaben.filter(a => a.datum.startsWith(String(selectedYear)))
  }, [ausgaben, selectedYear])

  const data = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const a of filtered) {
      grouped[a.kategorie] = (grouped[a.kategorie] || 0) + Number(a.betrag)
    }
    return Object.entries(grouped).map(([kategorie, betrag]) => ({
      name: KATEGORIE_LABELS[kategorie as Kategorie] ?? kategorie,
      value: betrag,
      key: kategorie,
    }))
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setSelectedYear(null)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            selectedYear === null
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Alle Jahre
        </button>
        <button
          onClick={() => setSelectedYear(currentYear)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            selectedYear === currentYear
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {currentYear}
        </button>
      </div>
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Keine Ausgaben {selectedYear ? `in ${selectedYear}` : ''} erfasst
        </div>
      ) : (
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
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                padding: '8px 12px',
                color: 'var(--color-foreground)',
              }}
              formatter={(value) => [formatCurrency(Number(value)), undefined]}
            />
            <Legend wrapperStyle={{ fontSize: '0.875rem', paddingTop: '8px', color: 'var(--color-muted-foreground)' }} />
          </PieChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
