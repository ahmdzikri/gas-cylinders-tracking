import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { IconFileOff } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"

export function NotFoundError() {
  return (
    <div className="flex min-h-96 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFileOff aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Halaman tidak ditemukan</EmptyTitle>
          <EmptyDescription>
            Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/cylinders">Kembali ke daftar tabung</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
