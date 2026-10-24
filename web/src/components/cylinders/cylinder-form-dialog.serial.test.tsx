import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CylinderFormDialog } from "@/components/cylinders/cylinder-form-dialog"
import type { Cylinder } from "@/lib/cylinders"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const META = { gasTypes: ["Oxygen", "Nitrogen"], statuses: [], transitions: {} }

const EXISTING: Cylinder = {
  id: 1,
  serialNumber: "CYL-000123",
  gasType: "Oxygen",
  status: "Empty",
  customerName: null,
  lastUpdated: "2026-10-20T10:00:00Z",
}

type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Response | undefined

function stubFetch(handler?: FetchHandler) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      handler?.(input, init) ?? jsonResponse(META)
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderDialog(
  cylinder: Cylinder | null = null,
  onOpenChange = vi.fn()
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CylinderFormDialog
        open
        onOpenChange={onOpenChange}
        cylinder={cylinder}
      />
    </QueryClientProvider>
  )
  return { onOpenChange }
}

function serialInput(): HTMLInputElement {
  return screen.getByLabelText("Serial Number") as HTMLInputElement
}

function bodyOf(
  fetchMock: ReturnType<typeof stubFetch>,
  method: string
): { serialNumber: string; gasType: string } | undefined {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method)
  return call ? JSON.parse(String(call[1]?.body)) : undefined
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("CylinderFormDialog serial input", () => {
  it("hanya menyimpan 6 angka saat mengetik campuran huruf", async () => {
    stubFetch()
    const user = userEvent.setup()
    renderDialog()

    await user.type(serialInput(), "12a3b4567")

    expect(serialInput()).toHaveValue("123456")
  })

  it.each([
    ["CYL-123456", "123456"],
    ["cyl-123456", "123456"],
    ["CYL- 123456", "123456"],
    ["123456", "123456"],
    ["1234567", "123456"],
    ["ABC-123456", "123456"],
    ["CYL-12345", "12345"],
  ])("paste %j menghasilkan %j", async (pasted, expected) => {
    stubFetch()
    const user = userEvent.setup()
    renderDialog()

    await user.click(serialInput())
    await user.paste(pasted)

    expect(serialInput()).toHaveValue(expected)
  })

  it("paste serial berawalan CYL mengganti isi yang sudah ada", async () => {
    stubFetch()
    const user = userEvent.setup()
    renderDialog()

    await user.type(serialInput(), "99")
    expect(serialInput()).toHaveValue("99")
    await user.paste("CYL-123456")

    expect(serialInput()).toHaveValue("123456")
  })

  it("mengirim serial lengkap CYL-xxxxxx saat membuat tabung", async () => {
    const fetchMock = stubFetch((_input, init) =>
      init?.method === "POST"
        ? jsonResponse({ ...EXISTING, id: 9, serialNumber: "CYL-123456" }, 201)
        : undefined
    )
    const user = userEvent.setup()
    const { onOpenChange } = renderDialog()

    await user.click(serialInput())
    await user.paste("CYL-123456")
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    expect(await screen.findByText("Konfirmasi data")).toBeInTheDocument()
    expect(screen.getByText("CYL-123456")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Simpan tabung" }))

    await waitFor(() =>
      expect(bodyOf(fetchMock, "POST")?.serialNumber).toBe("CYL-123456")
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it("mode edit menampilkan angka saja dan mengirim serial lengkap", async () => {
    const fetchMock = stubFetch((_input, init) =>
      init?.method === "PUT"
        ? jsonResponse({ ...EXISTING, serialNumber: "CYL-654321" })
        : undefined
    )
    const user = userEvent.setup()
    renderDialog(EXISTING)

    expect(serialInput()).toHaveValue("000123")

    await user.clear(serialInput())
    await user.type(serialInput(), "654321")
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    expect(await screen.findByText("Konfirmasi data")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Simpan perubahan" }))

    await waitFor(() =>
      expect(bodyOf(fetchMock, "PUT")?.serialNumber).toBe("CYL-654321")
    )
  })

  it("menampilkan galat wajib diisi setelah dikosongkan", async () => {
    stubFetch()
    const user = userEvent.setup()
    renderDialog()

    await user.type(serialInput(), "12")
    await user.clear(serialInput())
    expect(serialInput()).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))

    expect(
      await screen.findByText("Serial number wajib diisi.")
    ).toBeInTheDocument()
  })

  it("memiliki atribut aksesibilitas yang tepat", () => {
    stubFetch()
    renderDialog()

    const input = screen.getByRole("textbox", { name: "Serial Number" })
    expect(input).toHaveAttribute("inputmode", "numeric")
    expect(input).not.toHaveAttribute("maxlength")

    const describedBy = input.getAttribute("aria-describedby") ?? ""
    const descriptions = describedBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
    expect(descriptions.some((text) => text.includes("otomatis"))).toBe(true)

    const prefix = screen.getByText("CYL-", { selector: "span" })
    expect(prefix).toHaveAttribute("aria-hidden", "true")
  })

  it("menampilkan galat field 409 dari server pada input", async () => {
    const message = "Serial number CYL-123456 sudah terdaftar."
    stubFetch((_input, init) =>
      init?.method === "POST"
        ? jsonResponse(
            {
              title: "Conflict",
              status: 409,
              errors: { SerialNumber: [message] },
            },
            409
          )
        : undefined
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(serialInput())
    await user.paste("CYL-123456")
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }))
    await user.click(
      await screen.findByRole("button", { name: "Simpan tabung" })
    )

    await waitFor(() =>
      expect(screen.getAllByText(message).length).toBeGreaterThan(0)
    )
    expect(serialInput()).toHaveValue("123456")
    expect(serialInput()).toHaveAttribute("aria-invalid", "true")
  })
})
