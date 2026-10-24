/**
 * Typed HTTP client for the Gas Cylinders API.
 *
 * All server errors (RFC 7807 ProblemDetails) are thrown as `ApiError`
 * carrying the HTTP status, `title`, `detail`, and per-field `errors`.
 * Network errors (fetch rejection / non-JSON body) also become `ApiError`
 * with `status: 0` and a generic message.
 */

export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  readonly status: number
  readonly title?: string
  readonly detail?: string
  readonly errors?: Record<string, string[]>

  constructor(status: number, problem: ProblemDetails = {}) {
    super(problem.detail || problem.title || defaultMessage(status))
    this.name = "ApiError"
    this.status = status
    this.title = problem.title
    this.detail = problem.detail
    this.errors = problem.errors
  }

  /** Short summary message suitable for toasts. */
  get summary(): string {
    return this.detail || this.title || defaultMessage(this.status)
  }

  /** List of [field, messages[]] entries ready to render. */
  get fieldErrors(): Array<[string, string[]]> {
    return Object.entries(this.errors ?? {})
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

/** Display labels for ProblemDetails `errors` field keys. */
export const FIELD_LABELS: Record<string, string> = {
  serialNumber: "Serial Number",
  gasType: "Tipe Gas",
  status: "Status",
  customerName: "Nama Pelanggan",
  page: "Halaman",
  pageSize: "Ukuran Halaman",
  sortBy: "Kolom Urut",
  sortDir: "Arah Urut",
  body: "Isi Permintaan",
}

/**
 * Display label for a single `errors` key. The first character is normalized
 * to lowercase (`SerialNumber` → `serialNumber`), matching `applyFieldErrors`,
 * so PascalCase keys still get a label. Unknown keys are returned as-is.
 */
export function fieldLabel(field: string): string {
  const normalized = field.charAt(0).toLowerCase() + field.slice(1)
  return FIELD_LABELS[normalized] ?? field
}

/**
 * Map ProblemDetails `errors` to matching react-hook-form fields.
 * Server field names (PascalCase) are normalized to camelCase before matching.
 */
export function applyFieldErrors<TName extends string>(
  error: ApiError,
  setError: (name: TName, error: { type: string; message: string }) => void,
  fields: readonly TName[]
) {
  for (const [field, messages] of error.fieldErrors) {
    const name = field.charAt(0).toLowerCase() + field.slice(1)
    if (messages.length === 0) continue
    if (!(fields as readonly string[]).includes(name)) continue
    setError(name as TName, { type: "server", message: messages.join(" ") })
  }
}

function defaultMessage(status: number): string {
  if (status === 0) {
    return "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi."
  }
  if (status === 400) return "Permintaan tidak valid."
  if (status === 404) return "Data tidak ditemukan."
  if (status === 409) return "Terjadi konflik data."
  if (status >= 500) return "Terjadi kesalahan pada server."
  return "Terjadi kesalahan."
}

const API_BASE = "/api"

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = `${API_BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      params.set(key, JSON.stringify(value))
      continue
    }
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `${url}?${search}` : url
}

async function parseProblem(response: Response): Promise<ProblemDetails> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("json")) {
    return {}
  }
  try {
    return (await response.json()) as ProblemDetails
  } catch {
    return {}
  }
}

async function request<T>(
  method: string,
  path: string,
  options: {
    query?: Record<string, unknown>
    body?: unknown
    signal?: AbortSignal
  } = {}
): Promise<T> {
  const { query, body, signal } = options

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error
    throw new ApiError(0, {
      title: "Koneksi gagal",
      detail:
        "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.",
    })
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseProblem(response))
  }

  if (response.status === 204) return undefined as T

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError(response.status, {
      title: "Respons tidak valid",
      detail: "Server mengembalikan respons yang tidak dapat dibaca.",
    })
  }
}

export const api = {
  get: <T>(
    path: string,
    query?: Record<string, unknown>,
    signal?: AbortSignal
  ) => request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
}
