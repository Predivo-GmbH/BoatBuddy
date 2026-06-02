import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/shared/PageHeader'
import { GastsessionForm } from '@/components/gastsessions/GastsessionForm'
import { GastsessionStats } from '@/components/gastsessions/GastsessionStats'
import { GastsessionTabelle } from '@/components/gastsessions/GastsessionTabelle'

export default function GastsessionsPage() {
  useDocumentTitle('Gast-Sessions')
  return (
    <div className="slide-up">
      <PageHeader
        title="Gast-Sessions"
        subtitle="Wakesurfen-Sessions mit Gästen"
      />
      <div className="space-y-6 slide-up-stagger">
        <GastsessionStats />
        <GastsessionForm />
        <GastsessionTabelle />
      </div>
    </div>
  )
}
