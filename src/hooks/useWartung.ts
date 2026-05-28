import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Wartung } from '@/types'

export function useWartung() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['wartung'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wartung')
        .select('*')
        .order('naechstes_datum', { ascending: true, nullsFirst: false })
      if (error) throw new Error(error.message)
      return data as Wartung[]
    },
  })

  const addWartung = useMutation({
    mutationFn: async (task: Omit<Wartung, 'id' | 'erstellt_am' | 'erledigt' | 'erledigt_am'>) => {
      const { error } = await supabase
        .from('wartung')
        .insert(task)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wartung'] })
    },
  })

  const toggleWartung = useMutation({
    mutationFn: async ({ id, erledigt }: { id: string; erledigt: boolean }) => {
      const { error } = await supabase
        .from('wartung')
        .update({
          erledigt,
          erledigt_am: erledigt ? new Date().toISOString().slice(0, 10) : null,
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wartung'] })
    },
  })

  const deleteWartung = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('wartung')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wartung'] })
    },
  })

  return { wartungen: data ?? [], isLoading, addWartung, toggleWartung, deleteWartung }
}
