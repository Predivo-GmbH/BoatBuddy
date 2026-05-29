import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface Kontoberechnung {
  startsaldo: number
  beitraege: number
  gastsessions: number
  ausgabenBootkonto: number
  erstattungen: number
  saldo: number
}

export function useKontoberechnung() {
  return useQuery({
    queryKey: ['kontoberechnung'],
    queryFn: async (): Promise<Kontoberechnung> => {
      const [beitraegeRes, gastsessionsRes, ausgabenRes, bootStatsRes] = await Promise.all([
        supabase.from('beitraege').select('betrag'),
        supabase.from('gastsessions').select('betrag, auf_konto_eingezahlt'),
        supabase.from('ausgaben').select('betrag, bezahlt_von, erstattet'),
        supabase.from('boot_stats').select('startsaldo').limit(1).single(),
      ])

      if (beitraegeRes.error) throw new Error(beitraegeRes.error.message)
      if (gastsessionsRes.error) throw new Error(gastsessionsRes.error.message)
      if (ausgabenRes.error) throw new Error(ausgabenRes.error.message)
      if (bootStatsRes.error) throw new Error(bootStatsRes.error.message)

      // Opening balance offset (anchors calculated balance to real bank balance)
      const startsaldo = Number(bootStatsRes.data.startsaldo)

      // + All contributions
      const beitraege = beitraegeRes.data.reduce((sum, b) => sum + Number(b.betrag), 0)

      // + Guest sessions where cash has been deposited to the bank
      const gastsessions = gastsessionsRes.data
        .filter(s => s.auf_konto_eingezahlt)
        .reduce((sum, s) => sum + Number(s.betrag), 0)

      // - Expenses paid directly from the bank account
      const ausgabenBootkonto = ausgabenRes.data
        .filter(a => a.bezahlt_von === 'bootkonto')
        .reduce((sum, a) => sum + Number(a.betrag), 0)

      // - Reimbursements (paid by a person, then reimbursed from the bank)
      const erstattungen = ausgabenRes.data
        .filter(a => a.bezahlt_von !== 'bootkonto' && a.erstattet)
        .reduce((sum, a) => sum + Number(a.betrag), 0)

      const saldo = startsaldo + beitraege + gastsessions - ausgabenBootkonto - erstattungen

      return { startsaldo, beitraege, gastsessions, ausgabenBootkonto, erstattungen, saldo }
    },
  })
}
