import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import type { Table } from "@tanstack/react-table"

const PAGE_SIZE_OPTIONS = [10, 20, 50]

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  dataCount: number
}

/**
 * Pagination footer. Page state is fully owned by the caller (server mode
 * passes it to the URL via `onPaginationChange`); this component never
 * mutates the URL directly.
 */
export function DataTablePagination<TData>({
  table,
  dataCount,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize: currentPageSize } = table.getState().pagination
  const currentPage = pageIndex + 1
  const pageCount = Math.max(Math.ceil(dataCount / currentPageSize), 1)

  const pageSizeOptions = Array.from(
    new Set([...PAGE_SIZE_OPTIONS, currentPageSize])
  ).sort((a, b) => a - b)

  // Nomor halaman yang ditampilkan: 1, sekitar halaman aktif, terakhir;
  // celah diwakili elipsis. Di ponsel hanya "Hal. x/y" + prev/next.
  const pageItems: (number | "gap-start" | "gap-end")[] = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    if (
      pageNumber === 1 ||
      pageNumber === pageCount ||
      Math.abs(pageNumber - currentPage) <= 1
    ) {
      pageItems.push(pageNumber)
    } else if (pageNumber === 2 && currentPage > 3) {
      pageItems.push("gap-start")
    } else if (pageNumber === pageCount - 1 && currentPage < pageCount - 2) {
      pageItems.push("gap-end")
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="hidden text-sm text-muted-foreground md:inline"
        >
          Baris per halaman
        </span>
        <Select
          value={`${currentPageSize}`}
          onValueChange={(value) => {
            // Satu panggilan: dua panggilan terpisah (setPageSize lalu
            // setPageIndex) sama-sama memakai `pagination` dari props server
            // yang masih basi, sehingga perubahan ukuran halaman tertimpa.
            table.setPagination({ pageIndex: 0, pageSize: Number(value) })
          }}
        >
          <SelectTrigger aria-label="Baris per halaman" className="w-20">
            <SelectValue placeholder={currentPageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {pageSizeOptions.map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="hidden text-sm text-muted-foreground md:block">
          Total data: {dataCount}
        </p>
      </div>
      <nav
        aria-label="Navigasi halaman tabel"
        className="flex items-center gap-1"
      >
        <Button
          variant="outline"
          size="icon"
          aria-label="Halaman sebelumnya"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <IconChevronLeft />
        </Button>
        <span className="px-2 text-sm text-muted-foreground sm:hidden">
          Hal. {currentPage}/{pageCount}
        </span>
        {pageItems.map((item) => {
          if (item === "gap-start" || item === "gap-end") {
            return (
              <span
                key={item}
                aria-hidden="true"
                className="hidden px-1 text-sm text-muted-foreground sm:inline"
              >
                …
              </span>
            )
          }
          const isCurrent = item === currentPage
          return (
            <Button
              key={item}
              variant={isCurrent ? "default" : "outline"}
              size="icon"
              className="hidden sm:inline-flex"
              aria-label={`Halaman ${item}`}
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => table.setPageIndex(item - 1)}
            >
              {item}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          aria-label="Halaman berikutnya"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <IconChevronRight />
        </Button>
      </nav>
    </div>
  )
}
