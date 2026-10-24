import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { ServerErrorDialog } from "@/components/cylinders/server-error-dialog"
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
  type CylinderFormValues,
  GAS_TYPES,
  cylinderFormSchema,
  normalizeSerial,
  useCreateCylinder,
  useCylinderMeta,
  useUpdateCylinder,
} from "@/lib/cylinders"
import {
  SERIAL_PREFIX,
  extractSerialDigits,
  hasSerialPrefix,
  toSerialValue,
} from "@/lib/serial-number"

interface CylinderFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bila diisi: mode edit. Bila null: mode tambah. */
  cylinder?: Cylinder | null
  onSaved?: (cylinder: Cylinder) => void
}

type View = "form" | "confirm"

/**
 * Dialog tambah/ubah tabung. Alur dua langkah: isi form → layar konfirmasi
 * yang merangkum nilai (mode edit: sebelum → sesudah) → baru panggil API.
 */
export function CylinderFormDialog({
  open,
  onOpenChange,
  cylinder = null,
  onSaved,
}: CylinderFormDialogProps) {
  const isEdit = cylinder !== null
  const { data: meta } = useCylinderMeta()
  const gasTypes = meta?.gasTypes?.length ? meta.gasTypes : [...GAS_TYPES]

  const createMutation = useCreateCylinder()
  const updateMutation = useUpdateCylinder(cylinder?.id ?? 0)
  const mutation = isEdit ? updateMutation : createMutation
  const submitting = mutation.isPending

  const [view, setView] = useState<View>("form")
  const [pending, setPending] = useState<CylinderFormValues | null>(null)
  const [serverError, setServerError] = useState<ApiError | null>(null)

  const form = useForm<CylinderFormValues>({
    resolver: zodResolver(cylinderFormSchema),
    defaultValues: {
      serialNumber: cylinder?.serialNumber ?? "",
      gasType: cylinder?.gasType ?? "Oxygen",
    },
  })

  const cylinderId = cylinder?.id
  const cylinderStatus = cylinder?.status
  const cylinderSerial = cylinder?.serialNumber
  const cylinderGasType = cylinder?.gasType

  useEffect(() => {
    if (!open) return
    setView("form")
    setPending(null)
    setServerError(null)
    form.reset({
      serialNumber: cylinderSerial ?? "",
      gasType: cylinderGasType ?? "Oxygen",
    })
  }, [open, cylinderId, cylinderStatus, cylinderSerial, cylinderGasType, form])

  const handleValid = (values: CylinderFormValues) => {
    setPending({
      serialNumber: normalizeSerial(values.serialNumber),
      gasType: values.gasType,
    })
    setView("confirm")
  }

  const handleConfirm = async () => {
    if (!pending) return
    try {
      const payload = {
        serialNumber: normalizeSerial(pending.serialNumber),
        gasType: pending.gasType,
      }
      const saved = await mutation.mutateAsync(payload)

      toast.success(
        isEdit
          ? `Tabung ${saved.serialNumber} berhasil diperbarui.`
          : `Tabung ${saved.serialNumber} berhasil ditambahkan.`
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
      applyFieldErrors(apiError, form.setError, ["serialNumber", "gasType"])
      setServerError(apiError)
    }
  }

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
              {view === "confirm"
                ? "Konfirmasi data"
                : isEdit
                  ? "Ubah tabung"
                  : "Tambah tabung"}
            </DialogTitle>
            <DialogDescription>
              {view === "confirm"
                ? "Periksa kembali data berikut sebelum disimpan."
                : "Serial number harus berformat CYL- diikuti 6 angka."}
            </DialogDescription>
          </DialogHeader>

          {view === "form" ? (
            <Form {...form}>
              <form
                id="cylinder-form"
                onSubmit={form.handleSubmit(handleValid)}
                className="flex flex-col gap-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="serialNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serial Number</FormLabel>
                      <div className="flex items-stretch">
                        <span
                          aria-hidden="true"
                          className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none"
                        >
                          {SERIAL_PREFIX}
                        </span>
                        <FormControl>
                          <Input
                            {...field}
                            value={extractSerialDigits(field.value)}
                            onChange={(e) =>
                              field.onChange(toSerialValue(e.target.value))
                            }
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text/plain")
                              if (!hasSerialPrefix(text)) return
                              e.preventDefault()
                              field.onChange(toSerialValue(text))
                            }}
                            inputMode="numeric"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="123456"
                            className="rounded-l-none"
                          />
                        </FormControl>
                      </div>
                      <FormDescription>
                        Masukkan 6 angka serial number, awalan CYL- akan
                        ditambahkan otomatis.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gasType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipe Gas</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger
                            aria-label="Tipe gas"
                            className="w-full"
                          >
                            <SelectValue placeholder="Pilih tipe gas" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {gasTypes.map((gasType) => (
                            <SelectItem key={gasType} value={gasType}>
                              {gasType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          ) : (
            <ConfirmationSummary
              pending={pending}
              cylinder={isEdit ? cylinder : null}
            />
          )}

          <DialogFooter>
            {view === "form" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Batal
                </Button>
                <Button type="submit" form="cylinder-form">
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
                  {isEdit ? "Simpan perubahan" : "Simpan tabung"}
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

function ConfirmationSummary({
  pending,
  cylinder,
}: {
  pending: CylinderFormValues | null
  cylinder: Cylinder | null
}) {
  if (!pending) return null

  return (
    <dl className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4 text-sm">
      <SummaryRow
        label="Serial Number"
        before={cylinder?.serialNumber}
        after={pending.serialNumber}
      />
      <SummaryRow
        label="Tipe Gas"
        before={cylinder?.gasType}
        after={pending.gasType}
      />
    </dl>
  )
}

function SummaryRow({
  label,
  before,
  after,
}: {
  label: string
  before?: string
  after: string
}) {
  const changed = before !== undefined && before !== after
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">
        {changed ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground line-through">{before}</span>
            <span aria-hidden="true">→</span>
            <span>{after}</span>
          </span>
        ) : (
          after
        )}
      </dd>
    </div>
  )
}
