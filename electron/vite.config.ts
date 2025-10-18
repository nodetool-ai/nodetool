import { defineConfig } from "vite";
import { resolve } from "path";
import electron from "vite-plugin-electron";
import react from "@vitejs/plugin-react";

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
      },
      {
        entry: "src/preload-workflow.ts",
        onstart(options) {
          options.reload();
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
