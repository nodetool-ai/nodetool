/**
 * The permission gate inside `nodetool.code.Code`.
 *
 * The node reaches capabilities two ways — the `tools.*` belt bridge and an
 * `@nodetool-ai/sandbox-nodetool/<ns>` import — and both used to run ungated.
 * A chat in plan mode that approved `run_node` once therefore got a body that
 * could call any write capability unasked, the hole A2 closed for `AgentNode`.
 * Both doors now read the host's gate off the context (invariant I-1).
 */
import { describe, it, expect, afterEach } from "vitest";
import { CodeNode, setCodeNodeTools } from "@nodetool-ai/code-nodes";
import { PERMISSION_GATE_CONTEXT_KEY, Tool } from "@nodetool-ai/agents";
import type { PermissionGateOptions } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** `delete_workflow_version` is classified `write`, which plan mode blocks. */
class FakeDeleteVersionTool extends Tool {
  readonly name = "delete_workflow_version";
  readonly description = "Fake delete_workflow_version for tests.";
  calls: Record<string, unknown>[] = [];
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.calls.push(params);
    return { workflow_id: params["workflow_id"], deleted: true };
  }
}

const planGate: PermissionGateOptions = {
  mode: "plan",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

/**
 * A context carrying the values given, with the one method `gateFromContext`
 * reads. `{}` is the headless host: no key, so the run falls to `auto`.
 */
function contextWith(values: Record<string, unknown>): ProcessingContext {
  return {
    get<T = unknown>(key: string, defaultValue?: T): T {
      return (key in values ? values[key] : defaultValue) as T;
    }
  } as unknown as ProcessingContext;
}

/**
 * One belt call through the `nodetool` object model — the surface that still
 * reaches the bridge, since `tools.<name>` is now a thrower pointing at the
 * import. Reports what came back, thrown or returned.
 */
const CALL_DELETE = `
  try {
    const r = await nodetool.workflows.deleteVersion("wf_1", 2);
    return { message: JSON.stringify(r) };
  } catch (e) {
    return { message: String(e.message) };
  }`;

/** The same call through the import door. */
const IMPORT_DELETE = `
  import { delete_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";
  try {
    const r = await delete_workflow({ workflow_id: "wf_1" });
    await output("error", String(r && r.error));
  } catch (e) {
    await output("error", String(e.message));
  }`;

function runNode(
  code: string,
  context: ProcessingContext
): Promise<Record<string, unknown>> {
  return new CodeNode({ code }).process(context);
}

afterEach(() => setCodeNodeTools(null));

describe("CodeNode — the host's permission gate", () => {
  it("blocks a write-class belt call under a plan-mode gate", async () => {
    const tool = new FakeDeleteVersionTool();
    setCodeNodeTools([tool]);

    const r = await runNode(
      CALL_DELETE,
      contextWith({ [PERMISSION_GATE_CONTEXT_KEY]: planGate })
    );

    expect(String(r["message"])).toContain("plan mode");
    expect(tool.calls).toEqual([]);
  }, 60_000);

  it("runs the same call when no host set a gate", async () => {
    const tool = new FakeDeleteVersionTool();
    setCodeNodeTools([tool]);

    const r = await runNode(CALL_DELETE, contextWith({}));

    expect(JSON.parse(String(r["message"]))).toEqual({
      workflow_id: "wf_1",
      deleted: true
    });
    expect(tool.calls).toEqual([{ workflow_id: "wf_1", version: 2 }]);
  }, 60_000);

  it("blocks the same capability reached by import under a plan-mode gate", async () => {
    const r = await runNode(
      IMPORT_DELETE,
      contextWith({ [PERMISSION_GATE_CONTEXT_KEY]: planGate })
    );

    expect(String(r["error"])).toContain("in plan mode");
  }, 60_000);
});
