import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { routeTree } from "@/routeTree.gen"

/**
 * Tests for the list page (real route `/cylinders`) with mocked `fetch`.
 * Verifies: rows from API are displayed, empty states (no data vs no
 * results), and error state with a retry button that triggers a new request.
 */

interface MockCylinder {
  id: number
  serialNumber: string
  gasType: string
  status: string
  customerName: string | null
  lastUpdated: string
}

const rows: MockCylinder[] = [
  {
    id: 1,
    serialNumber: "CYL-000001",
    gasType: "Oxygen",
    status: "Filled",
    customerName: "PT Maju Jaya",
    lastUpdated: "2026-10-20T10:00:00Z",
  },
  {
    id: 2,
    serialNumber: "CYL-000002",
    gasType: "Nitrogen",
    status: "Delivered",
    customerName: "Toko O'Neil & Sons",
    lastUpdated: "2026-10-19T08:30:00Z",
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const metaBody = {
  gasTypes: ["Oxygen", "Nitrogen"],
  statuses: ["Empty", "Filled", "Delivered", "InMaintenance", "Retired"],
  transitions: {
    Empty: ["Filled", "InMaintenance", "Retired"],
    Filled: ["Delivered", "InMaintenance", "Retired"],
    Delivered: ["Empty"],
    InMaintenance: ["Empty", "Retired"],
    Retired: [],
  },
}

function isMetaRequest(input: RequestInfo | URL): boolean {
  return String(input).includes("/api/cylinders/meta")
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

/** All list request URLs (non-meta) that have been called. */
function listRequestParams(urls: string[]): URLSearchParams[] {
  return urls
    .filter((url) => url.includes("/api/cylinders?"))
    .map((url) => new URL(url, "http://localhost").searchParams)
}

function statusParam(params: URLSearchParams): string[] | null {
  const raw = params.get("status")
  return raw === null ? null : (JSON.parse(raw) as string[])
}

/** Status facet filter trigger button (accessible name includes title + count). */
function statusFilterTrigger() {
  return screen.getByRole("button", { name: /^Status/ })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("Halaman daftar tabung", () => {
  it("menampilkan baris dari API, termasuk nama pelanggan dengan apostrof", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (isMetaRequest(input)) {
        return jsonResponse(metaBody)
      }
      return jsonResponse({
        items: rows,
        page: 1,
        pageSize: 10,
        totalCount: 2,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    renderAt("/cylinders")

    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()
    expect(screen.getByText("CYL-000002")).toBeInTheDocument()
    expect(screen.getByText("Toko O'Neil & Sons")).toBeInTheDocument()
    expect(screen.getByText("PT Maju Jaya")).toBeInTheDocument()
    expect(screen.getByText("Total data: 2")).toBeInTheDocument()
  })

  it("menampilkan empty state 'Belum ada tabung' saat data kosong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        isMetaRequest(input)
          ? jsonResponse(metaBody)
          : jsonResponse({ items: [], page: 1, pageSize: 10, totalCount: 0 })
      )
    )

    renderAt("/cylinders")

    expect(await screen.findByText("Belum ada tabung")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Reset filter" })
    ).not.toBeInTheDocument()
  })

  it("menampilkan empty state 'Tidak ada hasil' + Reset filter saat filter aktif", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        isMetaRequest(input)
          ? jsonResponse(metaBody)
          : jsonResponse({ items: [], page: 1, pageSize: 10, totalCount: 0 })
      )
    )

    renderAt("/cylinders?search=tidakada")

    expect(await screen.findByText("Tidak ada hasil")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Reset filter" })
    ).toBeInTheDocument()
  })

  it("menampilkan error state dan memuat ulang saat 'Coba lagi' ditekan", async () => {
    let calls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (isMetaRequest(input)) {
        return jsonResponse(metaBody)
      }
      calls += 1
      if (calls === 1) {
        return jsonResponse(
          { title: "Kesalahan server", detail: "Basis data tidak tersedia." },
          500
        )
      }
      return jsonResponse({
        items: rows,
        page: 1,
        pageSize: 10,
        totalCount: 2,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    renderAt("/cylinders")

    expect(await screen.findByText("Gagal memuat data")).toBeInTheDocument()
    expect(screen.getByText("Basis data tidak tersedia.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /Coba lagi/i }))

    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2))
  })

  it("mengubah ukuran halaman ke 20 memuat pageSize=20 dari halaman 1", async () => {
    const requested: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (isMetaRequest(input)) return jsonResponse(metaBody)
      requested.push(String(input))
      return jsonResponse({
        items: rows,
        page: 1,
        pageSize: 10,
        totalCount: 40,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    renderAt("/cylinders?page=3")

    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    await user.click(
      screen.getByRole("combobox", { name: "Baris per halaman" })
    )
    await user.click(await screen.findByRole("option", { name: "20" }))

    await waitFor(() => {
      const listCalls = requested
        .filter((url) => url.includes("/api/cylinders?"))
        .map((url) => new URL(url, "http://localhost").searchParams)
      expect(
        listCalls.some(
          (params) =>
            params.get("pageSize") === "20" && params.get("page") === "1"
        )
      ).toBe(true)
    })
  })

  it("memindahkan halaman melewati akhir data ke halaman terakhir", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (isMetaRequest(input)) return jsonResponse(metaBody)
      const url = new URL(String(input), "http://localhost")
      const page = Number(url.searchParams.get("page") ?? "1")
      if (page === 99) {
        return jsonResponse({
          items: [],
          page: 99,
          pageSize: 10,
          totalCount: 12,
        })
      }
      if (page === 2) {
        return jsonResponse({
          items: [
            {
              id: 11,
              serialNumber: "CYL-000011",
              gasType: "Oxygen",
              status: "Empty",
              customerName: null,
              lastUpdated: "2026-10-18T10:00:00Z",
            },
          ],
          page: 2,
          pageSize: 10,
          totalCount: 12,
        })
      }
      return jsonResponse({
        items: rows,
        page,
        pageSize: 10,
        totalCount: 12,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const router = renderAt("/cylinders?page=99")

    expect(await screen.findByText("CYL-000011")).toBeInTheDocument()
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ page: 2 })
    )
  })
})

describe("Filter status multi-pilih", () => {
  it("membaca array JSON dari URL dan mengirimnya ke API", async () => {
    const requested: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (isMetaRequest(input)) return jsonResponse(metaBody)
        requested.push(String(input))
        return jsonResponse({
          items: rows,
          page: 1,
          pageSize: 10,
          totalCount: 2,
        })
      })
    )

    const router = renderAt(
      "/cylinders?status=%5B%22empty%22%2C%22filled%22%5D"
    )

    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()
    expect(router.state.location.search).toMatchObject({
      status: ["empty", "filled"],
    })

    await waitFor(() => {
      const params = listRequestParams(requested)
      expect(
        params.some((query) => {
          const status = statusParam(query)
          return (
            status?.length === 2 &&
            status[0] === "empty" &&
            status[1] === "filled"
          )
        })
      ).toBe(true)
    })

    expect(within(statusFilterTrigger()).getByText("2")).toBeInTheDocument()
  })

  it("memilih dua status mengambil URL array baru dan mengulang dari halaman 1", async () => {
    const requested: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (isMetaRequest(input)) return jsonResponse(metaBody)
        requested.push(String(input))
        return jsonResponse({
          items: rows,
          page: 1,
          pageSize: 10,
          totalCount: 40,
        })
      })
    )

    const user = userEvent.setup()
    const router = renderAt("/cylinders?page=2")

    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    await user.click(statusFilterTrigger())
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Empty" })
    )
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Filled" })
    )

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        status: ["empty", "filled"],
        page: 1,
      })
    )
    expect(router.state.location.href).toContain(
      "status=%5B%22empty%22%2C%22filled%22%5D"
    )

    await waitFor(() => {
      const params = listRequestParams(requested)
      expect(
        params.some((query) => {
          const status = statusParam(query)
          return (
            status?.length === 2 &&
            status[0] === "empty" &&
            status[1] === "filled" &&
            query.get("page") === "1"
          )
        })
      ).toBe(true)
    })
  })

  it("'Hapus filter' mengosongkan pilihan dan menghapus status dari query API", async () => {
    const requested: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (isMetaRequest(input)) return jsonResponse(metaBody)
        requested.push(String(input))
        return jsonResponse({
          items: rows,
          page: 1,
          pageSize: 10,
          totalCount: 2,
        })
      })
    )

    const user = userEvent.setup()
    const router = renderAt(
      "/cylinders?status=%5B%22empty%22%2C%22filled%22%5D"
    )

    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    await user.click(statusFilterTrigger())
    await user.click(
      await screen.findByRole("menuitem", { name: "Hapus filter" })
    )

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ status: [] })
    )

    await waitFor(() => {
      const params = listRequestParams(requested)
      expect(params.length).toBeGreaterThan(0)
      expect(params[params.length - 1]?.has("status")).toBe(false)
    })
  })

  it("nilai status tunggal gaya lama dinormalkan menjadi array", async () => {
    const requested: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (isMetaRequest(input)) return jsonResponse(metaBody)
        requested.push(String(input))
        return jsonResponse({
          items: rows,
          page: 1,
          pageSize: 10,
          totalCount: 2,
        })
      })
    )

    const router = renderAt("/cylinders?status=DELIVERED")

    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()
    expect(router.state.location.search).toMatchObject({
      status: ["delivered"],
    })

    await waitFor(() => {
      const params = listRequestParams(requested)
      expect(
        params.some((query) => {
          const status = statusParam(query)
          return status?.length === 1 && status[0] === "delivered"
        })
      ).toBe(true)
    })

    expect(within(statusFilterTrigger()).getByText("1")).toBeInTheDocument()
  })
})
