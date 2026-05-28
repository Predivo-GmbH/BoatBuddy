import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AbrechnungConfig } from '@/types'

export function useAbrechnung() {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['abrechnung_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abrechnung_config')
        .select('*')
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
