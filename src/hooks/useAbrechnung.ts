import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AbrechnungConfig } from '@/types'

export function useAbrechnung() {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['abrechnung_config'],
    queryFn: async () => {
      // abrechnung_config is a singleton (migration 031 enforces it in the database). Ordered for
      // the same reason as useBootStats: this row's id is what updateConfig writes back to, so an
      // undefined read would mean editing a row the user never saw.
      const { data, error } = await supabase
        .from('abrechnung_config')
        .select('*')
        .order('aktualisiert_am', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as AbrechnungConfig | null
    },
  })

  const updateConfig = useMutation({
    mutationFn: async (fields: Partial<Omit<AbrechnungConfig, 'id' | 'aktualisiert_am'>>) => {
      if (!config?.id) throw new Error('No config row found')
      const { error } = await supabase
        .from('abrechnung_config')
        .update({ ...fields, aktualisiert_am: new Date().toISOString() })
        .eq('id', config.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['abrechnung_config'] })
    },
  })

  return { config: config ?? null, isLoading, updateConfig }
}
