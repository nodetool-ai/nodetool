/**
 * What a Code node and a JS script can call, and what happens when they call
 * something the belt does not carry.
 *
 * The failure this pins: a chat ran `tools.run_apify_actor` inside
 * `execute_code`, then wrote the same call into a `nodetool.code.Code` body.
 * The chat belt carried the Apify capabilities and the sandbox belt did not,
 * so the body failed with QuickJS's `TypeError: not a function` — naming
 * neither the tool nor the belt. The agent read that as "the sandbox has no
 * network", tried `fetch` against Apify's REST API, hit the same message, and
 * ended up hard-coding a scraped URL into a workflow it reported as working.
 */
import { describe, it, expect } from "vitest";

import { assembleSandboxToolbelt } from "../src/sandbox-toolbelt.js";
import {
  APIFY_TOOL_NAMES,
  SERPAPI_TOOL_NAMES
} from "../src/tools/external-capability-tools.js";
import { runInSandbox } from "../src/js-sandbox.js";
import { NODETOOL_API_PRELUDE_FULL } from "../src/codeact/nodetool-api.js";
import { TOOLS_PRELUDE } from "../src/codeact/tools-prelude.js";

const PRELUDE = `${TOOLS_PRELUDE}\n${NODETOOL_API_PRELUDE_FULL}`;

/** Run a body over a belt of `names`, none of which is really callable. */
async function run(code: string, names: readonly string[] = []) {
  return runInSandbox({
    code: `${PRELUDE}\n${code}`,
    context: {} as never,
    globals: {
      __toolNames: [...names],
      __callTool: async (name: unknown) => ({
        ok: true,
        result: { called: name }
      })
    },
    timeoutMs: 20000
  });
}

describe("the sandbox toolbelt", () => {
  it("carries the Apify and SerpAPI capabilities", () => {
    const names = new Set(assembleSandboxToolbelt().map((tool) => tool.name));
    for (const name of [...APIFY_TOOL_NAMES, ...SERPAPI_TOOL_NAMES]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("names every tool once", () => {
    const names = assembleSandboxToolbelt().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("tools.<name> for a name the belt does not carry", () => {
  it("throws naming the tool instead of TypeError: not a function", async () => {
    const result = await run(
      `try {
         await tools.run_apify_actor({ actor_id: "apify/instagram-scraper" });
         return "no throw";
       } catch (e) {
         return String(e.message);
       }`
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toContain("run_apify_actor");
    expect(result.result).toContain("searchTools");
    expect(result.result).not.toContain("not a function");
  }, 60_000);

  it("leaves a tool the belt does carry callable", async () => {
    const result = await run(
      `const r = await tools.list_workflows({});
       return r.called;`,
      ["list_workflows"]
    );
    expect(result.result).toBe("list_workflows");
  }, 60_000);

  it("does not make nodetool report a capability the belt lacks", async () => {
    // `nodetool.capabilities()` and its per-method errors read `__toolNames`,
    // not whether reading a property answers a function — the thrower would
    // otherwise report every namespace as present.
    const result = await run(
      `const caps = nodetool.capabilities();
       let denied = "";
       try {
         await nodetool.workflows.list({});
       } catch (e) {
         denied = String(e.message);
       }
       return { workflows: Boolean(caps.workflows), denied };`
    );
    expect(result.result).toMatchObject({ workflows: false });
    expect((result.result as { denied: string }).denied).toContain(
      "list_workflows"
    );
  }, 60_000);

  it("keeps the belt enumerable and does not answer as a thenable", async () => {
    const result = await run(
      `return {
         keys: Object.keys(tools).sort(),
         then: typeof tools.then
       };`,
      ["list_workflows", "run_workflow"]
    );
    expect(result.result).toEqual({
      keys: ["list_workflows", "run_workflow"],
      then: "undefined"
    });
  }, 60_000);
});
