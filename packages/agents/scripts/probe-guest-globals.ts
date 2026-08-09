/**
 * Print the QuickJS guest's own globals as the snapshot literal
 * `GUEST_GLOBALS_SNAPSHOT` in `src/code-gen/sandbox-manifest.ts` expects.
 * Run after upgrading `@sebastianwessel/quickjs` or changing the prelude:
 *
 *     npx tsx packages/agents/scripts/probe-guest-globals.ts
 */
import { runInSandbox } from "../src/js-sandbox.js";

const run = await runInSandbox({
  code: "return Object.getOwnPropertyNames(globalThis)"
});
if (run.error) throw new Error(run.error);

const names = (run.result as string[])
  .filter((name) => !name.startsWith("__"))
  .sort();

console.log(names.map((name) => `  ${JSON.stringify(name)}`).join(",\n"));
