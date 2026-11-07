import { textEncodingBanner } from "../guest/text-encoding-banner.mjs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(root + "/package.json");
const { build } = require("esbuild");
const { parityPlugins } = await import(
  root + "/native/graph-runner/guest/parity/profile.mjs"
);
const { canvasPlugins } = await import(
  root + "/native/graph-runner/guest/host/canvas-build.mjs"
);
const host = root + "/native/graph-runner/guest/host";
await build({
  entryPoints: [
    root + "/native/graph-runner/unittests/canvas-timeline.test.mjs"
  ],
  outfile: process.argv[2],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  banner: { js: textEncodingBanner },
  plugins: [
    ...canvasPlugins(),
    {
      name: "canvas-overlay",
      setup(b) {
        b.onResolve({ filter: /^@napi-rs\/canvas$/ }, () => ({
          path: host + "/canvas.mjs"
        }));
      }
    },
    ...(await parityPlugins({ modules: [] }))
  ],
  logLevel: "silent"
});
