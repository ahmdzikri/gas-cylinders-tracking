import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ServerErrorDialog } from "@/components/cylinders/server-error-dialog"
import { ApiError } from "@/lib/api"

describe("ServerErrorDialog", () => {
  it("menampilkan title, detail, dan setiap entri errors ProblemDetails", () => {
    const error = new ApiError(400, {
      title: "Validasi gagal",
      detail: "Satu atau lebih field tidak valid.",
      errors: {
        serialNumber: ["Format serial tidak valid."],
        customerName: ["Nama pelanggan wajib diisi.", "Maksimal 120 karakter."],
        pageSize: ["Ukuran halaman maksimal 50."],
      },
    })

    render(<ServerErrorDialog error={error} open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Validasi gagal")).toBeInTheDocument()
    expect(
      screen.getByText("Satu atau lebih field tidak valid.")
    ).toBeInTheDocument()
    // Nama field server dipetakan ke label yang ramah pengguna.
    expect(screen.getByText("Serial Number")).toBeInTheDocument()
    expect(screen.getByText("Format serial tidak valid.")).toBeInTheDocument()
    expect(screen.getByText("Nama Pelanggan")).toBeInTheDocument()
    expect(screen.getByText("Nama pelanggan wajib diisi.")).toBeInTheDocument()
    expect(screen.getByText("Maksimal 120 karakter.")).toBeInTheDocument()
    expect(screen.getByText("Ukuran Halaman")).toBeInTheDocument()
    expect(screen.queryByText("serialNumber")).not.toBeInTheDocument()
    expect(screen.queryByText("customerName")).not.toBeInTheDocument()
  })

  it("memberi label untuk key PascalCase dan parameter urut", () => {
    const error = new ApiError(400, {
      title: "Validasi gagal",
      errors: {
        GasType: ["Jenis gas tidak valid."],
        sortBy: ["Kolom urut tidak dikenal."],
        body: ["Body permintaan wajib diisi."],
      },
    })

    render(<ServerErrorDialog error={error} open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Tipe Gas")).toBeInTheDocument()
    expect(screen.getByText("Kolom Urut")).toBeInTheDocument()
    expect(screen.getByText("Isi Permintaan")).toBeInTheDocument()
    expect(screen.queryByText("GasType")).not.toBeInTheDocument()
    expect(screen.queryByText("sortBy")).not.toBeInTheDocument()
  })

  it("menampilkan pesan umum untuk galat jaringan", () => {
    const error = new ApiError(0, {
      title: "Koneksi gagal",
      detail:
        "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.",
    })

    render(<ServerErrorDialog error={error} open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Koneksi gagal")).toBeInTheDocument()
    expect(
      screen.getByText(/Tidak dapat menghubungi server/i)
    ).toBeInTheDocument()
  })

  it("menutup dialog lewat tombol Tutup", async () => {
    const onOpenChange = vi.fn()
    const error = new ApiError(409, {
      title: "Serial duplikat",
      detail: "Serial number sudah digunakan.",
    })

    render(<ServerErrorDialog error={error} open onOpenChange={onOpenChange} />)

    // Ada dua tombol bernama "Tutup": tombol X di pojok (sr-only) dan tombol
    // footer. Kita menguji tombol footer secara spesifik.
    const footer = document.querySelector('[data-slot="dialog-footer"]')
    expect(footer).not.toBeNull()

    await userEvent.click(
      within(footer as HTMLElement).getByRole("button", { name: "Tutup" })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
