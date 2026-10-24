import { describe, expect, it } from "vitest"

import {
  extractSerialDigits,
  hasSerialPrefix,
  toSerialValue,
} from "@/lib/serial-number"

describe("extractSerialDigits", () => {
  it.each(["CYL-123456", "cyl-123456", "CYL- 123456", "1234567", "ABC-123456"])(
    "mengambil 6 angka dari %s",
    (input) => {
      expect(extractSerialDigits(input)).toBe("123456")
    }
  )

  it("mempertahankan angka yang kurang dari 6", () => {
    expect(extractSerialDigits("CYL-12345")).toBe("12345")
  })

  it.each(["CYL-", ""])("mengembalikan string kosong untuk %j", (input) => {
    expect(extractSerialDigits(input)).toBe("")
  })
})

describe("toSerialValue", () => {
  it.each(["", "CYL-"])("mengembalikan string kosong untuk %j", (input) => {
    expect(toSerialValue(input)).toBe("")
  })

  it("menambahkan awalan CYL-", () => {
    expect(toSerialValue("12")).toBe("CYL-12")
  })

  it("memotong ke 6 angka", () => {
    expect(toSerialValue("cyl-1234567")).toBe("CYL-123456")
  })
})

describe("hasSerialPrefix", () => {
  it.each([" cyl-1", "CYL-"])("true untuk %j", (input) => {
    expect(hasSerialPrefix(input)).toBe(true)
  })

  it.each(["123456", "ABC-1"])("false untuk %j", (input) => {
    expect(hasSerialPrefix(input)).toBe(false)
  })
})
