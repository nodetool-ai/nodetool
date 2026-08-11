/**
 * The scoped secret bridge.
 *
 * `getSecret` used to be all-or-nothing: a node written to post to Slack could
 * read the AWS keys. A run may now declare the names it needs, and the bridge —
 * not the guest prelude — refuses everything else.
 */
import { describe, it, expect } from "vitest";

import { resolveSandboxLimits, runInSandbox } from "../src/js-sandbox.js";
import { NODETOOL_API_PRELUDE_FULL } from "../src/codeact/nodetool-api.js";
import { TOOLS_PRELUDE } from "../src/codeact/tools-prelude.js";

/** The prelude a Code node and a CodeAct action both run before user code. */
const PRELUDE = `${TOOLS_PRELUDE}\n${NODETOOL_API_PRELUDE_FULL}`;

const STORE: Record<string, string> = {
  NOTION_API_KEY: "notion-key",
  AWS_SECRET_ACCESS_KEY: "aws-key"
};

/** Just enough ProcessingContext for the secret bridge. */
function context() {
  return {
    getSecret: async (name: string) => STORE[name] ?? null
  } as never;
}

async function run(code: string, secretScope?: readonly string[] | null) {
  return runInSandbox({
    code: `${PRELUDE}\n${code}`,
    context: context(),
    globals: { __toolNames: [] },
    limits: secretScope === undefined ? {} : { secretScope },
    timeoutMs: 20000
  });
}

describe("resolveSandboxLimits", () => {
  it("defaults to an unscoped run", () => {
    expect(resolveSandboxLimits().secretScope).toBeNull();
  });

  it("keeps an empty declared scope empty — that denies everything", () => {
    expect(resolveSandboxLimits({ secretScope: [] }).secretScope).toEqual([]);
  });

  it("drops blank names from a declared scope", () => {
    expect(
      resolveSandboxLimits({ secretScope: ["A", "", "  B  "] }).secretScope
    ).toEqual(["A", "B"]);
  });
});

describe("nodetool.secrets", () => {
  it("reads a secret and reports the declared scope", async () => {
    const result = await run(
      `const key = await nodetool.secrets.get("NOTION_API_KEY");
       return { key, scope: nodetool.secrets.list() };`,
      ["NOTION_API_KEY"]
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      key: "notion-key",
      scope: ["NOTION_API_KEY"]
    });
  });

  it("throws naming the secret that is not set, instead of returning undefined", async () => {
    const result = await run(
      `try { await nodetool.secrets.get("MISSING"); return { threw: false }; }
       catch (e) { return { threw: true, message: String(e.message) }; }`
    );
    expect(result.result).toMatchObject({ threw: true });
    expect((result.result as { message: string }).message).toContain(
      'nodetool.secrets.get("MISSING"): not set'
    );
  });

  it("answers undefined from tryGet for an optional credential", async () => {
    const result = await run(`return { value: await nodetool.secrets.tryGet("MISSING") ?? null };`);
    expect(result.result).toEqual({ value: null });
  });

  it("reports a null scope when the run declared none", async () => {
    const result = await run(`return { scope: nodetool.secrets.list() };`);
    expect(result.result).toEqual({ scope: null });
  });
});

describe("the scope is enforced at the bridge", () => {
  it("refuses a secret outside the declared scope, and names what is allowed", async () => {
    const result = await run(
      `try { await nodetool.secrets.get("AWS_SECRET_ACCESS_KEY"); return { threw: false }; }
       catch (e) { return { threw: true, message: String(e.message) }; }`,
      ["NOTION_API_KEY"]
    );
    expect(result.result).toMatchObject({ threw: true });
    expect((result.result as { message: string }).message).toContain(
      'may read only "NOTION_API_KEY"'
    );
  });

  it("refuses the bare getSecret global too — there is no second route", async () => {
    const result = await run(
      `try { await getSecret("AWS_SECRET_ACCESS_KEY"); return { threw: false }; }
       catch (e) { return { threw: true, message: String(e.message) }; }`,
      ["NOTION_API_KEY"]
    );
    expect(result.result).toMatchObject({ threw: true });
  });

  it("reads nothing at all when the declared scope is empty", async () => {
    const result = await run(
      `try { await getSecret("NOTION_API_KEY"); return { threw: false }; }
       catch (e) { return { threw: true, message: String(e.message) }; }`,
      []
    );
    expect(result.result).toMatchObject({ threw: true });
    expect((result.result as { message: string }).message).toContain(
      "declares no secrets"
    );
  });

  it("cannot be widened from inside the guest", async () => {
    const result = await run(
      `__secretScope.push("AWS_SECRET_ACCESS_KEY");
       try { await getSecret("AWS_SECRET_ACCESS_KEY"); return { threw: false }; }
       catch (e) { return { threw: true }; }`,
      ["NOTION_API_KEY"]
    );
    expect(result.result).toMatchObject({ threw: true });
  });
});
