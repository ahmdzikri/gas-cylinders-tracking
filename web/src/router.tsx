import * as TanstackQuery from "@/integrations/tanstack-query/root-provider"
import { routeTree } from "@/routeTree.gen"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"

export function getRouter() {
  const rqContext = TanstackQuery.getContext()

  return createTanStackRouter({
    routeTree,
    context: {
      ...rqContext,
    },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
