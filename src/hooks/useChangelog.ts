import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ChangelogEntry } from '@/types'

export function useChangelog() {
  const queryClient = useQueryClient()

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['changelog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('changelog')
        .select('*')
        .order('datum', { ascending: false })
      if (error) throw new Error(error.message)
      return data as ChangelogEntry[]
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['changelog'] })
  }

  const addEntry = useMutation({
    mutationFn: async (input: { titel: string; beschreibung?: string; kategorie: string; datum: string }) => {
      const { error } = await supabase.from('changelog').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<ChangelogEntry> & { id: string }) => {
      const { error } = await supabase.from('changelog').update(fields).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('changelog').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  return { entries, isLoading, error, addEntry, updateEntry, deleteEntry }
}
