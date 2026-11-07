import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// A banner runs before dependencies that construct encoders at module load.
const result = await build({
  entryPoints: [fileURLToPath(new URL("./env/text-encoding.mjs", import.meta.url))],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  write: false,
});
export const textEncodingBanner = result.outputFiles[0].text;
