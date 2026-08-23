/**
 * The capability dispatcher — the guest's way into the platform.
 *
 * Two things must hold. The validation ladder refuses every malformed call
 * before a capability is looked up, the way the host-module dispatcher does.
 * And the import path is the tools path: one action importing
 * `@nodetool-ai/sandbox-nodetool/workflows` and one calling
 * the import must see what the capability's own `invoke` answers, and pass
 * the same gate a direct tool call passes.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import {
  sandboxCapabilitySpecifier,
  SANDBOX_CAPABILITY_PACK
} from "@nodetool-ai/protocol";
import { createCapabilityDispatcher } from "../src/capabilities/dispatcher.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import type {
  ApprovalRequest,
  PermissionMode
} from "../src/tools/tool-permissions.js";

const USER = "user-dispatcher";
const ctx = { userId: USER } as unknown as ProcessingContext;
const WORKFLOWS = sandboxCapabilitySpecifier("workflows");

function ungatedRun(): CapabilityRun {
  return createCapabilityRun({ context: ctx, gate: UNGATED });
}

/** A run whose approval prompts are scripted and recorded. */
function gatedRun(
  mode: PermissionMode,
  answer: "allow" | "deny",
  prompts: ApprovalRequest[]
): CapabilityRun {
  return createCapabilityRun({
    context: ctx,
    gate: {
      mode,
      sessionAllow: new Set<string>(),
      requestApproval: async (request) => {
        prompts.push(request);
        return answer;
      }
    }
  });
}

/**
 * One action in a chat session whose only surface is the capability run: the
 * tool router routes straight to `invoke`, so the import and a direct tool
 * call land on the same ladder and any difference is the dispatcher's.
 */
async function action(
  run: CapabilityRun,
  code: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const session = createChatCodeActSession({
    tools: [
      {
        name: "list_workflows",
        description: "List workflows",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "create_workflow",
        description: "Create a workflow",
        inputSchema: { type: "object", properties: {} }
      }
    ],
    executeTool: async (call) => run.invoke(call.name, call.args),
    capabilityRun: run
  });
  return JSON.parse(await session.executeAction({ code })) as {
    ok: boolean;
    result?: unknown;
    error?: string;
  };
}

beforeEach(() => {
  initTestDb();
});

describe("the validation ladder", () => {
  it("refuses a module this run did not mount", async () => {
    const dispatcher = createCapabilityDispatcher(ungatedRun(), ["workflows"]);
    await expect(
      dispatcher.call(sandboxCapabilitySpecifier("assets"), "list_assets", [{}])
    ).rejects.toThrow(/is not a capability module mounted for this session/);
    await expect(dispatcher.call(42, "list_workflows", [{}])).rejects.toThrow(
      /a number value is not a capability module/
    );
  });

  it("refuses a module name the registry does not carry", () => {
    expect(() =>
      createCapabilityDispatcher(ungatedRun(), ["not_a_namespace"])
    ).toThrow(/no capability module is registered/);
  });

  it("refuses an export the module does not list", async () => {
    const dispatcher = createCapabilityDispatcher(ungatedRun(), ["workflows"]);
    await expect(
      dispatcher.call(WORKFLOWS, "list_assets", [{}])
    ).rejects.toThrow(/has no export named "list_assets"/);
    await expect(dispatcher.call(WORKFLOWS, 7, [{}])).rejects.toThrow(
      /has no export named a number value/
    );
  });

  it("refuses arguments that are not one arguments object", async () => {
    const dispatcher = createCapabilityDispatcher(ungatedRun(), ["workflows"]);
    await expect(
      dispatcher.call(WORKFLOWS, "list_workflows", "hello")
    ).rejects.toThrow(/non-list argument/);
    await expect(
      dispatcher.call(WORKFLOWS, "list_workflows", ["hello"])
    ).rejects.toThrow(/takes one arguments object/);
    await expect(
      dispatcher.call(WORKFLOWS, "list_workflows", [[1, 2]])
    ).rejects.toThrow(/takes one arguments object/);
  });

  it("names required fields when the first argument is not a record", async () => {
    const dispatcher = createCapabilityDispatcher(ungatedRun(), ["workflows"]);
    await expect(
      dispatcher.call(WORKFLOWS, "get_workflow", [1])
    ).rejects.toThrow(/get_workflow takes one arguments object \(\{ workflow_id \}\)/);
  });

  it("stops a cancelled run before anything is looked up", async () => {
    const controller = new AbortController();
    controller.abort();
    const dispatcher = createCapabilityDispatcher(ungatedRun(), ["workflows"], {
      signal: controller.signal
    });
    await expect(
      dispatcher.call(WORKFLOWS, "list_workflows", [{}])
    ).rejects.toThrow(/cancelled/);
  });
});

describe("the import path in the sandbox", () => {
  it("answers what the capability itself answers", async () => {
    await Workflow.create({
      name: "Imported",
      user_id: USER,
      access: "private",
      graph: { nodes: [], edges: [] }
    });
    const run = ungatedRun();

    const imported = await action(
      run,
      `import { list_workflows } from "${WORKFLOWS}";\n` +
        `return await list_workflows({});`
    );
    const direct = await run.invoke("list_workflows", {});

    expect(imported.ok).toBe(true);
    expect(imported.result).toEqual(direct);
    const names = (
      (imported.result as { workflows: { name: string }[] }).workflows ?? []
    ).map((w) => w.name);
    expect(names).toContain("Imported");
  });

  it("serves the namespace default import too", async () => {
    const run = ungatedRun();
    const outcome = await action(
      run,
      `import workflows from "${WORKFLOWS}";\n` +
        `return typeof workflows.list_workflows;`
    );
    expect(outcome).toMatchObject({ ok: true, result: "function" });
  });

  it("carries only what its own module exports", async () => {
    const outcome = await action(
      ungatedRun(),
      `import { list_assets } from "${WORKFLOWS}";\nreturn 1;`
    );
    expect(outcome.ok).toBe(false);
  });

  it("refuses a specifier under the pack that names no module", async () => {
    const outcome = await action(
      ungatedRun(),
      `import { nope } from "${SANDBOX_CAPABILITY_PACK}/nowhere";\nreturn 1;`
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(`${SANDBOX_CAPABILITY_PACK}/nowhere`);
    expect(outcome.error).toContain("not a NodeTool capability module");
  });
});

describe("the gate", () => {
  it("prompts for a write capability reached through the import", async () => {
    const prompts: ApprovalRequest[] = [];
    const run = gatedRun("default", "deny", prompts);
    const outcome = await action(
      run,
      `import { create_workflow } from "${WORKFLOWS}";\n` +
        `return await create_workflow({ name: "x", objective: "y" });`
    );
    expect(prompts.map((p) => p.toolName)).toEqual(["create_workflow"]);
    expect(prompts[0].category).toBe("write");
    // A denial comes back as the gate's structured refusal, which the guest
    // prelude surfaces as the action's error.
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("declined to run");
  });

  it("never prompts for a read capability, on either path", async () => {
    const prompts: ApprovalRequest[] = [];
    const run = gatedRun("default", "deny", prompts);
    const imported = await action(
      run,
      `import { list_workflows } from "${WORKFLOWS}";\n` +
        `return await list_workflows({});`
    );
    expect(prompts).toEqual([]);
    expect(imported.result).toEqual(await run.invoke("list_workflows", {}));
  });
});

describe("a session with no capability run", () => {
  it("mounts nothing, and the import is refused by name", async () => {
    const session = createChatCodeActSession({
      tools: [],
      executeTool: async () => ({})
    });
    const outcome = JSON.parse(
      await session.executeAction({
        code: `import { list_workflows } from "${WORKFLOWS}";\nreturn 1;`
      })
    ) as { ok: boolean; error?: string };
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(WORKFLOWS);
    expect(outcome.error).toContain("package allowlist");
  });
});
