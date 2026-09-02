/**
 * The gate a JS script's capability calls run behind.
 *
 * A script is code a model wrote, running with the platform's own namespaces
 * mounted. It used to build an ungated run, so a script started from a chat in
 * plan mode could delete a workflow the mode had promised not to touch. It now
 * reads the host's gate off the context and falls back to the headless gate
 * when no host set one (invariant I-1, D4).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { mountJsScriptSandbox } from "../src/js-script-sandbox.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../src/types.js";
import type { PermissionGateOptions } from "../src/tools/tool-permissions.js";

const USER = "user-js-script-gate";
const WORKFLOWS = sandboxCapabilitySpecifier("workflows");

/** A body that imports the namespace, which is what gets it mounted. */
const CODE = `
import { delete_workflow } from "${WORKFLOWS}";
await delete_workflow({ workflow_id: inputs.id });
`;

function contextWith(variables: Record<string, unknown>): ProcessingContext {
  return {
    userId: USER,
    get: <T,>(key: string, defaultValue?: T) =>
      (key in variables ? variables[key] : defaultValue) as T
  } as unknown as ProcessingContext;
}

function planModeGate(): PermissionGateOptions {
  return {
    mode: "plan",
    sessionAllow: new Set<string>(),
    // Plan mode blocks a write outright; being asked would mean the matrix let
    // it as far as the user.
    requestApproval: async () => {
      throw new Error("plan mode must block before asking");
    }
  };
}

async function deleteThrough(
  context: ProcessingContext,
  workflowId: string
): Promise<unknown> {
  const mounted = await mountJsScriptSandbox(CODE, context);
  if (!mounted.ok) throw new Error(mounted.error);
  const capabilities = mounted.capabilities;
  if (!capabilities) throw new Error("the workflows namespace was not mounted");
  return capabilities.call(WORKFLOWS, "delete_workflow", [
    { workflow_id: workflowId }
  ]);
}

async function saveWorkflow(id: string): Promise<void> {
  await Workflow.create({
    id,
    user_id: USER,
    name: "gate fixture",
    graph: { nodes: [], edges: [] }
  });
}

describe("a JS script's capability calls", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("are blocked in plan mode, and the workflow survives", async () => {
    await saveWorkflow("wf-plan");

    // The dispatcher raises a blocked call into the guest as a throw, so the
    // script sees the refusal rather than a value it might mistake for success.
    await expect(
      deleteThrough(
        contextWith({ [PERMISSION_GATE_CONTEXT_KEY]: planModeGate() }),
        "wf-plan"
      )
    ).rejects.toThrow(/plan mode/);
    expect(await Workflow.find(USER, "wf-plan")).not.toBeNull();
  });

  it("run in auto when no host gated the context", async () => {
    await saveWorkflow("wf-headless");

    const answer = await deleteThrough(contextWith({}), "wf-headless");

    expect(answer).toMatchObject({ deleted: true });
    expect(await Workflow.find(USER, "wf-headless")).toBeNull();
  });
});
