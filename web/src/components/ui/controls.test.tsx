import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

afterEach(cleanup)

describe("Form control standard sizing", () => {
  it("Input uses h-9 px-3 py-1 text-sm without md shrink", () => {
    render(<Input placeholder="Test input" />)
    const input = screen.getByPlaceholderText("Test input")
    expect(input).toHaveClass("h-9", "px-3", "py-1", "text-sm")
    expect(input.className).not.toContain("h-7")
    expect(input.className).not.toContain("md:text-xs/relaxed")
  })

  it("Label uses text-sm leading-none font-medium", () => {
    render(<Label>Test label</Label>)
    const label = screen.getByText("Test label")
    expect(label).toHaveClass("text-sm", "leading-none", "font-medium")
    expect(label.className).not.toContain("text-xs/relaxed")
  })

  it("SelectTrigger uses px-3 py-2 text-sm and default h-9", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    )
    const trigger = screen.getByRole("combobox")
    expect(trigger).toHaveClass("px-3", "py-2", "text-sm")
    expect(trigger).toHaveAttribute("data-size", "default")
    expect(trigger.className).toContain("data-[size=default]:h-9")
    expect(trigger.className).toContain("data-[size=sm]:h-8")
  })
})

describe("Badge standard sizing", () => {
  it("Badge uses h-6 px-2.5 text-xs (never the 10px mira token)", () => {
    render(<Badge>Active</Badge>)
    const badge = screen.getByText("Active")
    expect(badge).toHaveClass("h-6", "px-2.5", "text-xs", "font-medium")
    expect(badge.className).not.toContain("text-[0.625rem]")
    expect(badge.className).not.toContain("h-5")
  })
})

describe("Cross-component scale pairing", () => {
  it("pairs Button default, Input, and SelectTrigger at the same 36px height", () => {
    // Tanpa jsdom layout, invarian dijaga lewat token tinggi yang sama (h-9).
    expect(buttonVariants({ size: "default" }).split(" ")).toContain("h-9")
    render(<Input placeholder="pairing" />)
    expect(screen.getByPlaceholderText("pairing")).toHaveClass("h-9")
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="pair" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">1</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(screen.getByRole("combobox").className).toContain(
      "data-[size=default]:h-9"
    )
    // Badge stays a step smaller than the Button `sm` control.
    render(<Badge>smallest</Badge>)
    expect(screen.getByText("smallest")).toHaveClass("h-6")
    expect(buttonVariants({ size: "sm" }).split(" ")).toContain("h-8")
  })
})
