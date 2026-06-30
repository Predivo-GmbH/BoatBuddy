import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Account/season reset: set the calculated Kontostand to a target value by adjusting the
// startsaldo anchor, and auto-log a News entry — atomically, server-side (RPC 028).
export function useKontoReset() {
  const queryClient = useQueryClient()

  const resetKontostand = useMutation({
    mutationFn: async ({ target, note }: { target: number; note?: string }) => {
      const { data, error } = await supabase.rpc('reset_kontostand', {
        p_target: target,
        p_note: note?.trim() || null,
      })
      if (error) throw new Error(error.message)
      return data as number // the new startsaldo
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kontoberechnung'] })
      queryClient.invalidateQueries({ queryKey: ['boot_stats'] })
      queryClient.invalidateQueries({ queryKey: ['changelog'] })
    },
  })

  return { resetKontostand }
}
