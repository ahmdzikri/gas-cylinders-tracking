import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { getRouter } from "./router"
import "@/styles.css"

const router = getRouter()

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Elemen #root tidak ditemukan di index.html")
}

if (!rootElement.innerHTML) {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
