import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "./", // Makes paths relative
  build: {
    outDir: "build",
    rollupOptions: {
      input: {
        "run-workflow": resolve(__dirname, "run-workflow.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
