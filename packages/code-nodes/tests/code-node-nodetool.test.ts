/**
 * The `nodetool` object model inside `nodetool.code.Code`.
 *
 * The node prepends the `tools.*` wrapper prelude and the full `nodetool`
 * prelude to every run, wired to a real tool bridge when a belt is
 * constructible. These tests drive both ends of that contract: a fake belt
 * carrying a platform-named tool, and the degraded hosts (empty belt, no
 * ProcessingContext) where `nodetool.capabilities()` is `{}` and every method
 * throws naming its missing tool.
 */
import { describe, it, expect, afterEach } from "vitest";
import { CodeNode, setCodeNodeTools } from "@nodetool-ai/code-nodes";
import { Tool } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Minimal context: the fake tools below never read it. */
const fakeContext = {} as unknown as ProcessingContext;

class FakeListWorkflowsTool extends Tool {
  readonly name = "list_workflows";
  readonly description = "Fake list_workflows for tests.";
  calls: Record<string, unknown>[] = [];
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.calls.push(params);
    return [{ id: "wf_1", name: "First" }, { id: "wf_2", name: "Second" }];
  }
}

class FailingTool extends Tool {
  readonly name = "get_workflow";
  readonly description = "Always fails.";
  async process(): Promise<unknown> {
    return { error: "boom", message: "workflow store is on fire" };
  }
}

function runNode(
  code: string,
  context?: ProcessingContext
): Promise<Record<string, unknown>> {
  const node = new CodeNode({ code });
  return node.process(context);
}

afterEach(() => setCodeNodeTools(null));

describe("CodeNode — the belt it assembles", () => {
  it("carries the Apify capabilities a chat action can call", async () => {
    // The regression: a chat ran `tools.run_apify_actor` in `execute_code`,
    // then wrote the same call into a Code body. The chat belt had the tool
    // and this one did not, so the node failed with a bare `TypeError: not a
    // function` and the agent concluded the sandbox had no network.
    const r = await runNode(
      `return {
         run: __toolNames.includes("run_apify_actor"),
         dataset: __toolNames.includes("get_apify_dataset_items")
       };`,
      fakeContext
    );
    expect(r).toEqual({ run: true, dataset: true });
  }, 60_000);

  it("names a tool it does not carry instead of failing as a TypeError", async () => {
    setCodeNodeTools([]);
    const r = await runNode(
      `try {
         await tools.run_apify_actor({ actor_id: "apify/instagram-scraper" });
         return { message: "no throw" };
       } catch (e) {
         return { message: String(e.message) };
       }`,
      fakeContext
    );
    expect(r["message"]).toContain("run_apify_actor");
    expect(r["message"]).not.toContain("not a function");
  }, 60_000);
});

describe("CodeNode — nodetool object model", () => {
  it("routes nodetool.* calls through the injected belt", async () => {
    const listTool = new FakeListWorkflowsTool();
    setCodeNodeTools([listTool]);
    const r = await runNode(
      `
      const caps = nodetool.capabilities();
      const wfs = await nodetool.workflows.list({ limit: 5 });
      return { namespaces: Object.keys(caps), ids: wfs.map((w) => w.id) };
      `,
      fakeContext
    );
    expect(r["namespaces"]).toEqual(["workflows"]);
    expect(r["ids"]).toEqual(["wf_1", "wf_2"]);
    expect(listTool.calls).toEqual([{ limit: 5 }]);
  });

  it("names the import that replaced the retired tools.<name>() bridge", async () => {
    // The belt is reached by import now (and through `nodetool.*`, which the
    // test above pins). What `tools` still does is tell a body written
    // against the old global which import takes its place.
    setCodeNodeTools([new FakeListWorkflowsTool()]);
    const r = await runNode(
      `try {
         await tools.list_workflows();
         return { message: "no throw" };
       } catch (e) {
         return { message: String(e.message) };
       }`,
      fakeContext
    );
    expect(r["message"]).toContain(
      'import { list_workflows } from "@nodetool-ai/sandbox-nodetool/workflows";'
    );
  });

  it("rethrows a tool {error} payload as a guest exception", async () => {
    setCodeNodeTools([new FailingTool()]);
    const r = await runNode(
      `
      try {
        await nodetool.workflows.get("wf_1");
        return { threw: false };
      } catch (e) {
        return { threw: true, message: e.message };
      }
      `,
      fakeContext
    );
    expect(r["threw"]).toBe(true);
    expect(String(r["message"])).toContain("workflow store is on fire");
  });

  it("with an empty belt: capabilities() is {} and methods name their tool", async () => {
    setCodeNodeTools([]);
    const r = await runNode(
      `
      const caps = nodetool.capabilities();
      let error = null;
      try {
        await nodetool.workflows.list();
      } catch (e) {
        error = e.message;
      }
      return { caps, error };
      `,
      fakeContext
    );
    expect(r["caps"]).toEqual({});
    expect(String(r["error"])).toContain("list_workflows");
  });

  it("without a ProcessingContext: same degradation, no ReferenceError", async () => {
    const r = await runNode(`
      const caps = nodetool.capabilities();
      let error = null;
      try {
        await nodetool.assets.list();
      } catch (e) {
        error = e.message;
      }
      return { caps, hasTools: typeof tools === "object", error };
    `);
    expect(r["caps"]).toEqual({});
    expect(r["hasTools"]).toBe(true);
    expect(String(r["error"])).toContain("list_assets");
  });

  it("plain code that never touches nodetool runs unchanged", async () => {
    const r = await runNode("return { sum: 1 + 2 };");
    expect(r).toEqual({ sum: 3 });
  });

  it("streaming (yield) bodies get the object model too", async () => {
    setCodeNodeTools([new FakeListWorkflowsTool()]);
    const node = new CodeNode({
      code: `
        const wfs = await nodetool.workflows.list();
        for (const wf of wfs) { yield({ id: wf.id }); }
      `
    });
    const out: Record<string, unknown>[] = [];
    for await (const item of node.genProcess(fakeContext)) out.push(item);
    expect(out).toEqual([{ id: "wf_1" }, { id: "wf_2" }]);
  });
});
