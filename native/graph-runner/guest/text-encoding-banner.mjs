import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { lazyEncodingIndexesPlugin } from "./bundle-assets-build.mjs";

const entry = fileURLToPath(new URL("./env/text-encoding.mjs", import.meta.url));
const options = { entryPoints: [entry], bundle: true, platform: "browser", format: "iife", target: "es2022", write: false };

// A banner runs before dependencies that construct encoders at module load.
// The sandbox bootstrap embeds this one, with the legacy encoding tables.
const result = await build(options);
export const textEncodingBanner = result.outputFiles[0].text;

// The guest bundle's banner reads the legacy encoding tables from the bundle
// assets when a decoder first needs one. UTF-8 and UTF-16 use none.
export async function lazyTextEncodingBanner() {
  const lazy = await build({
    ...options,
    plugins: [lazyEncodingIndexesPlugin()],
  });
  return lazy.outputFiles[0].text;
}
