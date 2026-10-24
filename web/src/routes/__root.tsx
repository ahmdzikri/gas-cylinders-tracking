import { ThemeProvider, useTheme } from "@/components/context/theme-context"
import { GeneralError } from "@/components/errors/general-error"
import { NotFoundError } from "@/components/errors/not-found-error"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Provider as TanstackQueryProvider } from "@/integrations/tanstack-query/root-provider"
import { IconGasStation, IconMoon, IconSun } from "@tabler/icons-react"
import type { QueryClient } from "@tanstack/react-query"
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router"

import "@/styles.css"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  notFoundComponent: NotFoundError,
  errorComponent: GeneralError,
  component: RootComponent,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()

  return (
    <TanstackQueryProvider queryClient={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="samator-theme">
        <TooltipProvider delayDuration={300}>
          <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <AppHeader />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
              <Outlet />
            </main>
            <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
              Gas Cylinder Tracker © 2026 • PT Samator Gas Industri Tbk
            </footer>
          </div>
        </TooltipProvider>
        <Toaster richColors closeButton position="top-center" />
      </ThemeProvider>
    </TanstackQueryProvider>
  )
}

function AppHeader() {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/cylinders"
          className="flex items-center gap-2 font-heading text-base font-semibold"
        >
          <IconGasStation aria-hidden="true" className="size-5 text-primary" />
          Gas Cylinder Tracker
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? (
            <IconSun aria-hidden="true" />
          ) : (
            <IconMoon aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  )
}
