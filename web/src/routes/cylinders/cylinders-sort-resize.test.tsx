import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { routeTree } from "@/routeTree.gen"

/**
 * Sort columns (server-side, via URL) and resize columns (mouse/keyboard, saved in
 * localStorage) on the cylinder list page.
 */

const WIDTHS_KEY = "samator-cylinders-column-widths"

const rows = [
  {
    id: 1,
    serialNumber: "CYL-000001",
    gasType: "Oxygen",
    status: "Filled",
    customerName: null,
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

const metaBody = {
  gasTypes: ["Oxygen", "Nitrogen"],
  statuses: ["Empty", "Filled", "Delivered", "InMaintenance", "Retired"],
  transitions: {},
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

/** Mock fetch that records query strings for each list request. */
function stubApi() {
  const listRequests: URLSearchParams[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost")
      if (url.pathname.endsWith("/meta")) return jsonResponse(metaBody)
      listRequests.push(url.searchParams)
      return jsonResponse({ items: rows, page: 1, pageSize: 10, totalCount: 2 })
    })
  )
  return listRequests
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

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.removeItem(WIDTHS_KEY)
})

afterEach(() => {
  window.localStorage.removeItem(WIDTHS_KEY)
})

describe("Urut kolom tabel tabung", () => {
  it("klik judul kolom: naik, turun, lalu kembali ke urutan bawaan (via URL + API)", async () => {
    const requests = stubApi()
    const user = userEvent.setup()
    const router = renderAt("/cylinders?page=2")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    // Default: no sortBy sent (server: last updated, newest first).
    expect(requests[0].get("sortBy")).toBeNull()
    const header = () => screen.getByRole("columnheader", { name: /Pelanggan/ })
    expect(header()).toHaveAttribute("aria-sort", "none")

    await user.click(
      screen.getByRole("button", { name: "Urutkan berdasarkan Pelanggan" })
    )
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        sortBy: "customerName",
        sortDir: "asc",
        page: 1,
      })
    )
    await waitFor(() =>
      expect(
        requests.some(
          (p) =>
            p.get("sortBy") === "customerName" &&
            p.get("sortDir") === "asc" &&
            p.get("page") === "1"
        )
      ).toBe(true)
    )
    expect(header()).toHaveAttribute("aria-sort", "ascending")

    await user.click(
      screen.getByRole("button", { name: /Pelanggan: urut naik/ })
    )
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        sortBy: "customerName",
        sortDir: "desc",
      })
    )
    await waitFor(() =>
      expect(requests.some((p) => p.get("sortDir") === "desc")).toBe(true)
    )
    expect(header()).toHaveAttribute("aria-sort", "descending")

    await user.click(
      screen.getByRole("button", { name: /Pelanggan: urut turun/ })
    )
    await waitFor(() =>
      expect(router.state.location.search.sortBy).toBeUndefined()
    )
    expect(header()).toHaveAttribute("aria-sort", "none")
  })

  it("membaca urutan dari URL lalu mengirimnya ke API", async () => {
    const requests = stubApi()
    renderAt("/cylinders?sortBy=status&sortDir=desc")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    expect(requests[0].get("sortBy")).toBe("status")
    expect(requests[0].get("sortDir")).toBe("desc")
    expect(
      screen.getByRole("columnheader", { name: /^Status/ })
    ).toHaveAttribute("aria-sort", "descending")
  })

  it("mengabaikan kolom urut yang tidak dikenal di URL", async () => {
    const requests = stubApi()
    renderAt("/cylinders?sortBy=price&sortDir=sideways")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()
    expect(requests[0].get("sortBy")).toBeNull()
    expect(requests[0].get("sortDir")).toBeNull()
  })

  it("kolom Aksi tidak bisa diurutkan", async () => {
    stubApi()
    renderAt("/cylinders")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: /^Urutkan berdasarkan/ })
    ).toHaveLength(5)
  })
})

describe("Resize kolom tabel tabung", () => {
  it("panah kiri/kanan mengubah lebar (±16px, min 80px), tersimpan, dan bisa direset", async () => {
    stubApi()
    const user = userEvent.setup()
    const router = renderAt("/cylinders")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    // Four data columns that can be resized have handles; Last
    // Updated and Actions do not.
    expect(screen.getAllByRole("separator")).toHaveLength(4)
    expect(
      screen.queryByRole("separator", {
        name: "Ubah lebar kolom Terakhir Diperbarui",
      })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: /Terakhir Diperbarui/ }).style
        .width
    ).toBe("200px")

    // Kolom tanpa pegangan tetap bisa diurutkan lewat judulnya.
    const lastUpdatedHeader = () =>
      screen.getByRole("columnheader", { name: /Terakhir Diperbarui/ })
    await user.click(
      screen.getByRole("button", {
        name: "Urutkan berdasarkan Terakhir Diperbarui",
      })
    )
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        sortBy: "lastUpdated",
        sortDir: "asc",
        page: 1,
      })
    )
    expect(lastUpdatedHeader()).toHaveAttribute("aria-sort", "ascending")

    const handle = screen.getByRole("separator", {
      name: "Ubah lebar kolom Pelanggan",
    })
    const header = screen.getByRole("columnheader", { name: /Pelanggan/ })
    expect(handle).toHaveAttribute("aria-valuenow", "280")
    expect(header.style.width).toBe("280px")
    expect(
      screen.queryByRole("button", { name: /Reset lebar kolom/ })
    ).not.toBeInTheDocument()

    handle.focus()
    await user.keyboard("{ArrowRight}{ArrowRight}")
    expect(handle).toHaveAttribute("aria-valuenow", "312")
    expect(header.style.width).toBe("312px")
    expect(
      JSON.parse(window.localStorage.getItem(WIDTHS_KEY) ?? "{}")
    ).toMatchObject({ customerName: 312 })

    for (let i = 0; i < 20; i++) await user.keyboard("{ArrowLeft}")
    expect(handle).toHaveAttribute("aria-valuenow", "80")

    await user.click(screen.getByRole("button", { name: /Reset lebar kolom/ }))
    expect(handle).toHaveAttribute("aria-valuenow", "280")
    expect(header.style.width).toBe("280px")
    expect(
      screen.queryByRole("button", { name: /Reset lebar kolom/ })
    ).not.toBeInTheDocument()
  })

  it("seret pegangan dengan mouse melebarkan kolom", async () => {
    stubApi()
    renderAt("/cylinders")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    const handle = screen.getByRole("separator", {
      name: "Ubah lebar kolom Serial Number",
    })
    const { fireEvent } = await import("@testing-library/react")
    fireEvent.mouseDown(handle, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 160 })
    fireEvent.mouseUp(document, { clientX: 160 })

    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "220"))
  })

  it("klik ganda pegangan mengembalikan lebar bawaan kolom itu", async () => {
    window.localStorage.setItem(WIDTHS_KEY, JSON.stringify({ gasType: 400 }))
    stubApi()
    const user = userEvent.setup()
    renderAt("/cylinders")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    const handle = screen.getByRole("separator", {
      name: "Ubah lebar kolom Tipe Gas",
    })
    expect(handle).toHaveAttribute("aria-valuenow", "400")
    await user.dblClick(handle)
    expect(handle).toHaveAttribute("aria-valuenow", "150")
  })

  it("memulihkan lebar tersimpan dan memangkas nilai di luar batas", async () => {
    window.localStorage.setItem(
      WIDTHS_KEY,
      JSON.stringify({ serialNumber: 240, customerName: 5000, status: "x" })
    )
    stubApi()
    renderAt("/cylinders")
    expect(await screen.findByText("CYL-000001")).toBeInTheDocument()

    expect(
      screen.getByRole("separator", { name: "Ubah lebar kolom Serial Number" })
    ).toHaveAttribute("aria-valuenow", "240")
    expect(
      screen.getByRole("separator", { name: "Ubah lebar kolom Pelanggan" })
    ).toHaveAttribute("aria-valuenow", "800")
    expect(
      screen.getByRole("separator", { name: "Ubah lebar kolom Status" })
    ).toHaveAttribute("aria-valuenow", "150")
  })
})
