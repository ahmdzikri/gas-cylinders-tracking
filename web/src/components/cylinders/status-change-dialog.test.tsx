import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { StatusChangeDialog } from "@/components/cylinders/status-change-dialog"
import type { Cylinder } from "@/lib/cylinders"

/**
 * Dialog ubah status: hanya transisi yang diizinkan tampil, `Retired` final,
 * dan `customerName` wajib saat tujuan `Delivered`.
 */

const baseCylinder: Cylinder = {
  id: 1,
  serialNumber: "CYL-000001",
  gasType: "Oxygen",
  status: "Filled",
  customerName: null,
  lastUpdated: "2026-10-20T10:00:00Z",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function mockMeta() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse({
        gasTypes: ["Oxygen"],
        statuses: ["Empty", "Filled", "Delivered", "InMaintenance", "Retired"],
        transitions: {
          Empty: ["Filled", "InMaintenance", "Retired"],
          Filled: ["Delivered", "InMaintenance", "Retired"],
          Delivered: ["Empty"],
          InMaintenance: ["Empty", "Retired"],
          Retired: [],
        },
      })
    )
  )
}

function renderDialog(cylinder: Cylinder) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <StatusChangeDialog open onOpenChange={vi.fn()} cylinder={cylinder} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("StatusChangeDialog", () => {
  it("hanya menampilkan transisi yang diizinkan dari status Filled", async () => {
    mockMeta()
    const user = userEvent.setup()
    renderDialog(baseCylinder)

    await user.click(screen.getByRole("combobox", { name: "Status tujuan" }))

    const options = await screen.findAllByRole("option")
    const labels = options.map((option) => option.textContent?.trim())
    expect(labels).toEqual(["Delivered", "In Maintenance", "Retired"])
    // Status yang tidak diizinkan tidak muncul.
    expect(labels).not.toContain("Empty")
  })

  it("mewajibkan nama pelanggan saat tujuan Delivered", async () => {
    mockMeta()
    const user = userEvent.setup()
    renderDialog(baseCylinder)

    await user.click(screen.getByRole("combobox", { name: "Status tujuan" }))
    await user.click(await screen.findByRole("option", { name: "Delivered" }))

    expect(await screen.findByLabelText("Nama pelanggan")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    expect(
      await screen.findByText(/Nama pelanggan wajib diisi/i)
    ).toBeInTheDocument()
    // Belum masuk layar konfirmasi.
    expect(screen.queryByText("Konfirmasi ubah status")).not.toBeInTheDocument()
  })

  it("menampilkan konfirmasi sebelum memanggil API status", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/status") && init?.method === "POST") {
          return jsonResponse({
            ...baseCylinder,
            status: "Delivered",
            customerName: "Toko O'Neil",
          })
        }
        return jsonResponse({
          gasTypes: ["Oxygen"],
          statuses: [
            "Empty",
            "Filled",
            "Delivered",
            "InMaintenance",
            "Retired",
          ],
          transitions: {
            Empty: ["Filled", "InMaintenance", "Retired"],
            Filled: ["Delivered", "InMaintenance", "Retired"],
            Delivered: ["Empty"],
            InMaintenance: ["Empty", "Retired"],
            Retired: [],
          },
        })
      }
    )
    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    renderDialog(baseCylinder)

    await user.click(screen.getByRole("combobox", { name: "Status tujuan" }))
    await user.click(await screen.findByRole("option", { name: "Delivered" }))
    await user.type(
      await screen.findByLabelText("Nama pelanggan"),
      "Toko O'Neil"
    )
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    expect(
      await screen.findByText("Konfirmasi ubah status")
    ).toBeInTheDocument()
    expect(screen.getByText("Toko O'Neil")).toBeInTheDocument()
    // API belum dipanggil sebelum konfirmasi.
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes("/status") && init?.method === "POST"
      )
    ).toBe(false)

    await user.click(screen.getByRole("button", { name: "Simpan status" }))

    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).includes("/status") && init?.method === "POST"
        )
      ).toBe(true)
    )
  })

  it("menampilkan pesan status final untuk tabung Retired", async () => {
    mockMeta()
    renderDialog({ ...baseCylinder, status: "Retired" })

    expect(await screen.findByText("Status final")).toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", { name: "Status tujuan" })
    ).not.toBeInTheDocument()
  })

  it("menampilkan pelanggan yang dikosongkan saat tujuan bukan Delivered", async () => {
    mockMeta()
    const user = userEvent.setup()
    renderDialog({
      ...baseCylinder,
      status: "Delivered",
      customerName: "Toko O'Neil",
    })

    await user.click(screen.getByRole("combobox", { name: "Status tujuan" }))
    await user.click(await screen.findByRole("option", { name: "Empty" }))
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    expect(
      await screen.findByText("Konfirmasi ubah status")
    ).toBeInTheDocument()
    expect(screen.getByText("Toko O'Neil")).toBeInTheDocument()
    expect(screen.getByText("(dikosongkan)")).toBeInTheDocument()
  })
})
