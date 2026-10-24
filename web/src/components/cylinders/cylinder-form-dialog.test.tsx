import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CylinderFormDialog } from "@/components/cylinders/cylinder-form-dialog"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CylinderFormDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  return { onOpenChange }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("CylinderFormDialog", () => {
  it("menampilkan galat zod untuk serial yang tidak valid", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ gasTypes: ["Oxygen"], statuses: [], transitions: {} })
    )
    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText("Serial Number"), "ABC-1")
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    expect(
      await screen.findByText(/Format serial harus CYL-/i)
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST")
    ).toBe(false)
  })

  it("menampilkan ringkasan konfirmasi sebelum memanggil API", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return jsonResponse(
            {
              id: 9,
              serialNumber: "CYL-123456",
              gasType: "Oxygen",
              status: "Empty",
              customerName: null,
              lastUpdated: "2026-10-20T10:00:00Z",
            },
            201
          )
        }
        return jsonResponse({
          gasTypes: ["Oxygen", "Nitrogen"],
          statuses: [],
          transitions: {},
        })
      }
    )
    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    const { onOpenChange } = renderDialog()

    await user.type(screen.getByLabelText("Serial Number"), " cyl-123456 ")
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    // Layar konfirmasi: nilai sudah dinormalisasi, API belum dipanggil.
    expect(await screen.findByText("Konfirmasi data")).toBeInTheDocument()
    expect(screen.getByText("CYL-123456")).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST")
    ).toBe(false)

    await user.click(screen.getByRole("button", { name: "Simpan tabung" }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "POST")
      ).toBe(true)
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
