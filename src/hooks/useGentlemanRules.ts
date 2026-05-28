import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GentlemanRule } from '@/types'

export function useGentlemanRules() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gentleman_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gentleman_rules')
        .select('*')
        .order('sortierung')
      if (error) throw new Error(error.message)
      return data as GentlemanRule[]
    },
  })

  const addRule = useMutation({
    mutationFn: async ({ regel, sortierung }: { regel: string; sortierung: number }) => {
      const { error } = await supabase
        .from('gentleman_rules')
        .insert({ regel, sortierung })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gentleman_rules'] })
    },
  })

  const updateRule = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<Omit<GentlemanRule, 'id' | 'erstellt_am'>>) => {
      const { error } = await supabase
        .from('gentleman_rules')
        .update(fields)
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gentleman_rules'] })
    },
  })

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('gentleman_rules')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gentleman_rules'] })
    },
  })

  return { rules: data ?? [], isLoading, addRule, updateRule, deleteRule }
}
