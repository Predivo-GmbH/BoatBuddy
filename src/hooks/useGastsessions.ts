import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Gastsession } from '@/types'
import type { Fahrer } from '@/lib/fahrer'

export function useGastsessions() {
  const queryClient = useQueryClient()

  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ['gastsessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gastsessions')
        .select('*')
        .order('datum', { ascending: false })
      if (error) throw new Error(error.message)
      return data as Gastsession[]
    },
  })

  const createGastsession = useMutation({
    mutationFn: async (input: { gast_name: string; betrag: number; bezahlt_an: Fahrer; datum: string; notiz?: string }) => {
      const { error } = await supabase.from('gastsessions').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastsessions'] })
    },
  })

  const deleteGastsession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastsessions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastsessions'] })
    },
  })

  return { sessions, isLoading, error, createGastsession, deleteGastsession }
}
