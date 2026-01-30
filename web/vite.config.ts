import { defineConfig, type ProxyOptions, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import viteTsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";

export default defineConfig(async ({ mode }) => {
  const browserslistToEsbuild = (await import("browserslist-to-esbuild"))
    .default;
  const isDebug = mode === "debug";

  const proxyConfig: Record<string, ProxyOptions> = {
    "/api": {
      target: "http://localhost:7777",
      changeOrigin: true,
      secure: false
    },
    "/ws": {
      target: "http://localhost:7777",
      ws: true,
      changeOrigin: true
    },
    "/storage": {
      target: "http://localhost:7777",
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
      exclude: ["@tanstack/react-query"]
    },
    plugins: [
      react({
        jsxImportSource: "@emotion/react",
        babel: {
          plugins: ["@emotion/babel-plugin"]
        }
      }),
      viteTsconfigPaths(),
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
              output: {
                manualChunks: {
                  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                  'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
                  'vendor-plotly': ['react-plotly.js'],
                  'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
                  'vendor-editor': ['@monaco-editor/react', 'lexical'],
                  'vendor-pdf': ['react-pdf'],
                  'vendor-waveform': ['wavesurfer.js'],
                }
              }
            }
          })
    }
  } satisfies UserConfig;
});
