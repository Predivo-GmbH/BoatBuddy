import { Link } from 'react-router-dom'
import { Anchor } from 'lucide-react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Seite nicht gefunden')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Anchor className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold text-foreground">Seite nicht gefunden</h1>
      <p className="text-muted-foreground">Diese Seite existiert nicht.</p>
      <Link
        to="/dashboard"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
      >
        Zum Dashboard
      </Link>
    </div>
  )
}
