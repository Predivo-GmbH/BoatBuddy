import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { KontostandSnapshot } from '@/types'

export function useKontostand() {
  const queryClient = useQueryClient()

  const { data: snapshots = [], isLoading, error } = useQuery({
    queryKey: ['kontostand'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kontostand_snapshots')
        .select('*')
        .order('datum', { ascending: false })
      if (error) throw new Error(error.message)
      return data as KontostandSnapshot[]
    },
  })

  const latestKontostand = snapshots[0] ?? null

  const createSnapshot = useMutation({
    mutationFn: async (input: { betrag: number; datum: string; notiz?: string }) => {
      const { error } = await supabase.from('kontostand_snapshots').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kontostand'] })
    },
  })

  return { snapshots, latestKontostand, isLoading, error, createSnapshot }
}
