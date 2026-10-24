// vitest.setup.ts — global test setup (jest-dom matchers + jsdom polyfills).
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom tidak mengimplementasikan Pointer Events API yang dipakai Radix
// (Select/DropdownMenu memanggil hasPointerCapture/setPointerCapture saat
// membuka/menutup). Tanpa polyfill, membuka Select melempar
// `target.hasPointerCapture is not a function`.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}

// jsdom mendefinisikan `window.scrollTo` tetapi melempar "Not implemented"
// setiap kali router memanggilnya; ganti dengan noop agar output tes bersih.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    configurable: true,
    value: () => {},
  })
}

afterEach(() => {
  cleanup()
})
