import { defineConfig } from "vite";
import { resolve } from "path";
import electron from "vite-plugin-electron";

export default defineConfig({
  base: "./",
  plugins: [
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
        main: resolve(__dirname, "src/index.ts"),
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
