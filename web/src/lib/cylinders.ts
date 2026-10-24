import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { z } from "zod"

import { ApiError, api } from "@/lib/api"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export const GAS_TYPES = [
  "Oxygen",
  "Nitrogen",
  "Argon",
  "Carbon Dioxide",
  "Acetylene",
  "Hydrogen",
] as const

export type GasType = (typeof GAS_TYPES)[number]

export const STATUSES = [
  "Empty",
  "Filled",
  "Delivered",
  "InMaintenance",
  "Retired",
] as const

export type CylinderStatus = (typeof STATUSES)[number]

export interface Cylinder {
  id: number
  serialNumber: string
  gasType: GasType
  status: CylinderStatus
  customerName: string | null
  lastUpdated: string
}

export interface CylinderListResponse {
  items: Cylinder[]
  page: number
  pageSize: number
  totalCount: number
}

export interface CylinderMeta {
  gasTypes: string[]
  statuses: string[]
  transitions: Record<string, string[]>
}

export const SORT_FIELDS = [
  "serialNumber",
  "gasType",
  "status",
  "customerName",
  "lastUpdated",
] as const

export type CylinderSortField = (typeof SORT_FIELDS)[number]
export type SortDirection = "asc" | "desc"

export interface CylinderListParams {
  search?: string
  status?: string[]
  page: number
  pageSize: number
  sortBy?: CylinderSortField
  sortDir?: SortDirection
}

/* -------------------------------------------------------------------------- */
/* Domain helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fallback copy of transition rules. The source of truth remains `GET /api/cylinders/meta`;
 * this constant is only used when meta is not loaded or failed to load.
 */
export const TRANSITIONS: Record<CylinderStatus, CylinderStatus[]> = {
  Empty: ["Filled", "InMaintenance", "Retired"],
  Filled: ["Delivered", "InMaintenance", "Retired"],
  Delivered: ["Empty"],
  InMaintenance: ["Empty", "Retired"],
  Retired: [],
}

const STATUS_LABELS: Record<CylinderStatus, string> = {
  Empty: "Empty",
  Filled: "Filled",
  Delivered: "Delivered",
  InMaintenance: "In Maintenance",
  Retired: "Retired",
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as CylinderStatus] ?? status
}

export function isCylinderStatus(value: string): value is CylinderStatus {
  return (STATUSES as readonly string[]).includes(value)
}

/** Allowed next statuses; uses server meta when available. */
export function nextStatuses(
  status: string,
  meta?: CylinderMeta
): CylinderStatus[] {
  const fromMeta = meta?.transitions?.[status]
  const values = fromMeta ?? TRANSITIONS[status as CylinderStatus] ?? []
  return values.filter(isCylinderStatus)
}

export const SERIAL_PATTERN = /^CYL-\d{6}$/i

/* -------------------------------------------------------------------------- */
/* Zod schemas (mirror server rules)                                          */
/* -------------------------------------------------------------------------- */

export const cylinderFormSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .min(1, "Serial number wajib diisi.")
    .regex(
      SERIAL_PATTERN,
      "Format serial harus CYL- diikuti 6 angka, contoh CYL-123456."
    ),
  gasType: z.enum(GAS_TYPES, { message: "Pilih tipe gas." }),
})

export type CylinderFormValues = z.infer<typeof cylinderFormSchema>

export const statusChangeSchema = z
  .object({
    status: z.enum(STATUSES, { message: "Pilih status tujuan." }),
    customerName: z.string().max(120, "Nama pelanggan maksimal 120 karakter."),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "Delivered") return
    if (!value.customerName.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Nama pelanggan wajib diisi untuk status Delivered.",
      })
    }
  })

export type StatusChangeValues = z.infer<typeof statusChangeSchema>

/** Normalize input to server-send format (trim + upper). */
export function normalizeSerial(serialNumber: string): string {
  return serialNumber.trim().toUpperCase()
}

/* -------------------------------------------------------------------------- */
/* Query keys                                                                 */
/* -------------------------------------------------------------------------- */

export const cylinderKeys = {
  all: ["cylinders"] as const,
  list: (params: CylinderListParams) =>
    [...cylinderKeys.all, "list", params] as const,
  detail: (id: number) => [...cylinderKeys.all, "detail", id] as const,
  meta: () => [...cylinderKeys.all, "meta"] as const,
}

/* -------------------------------------------------------------------------- */
/* API calls                                                                  */
/* -------------------------------------------------------------------------- */

export function fetchCylinders(
  params: CylinderListParams,
  signal?: AbortSignal
): Promise<CylinderListResponse> {
  return api.get<CylinderListResponse>("/cylinders", { ...params }, signal)
}

export function fetchCylinder(id: number): Promise<Cylinder> {
  return api.get<Cylinder>(`/cylinders/${id}`)
}

export function fetchCylinderMeta(): Promise<CylinderMeta> {
  return api.get<CylinderMeta>("/cylinders/meta")
}

export interface CreateCylinderInput {
  serialNumber: string
  gasType: GasType
}

export interface UpdateCylinderInput extends CreateCylinderInput {}

export interface ChangeStatusInput {
  status: CylinderStatus
  customerName?: string | null
}

export function createCylinder(input: CreateCylinderInput): Promise<Cylinder> {
  return api.post<Cylinder>("/cylinders", input)
}

export function updateCylinder(
  id: number,
  input: UpdateCylinderInput
): Promise<Cylinder> {
  return api.put<Cylinder>(`/cylinders/${id}`, input)
}

export function changeCylinderStatus(
  id: number,
  input: ChangeStatusInput
): Promise<Cylinder> {
  return api.post<Cylinder>(`/cylinders/${id}/status`, input)
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

export function useCylinders(params: CylinderListParams) {
  return useQuery({
    queryKey: cylinderKeys.list(params),
    queryFn: ({ signal }) => fetchCylinders(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useCylinder(id: number) {
  return useQuery({
    queryKey: cylinderKeys.detail(id),
    queryFn: () => fetchCylinder(id),
    enabled: Number.isFinite(id) && id > 0,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false
      return failureCount < 2
    },
  })
}

export function useCylinderMeta() {
  return useQuery({
    queryKey: cylinderKeys.meta(),
    queryFn: fetchCylinderMeta,
    staleTime: 5 * 60_000,
  })
}

export function useCreateCylinder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCylinder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cylinderKeys.all })
    },
  })
}

export function useUpdateCylinder(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateCylinderInput) => updateCylinder(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cylinderKeys.all })
    },
  })
}

export function useChangeCylinderStatus(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ChangeStatusInput) => changeCylinderStatus(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cylinderKeys.all })
    },
  })
}
