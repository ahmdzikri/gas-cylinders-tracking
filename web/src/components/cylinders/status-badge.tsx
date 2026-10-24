import { Badge } from "@/components/ui/badge"
import type { CylinderStatus } from "@/lib/cylinders"
import { statusLabel } from "@/lib/cylinders"

const VARIANTS: Record<
  CylinderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Empty: "outline",
  Filled: "default",
  Delivered: "secondary",
  InMaintenance: "outline",
  Retired: "destructive",
}

export function StatusBadge({ status }: { status: CylinderStatus }) {
  return (
    <Badge variant={VARIANTS[status] ?? "outline"}>{statusLabel(status)}</Badge>
  )
}
