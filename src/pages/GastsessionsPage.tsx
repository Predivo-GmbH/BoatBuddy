import { PageHeader } from '@/components/shared/PageHeader'
import { GastsessionForm } from '@/components/gastsessions/GastsessionForm'
import { GastsessionStats } from '@/components/gastsessions/GastsessionStats'
import { GastsessionTabelle } from '@/components/gastsessions/GastsessionTabelle'

export default function GastsessionsPage() {
  return (
    <>
      <PageHeader title="Gast-Sessions" />
      <div className="space-y-6">
        <GastsessionForm />
        <GastsessionStats />
        <GastsessionTabelle />
      </div>
    </>
  )
}
