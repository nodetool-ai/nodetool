import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Copies the static MV3 manifest and the icon assets into the build output.
 *
 * The manifest already references the built output paths
 * (`background/service-worker.js`, `popup/popup.html`), so it is copied
 * verbatim rather than rewritten. Icons are sourced from the previous `dist/`
 * build, the only place they currently live in the repo.
 */
function copyStaticAssets(): Plugin {
  return {
    name: "nodetool-copy-static-assets",
    apply: "build",
    closeBundle() {
      const outDir = resolve(root, "dist");
      cpSync(resolve(root, "manifest.json"), resolve(outDir, "manifest.json"));

      const iconsSrc = resolve(root, "assets/icons");
      const iconsOut = resolve(outDir, "assets/icons");
      mkdirSync(iconsOut, { recursive: true });
      if (existsSync(iconsSrc)) {
        cpSync(iconsSrc, iconsOut, { recursive: true });
      }

      // Vite derives the HTML output path from the entry's path relative to
      // root, emitting it at `dist/src/popup/popup.html`. The manifest
      // references `popup/popup.html`, so relocate it and drop the empty
      // `src/` shell. The emitted asset references are root-absolute
      // (`/popup/popup.js`), which resolve correctly from the extension root.
      const emittedHtml = resolve(outDir, "src/popup/popup.html");
      const finalHtml = resolve(outDir, "popup/popup.html");
      if (existsSync(emittedHtml)) {
        mkdirSync(dirname(finalHtml), { recursive: true });
        renameSync(emittedHtml, finalHtml);
        rmSync(resolve(outDir, "src"), { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  root,
  plugins: [copyStaticAssets()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        "service-worker": resolve(root, "src/background/service-worker.ts"),
        popup: resolve(root, "src/popup/popup.html"),
      },
      output: {
        // Service worker must be a single classic-style module file at a
        // stable path that the manifest references.
        entryFileNames: (chunk) =>
          chunk.name === "service-worker"
            ? "background/service-worker.js"
            : "[name]/[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
