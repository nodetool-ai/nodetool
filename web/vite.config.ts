import { defineConfig, loadEnv, type ProxyOptions, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import viteTsconfigPaths from "vite-tsconfig-paths";
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
      // Use the `nodetool-dev` export condition so @nodetool/* packages
      // resolve to their `src/*.ts` sources instead of built `dist/*.js`.
      // This is the repo-wide convention declared in each package's exports.
      conditions: ["nodetool-dev", "import", "module", "browser", "default"],
      alias: {
        "monaco-editor": resolve(rootNodeModules, "monaco-editor"),
      },
    },
    plugins: [
      react({
        jsxImportSource: "@emotion/react",
        babel: {
          plugins: ["@emotion/babel-plugin"]
        }
      }),
      viteTsconfigPaths({
        // Skip Electron build output directories — they contain bundled npm
        // packages with tsconfig.json files whose "extends" targets (e.g.
        // @ljharb/tsconfig) are not installed in the stripped bundle.
        ignoreConfigErrors: true,
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
                manualChunks: {
                  "vendor-react": ["react", "react-dom", "react-router-dom"],
                  "vendor-mui": [
                    "@mui/material",
                    "@mui/icons-material",
                    "@emotion/react",
                    "@emotion/styled"
                  ],
                  "vendor-plotly": ["react-plotly.js"],
                  "vendor-three": [
                    "three",
                    "@react-three/fiber",
                    "@react-three/drei"
                  ],
                  "vendor-editor": ["@monaco-editor/react", "lexical"],
                  "vendor-waveform": ["wavesurfer.js"]
                }
              }
            }
          })
    }
  } satisfies UserConfig;
});
