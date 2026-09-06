import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

/** HTML entries, by the directory the manifest expects them in. */
const HTML_PAGES = ["popup", "sidepanel"] as const;

/**
 * Copies the static MV3 manifest and the icon assets into the build output,
 * and moves the emitted HTML pages to the paths the manifest references.
 *
 * The manifest already references the built output paths
 * (`background/service-worker.js`, `popup/popup.html`,
 * `sidepanel/sidepanel.html`), so it is copied verbatim rather than rewritten.
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

      // Vite derives each HTML output path from the entry's path relative to
      // root, emitting them under `dist/src/<page>/`. The manifest references
      // `<page>/<page>.html`, so relocate them and drop the empty `src/` shell.
      // The emitted asset references are root-absolute (`/popup/popup.js`),
      // which resolve correctly from the extension root.
      for (const page of HTML_PAGES) {
        const emitted = resolve(outDir, `src/${page}/${page}.html`);
        const final = resolve(outDir, `${page}/${page}.html`);
        if (existsSync(emitted)) {
          mkdirSync(dirname(final), { recursive: true });
          renameSync(emitted, final);
        }
      }
      rmSync(resolve(outDir, "src"), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  root,
  plugins: [react(), copyStaticAssets()],
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
        sidepanel: resolve(root, "src/sidepanel/sidepanel.html"),
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
