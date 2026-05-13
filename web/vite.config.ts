import { defineConfig, loadEnv, type ProxyOptions, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const rootNodeModules = resolve(configDir, "../node_modules");

export default defineConfig(async ({ mode }) => {
  // Load all env vars (including non-VITE_ prefixed ones) for server-side config
  const env = loadEnv(mode, configDir, "");
  const browserslistToEsbuild = (await import("browserslist-to-esbuild"))
    .default;
  const isDebug = mode === "debug";

  const apiTarget = env.PROXY_API_TARGET || "http://localhost:7777";
  const proxyConfig: Record<string, ProxyOptions> = {
    "/api": {
      target: apiTarget,
      changeOrigin: true,
      secure: false
    },
    "/comfy-api": {
      target: "http://localhost:8000",
      changeOrigin: true,
      secure: false,
      ws: true,
      rewrite: (path) => path.replace(/^\/comfy-api/, "/api")
    },
    "/ws": {
      target: apiTarget,
      ws: true,
      changeOrigin: true
    },
    "/trpc": {
      target: apiTarget,
      changeOrigin: true,
      secure: false
    },
    "/storage": {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
      rewrite: (path) => path.replace(/^\/storage/, "/api/storage")
    }
  };

  return {
    server: {
      allowedHosts: [".nodetool.ai", "localhost"],
      port: 3000,
      proxy: proxyConfig
    },
    optimizeDeps: {
      include: [
        "superjson",
        "@trpc/client",
        "@trpc/react-query",
        "@trpc/server",
        "@tanstack/react-query",
      ],
      exclude: [
        "monaco-editor",
        "@monaco-editor/react",
        "@monaco-editor/loader",
      ]
    },
    resolve: {
      // Use the `nodetool-dev` export condition so @nodetool-ai/* packages
      // resolve to their `src/*.ts` sources instead of built `dist/*.js`.
      // This is the repo-wide convention declared in each package's exports.
      conditions: ["nodetool-dev", "import", "module", "browser", "default"],
      alias: {
        "monaco-editor": resolve(rootNodeModules, "monaco-editor"),
      },
      tsconfigPaths: true,
    },
    plugins: [
      react({
        jsxImportSource: "@emotion/react",
        babel: {
          plugins: ["@emotion/babel-plugin"]
        }
      }),
      svgr()
    ],
    build: {
      target: browserslistToEsbuild([">0.2%", "not dead", "not op_mini all"]),
      sourcemap: isDebug,
      minify: isDebug ? false : "esbuild",
      ...(isDebug
        ? {}
        : {
            rollupOptions: {
              external: ["web-worker"],
              output: {
                manualChunks: (id: string) => {
                  if (id.includes("react-plotly.js") || id.includes("plotly")) return "vendor-plotly";
                  if (id.includes("wavesurfer")) return "vendor-waveform";
                  if (id.includes("react-pdf") || id.includes("pdfjs")) return "vendor-pdf";
                  if (id.includes("@monaco-editor") || id.includes("lexical")) return "vendor-editor";
                  if (id.includes("three") || id.includes("@react-three")) return "vendor-three";
                  if (id.includes("@mui") || id.includes("@emotion")) return "vendor-mui";
                  if (
                    id.includes("/node_modules/react/") ||
                    id.includes("/node_modules/react-dom/") ||
                    id.includes("/node_modules/react-router")
                  ) return "vendor-react";
                }
              }
            }
          })
    }
  } satisfies UserConfig;
});
