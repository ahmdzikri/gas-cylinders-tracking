import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Button, buttonVariants } from "@/components/ui/button"

afterEach(cleanup)

describe("Button sizing", () => {
  it("uses the comfortable shadcn default scale", () => {
    render(<Button>Continue</Button>)
    expect(screen.getByRole("button")).toHaveClass(
      "h-9",
      "px-4",
      "gap-2",
      "text-sm"
    )
  })

  it.each([
    ["xs", "h-6"],
    ["sm", "h-8"],
    ["lg", "h-10"],
    ["icon", "size-9"],
    ["icon-xs", "size-6"],
    ["icon-sm", "size-8"],
    ["icon-lg", "size-10"],
  ] as const)("keeps %s proportional", (size, expectedClass) => {
    expect(buttonVariants({ size }).split(" ")).toContain(expectedClass)
  })

  it("keeps sm text at text-sm (never the 12px mira token)", () => {
    const sm = buttonVariants({ size: "sm" }).split(" ")
    expect(sm).toContain("text-sm")
    expect(sm).not.toContain("text-xs")
    expect(buttonVariants().split(" ")).not.toContain("text-xs/relaxed")
  })

  it("preserves explicit sizing overrides", () => {
    render(<Button className="h-12 px-8 text-base">Continue</Button>)
    const button = screen.getByRole("button")
    expect(button).toHaveClass("h-12", "px-8", "text-base")
    expect(button).not.toHaveClass("h-9", "px-4", "text-sm")
  })

  it("keeps disabled buttons non-interactive", () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Continue
      </Button>
    )
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("preserves asChild link semantics without nesting a button", () => {
    render(
      <Button asChild>
        <a href="/id/contact">Contact</a>
      </Button>
    )
    expect(screen.getByRole("link")).toHaveAttribute("href", "/id/contact")
    expect(screen.getByRole("link")).toHaveClass("h-9")
    expect(screen.queryByRole("button")).toBeNull()
  })
})
