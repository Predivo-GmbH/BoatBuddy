import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BootStats } from '@/types'

export function useBootStats() {
  const queryClient = useQueryClient()

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['boot_stats'],
    queryFn: async () => {
      // boot_stats is a singleton (migration 031 enforces it in the database). The ORDER BY is
      // the belt to that braces: without one, limit(1) returns whatever row Postgres reaches
      // first, which is only stable while there is exactly one row - and a developer's local
      // database has not necessarily had 031 applied. Oldest-first because the seeded row is the
      // authoritative one; id breaks any tie so the choice is total, never arbitrary.
      const { data, error } = await supabase
        .from('boot_stats')
        .select('*')
        .order('aktualisiert_am', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as BootStats | null
    },
  })

  const updateBootStats = useMutation({
    mutationFn: async (fields: Partial<Omit<BootStats, 'id' | 'aktualisiert_am'>>) => {
      if (!stats?.id) throw new Error('No boot stats row found')
      const { error } = await supabase
        .from('boot_stats')
        .update({ ...fields, aktualisiert_am: new Date().toISOString() })
        .eq('id', stats.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
    },
  })

  return { stats: stats ?? null, isLoading, error, updateBootStats }
}
