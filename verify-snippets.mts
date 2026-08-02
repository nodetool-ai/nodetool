/**
 * Snippet verification harness.
 * Usage: npx tsx verify-snippets.mts <cases.json>
 * cases.json: [{ "id": "...", "code": "...", "globals": { ... } }]
 * Prints PASS/FAIL per case and exits non-zero if any failed.
 */
import { readFileSync } from "node:fs";
import { runInSandbox } from "@nodetool-ai/agents/js-sandbox";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8")) as Array<{
  id: string;
  code: string;
  globals?: Record<string, unknown>;
}>;

let failed = 0;
for (const c of cases) {
  const r = await runInSandbox({ code: c.code, globals: c.globals ?? {} });
  if (r.success) {
    console.log(`PASS ${c.id} → ${JSON.stringify(r.result)}`);
  } else {
    failed++;
    console.log(`FAIL ${c.id} → ${r.error}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
