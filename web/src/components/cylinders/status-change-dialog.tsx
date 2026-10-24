import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { ServerErrorDialog } from "@/components/cylinders/server-error-dialog"
import { StatusBadge } from "@/components/cylinders/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, applyFieldErrors } from "@/lib/api"
import {
  type Cylinder,
  type CylinderStatus,
  type StatusChangeValues,
  nextStatuses,
  statusChangeSchema,
  statusLabel,
  useChangeCylinderStatus,
  useCylinderMeta,
} from "@/lib/cylinders"

interface StatusChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cylinder: Cylinder
  onSaved?: (cylinder: Cylinder) => void
}

type View = "form" | "confirm"

export function StatusChangeDialog({
  open,
  onOpenChange,
  cylinder,
  onSaved,
}: StatusChangeDialogProps) {
  const { data: meta } = useCylinderMeta()
  const allowed = useMemo(
    () => nextStatuses(cylinder.status, meta),
    [cylinder.status, meta]
  )

  const allowedRef = useRef(allowed)
  allowedRef.current = allowed

  const mutation = useChangeCylinderStatus(cylinder.id)
  const submitting = mutation.isPending

  const [view, setView] = useState<View>("form")
  const [pending, setPending] = useState<StatusChangeValues | null>(null)
  const [serverError, setServerError] = useState<ApiError | null>(null)

  const form = useForm<StatusChangeValues>({
    resolver: zodResolver(statusChangeSchema),
    defaultValues: {
      status: allowed[0] ?? "Empty",
      customerName: cylinder.customerName ?? "",
    },
  })

  const targetStatus = form.watch("status")

  const cylinderId = cylinder.id
  const cylinderStatus = cylinder.status
  const cylinderCustomerName = cylinder.customerName

  useEffect(() => {
    if (!open) return
    setView("form")
    setPending(null)
    setServerError(null)
    form.reset({
      status: allowedRef.current[0] ?? "Empty",
      customerName: cylinderCustomerName ?? "",
    })
  }, [open, cylinderId, cylinderStatus, cylinderCustomerName, form])

  const handleValid = (values: StatusChangeValues) => {
    setPending({
      status: values.status,
      customerName:
        values.status === "Delivered" ? values.customerName.trim() : "",
    })
    setView("confirm")
  }

  const handleConfirm = async () => {
    if (!pending) return
    try {
      const saved = await mutation.mutateAsync({
        status: pending.status,
        customerName:
          pending.status === "Delivered" ? pending.customerName : null,
      })
      toast.success(
        `Status ${saved.serialNumber} diubah menjadi ${statusLabel(saved.status)}.`
      )
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(0, {
              title: "Koneksi gagal",
              detail:
                "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.",
            })
      // Kembali ke form lebih dulu supaya galat per-field terlihat di
      // samping input; popup ServerErrorDialog tetap terbuka.
      setView("form")
      applyFieldErrors(apiError, form.setError, ["status", "customerName"])
      setServerError(apiError)
    }
  }

  const customerCleared =
    Boolean(cylinder.customerName) && pending?.status !== "Delivered"

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (submitting) return
          onOpenChange(next)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {view === "confirm" ? "Konfirmasi ubah status" : "Ubah status"}
            </DialogTitle>
            <DialogDescription>
              Tabung {cylinder.serialNumber} saat ini berstatus{" "}
              {statusLabel(cylinder.status)}.
            </DialogDescription>
          </DialogHeader>

          {allowed.length === 0 ? (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Status final</p>
              <p className="text-muted-foreground">
                Tabung berstatus {statusLabel(cylinder.status)} tidak dapat
                diubah lagi ke status lain.
              </p>
            </div>
          ) : view === "form" ? (
            <Form {...form}>
              <form
                id="status-form"
                onSubmit={form.handleSubmit(handleValid)}
                className="flex flex-col gap-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status tujuan</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value)
                          if (value !== "Delivered") {
                            form.setValue("customerName", "")
                            form.clearErrors("customerName")
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger
                            aria-label="Status tujuan"
                            className="w-full"
                          >
                            <SelectValue placeholder="Pilih status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allowed.map((status) => (
                            <SelectItem key={status} value={status}>
                              {statusLabel(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {targetStatus === "Delivered" ? (
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nama pelanggan</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nama pelanggan penerima"
                            maxLength={120}
                            autoComplete="off"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Wajib diisi untuk status Delivered (maksimal 120
                          karakter).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </form>
            </Form>
          ) : (
            <dl className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4 text-sm">
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="flex flex-wrap items-center gap-2 font-medium">
                  <StatusBadge status={cylinder.status as CylinderStatus} />
                  <span aria-hidden="true">→</span>
                  <StatusBadge status={pending?.status ?? "Empty"} />
                </dd>
              </div>
              {pending?.status === "Delivered" ? (
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">
                    Nama pelanggan
                  </dt>
                  <dd className="font-medium break-words">
                    {pending.customerName}
                  </dd>
                </div>
              ) : null}
              {customerCleared ? (
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">Pelanggan</dt>
                  <dd className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="break-words">{cylinder.customerName}</span>
                    <span aria-hidden="true">→</span>
                    <span className="text-muted-foreground">(dikosongkan)</span>
                  </dd>
                </div>
              ) : null}
            </dl>
          )}

          <DialogFooter>
            {allowed.length === 0 ? (
              <Button type="button" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
            ) : view === "form" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Batal
                </Button>
                <Button type="submit" form="status-form">
                  Lanjutkan
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setView("form")}
                  disabled={submitting}
                >
                  Kembali
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  {submitting ? <Spinner /> : null}
                  Simpan status
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ServerErrorDialog
        error={serverError}
        open={serverError !== null}
        onOpenChange={(next) => {
          if (!next) setServerError(null)
        }}
      />
    </>
  )
}
