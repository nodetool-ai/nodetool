import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { textEncodingBanner } from "../guest/text-encoding-banner.mjs";
await build({
  entryPoints: [
    fileURLToPath(new URL("./file-handle.test.mjs", import.meta.url))
  ],
  outfile: process.argv[2],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  banner: { js: textEncodingBanner }
});
