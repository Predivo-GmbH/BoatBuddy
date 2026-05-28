import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Eigentuemer } from '@/types'

export function useEigentuemer() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['eigentuemer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eigentuemer')
        .select('*')
        .order('fahrer')
      if (error) throw new Error(error.message)
      return data as Eigentuemer[]
    },
  })

  const updateEigentuemer = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<Omit<Eigentuemer, 'id' | 'erstellt_am'>>) => {
      const { error } = await supabase
        .from('eigentuemer')
        .update(fields)
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eigentuemer'] })
    },
  })

  return { eigentuemer: data ?? [], isLoading, updateEigentuemer }
}
