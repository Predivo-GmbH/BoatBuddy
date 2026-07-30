import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Nutzungslog, Aktivitaet } from '@/types'
import type { Fahrer } from '@/lib/fahrer'

async function adjustGesamtstunden(delta: number) {
  const { error } = await supabase.rpc('adjust_gesamtstunden', { delta })
  if (error) throw new Error(error.message)
}

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
      neue_gesamtstunden?: number
      treibstoff_liter?: number
      aktivitaeten: Aktivitaet[]
      notiz?: string
      reservierung_id?: string | null
    }) => {
      // Pass raw arrays (NOT JSON.stringify): the RPC params are jsonb, and the
      // function calls jsonb_array_elements_text(p_teilnehmer). A stringified '[]'
      // arrives as a jsonb scalar string and throws 22023 "cannot extract elements
      // from a scalar" (broke 2026-06-02 when that conversion was added).
      const { data, error } = await supabase.rpc('create_nutzungslog_atomic', {
        p_datum: input.datum,
        p_fahrer: input.fahrer,
        p_betriebsstunden: input.betriebsstunden,
        p_treibstoff_liter: input.treibstoff_liter ?? null,
        p_aktivitaeten: input.aktivitaeten,
        p_notiz: input.notiz ?? null,
        p_teilnehmer: [],
        p_neue_gesamtstunden: input.neue_gesamtstunden ?? null,
        p_reservierung_id: input.reservierung_id ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
      queryClient.invalidateQueries({ queryKey: ['changelog'] })
    },
  })

  const updateNutzungslog = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<Nutzungslog> & { id: string }) => {
      let oldHours = 0
      if (fields.betriebsstunden !== undefined) {
        const { data: old } = await supabase.from('nutzungslogs').select('betriebsstunden').eq('id', id).single()
        if (old) oldHours = Number(old.betriebsstunden)
      }
      const { error } = await supabase.from('nutzungslogs').update(fields).eq('id', id)
      if (error) throw new Error(error.message)
      if (fields.betriebsstunden !== undefined) {
        await adjustGesamtstunden(Number(fields.betriebsstunden) - oldHours)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
      queryClient.invalidateQueries({ queryKey: ['changelog'] })
    },
  })

  const deleteNutzungslog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_nutzungslog_atomic', { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
      queryClient.invalidateQueries({ queryKey: ['changelog'] })
    },
  })

  return { logs, isLoading, error, createNutzungslog, updateNutzungslog, deleteNutzungslog }
}
