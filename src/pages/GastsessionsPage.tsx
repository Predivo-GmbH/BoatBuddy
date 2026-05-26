import { PageHeader } from '@/components/shared/PageHeader'
import { GastsessionForm } from '@/components/gastsessions/GastsessionForm'
import { GastsessionStats } from '@/components/gastsessions/GastsessionStats'
import { GastsessionTabelle } from '@/components/gastsessions/GastsessionTabelle'

export default function GastsessionsPage() {
  return (
    <div className="section-fade-in">
      <PageHeader
        title="Gast-Sessions"
        subtitle="Wakesurfen-Sessions mit Gasten"
      />
      <div className="space-y-6">
        <GastsessionStats />
        <GastsessionForm />
        <GastsessionTabelle />
      </div>
    </div>
  )
}
