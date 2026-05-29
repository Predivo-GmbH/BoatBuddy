import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Ausgabe } from '@/types'
import type { Kategorie } from '@/lib/fahrer'

export function useAusgaben() {
  const queryClient = useQueryClient()

  const { data: ausgaben = [], isLoading, error } = useQuery({
    queryKey: ['ausgaben'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ausgaben')
        .select('*')
        .order('datum', { ascending: false })
      if (error) throw new Error(error.message)
      return data as Ausgabe[]
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
    queryClient.invalidateQueries({ queryKey: ['kontoberechnung'] })
  }

  const createAusgabe = useMutation({
    mutationFn: async (input: { bezeichnung: string; betrag: number; kategorie: Kategorie; datum: string; bezahlt_von?: string; notiz?: string }) => {
      const { error } = await supabase.from('ausgaben').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const updateAusgabe = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<Ausgabe> & { id: string }) => {
      const { error } = await supabase.from('ausgaben').update(fields).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const deleteAusgabe = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ausgaben').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  return { ausgaben, isLoading, error, createAusgabe, updateAusgabe, deleteAusgabe }
}
