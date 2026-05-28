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
      treibstoff_liter?: number
      aktivitaeten: Aktivitaet[]
      notiz?: string
    }) => {
      const { error } = await supabase.from('nutzungslogs').insert(input)
      if (error) throw new Error(error.message)
      await adjustGesamtstunden(input.betriebsstunden)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
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
    },
  })

  const deleteNutzungslog = useMutation({
    mutationFn: async (id: string) => {
      const { data: log } = await supabase.from('nutzungslogs').select('betriebsstunden').eq('id', id).single()
      const { error } = await supabase.from('nutzungslogs').delete().eq('id', id)
      if (error) throw new Error(error.message)
      if (log) await adjustGesamtstunden(-Number(log.betriebsstunden))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
    },
  })

  return { logs, isLoading, error, createNutzungslog, updateNutzungslog, deleteNutzungslog }
}
