import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type ApiError, fieldLabel } from "@/lib/api"
import { IconAlertTriangle } from "@tabler/icons-react"

interface ServerErrorDialogProps {
  error: ApiError | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ServerErrorDialog({
  error,
  open,
  onOpenChange,
}: ServerErrorDialogProps) {
  const fieldErrors = error?.fieldErrors ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <IconAlertTriangle
                aria-hidden="true"
                className="size-5 text-destructive-strong"
              />
              {error?.title ?? "Terjadi kesalahan"}
            </span>
          </DialogTitle>
          <DialogDescription>
            {error?.detail ??
              "Permintaan tidak dapat diproses. Silakan periksa kembali data Anda."}
          </DialogDescription>
        </DialogHeader>

        {fieldErrors.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Detail kesalahan">
            {fieldErrors.map(([field, messages]) => (
              <li key={field} className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-medium">{fieldLabel(field)}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {messages.map((message) => (
                    <li key={`${field}-${message}`}>{message}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}

        {error && error.status > 0 ? (
          <p className="text-xs text-muted-foreground">
            Kode status: {error.status}
          </p>
        ) : null}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
