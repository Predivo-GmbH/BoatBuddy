import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Nutzungslog, Aktivitaet } from '@/types'
import type { Fahrer } from '@/lib/fahrer'

export function useNutzungslogs() {
  const queryClient = useQueryClient()

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['nutzungslogs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutzungslogs')
        .select('*')
        .order('datum', { ascending: false })
      if (error) throw new Error(error.message)
      return data as Nutzungslog[]
    },
  })

  const createNutzungslog = useMutation({
    mutationFn: async (input: {
      datum: string
      fahrer: Fahrer
      betriebsstunden: number
      treibstoff_liter?: number
      aktivitaeten: Aktivitaet[]
      notiz?: string
    }) => {
      const { error } = await supabase.from('nutzungslogs').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
    },
  })

  const updateNutzungslog = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<Nutzungslog> & { id: string }) => {
      const { error } = await supabase.from('nutzungslogs').update(fields).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
    },
  })

  const deleteNutzungslog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nutzungslogs').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
    },
  })

  return { logs, isLoading, error, createNutzungslog, updateNutzungslog, deleteNutzungslog }
}
