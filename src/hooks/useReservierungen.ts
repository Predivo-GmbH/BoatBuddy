import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Reservierung } from '@/types'
import type { Fahrer } from '@/lib/fahrer'

export function useReservierungen(monat?: number, jahr?: number) {
  const queryClient = useQueryClient()

  const { data: reservierungen = [], isLoading, error } = useQuery({
    queryKey: ['reservierungen', monat, jahr],
    queryFn: async () => {
      let query = supabase
        .from('reservierungen')
        .select('*')
        .order('datum', { ascending: true })

      if (monat !== undefined && jahr !== undefined) {
        const startDate = `${jahr}-${String(monat + 1).padStart(2, '0')}-01`
        const lastDay = new Date(jahr, monat + 1, 0).getDate()
        const endDate = `${jahr}-${String(monat + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        query = query.gte('datum', startDate).lte('datum', endDate)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as Reservierung[]
    },
  })

  const createReservierung = useMutation({
    mutationFn: async (input: { fahrer: Fahrer; datum: string; ganzer_tag?: boolean; von_zeit?: string; bis_zeit?: string; notiz?: string }) => {
      const { error } = await supabase.from('reservierungen').insert({
        ganzer_tag: true,
        ...input,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservierungen'] })
      queryClient.invalidateQueries({ queryKey: ['changelog'] })
    },
  })

  const updateReservierung = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<Reservierung> & { id: string }) => {
      const { error } = await supabase.from('reservierungen').update(fields).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservierungen'] })
      queryClient.invalidateQueries({ queryKey: ['changelog'] })
    },
  })

  const deleteReservierung = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reservierungen').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservierungen'] })
      queryClient.invalidateQueries({ queryKey: ['changelog'] })
    },
  })

  return { reservierungen, isLoading, error, createReservierung, updateReservierung, deleteReservierung }
}
