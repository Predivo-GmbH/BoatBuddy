import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Ferien } from '@/types'
import type { Fahrer } from '@/lib/fahrer'

export function useFerien() {
  const queryClient = useQueryClient()

  const { data: ferien = [], isLoading, error } = useQuery({
    queryKey: ['ferien'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ferien')
        .select('*')
        .order('von_datum', { ascending: true })
      if (error) throw new Error(error.message)
      return data as Ferien[]
    },
  })

  const createFerien = useMutation({
    mutationFn: async (input: { fahrer: Fahrer; von_datum: string; bis_datum: string; notiz?: string }) => {
      const { error } = await supabase.from('ferien').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferien'] })
    },
  })

  const updateFerien = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<Ferien> & { id: string }) => {
      const { error } = await supabase.from('ferien').update(fields).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferien'] })
    },
  })

  const deleteFerien = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ferien').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferien'] })
    },
  })

  return { ferien, isLoading, error, createFerien, updateFerien, deleteFerien }
}
