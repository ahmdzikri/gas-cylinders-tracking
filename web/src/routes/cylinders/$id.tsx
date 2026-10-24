import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"

import { CylinderFormDialog } from "@/components/cylinders/cylinder-form-dialog"
import { StatusBadge } from "@/components/cylinders/status-badge"
import { StatusChangeDialog } from "@/components/cylinders/status-change-dialog"
import { NotFoundError } from "@/components/errors/not-found-error"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { type Cylinder, useCylinder } from "@/lib/cylinders"
import { formatDateTime } from "@/lib/utils"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconPencil,
  IconRefresh,
  IconSwitch,
} from "@tabler/icons-react"

export const Route = createFileRoute("/cylinders/$id")({
  component: CylinderDetailPage,
})

function CylinderDetailPage() {
  const { id } = Route.useParams()
  const numericId = Number(id)
  const query = useCylinder(numericId)

  if (!Number.isInteger(numericId) || numericId < 1) {
    return <NotFoundError />
  }

  if (query.isLoading) {
    return <DetailSkeleton />
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <DetailNotFound />
    }
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconAlertTriangle
              aria-hidden="true"
              className="size-5 text-destructive-strong"
            />
            Gagal memuat detail tabung
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {query.error instanceof Error
              ? query.error.message
              : "Terjadi kesalahan saat memuat data."}
          </p>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => void query.refetch()}
          >
            <IconRefresh aria-hidden="true" />
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!query.data) {
    return <DetailNotFound />
  }

  return <CylinderDetail cylinder={query.data} />
}

function CylinderDetail({ cylinder }: { cylinder: Cylinder }) {
  const [editOpen, setEditOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <BackToList />
          <h1 className="font-heading text-xl font-semibold tabular-nums">
            {cylinder.serialNumber}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <IconPencil aria-hidden="true" />
            Edit
          </Button>
          <Button onClick={() => setStatusOpen(true)}>
            <IconSwitch aria-hidden="true" />
            Ubah Status
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi tabung</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DetailRow label="Serial Number">
            <span className="tabular-nums">{cylinder.serialNumber}</span>
          </DetailRow>
          <Separator />
          <DetailRow label="Tipe Gas">{cylinder.gasType}</DetailRow>
          <Separator />
          <DetailRow label="Status">
            <StatusBadge status={cylinder.status} />
          </DetailRow>
          <Separator />
          <DetailRow label="Pelanggan">
            {cylinder.customerName ? (
              <span className="break-words">{cylinder.customerName}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <Separator />
          <DetailRow label="Terakhir Diperbarui">
            <span className="tabular-nums">
              {formatDateTime(cylinder.lastUpdated)}
            </span>
          </DetailRow>
          <Separator />
          <DetailRow label="ID">
            <span className="tabular-nums">{cylinder.id}</span>
          </DetailRow>
        </CardContent>
      </Card>

      <CylinderFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cylinder={cylinder}
      />

      <StatusChangeDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        cylinder={cylinder}
      />
    </div>
  )
}

/**
 * Kembali ke daftar dengan filter terpelihara: memakai riwayat browser bila
 * memungkinkan (entri daftar sebelumnya menyimpan query string), jika tidak
 * (mis. dibuka langsung dari tautan) jatuh ke `/cylinders` biasa.
 */
function BackToList() {
  const router = useRouter()
  const canGoBack = router.history.canGoBack()

  if (!canGoBack) {
    return (
      <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
        <Link to="/cylinders">
          <IconArrowLeft aria-hidden="true" />
          Kembali ke daftar
        </Link>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-fit -ml-2"
      onClick={() => router.history.back()}
    >
      <IconArrowLeft aria-hidden="true" />
      Kembali ke daftar
    </Button>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Skeleton className="h-9 w-56" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`detail-skeleton-${index}`} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function DetailNotFound() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Tabung tidak ditemukan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Data tabung dengan ID tersebut tidak ada atau sudah dihapus.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link to="/cylinders">Kembali ke daftar tabung</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
