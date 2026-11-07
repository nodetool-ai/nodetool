import { build } from "esbuild";
// Build-time extraction reuses the canonical guest helpers. Anchor checks fail
// the build if their location changes rather than silently shipping no helpers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CANVAS_PROPERTIES,
  CANVAS_METHODS,
  CANVAS_GRADIENT_FACTORIES,
  CANVAS_GRADIENT_MARKER
} from "@nodetool-ai/sandbox-runtime/sandbox-canvas-api";
import { textEncodingBanner } from "./text-encoding-banner.mjs";
const source = readFileSync(
  fileURLToPath(
    new URL(
      "../../../packages/sandbox-runtime/src/js-sandbox-worker/interpreter.ts",
      import.meta.url
    )
  ),
  "utf8"
);
function between(start, end) {
  const a = source.indexOf(start),
    b = source.indexOf(end, a);
  if (a < 0 || b <= a)
    throw new Error(`Canonical sandbox helper anchors missing: ${start}`);
  return source.slice(a, b);
}
const bytes = between("const __b64chars =", "const __revive =").replace(
  "${BASE64_ALPHABET}",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
);
const canvas = between("const __canvasProps =", "const __crypto =")
  .replace(
    "${JSON.stringify(CANVAS_PROPERTIES)}",
    JSON.stringify(CANVAS_PROPERTIES)
  )
  .replace("${JSON.stringify(CANVAS_METHODS)}", JSON.stringify(CANVAS_METHODS))
  .replace(
    "${JSON.stringify(CANVAS_GRADIENT_FACTORIES)}",
    JSON.stringify(CANVAS_GRADIENT_FACTORIES)
  )
  .replace("${CANVAS_GRADIENT_MARKER}", CANVAS_GRADIENT_MARKER);
const globals = await build({
  stdin: {
    contents:
      'import "./env/url.mjs";import { installStructuredClone } from "./env/structured-clone.mjs";installStructuredClone(globalThis);',
    resolveDir: fileURLToPath(new URL(".", import.meta.url))
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false
});
export const sandboxBootstrapSource =
  textEncodingBanner + globals.outputFiles[0].text + bytes + canvas;
