import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IconAlertTriangle } from "@tabler/icons-react"
import type { ErrorComponentProps } from "@tanstack/react-router"

/**
 * Route error boundary: displayed when rendering a page throws an error.
 * Raw technical error details are not exposed; only a safe summary is displayed.
 */
export function GeneralError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-96 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconAlertTriangle aria-hidden="true" className="size-5" />
            Terjadi kesalahan
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Halaman gagal dimuat. Silakan coba lagi. Bila masalah berlanjut,
            muat ulang aplikasi.
          </p>
          {error instanceof Error && error.message ? (
            <p className="text-xs text-muted-foreground break-words">
              {error.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={reset}>Coba lagi</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Muat ulang
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
