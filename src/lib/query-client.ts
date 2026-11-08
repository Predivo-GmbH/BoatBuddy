import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { showServerError } from '@/lib/show-server-error'

/**
 * The app's QueryClient. Every server error a member meets goes through ONE notice
 * (lib/show-server-error.ts): each failed save (the mutation's meta.action names it), and each
 * first load that came back empty-handed. A background refetch that fails while the data is still
 * on screen shows nothing new, so it is not announced.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data === undefined) void showServerError(error, { action: 'daten-laden' })
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => {
        const action = mutation.options.meta?.action
        void showServerError(error, { action: typeof action === 'string' ? action : 'daten-speichern' })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        retry: 1,
      },
    },
  })
}
