/**
 * Bundle the RenderToImage headless page (three.js + render core) into a
 * single self-contained IIFE the Node backend injects into headless Chromium
 * via CDP (`render3d-headless.ts`). Runs as part of `npm run build` after
 * tsc; the output is a registered package runtime asset
 * (`PACKAGE_RUNTIME_ASSETS` in @nodetool-ai/config), so the Electron
 * packaging stages and verifies it.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(pkgRoot, "src/nodes/model3d/render3d-page.ts")],
  outfile: path.join(pkgRoot, "dist/render3d-page.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  logLevel: "warning"
});
