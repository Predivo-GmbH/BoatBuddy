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
        .order('erstellt_am', { ascending: false })
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
      // Cascade: also delete the linked source record (trip, expense, …) so News and
      // the underlying data stay in sync. Manually-added news (no source) just delete.
      const { error } = await supabase.rpc('delete_changelog_cascade', { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['nutzungslogs'] })
      queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
      queryClient.invalidateQueries({ queryKey: ['reservierungen'] })
      queryClient.invalidateQueries({ queryKey: ['gastsessions'] })
      queryClient.invalidateQueries({ queryKey: ['beitraege'] })
      queryClient.invalidateQueries({ queryKey: ['kontoberechnung'] })
    },
  })

  return { entries, isLoading, error, addEntry, updateEntry, deleteEntry }
}
