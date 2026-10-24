import { useTheme } from "@/components/context/theme-context"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  // Meneruskan `light | dark | system` apa adanya ke Sonner. Sonner yang
  // me-resolve `system` ke preferensi OS (matchMedia) untuk atribut
  // `data-sonner-theme`, sementara warna toast selalu diambil dari token tema
  // (--color-*) lewat blok "Sonner toast mengikuti tema aplikasi" di styles.css.
  // Jangan menimpa classNames warna di sini: CSS inject Sonner (tanpa layer)
  // menang atas utilitas Tailwind, jadi mapping warna milik styles.css.
  const { theme = "light" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl font-sans",
          description: "group-[.toast]:text-muted-foreground text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:border-primary/30 group-[.toaster]:text-foreground",
          error:
            "group-[.toaster]:border-destructive/30 group-[.toaster]:text-foreground",
          warning:
            "group-[.toaster]:border-warning/30 group-[.toaster]:text-foreground",
          info: "group-[.toaster]:border-primary/30 group-[.toaster]:text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
