import { defineConfig } from "vite";
import { resolve } from "path";
import electron from "vite-plugin-electron";
import react from "@vitejs/plugin-react";

// Node.js built-in modules to externalize in Electron builds
const builtins = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "punycode",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "vm",
  "worker_threads",
  "zlib",
];

// All modules to externalize for preload
const externalModules = ["electron", "electron/common", ...builtins];

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    electron([
      {
        entry: "src/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            emptyOutDir: true,
            rollupOptions: {
              external: externalModules,
              output: {
                format: "cjs",
                entryFileNames: "[name].js",
              },
            },
          },
        },
      },
      {
        entry: "src/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: externalModules,
              output: {
                format: "cjs",
                entryFileNames: "[name].js",
              },
            },
          },
        },
      },
      {
        entry: "src/preload-workflow.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: externalModules,
              output: {
                format: "cjs",
                entryFileNames: "[name].js",
              },
            },
          },
        },
      },
    ]),
  ],
  build: {
    sourcemap: true,
    outDir: "dist-web",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        packages: resolve(__dirname, "pages/packages.html"),
        logs: resolve(__dirname, "pages/logs.html"),
        settings: resolve(__dirname, "pages/settings.html"),
      },
      output: {
        format: "es",
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
