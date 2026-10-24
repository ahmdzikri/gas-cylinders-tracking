import { Button } from "@/components/ui/button"
import { IconArrowDown, IconArrowUp, IconArrowsSort } from "@tabler/icons-react"
import type { Column } from "@tanstack/react-table"

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>
  title: string
}

/**
 * Clickable column header for sorting. Click cycle: ascending (A-Z) → descending (Z-A) →
 * return to default order. Columns without `enableSorting` render as plain text.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span>{title}</span>
  }

  const sorted = column.getIsSorted()
  const label =
    sorted === "asc"
      ? `${title}: urut naik. Klik untuk urut turun.`
      : sorted === "desc"
        ? `${title}: urut turun. Klik untuk kembali ke urutan bawaan.`
        : `Urutkan berdasarkan ${title}`

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-3"
      onClick={column.getToggleSortingHandler()}
      aria-label={label}
      title={label}
    >
      <span>{title}</span>
      {sorted === "asc" ? (
        <IconArrowUp aria-hidden="true" />
      ) : sorted === "desc" ? (
        <IconArrowDown aria-hidden="true" />
      ) : (
        <IconArrowsSort aria-hidden="true" className="text-muted-foreground" />
      )}
    </Button>
  )
}
