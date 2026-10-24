import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * Query client for the SPA. Created once per document via
 * `getContext()` (called from `router.tsx`).
 *
 * Query/mutation error toasts are handled in the calling component (page or
 * dialog) so the message is contextual; only the retry policy is defined here.
 */
export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status
          // 4xx tidak akan berubah bila diulang.
          if (typeof status === "number" && status >= 400 && status < 500) {
            return false
          }
          return failureCount < 2
        },
      },
    },
  })
  return { queryClient }
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
