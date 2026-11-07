// Use the parity profile's existing builtin resolution, with real memfs.
import { textEncodingBanner } from "../guest/text-encoding-banner.mjs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { parityPlugins } from "../guest/parity/profile.mjs";

await build({
  banner: { js: textEncodingBanner },
  entryPoints: [fileURLToPath(new URL("./process-virtual.test.mjs", import.meta.url))],
  outfile: process.argv[2], bundle: true, format: "esm", platform: "browser", target: "es2022",
  plugins: await parityPlugins({ modules: [], builtinShims: {
    process: fileURLToPath(new URL("../guest/host/process.mjs", import.meta.url)),
    timers: fileURLToPath(new URL("../guest/host/timers.mjs", import.meta.url))
  } })
});
