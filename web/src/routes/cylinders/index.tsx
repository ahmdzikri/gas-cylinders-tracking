import { createFileRoute, useNavigate, stripSearchParams } from "@tanstack/react-router"
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table"
import { useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"

import { CylinderFormDialog } from "@/components/cylinders/cylinder-form-dialog"
import { StatusBadge } from "@/components/cylinders/status-badge"
import { StatusChangeDialog } from "@/components/cylinders/status-change-dialog"
import { DataTable } from "@/components/table/data-table"
import { DataTableColumnHeader } from "@/components/table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/table/data-table-faceted-filter"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  type Cylinder,
  type CylinderSortField,
  SORT_FIELDS,
  STATUSES,
  statusLabel,
  useCylinders,
} from "@/lib/cylinders"
import { formatDateTime, useDebouncedValue } from "@/lib/utils"
import {
  IconAlertTriangle,
  IconDatabaseOff,
  IconDots,
  IconEye,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearchOff,
  IconSwitch,
} from "@tabler/icons-react"

const PAGE_SIZES = [10, 20, 50] as const

const STATUS_VALUES = STATUSES.map(
  (status) => status.toLowerCase() as Lowercase<(typeof STATUSES)[number]>
)

type StatusFilterValue = (typeof STATUS_VALUES)[number]
type StatusFilter = StatusFilterValue[]

const STATUS_OPTIONS = STATUSES.map((status) => ({
  value: status.toLowerCase() as StatusFilterValue,
  label: statusLabel(status),
}))

export interface ListSearch {
  search: string
  status: StatusFilter
  page: number
  pageSize: number
  sortBy?: CylinderSortField
  sortDir?: "asc" | "desc"
}

/**
 * Status filter URL param accepts the current JSON array form
 * (`?status=["empty","filled"]`) and the legacy single value (`?status=Empty`).
 * Values are lowercased, deduplicated and limited to known statuses.
 */
function normalizeStatusFilter(value: unknown): StatusFilter {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? [value]
      : []
  const values = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is StatusFilterValue =>
      (STATUS_VALUES as readonly string[]).includes(item)
    )
  return [...new Set(values)]
}

const statusFilterSchema = z
  .unknown()
  .optional()
  .transform(normalizeStatusFilter)
  .catch([])

const listSearchSchema = z.object({
  search: z.string().default("").catch(""),
  status: statusFilterSchema,
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (PAGE_SIZES as readonly number[]).includes(value))
    .default(10)
    .catch(10),
  sortBy: z.enum(SORT_FIELDS).optional().catch(undefined),
  sortDir: z.enum(["asc", "desc"]).optional().catch(undefined),
})

export const Route = createFileRoute("/cylinders/")({
  validateSearch: listSearchSchema,
  search: {
    middlewares: [stripSearchParams({ status: []})],
  },
  component: CylindersListPage,
})

function CylindersListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const [searchInput, setSearchInput] = useState(search.search)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Cylinder | null>(null)
  const [statusTarget, setStatusTarget] = useState<Cylinder | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)

  useEffect(() => {
    setSearchInput(search.search)
  }, [search.search])

  useDebouncedSearch(searchInput, (value) => {
    if (value === search.search) return
    void navigate({
      search: (prev) => ({ ...prev, search: value, page: 1 }),
      replace: true,
    })
  })

  const params = {
    search: search.search,
    status: search.status,
    page: search.page,
    pageSize: search.pageSize,
    ...(search.sortBy
      ? { sortBy: search.sortBy, sortDir: search.sortDir ?? "asc" }
      : {}),
  }

  const sorting: SortingState = search.sortBy
    ? [{ id: search.sortBy, desc: search.sortDir === "desc" }]
    : []

  const query = useCylinders(params)
  const hasFilters = search.search.trim() !== "" || search.status.length > 0

  const totalCount = query.data?.totalCount ?? 0
  const itemsLength = query.data?.items.length ?? 0
  useEffect(() => {
    if (query.isFetching) return
    if (itemsLength !== 0 || totalCount === 0) return
    const lastPage = Math.max(Math.ceil(totalCount / search.pageSize), 1)
    if (search.page === lastPage) return
    void navigate({
      search: (prev) => ({ ...prev, page: lastPage }),
      replace: true,
    })
  }, [
    query.isFetching,
    itemsLength,
    totalCount,
    search.page,
    search.pageSize,
    navigate,
  ])

  const pagination: PaginationState = {
    pageIndex: search.page - 1,
    pageSize: search.pageSize,
  }

  const columns = useMemo<ColumnDef<Cylinder>[]>(
    () => [
      {
        accessorKey: "serialNumber",
        size: 160,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Serial Number" />
        ),
        meta: { title: "Serial Number" },
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {row.original.serialNumber}
          </span>
        ),
      },
      {
        accessorKey: "gasType",
        size: 150,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tipe Gas" />
        ),
        meta: { title: "Tipe Gas" },
      },
      {
        accessorKey: "status",
        size: 150,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        meta: { title: "Status" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "customerName",
        size: 280,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Pelanggan" />
        ),
        meta: { title: "Pelanggan" },
        cell: ({ row }) => {
          const name = row.original.customerName
          if (!name) return <span className="text-muted-foreground">—</span>
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate">{name}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs break-words">
                {name}
              </TooltipContent>
            </Tooltip>
          )
        },
      },
      {
        accessorKey: "lastUpdated",
        size: 200,
        enableResizing: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Terakhir Diperbarui" />
        ),
        meta: { title: "Terakhir Diperbarui" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDateTime(row.original.lastUpdated)}
          </span>
        ),
      },
      {
        id: "actions",
        size: 56,
        minSize: 56,
        maxSize: 56,
        enableResizing: false,
        enableSorting: false,
        header: () => <span className="sr-only">Aksi</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <RowActions
            cylinder={row.original}
            onDetail={() =>
              void navigate({
                to: "/cylinders/$id",
                params: { id: String(row.original.id) },
              })
            }
            onEdit={() => {
              setEditing(row.original)
              setFormOpen(true)
            }}
            onStatus={() => {
              setStatusTarget(row.original)
              setStatusOpen(true)
            }}
          />
        ),
      },
    ],
    [navigate]
  )

  const resetFilters = () => {
    setSearchInput("")
    void navigate({
      search: {
        search: "",
        status: [],
        page: 1,
        pageSize: search.pageSize,
        sortBy: search.sortBy,
        sortDir: search.sortDir,
      },
      replace: true,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">Daftar Tabung</h1>
          <p className="text-sm text-muted-foreground">
            Kelola data tabung gas: cari, filter, dan ubah status.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <IconPlus aria-hidden="true" />
          Tambah Tabung
        </Button>
      </div>

      {query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : "Gagal memuat daftar tabung."
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          dataCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          columnSizingStorageKey="samator-cylinders-column-widths"
          filterPlaceholder="Cari serial atau pelanggan..."
          filterLabel="Cari tabung"
          server={{
            pagination,
            sorting,
            onSortingChange: (next) => {
              const first = next[0]
              void navigate({
                search: (prev) => ({
                  ...prev,
                  sortBy: first ? (first.id as CylinderSortField) : undefined,
                  sortDir: first ? (first.desc ? "desc" : "asc") : undefined,
                  page: 1,
                }),
                replace: true,
              })
            },
            onPaginationChange: (next) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  page:
                    next.pageSize !== prev.pageSize ? 1 : next.pageIndex + 1,
                  pageSize: next.pageSize as 10 | 20 | 50,
                }),
              })
            },
            filterValue: searchInput,
            onFilterChange: setSearchInput,
          }}
          toolbarFilters={
            <DataTableFacetedFilter
              title="Status"
              options={STATUS_OPTIONS}
              selectedValues={search.status}
              onSelectedValuesChange={(values) => {
                void navigate({
                  search: (prev) => ({ ...prev, status: values, page: 1 }),
                  replace: true,
                })
              }}
            />
          }
          emptyState={
            hasFilters ? (
              <NoResults onReset={resetFilters} />
            ) : (
              <NoData
                onCreate={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              />
            )
          }
        />
      )}

      <CylinderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        cylinder={editing}
      />

      {statusTarget ? (
        <StatusChangeDialog
          open={statusOpen}
          onOpenChange={setStatusOpen}
          cylinder={statusTarget}
        />
      ) : null}
    </div>
  )
}

function useDebouncedSearch(value: string, onChange: (value: string) => void) {
  const debounced = useDebouncedValue(value, 300)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    onChangeRef.current(debounced.trim())
  }, [debounced])
}

function RowActions({
  cylinder,
  onDetail,
  onEdit,
  onStatus,
}: {
  cylinder: Cylinder
  onDetail: () => void
  onEdit: () => void
  onStatus: () => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Aksi untuk ${cylinder.serialNumber}`}
        >
          <IconDots aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onDetail}>
          <IconEye aria-hidden="true" />
          Detail
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <IconPencil aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onStatus}>
          <IconSwitch aria-hidden="true" />
          Ubah Status
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NoData({ onCreate }: { onCreate: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconDatabaseOff aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Belum ada tabung</EmptyTitle>
        <EmptyDescription>
          Tambahkan tabung pertama untuk mulai mencatat status dan pelanggan.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreate}>
          <IconPlus aria-hidden="true" />
          Tambah Tabung
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconSearchOff aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Tidak ada hasil</EmptyTitle>
        <EmptyDescription>
          Tidak ada tabung yang cocok dengan pencarian atau filter Anda.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onReset}>
          Reset filter
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconAlertTriangle
            aria-hidden="true"
            className="size-5 text-destructive-strong"
          />
          Gagal memuat data
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={onRetry} className="w-fit">
          <IconRefresh aria-hidden="true" />
          Coba lagi
        </Button>
      </CardContent>
    </Card>
  )
}
