import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PasswordGate } from '@/components/shared/PasswordGate'
import { AppLayout } from '@/components/shared/AppLayout'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const FinanzenPage = lazy(() => import('@/pages/FinanzenPage'))
const KalenderPage = lazy(() => import('@/pages/KalenderPage'))
const GastsessionsPage = lazy(() => import('@/pages/GastsessionsPage'))
const NutzungslogPage = lazy(() => import('@/pages/NutzungslogPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <PasswordGate>
        <BrowserRouter>
          <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Laden...</div>}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="finanzen" element={<FinanzenPage />} />
                <Route path="kalender" element={<KalenderPage />} />
                <Route path="gastsessions" element={<GastsessionsPage />} />
                <Route path="nutzung" element={<NutzungslogPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </PasswordGate>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
