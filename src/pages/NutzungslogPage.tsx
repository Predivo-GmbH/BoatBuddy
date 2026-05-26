import { PageHeader } from '@/components/shared/PageHeader'
import { BootStatsKarte } from '@/components/nutzung/BootStatsKarte'
import { NutzungslogForm } from '@/components/nutzung/NutzungslogForm'
import { NutzungslogTabelle } from '@/components/nutzung/NutzungslogTabelle'

export default function NutzungslogPage() {
  return (
    <>
      <PageHeader title="Nutzungslog" />
      <div className="space-y-6">
        <BootStatsKarte />
        <NutzungslogForm />
        <NutzungslogTabelle />
      </div>
    </>
  )
}
