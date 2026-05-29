import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Beitrag } from '@/types'
import type { Fahrer } from '@/lib/fahrer'

export function useBeitraege(jahr: number) {
  const queryClient = useQueryClient()
  const startDate = `${jahr}-01-01`
  const endDate = `${jahr}-12-31`

  const { data: beitraege = [], isLoading, error } = useQuery({
    queryKey: ['beitraege', jahr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beitraege')
        .select('*')
        .gte('monat', startDate)
        .lte('monat', endDate)
        .order('monat', { ascending: true })
      if (error) throw new Error(error.message)
      return data as Beitrag[]
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['beitraege'] })
    queryClient.invalidateQueries({ queryKey: ['beitraege-months'] })
    queryClient.invalidateQueries({ queryKey: ['kontoberechnung'] })
  }

  const createBeitrag = useMutation({
    mutationFn: async (input: { fahrer: Fahrer; betrag: number; monat: string; notiz?: string }) => {
      const { error } = await supabase.from('beitraege').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const deleteBeitrag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('beitraege').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  return { beitraege, isLoading, error, createBeitrag, deleteBeitrag }
}
