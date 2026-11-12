// Bundle actual node bodies against explicit native service adapters.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { textEncodingBanner } from "../guest/text-encoding-banner.mjs";
import { capabilityPlugins } from "../guest/host/plugins.mjs";
import { providerCapabilitiesPlugin } from "../guest/provider-capabilities-plugin.mjs";
import { parityPlugins } from "../guest/parity/profile.mjs";
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const mappings = {
  "node:crypto": path("../guest/shims/crypto.cjs"),
  crypto: path("../guest/shims/crypto.cjs"),
  "@nodetool-ai/agents": path("../guest/host/agents.mjs"),
  "@nodetool-ai/agents/js-sandbox": path("../guest/host/sandbox.mjs")
};
await build({
  entryPoints: [process.argv[3] ?? path("./context.test.mjs")],
  outfile: process.argv[2],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  banner: { js: textEncodingBanner },
  plugins: [
    providerCapabilitiesPlugin(),
    ...capabilityPlugins(),
    {
      name: "native-context-adapters",
      setup(b) {
        b.onResolve({ filter: /^fixture:context-font$/ }, () => ({
          path: "context-font",
          namespace: "context-font"
        }));
        b.onLoad({ filter: /.*/, namespace: "context-font" }, () => ({
          contents: `export default new Uint8Array(${JSON.stringify([...readFileSync(path("../../../packages/timeline/fonts/Inter-Variable.ttf"))])});`,
          loader: "js"
        }));
        b.onResolve(
          {
            filter: /^(node:crypto|crypto|@nodetool-ai\/agents(\/js-sandbox)?)$/
          },
          (args) => ({ path: mappings[args.path] })
        );
      }
    },
    ...(await parityPlugins({
      modules: [],
      builtinShims: {
        process: path("../guest/host/process.mjs"),
        timers: path("../guest/host/timers.mjs")
      }
    }))
  ]
});
