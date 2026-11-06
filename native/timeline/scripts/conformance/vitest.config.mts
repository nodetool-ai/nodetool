// Runs packages/timeline's edit-operation tests against the native port:
// the tests' imports of the operations resolve to native-ops.ts.
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const here = import.meta.dirname;
const pkg = resolve(here, "../../../../packages/timeline");
const shim = resolve(here, "native-ops.ts");

export default defineConfig({
  root: pkg,
  resolve: {
    alias: [
      {
        find: /^\.\.\/src\/(trimClip|splitClip|rippleEdit|dropResolve|snap|snapping\/resolveSnap|snapping\/buildSnapPoints|slideEdit)\.js$/,
        replacement: shim
      },
      { find: /^\.\.\/src\/clipSpeed\.js$/, replacement: resolve(here, "native-clipspeed.ts") },
      { find: /^@nodetool-ai\/timeline$/, replacement: resolve(pkg, "src/index.ts") }
    ]
  },
  test: {
    include: (process.env.NT_CONFORMANCE_TESTS ?? "").split(",").filter(Boolean),
    testTimeout: 60000
  }
});
