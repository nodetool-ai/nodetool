import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { parityPlugins } from "../guest/parity/profile.mjs";
import { capabilityPlugins } from "../guest/host/plugins.mjs";
import { providerCapabilitiesPlugin } from "../guest/provider-capabilities-plugin.mjs";
import { textEncodingBanner } from "../guest/text-encoding-banner.mjs";
const path = (ref) => fileURLToPath(new URL(ref, import.meta.url));
await build({
  entryPoints: [path("../guest/entry.mjs")],
  outfile: process.argv[2],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  banner: { js: textEncodingBanner },
  plugins: [
    providerCapabilitiesPlugin(),
    ...capabilityPlugins(),
    ...(await parityPlugins({
      modules: [
        path("./blob-values-node.mjs"),
        path("../../../packages/code-nodes/src/nodes/code-node.ts")
      ],
      builtinShims: {
        process: path("../guest/host/process.mjs"),
        timers: path("../guest/host/timers.mjs")
      }
    }))
  ]
});
