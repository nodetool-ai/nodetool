/**
 * Bundle the headless timeline render page (`web/src/components/timeline/
 * render/headless/renderPage.ts`) into one ES module that `RenderTimeline` serves
 * to headless Chromium. The page is the editor's own exporter, so its source
 * lives with the web app; it is built here because the backend ships it.
 * Runs as part of `npm run build` after tsc, through the same function a
 * source checkout calls at render time (`src/nodes/timeline/renderPage.ts`).
 * The output is a registered package runtime asset (`PACKAGE_RUNTIME_ASSETS`
 * in @nodetool-ai/config), so the Electron and Docker bundles stage it.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { bundleTimelineRenderPage } from "../dist/nodes/timeline/renderPage.js";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await writeFile(
  path.join(pkgRoot, "dist/timeline-render-page.js"),
  await bundleTimelineRenderPage()
);
