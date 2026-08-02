import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'
import type { Ausgabe } from '@/types'
import type { Kategorie } from '@/lib/fahrer'

export function useAusgaben() {
  const queryClient = useQueryClient()

  const { data: ausgaben = [], isLoading, error } = useQuery({
    queryKey: ['ausgaben'],
    queryFn: async () =>
      // Paginate past the 1000-row PostgREST cap so year totals/counts stay correct
      // once expenses exceed 1000 (v11 Gate I). See src/lib/fetchAllRows.ts.
      fetchAllRows<Ausgabe>((from, to) =>
        supabase
          .from('ausgaben')
          .select('*')
          .order('datum', { ascending: false })
          .range(from, to),
      ),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
    queryClient.invalidateQueries({ queryKey: ['kontoberechnung'] })
    queryClient.invalidateQueries({ queryKey: ['changelog'] })
  }

  const createAusgabe = useMutation({
    mutationFn: async (input: { bezeichnung: string; betrag: number; kategorie: Kategorie; datum: string; bezahlt_von?: string; notiz?: string; treibstoff_liter?: number | null; dokument_pfad?: string | null; verarbeitungs_status?: Ausgabe['verarbeitungs_status'] }) => {
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
