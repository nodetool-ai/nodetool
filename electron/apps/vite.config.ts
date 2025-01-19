import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./", // Makes paths relative
  plugins: [react()],
  build: {
    outDir: "../build",
    sourcemap: true,
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
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
  optimizeDeps: {
    include: [
      "@chakra-ui/react",
      "@emotion/react",
      "@emotion/styled",
      "framer-motion",
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  esbuild: {
    loader: "tsx",
    include: /\.[jt]sx?$/,
    exclude: [],
  },
});
