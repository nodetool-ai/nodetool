/**
 * The script of the headless render page, as one ES module.
 *
 * A source checkout bundles `web/src/components/timeline/render/headless/
 * renderPage.ts` on first use, so an edit to the editor's exporter is what
 * the next server render runs. A built install has no web sources and reads
 * the bundle `npm run build` wrote into `dist/` (a registered package asset,
 * so the Electron and Docker bundles carry it).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolvePackageAssetPath } from "@nodetool-ai/config";

/** The web app, from `src/nodes/timeline/` or `dist/nodes/timeline/`. */
const WEB_ROOT = new URL("../../../../../web/", import.meta.url);
const PAGE_SOURCE = fileURLToPath(
  new URL("src/components/timeline/render/headless/renderPage.ts", WEB_ROOT)
);

/**
 * `node:` built-ins that shared timeline modules import for their server
 * paths, mapped to the stubs the web build uses (`web/vite.config.ts`).
 */
const NODE_BUILTIN_STUBS: Record<string, string> = {
  "node:crypto": "crypto-stub.js",
  "node:fs": "fs-stub.js",
  "node:fs/promises": "fs-promises-stub.js",
  "node:path": "path-stub.js",
  "node:url": "url-stub.js"
};

/** Compile the page from the web sources. */
export async function bundleTimelineRenderPage(): Promise<string> {
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [PAGE_SOURCE],
    bundle: true,
    // A module script: yoga-layout initializes with a top-level await.
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
    // Workspace packages resolve to their sources, as Vite resolves them.
    conditions: ["nodetool-dev"],
    // Shared web modules read Vite's `import.meta.env`; the page has no
    // backend URL or Supabase project of its own, so every key is unset.
    define: {
      "import.meta.env": JSON.stringify({ MODE: "production", DEV: false, PROD: true, SSR: false })
    },
    logLevel: "silent",
    plugins: [
      {
        name: "stub-node-builtins",
        setup(build) {
          build.onResolve({ filter: /^node:/ }, (args) => ({
            path: fileURLToPath(
              new URL(
                `vite-node-stubs/${NODE_BUILTIN_STUBS[args.path] ?? "empty.js"}`,
                WEB_ROOT
              )
            )
          }));
        }
      }
    ]
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error("The timeline render page bundle is empty");
  return output.text;
}

let pageScript: Promise<string> | undefined;

/** The page script, built once per process. */
export function loadTimelineRenderPage(): Promise<string> {
  pageScript ??= (
    existsSync(PAGE_SOURCE)
      ? bundleTimelineRenderPage()
      : readFile(
          resolvePackageAssetPath(
            { pkg: "@nodetool-ai/video-nodes", path: "timeline-render-page.js" },
            import.meta.url
          ),
          "utf8"
        )
  ).catch((error: unknown) => {
    pageScript = undefined;
    throw error;
  });
  return pageScript;
}
