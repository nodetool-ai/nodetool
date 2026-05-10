import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, "");
  const apiTarget = env.PROXY_API_TARGET || "http://localhost:7777";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(here, "src")
      }
    },
    server: {
      port: 5173,
      proxy: {
        "/trpc": { target: apiTarget, changeOrigin: true },
        "/api": { target: apiTarget, changeOrigin: true },
        "/ws": { target: apiTarget, ws: true, changeOrigin: true }
      }
    }
  };
});
