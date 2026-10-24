import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Renders a dialog open by default so the portal content is in the document.
 * Radix Dialog requires a title/description for a11y; we include a title.
 */
function renderOpenDialog(body: React.ReactNode) {
  return render(
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Judul</DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter>
          <button type="button">Kirim</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe("DialogContent adaptive sizing", () => {
  it("caps the panel height to the viewport with a small margin", () => {
    renderOpenDialog(<p>Isi pendek</p>)

    const content = document.querySelector('[data-slot="dialog-content"]')
    expect(content).not.toBeNull()
    expect(content).toHaveClass("max-h-[calc(100dvh-2rem)]")
  })

  it("lays the panel out as a flex column so the body can grow and shrink", () => {
    renderOpenDialog(<p>Isi pendek</p>)

    const content = document.querySelector('[data-slot="dialog-content"]')
    expect(content).toHaveClass("flex", "flex-col")
    // The old grid layout collapsed the header/footer into grid rows; the
    // adaptive layout must no longer rely on grid.
    expect(content).not.toHaveClass("grid")
  })

  it("makes the scrollable content area the flex-growing region", () => {
    renderOpenDialog(<p style={{ height: "5000px" }}>Isi sangat panjang</p>)

    const content = document.querySelector('[data-slot="dialog-content"]')
    // The panel itself must not scroll — only the content area does.
    expect(content).not.toHaveClass("overflow-y-auto")
    expect(content).not.toHaveClass("overflow-auto")

    const body = document.querySelector('[data-slot="dialog-body"]')
    expect(body).not.toBeNull()
    expect(body).toHaveClass("overflow-y-auto")
    expect(body).toHaveClass("min-h-0")
    expect(body).toHaveClass("flex-1")
  })

  it("bounds the body by the viewport cap so tall content scrolls inside it", () => {
    // Regression guard for the supervisi modal: a tall form must not push the
    // panel past the viewport. The panel carries the viewport cap
    // (`max-h-[calc(100dvh-2rem)]`), and the body is the flex-growing region
    // bounded by that cap (`flex-1 min-h-0`) with its own scroll.
    renderOpenDialog(<p style={{ height: "5000px" }}>Isi sangat panjang</p>)

    const content = document.querySelector(
      '[data-slot="dialog-content"]'
    ) as HTMLElement | null
    const body = document.querySelector('[data-slot="dialog-body"]')
    expect(content).not.toBeNull()
    expect(body).not.toBeNull()

    // The panel itself carries the bounded viewport max-height.
    expect(content).toHaveClass("max-h-[calc(100dvh-2rem)]")
    // The body is scrollable (overflow-y-auto) and bounded (flex-1 min-h-0)
    // so it grows/shrinks with content but never exceeds the panel cap.
    expect(body).toHaveClass("overflow-y-auto")
    expect(body).toHaveClass("min-h-0")
    expect(body).toHaveClass("flex-1")
  })

  it("keeps header and footer pinned outside the scrolling region", () => {
    renderOpenDialog(<p style={{ height: "5000px" }}>Isi sangat panjang</p>)

    const content = document.querySelector('[data-slot="dialog-content"]')
    const header = document.querySelector('[data-slot="dialog-header"]')
    const footer = document.querySelector('[data-slot="dialog-footer"]')
    const body = document.querySelector('[data-slot="dialog-body"]')

    expect(header).not.toHaveClass("overflow-y-auto")
    expect(footer).not.toHaveClass("overflow-y-auto")
    expect(header).toHaveClass("shrink-0")
    expect(footer).toHaveClass("shrink-0")
    // Header/footer are direct, pinned children of the panel — not inside the
    // scrollable middle region.
    expect(header?.parentElement).toBe(content)
    expect(footer?.parentElement).toBe(content)
    expect(body?.contains(header as Node)).toBe(false)
    expect(body?.contains(footer as Node)).toBe(false)
  })

  it("exposes exactly one vertical scroll region inside the panel", () => {
    // Nested-scroll guard: the panel may contain exactly one element declaring
    // vertical scroll (the auto-generated DialogBody). A consumer re-declaring
    // `overflow-y-auto` on its own wrapper would create a second, nested
    // scroller (double scrollbar / scroll chaining); this guard fails then.
    renderOpenDialog(
      <div className="space-y-4" data-testid="consumer-wrapper">
        <textarea data-slot="textarea" />
      </div>
    )

    const content = document.querySelector('[data-slot="dialog-content"]')
    expect(content).not.toBeNull()

    const scrollers = Array.from(
      content!.querySelectorAll<HTMLElement>(
        ".overflow-y-auto, .overflow-y-scroll, .overflow-auto, .overflow-scroll"
      )
    )
    expect(scrollers).toHaveLength(1)
    expect(scrollers[0].getAttribute("data-slot")).toBe("dialog-body")

    // The intentional textarea (and its wrapper) are NOT scrollers themselves.
    const textarea = content!.querySelector('[data-slot="textarea"]')
    expect(scrollers).not.toContain(textarea as HTMLElement)
    expect(scrollers).not.toContain(
      content!.querySelector('[data-testid="consumer-wrapper"]') as HTMLElement
    )
  })

  it("preserves the public API and consumer class overrides", () => {
    render(
      <Dialog open>
        <DialogContent className="sm:max-w-2xl" data-testid="custom">
          <DialogHeader>
            <DialogTitle>Judul</DialogTitle>
          </DialogHeader>
          <div data-testid="dialog-body">
            <p>Isi</p>
          </div>
        </DialogContent>
      </Dialog>
    )

    const content = document.querySelector('[data-slot="dialog-content"]')
    expect(content).toHaveClass("sm:max-w-2xl")
    // Close button (public showCloseButton default) still renders.
    expect(screen.getByRole("button", { name: /tutup/i })).toBeInTheDocument()
  })
})
