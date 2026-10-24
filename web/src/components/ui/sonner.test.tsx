import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeProvider } from "@/components/context/theme-context"
import { Toaster } from "@/components/ui/sonner"

const captured = vi.hoisted(() => ({
  theme: undefined as string | undefined,
}))

vi.mock("sonner", () => ({
  Toaster: (props: { theme?: string }) => {
    captured.theme = props.theme
    return <div data-testid="sonner-mock" data-theme={props.theme} />
  },
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))

const THEME_KEY = "samator-theme"

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("light", "dark")
  captured.theme = undefined
  mockMatchMedia(false)
})

describe("Toaster mengikuti tema aplikasi", () => {
  it("meneruskan tema light dari ThemeProvider ke Sonner", () => {
    localStorage.setItem(THEME_KEY, "light")
    render(
      <ThemeProvider storageKey={THEME_KEY}>
        <Toaster />
      </ThemeProvider>
    )
    expect(screen.getByTestId("sonner-mock")).toHaveAttribute(
      "data-theme",
      "light"
    )
    expect(captured.theme).toBe("light")
  })

  it("meneruskan tema dark dari ThemeProvider ke Sonner", () => {
    localStorage.setItem(THEME_KEY, "dark")
    render(
      <ThemeProvider storageKey={THEME_KEY}>
        <Toaster />
      </ThemeProvider>
    )
    expect(screen.getByTestId("sonner-mock")).toHaveAttribute(
      "data-theme",
      "dark"
    )
    expect(captured.theme).toBe("dark")
  })

  it("meneruskan system apa adanya agar Sonner resolve via matchMedia", () => {
    localStorage.setItem(THEME_KEY, "system")
    render(
      <ThemeProvider storageKey={THEME_KEY}>
        <Toaster />
      </ThemeProvider>
    )
    // Resolusi system -> light/dark milik Sonner (atribut data-sonner-theme),
    // wrapper tidak boleh mengeras ke light/dark di sini.
    expect(captured.theme).toBe("system")
  })
})

describe("guard: styles.css memetakan variabel Sonner ke token tema", () => {
  const stylesPath = resolve(__dirname, "../../styles.css")
  const css = readFileSync(stylesPath, "utf8")
  const marker = ":root [data-sonner-toaster]"
  const start = css.indexOf(marker)
  const end = css.indexOf("Tipografi body artikel publik", start)
  const block = css.slice(start, end === -1 ? undefined : end)

  it("blok override Sonner ada di styles.css", () => {
    expect(start).toBeGreaterThanOrEqual(0)
    expect(block.length).toBeGreaterThan(500)
  })

  it("permukaan normal memakai token card/border", () => {
    expect(block).toContain("--normal-bg: var(--color-card)")
    expect(block).toContain("--normal-border: var(--color-border)")
    expect(block).toContain("--normal-text: var(--color-card-foreground)")
  })

  it("varian rich memakai tint token primary/warning/destructive", () => {
    for (const name of [
      "--success-bg",
      "--success-border",
      "--info-bg",
      "--info-border",
      "--warning-bg",
      "--warning-border",
      "--error-bg",
      "--error-border",
    ]) {
      expect(block, name).toContain(name)
    }
    expect(block).toContain("var(--color-primary)")
    expect(block).toContain("var(--color-warning)")
    expect(block).toContain("var(--color-destructive)")
    expect(block).toContain("var(--color-card-foreground)")
  })

  it("tidak mengeras ke putih/hitam mentah untuk latar toast", () => {
    const themeRule = block.slice(
      block.indexOf("[data-sonner-theme]"),
      block.indexOf("[data-sonner-theme]") + 2000
    )
    expect(themeRule).not.toContain("#fff")
    expect(themeRule).not.toContain("#000")
  })
})
