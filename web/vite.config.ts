import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tsrConfig from "./tsr.config.json"

const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:5080"

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: tsrConfig.routeFileIgnorePattern,
    }),
    viteReact(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Pecah vendor besar ke chunk terpisah supaya bundel utama tidak
        // melewati batas 500 kB dan cache antar-rilis lebih stabil.
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("@tanstack")) return "vendor-tanstack"
          if (id.includes("radix-ui") || id.includes("@radix-ui")) {
            return "vendor-radix"
          }
          if (id.includes("@tabler/icons")) return "vendor-icons"
          if (id.includes("react-dom") || id.includes("/react/")) {
            return "vendor-react"
          }
        },
      },
    },
  },
})
