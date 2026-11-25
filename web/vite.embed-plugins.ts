/**
 * Build plugins shared by the static demo pages the marketing site embeds
 * (vite.node-editor-embed.config.ts). Each demo imports a slice of the app
 * whose static import graph reaches most of it, so a plain build writes
 * every lazy chunk the app has. These plugins keep the output to what the
 * demo loads.
 */
import type { Plugin, Rollup } from "vite";

const EMPTY_LOCALE = "\0embed-empty-locale";

/** Every UI language but English loads as an empty table. */
export function englishOnlyPlugin(): Plugin {
  return {
    name: "embed-english-only",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        importer?.endsWith("src/i18n/i18n.ts") &&
        /^\.\/locales\/[\w-]+\.json$/.test(source) &&
        source !== "./locales/en.json"
      ) {
        return EMPTY_LOCALE;
      }
      return null;
    },
    load(id) {
      return id === EMPTY_LOCALE ? "export default {};" : null;
    }
  };
}

/**
 * Write only the entry's static import closure, plus lazy chunks whose
 * module matches `runtimeLazyModules`, and the CSS and assets they reference.
 * A lazy import of any other chunk fails at runtime, so the allowlist must
 * name every lazy module the demo reaches.
 */
export function pruneUnusedChunksPlugin(runtimeLazyModules: readonly RegExp[]): Plugin {
  return {
    name: "embed-prune",
    enforce: "post",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        (output): output is Rollup.OutputChunk => output.type === "chunk"
      );
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const keep = new Set<string>();
      const visit = (fileName: string): void => {
        const chunk = byName.get(fileName);
        if (!chunk || keep.has(fileName)) {
          return;
        }
        keep.add(fileName);
        chunk.imports.forEach(visit);
      };
      for (const chunk of chunks) {
        const lazyAtRuntime =
          chunk.facadeModuleId !== null &&
          runtimeLazyModules.some((pattern) => pattern.test(chunk.facadeModuleId ?? ""));
        if (chunk.isEntry || lazyAtRuntime) {
          visit(chunk.fileName);
        }
      }
      const kept = [...keep].map((fileName) => byName.get(fileName));
      const referenced = new Set<string>();
      for (const chunk of kept) {
        chunk?.viteMetadata?.importedCss.forEach((file) => referenced.add(file));
        chunk?.viteMetadata?.importedAssets.forEach((file) => referenced.add(file));
      }
      const keptCss = Object.values(bundle)
        .filter((output) => output.type === "asset" && referenced.has(output.fileName))
        .map((output) => (output.type === "asset" ? String(output.source) : ""))
        .join("\n");
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk") {
          if (!keep.has(fileName)) {
            delete bundle[fileName];
          }
          continue;
        }
        const isPage = fileName.endsWith(".html");
        const used =
          referenced.has(fileName) || keptCss.includes(fileName.split("/").pop() ?? fileName);
        if (!isPage && !used) {
          delete bundle[fileName];
        }
      }
    }
  };
}
