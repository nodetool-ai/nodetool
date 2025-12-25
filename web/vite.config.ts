import { defineConfig, type ProxyOptions, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import viteTsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import { resolve } from "path";

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
    }
  };

  return {
    server: {
      allowedHosts: [".nodetool.ai", "localhost"],
      port: 3000,
      proxy: proxyConfig
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
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          miniapp: resolve(__dirname, "miniapp.html")
        },
        ...(isDebug
          ? {}
          : {
              output: {
                manualChunks: undefined
              }
            })
      }
    }
  } satisfies UserConfig;
});
