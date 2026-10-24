import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "samator-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, _setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    const stored = localStorage.getItem(storageKey) as Theme | null
    return stored ?? defaultTheme
  })

  useEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const applyTheme = (theme: Theme) => {
      root.classList.remove("light", "dark") // Remove existing theme classes
      const systemTheme = mediaQuery.matches ? "dark" : "light"
      const effectiveTheme = theme === "system" ? systemTheme : theme
      root.classList.add(effectiveTheme) // Add the new theme class
    }

    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system")
      }
    }

    applyTheme(theme)

    mediaQuery.addEventListener("change", handleChange)

    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = (theme: Theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, theme)
    }
    _setTheme(theme)
  }

  const value = {
    theme,
    setTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  // Return default state if context is not available (SSR or outside provider)
  // This prevents hydration errors and allows components to render safely
  if (context === undefined) {
    return initialState
  }

  return context
}
