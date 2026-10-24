import { DataTableViewOptions } from "@/components/table/data-table-view-options"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IconArrowsHorizontal, IconX } from "@tabler/icons-react"
import type { Table } from "@tanstack/react-table"
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  filterPlaceholder?: string
  filterLabel?: string
  filterValue?: string
  onFilterChange?: (value: string) => void
  children?: ReactNode
  actions?: ReactNode
  onResetColumnWidths?: () => void
}

function labelFromPlaceholder(placeholder?: string): string {
  const label = placeholder?.replace(/(\.\.\.|…)\s*$/, "").trim()
  return label || "Filter data tabel"
}

export function DataTableToolbar<TData>({
  table,
  filterPlaceholder,
  filterLabel,
  filterValue = "",
  onFilterChange,
  children,
  actions,
  onResetColumnWidths,
}: DataTableToolbarProps<TData>) {
  const handleFilterChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFilterChange?.(event.target.value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.preventDefault()
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={filterLabel ?? labelFromPlaceholder(filterPlaceholder)}
          placeholder={filterPlaceholder ?? "Cari..."}
          value={filterValue}
          onChange={handleFilterChange}
          onKeyDown={handleKeyDown}
          className="w-40 lg:w-64"
        />
        {filterValue ? (
          <Button
            variant="outline"
            size="icon"
            aria-label="Hapus filter"
            onClick={() => onFilterChange?.("")}
          >
            <IconX />
          </Button>
        ) : null}
        {children}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onResetColumnWidths ? (
          <Button variant="outline" onClick={onResetColumnWidths}>
            <IconArrowsHorizontal aria-hidden="true" />
            Reset lebar kolom
          </Button>
        ) : null}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}
