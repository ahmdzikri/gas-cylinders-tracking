import { describe, expect, it } from "vitest"

import { FIELD_LABELS, fieldLabel } from "@/lib/api"

describe("fieldLabel", () => {
  it("memetakan setiap key errors dari server ke label tampilan", () => {
    // Keys observed from the actual API (all camelCase).
    expect(fieldLabel("serialNumber")).toBe("Serial Number")
    expect(fieldLabel("gasType")).toBe("Tipe Gas")
    expect(fieldLabel("status")).toBe("Status")
    expect(fieldLabel("customerName")).toBe("Nama Pelanggan")
    expect(fieldLabel("page")).toBe("Halaman")
    expect(fieldLabel("pageSize")).toBe("Ukuran Halaman")
    expect(fieldLabel("sortBy")).toBe("Kolom Urut")
    expect(fieldLabel("sortDir")).toBe("Arah Urut")
    expect(fieldLabel("body")).toBe("Isi Permintaan")
  })

  it("menormalkan key PascalCase sebelum dicari", () => {
    expect(fieldLabel("SerialNumber")).toBe("Serial Number")
    expect(fieldLabel("CustomerName")).toBe("Nama Pelanggan")
    expect(fieldLabel("PageSize")).toBe("Ukuran Halaman")
  })

  it("menampilkan key yang tidak dikenal apa adanya", () => {
    expect(fieldLabel("$.serialNumber")).toBe("$.serialNumber")
    expect(fieldLabel("Unknown")).toBe("Unknown")
    expect(fieldLabel("")).toBe("")
  })

  it("mencakup semua key yang dikirim backend", () => {
    // Key list from CylindersController, CylinderService, and
    // InvalidModelStateResponseFactory (Program.cs). Add here and in
    // FIELD_LABELS when the backend introduces a new key.
    const backendKeys = [
      "serialNumber",
      "gasType",
      "status",
      "customerName",
      "page",
      "pageSize",
      "sortBy",
      "sortDir",
      "body",
    ]
    expect(Object.keys(FIELD_LABELS).sort()).toEqual([...backendKeys].sort())
  })
})
