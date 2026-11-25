/**
 * Builds the node editor demo (node-editor-embed.html) as a static page for
 * the marketing site: `npm run build:node-editor-embed`.
 *
 * Output goes to marketing/public/embed/node-editor/, served at
 * /embed/node-editor/. The app's own config supplies resolution, stubs and
 * plugins. This file changes the entry, the base path and the output folder,
 * keeps the interface English only, and writes only the chunks the demo
 * loads (see vite.embed-plugins.ts).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ConfigEnv, type Plugin, type UserConfig } from "vite";

import appConfig from "./vite.config";
import { englishOnlyPlugin, pruneUnusedChunksPlugin } from "./vite.embed-plugins";

const configDir = dirname(fileURLToPath(import.meta.url));
const BASE = "/embed/node-editor/";
const OUT_DIR = resolve(configDir, "../marketing/public/embed/node-editor");

const NO_BROWSER_RUNNER = "\0node-editor-embed-no-browser-runner";

/** Lazy chunks the demo loads, by the module they start from. */
const RUNTIME_LAZY_MODULES: RegExp[] = [/node-editor-embed-no-browser-runner$/];

/**
 * Leave the in-browser workflow runner out. The demo's generation nodes run
 * only on a server, so Run always takes the server path, which the demo
 * answers in the page. Without this the app loads the runner to check, from
 * chunks the build does not write.
 */
function noBrowserRunnerPlugin(): Plugin {
  return {
    name: "node-editor-embed-no-browser-runner",
    enforce: "pre",
    resolveId(source, importer) {
      const fromRunner =
        (source === "./browserWorkerClient" && importer?.endsWith("browserWorkflowRunner.ts")) ||
        source === "@nodetool-ai/workflow-runner/browser";
      return fromRunner ? NO_BROWSER_RUNNER : null;
    },
    load(id) {
      return id === NO_BROWSER_RUNNER
        ? 'throw new Error("The browser workflow runner is not part of this demo.");'
        : null;
    }
  };
}

export default defineConfig(async (env: ConfigEnv) => {
  const resolved = (await (typeof appConfig === "function" ? appConfig(env) : appConfig)) as UserConfig;
  const build = resolved.build ?? {};
  const prune = process.env.EMBED_NO_PRUNE === "1" ? [] : [pruneUnusedChunksPlugin(RUNTIME_LAZY_MODULES)];
  return {
    ...resolved,
    base: BASE,
    publicDir: false,
    plugins: [englishOnlyPlugin(), noBrowserRunnerPlugin(), ...(resolved.plugins ?? []), ...prune],
    build: {
      ...build,
      outDir: OUT_DIR,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        ...build.rollupOptions,
        input: resolve(configDir, "node-editor-embed.html")
      }
    }
  } satisfies UserConfig;
});
