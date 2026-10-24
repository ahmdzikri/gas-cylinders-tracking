import { DataTablePagination } from "@/components/table/data-table-pagination"
import { DataTableToolbar } from "@/components/table/data-table-toolbar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  type ColumnDef,
  type ColumnSizingState,
  type Header,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import * as React from "react"

/** State milik pemanggil untuk tabel mode server. */
export interface DataTableServerState {
  pagination: PaginationState
  onPaginationChange: (pagination: PaginationState) => void
  /** Urutan aktif (satu kolom). Kosong = urutan bawaan server. */
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  /** Kata kunci pencarian (dikendalikan pemanggil/URL). */
  filterValue?: string
  onFilterChange?: (value: string) => void
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  dataCount: number
  filterPlaceholder?: string
  filterLabel?: string
  isLoading?: boolean
  /** Permintaan latar berjalan (mis. pindah halaman) tanpa skeleton penuh. */
  isFetching?: boolean
  hideToolbar?: boolean
  toolbarFilters?: React.ReactNode
  toolbarActions?: React.ReactNode
  /** Konten pengganti baris saat data kosong (mis. empty state kaya). */
  emptyState?: React.ReactNode
  server?: DataTableServerState
  /**
   * Kunci localStorage untuk menyimpan lebar kolom hasil resize. Tanpa kunci, lebar
   * hanya bertahan selama halaman terbuka.
   */
  columnSizingStorageKey?: string
}

const MIN_COLUMN_WIDTH = 80
const MAX_COLUMN_WIDTH = 800

function readSizing(key: string | undefined): ColumnSizingState {
  if (!key || typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const out: ColumnSizingState = {}
    for (const [id, width] of Object.entries(parsed)) {
      if (typeof width === "number" && Number.isFinite(width)) {
        out[id] = Math.min(Math.max(width, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
      }
    }
    return out
  } catch {
    return {}
  }
}

export function DataTable<TData, TValue>({
  columns,
  data,
  dataCount,
  filterPlaceholder,
  filterLabel,
  isLoading = false,
  isFetching = false,
  hideToolbar = false,
  toolbarFilters,
  toolbarActions,
  emptyState,
  server,
  columnSizingStorageKey,
}: DataTableProps<TData, TValue>) {
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(
    () => readSizing(columnSizingStorageKey)
  )
  const [showSlowFetching, setShowSlowFetching] = React.useState(false)

  React.useEffect(() => {
    if (!isFetching || isLoading) {
      setShowSlowFetching(false)
      return
    }

    const timer = setTimeout(() => {
      setShowSlowFetching(true)
    }, 200)

    return () => clearTimeout(timer)
  }, [isFetching, isLoading])

  React.useEffect(() => {
    if (!columnSizingStorageKey) return
    try {
      window.localStorage.setItem(
        columnSizingStorageKey,
        JSON.stringify(columnSizing)
      )
    } catch {
      // Penyimpanan penuh/diblokir: lebar tetap berlaku untuk sesi ini.
    }
  }, [columnSizing, columnSizingStorageKey])

  const pagination = server?.pagination ?? { pageIndex: 0, pageSize: 10 }
  const sorting = server?.sorting ?? []

  const table = useReactTable({
    data,
    columns,
    defaultColumn: {
      size: 160,
      minSize: MIN_COLUMN_WIDTH,
      maxSize: MAX_COLUMN_WIDTH,
      enableSorting: Boolean(server?.onSortingChange),
    },
    state: {
      sorting,
      columnVisibility,
      columnSizing,
      pagination,
    },
    manualPagination: Boolean(server),
    manualSorting: Boolean(server),
    manualFiltering: Boolean(server),
    enableMultiSort: false,
    // Klik pertama selalu naik (A-Z / terlama dulu), lalu turun, lalu bawaan.
    sortDescFirst: false,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    rowCount: server ? dataCount : undefined,
    onPaginationChange: (updater) => {
      if (!server) return
      const next =
        typeof updater === "function" ? updater(server.pagination) : updater
      server.onPaginationChange(next)
    },
    onSortingChange: (updater) => {
      if (!server?.onSortingChange) return
      const next =
        typeof updater === "function" ? updater(server.sorting ?? []) : updater
      server.onSortingChange(next)
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
  })

  const hasCustomSizing = Object.keys(columnSizing).length > 0
  // Kolom pengisi kosong menyerap sisa lebar agar kolom hasil resize tidak diregangkan.
  // Diletakkan tepat sebelum kolom Aksi supaya tombol aksi tetap di tepi kanan.
  const fillerBefore = table
    .getVisibleLeafColumns()
    .some((column) => column.id === "actions")
    ? "actions"
    : null

  return (
    <div
      className="overflow-hidden rounded-xl border bg-card"
      aria-busy={isFetching || isLoading}
    >
      {!hideToolbar && (
        <DataTableToolbar
          table={table}
          filterPlaceholder={filterPlaceholder}
          filterLabel={filterLabel}
          filterValue={server?.filterValue}
          onFilterChange={server?.onFilterChange}
          actions={toolbarActions}
          onResetColumnWidths={
            hasCustomSizing ? () => table.resetColumnSizing(true) : undefined
          }
        >
          {toolbarFilters}
        </DataTableToolbar>
      )}
      <div
        className={cn(
          "relative overflow-x-auto",
          showSlowFetching &&
            "pointer-events-none opacity-40 transition-opacity duration-200"
        )}
      >
        {/* Lebar tiap kolom ditetapkan lewat <colgroup> (table-fixed). Bila total lebih kecil
            dari kontainer, kolom pengisi kosong di akhir menyerap sisa ruang sehingga lebar
            hasil resize tetap persis (tidak diregangkan proporsional). Bila lebih besar,
            tabel bisa digulir horizontal. */}
        <Table
          className="table-fixed"
          // oxlint-disable-next-line shadcn/no-inline-styles -- lebar dihitung runtime oleh TanStack (resize kolom)
          style={{ width: "100%", minWidth: table.getTotalSize() }}
        >
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <React.Fragment key={column.id}>
                {column.id === fillerBefore ? <col /> : null}
                <col
                  // oxlint-disable-next-line shadcn/no-inline-styles -- lebar dihitung runtime oleh TanStack (resize kolom)
                  style={{ width: column.getSize() }}
                />
              </React.Fragment>
            ))}
            {fillerBefore === null ? <col /> : null}
          </colgroup>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isActions = header.id === "actions"
                  const sorted = header.column.getIsSorted()
                  return (
                    <React.Fragment key={header.id}>
                      {header.column.id === fillerBefore ? (
                        <TableHead aria-hidden="true" className="p-0" />
                      ) : null}
                      <TableHead
                        scope="col"
                        colSpan={header.colSpan}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : header.column.getCanSort()
                                ? "none"
                                : undefined
                        }
                        className={cn(
                          "relative",
                          // oxlint-disable-next-line shadcn/require-static-classes -- class berasal dari meta kolom pemanggil
                          (
                            header.column.columnDef as {
                              meta?: { className?: string }
                            }
                          ).meta?.className,
                          isActions &&
                            "sticky right-0 z-10 border-l bg-card px-0 text-center"
                        )}
                        // oxlint-disable-next-line shadcn/no-inline-styles -- lebar dihitung runtime oleh TanStack (resize kolom)
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {header.column.getCanResize() ? (
                          <ColumnResizer header={header} />
                        ) : null}
                      </TableHead>
                    </React.Fragment>
                  )
                })}
                {fillerBefore === null ? (
                  <TableHead aria-hidden="true" className="p-0" />
                ) : null}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {table.getVisibleLeafColumns().map((col) => (
                    <React.Fragment key={`skeleton-cell-${col.id}`}>
                      {col.id === fillerBefore ? (
                        <TableCell aria-hidden="true" className="p-0" />
                      ) : null}
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </React.Fragment>
                  ))}
                  {fillerBefore === null ? (
                    <TableCell aria-hidden="true" className="p-0" />
                  ) : null}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const isActions = cell.column.id === "actions"
                    return (
                      <React.Fragment key={cell.id}>
                        {cell.column.id === fillerBefore ? (
                          <TableCell aria-hidden="true" className="p-0" />
                        ) : null}
                        <TableCell
                          className={cn(
                            // Isi lebih lebar dari kolom (hasil resize) dipotong; teks panjang
                            // memakai `truncate` di sel masing-masing.
                            "overflow-hidden",
                            // oxlint-disable-next-line shadcn/require-static-classes -- class berasal dari meta kolom pemanggil
                            (
                              cell.column.columnDef as {
                                meta?: { className?: string }
                              }
                            ).meta?.className,
                            isActions &&
                              "sticky right-0 z-10 border-l bg-card px-0 text-center"
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      </React.Fragment>
                    )
                  })}
                  {fillerBefore === null ? (
                    <TableCell aria-hidden="true" className="p-0" />
                  ) : null}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length + 1}
                  className="p-0"
                >
                  {emptyState ?? (
                    <p className="h-24 content-center text-center text-sm text-muted-foreground">
                      Tidak ada data yang cocok.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} dataCount={dataCount} />
    </div>
  )
}

const RESIZE_STEP = 16

function ColumnResizer<TData, TValue>({
  header,
}: {
  header: Header<TData, TValue>
}) {
  const column = header.column
  const title =
    (column.columnDef.meta as { title?: string } | undefined)?.title ??
    column.id
  const resizing = column.getIsResizing()

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ubah lebar kolom ${title}`}
      aria-valuenow={Math.round(header.getSize())}
      aria-valuemin={column.columnDef.minSize ?? MIN_COLUMN_WIDTH}
      aria-valuemax={column.columnDef.maxSize ?? MAX_COLUMN_WIDTH}
      tabIndex={0}
      title="Seret untuk mengubah lebar, klik ganda untuk mengembalikan"
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      onDoubleClick={() => column.resetSize()}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        event.preventDefault()
        const delta = event.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP
        const min = column.columnDef.minSize ?? MIN_COLUMN_WIDTH
        const max = column.columnDef.maxSize ?? MAX_COLUMN_WIDTH
        const next = Math.min(Math.max(header.getSize() + delta, min), max)
        header
          .getContext()
          .table.setColumnSizing((prev) => ({ ...prev, [column.id]: next }))
      }}
      className={cn(
        "absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-2 after:right-0.5 after:w-px after:bg-border",
        "hover:after:bg-primary focus-visible:outline-none focus-visible:after:w-0.5 focus-visible:after:bg-primary",
        resizing && "after:w-0.5 after:bg-primary"
      )}
    />
  )
}
