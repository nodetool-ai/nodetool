/**
 * Disclosure on error: a call that fails argument validation answers with the
 * tool's full signature, once per tool per action. Every other failure keeps
 * its message as it was.
 */
import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";
import { createCapabilityDispatcher } from "../src/capabilities/dispatcher.js";
import { loadCapabilityModule } from "../src/capabilities/registry.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import {
  buildToolBridge,
  createSignatureDisclosure,
  focusedToolSignature,
  isArgumentValidationFailure,
  type ToolSignatureSource
} from "../src/codeact/tool-api.js";
import { createStoryboardToolBridge } from "../src/evals/surfaces/storyboard.js";
import { createMockContext } from "./_helpers/mock-context.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const storyboard = createStoryboardToolBridge();
const schemas: ToolSignatureSource[] = storyboard.tools.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: zodToJsonSchema(t.parameters)
}));
const byName = new Map(schemas.map((t) => [t.name, t]));
const ADD_SHOT = "ui_storyboard_add_shot";
const GET_STATE = "ui_storyboard_get_state";
const signatureOf = (name: string) =>
  focusedToolSignature(byName.get(name) as ToolSignatureSource);

/** The bridge tools' own validation, as the headless harness runs them. */
async function runBridgeTool(name: string, args: Record<string, unknown>) {
  const found = storyboard.tools.find((t) => t.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found.execute(args);
}

/** What the browser answers when a client tool throws (chatProtocol.ts). */
async function asBrowser(call: ChatCodeActToolCall): Promise<unknown> {
  try {
    return await runBridgeTool(call.name, call.args);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

describe("recognising a validation failure", () => {
  it("accepts a Zod issue list, a ZodError and invalid_tool_arguments", async () => {
    const thrown = await runBridgeTool(ADD_SHOT, {}).catch((e: unknown) => e);
    expect(isArgumentValidationFailure(thrown)).toBe(true);
    expect(isArgumentValidationFailure({ error: (thrown as Error).message })).toBe(true);
    expect(
      isArgumentValidationFailure({
        error: "invalid_tool_arguments",
        message: "Invalid arguments for list_workflows: limit: expected number"
      })
    ).toBe(true);
  });

  it("rejects other failures", () => {
    expect(isArgumentValidationFailure({ error: "storyboard sb-9 not found" })).toBe(false);
    expect(isArgumentValidationFailure(new Error("network down"))).toBe(false);
    expect(isArgumentValidationFailure({ error: "[1, 2]" })).toBe(false);
    expect(isArgumentValidationFailure("[not json")).toBe(false);
  });
});

describe("the belt bridge", () => {
  const bridge = () =>
    buildToolBridge({
      tools: schemas,
      invoke: async (name, args) => {
        if (name === GET_STATE) return { error: "storyboard sb-9 not found" };
        return runBridgeTool(name, args);
      }
    });
  const call = async (
    b: ReturnType<typeof bridge>,
    name: string,
    args: Record<string, unknown>
  ) => {
    const callTool = b.globals["__callTool"] as (
      name: string,
      argsJson: string
    ) => Promise<{ ok: boolean; error?: string }>;
    return callTool(name, JSON.stringify(args));
  };

  it("attaches the signature to the first validation failure of a tool in an action", async () => {
    const b = bridge();
    const first = await call(b, ADD_SHOT, { storyboard_id: "sb-1" });
    const second = await call(b, ADD_SHOT, { storyboard_id: "sb-1", action: 3 });
    expect(first.ok).toBe(false);
    expect(first.error).toContain(signatureOf(ADD_SHOT));
    expect(second.ok).toBe(false);
    expect(second.error).not.toContain(signatureOf(ADD_SHOT));
    expect(second.error).toContain("action");

    b.resetActionBudget();
    const nextAction = await call(b, ADD_SHOT, { storyboard_id: "sb-1" });
    expect(nextAction.error).toContain(signatureOf(ADD_SHOT));
  });

  it("leaves a failure that is not about the arguments alone", async () => {
    const b = bridge();
    const failed = await call(b, GET_STATE, { storyboard_id: "sb-9" });
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe(`tools.${GET_STATE}: storyboard sb-9 not found`);
  });
});

describe("a chat action", () => {
  const session = () =>
    createChatCodeActSession({
      tools: schemas,
      executeTool: async (call) =>
        call.name === GET_STATE
          ? { error: "storyboard sb-9 not found" }
          : asBrowser(call),
      context: createMockContext() as unknown as ProcessingContext
    });

  const action = `
import { ${ADD_SHOT}, ${GET_STATE} } from "@nodetool-ai/sandbox-nodetool/ui";
const errors = [];
for (const args of [{ storyboard_id: "sb-1" }, { storyboard_id: "sb-1", action: 3 }]) {
  try { await ${ADD_SHOT}(args); } catch (e) { errors.push(e.message); }
}
try { await ${GET_STATE}({ storyboard_id: "sb-9" }); } catch (e) { errors.push(e.message); }
return errors;`;

  it("shows the signature once, and not on a missing document", async () => {
    const observation = JSON.parse(await session().executeAction({ code: action })) as {
      ok: boolean;
      result: string[];
    };
    expect(observation.ok).toBe(true);
    const [first, second, missing] = observation.result;
    expect(first).toContain(signatureOf(ADD_SHOT));
    expect(second).not.toContain(signatureOf(ADD_SHOT));
    expect(missing).not.toContain(signatureOf(GET_STATE));
    expect(missing).toContain("storyboard sb-9 not found");
  }, 60_000);

  it("shows it again in the next action", async () => {
    const s = session();
    const once = `
import { ${ADD_SHOT} } from "@nodetool-ai/sandbox-nodetool/ui";
try { await ${ADD_SHOT}({ storyboard_id: "sb-1" }); } catch (e) { return e.message; }`;
    for (let i = 0; i < 2; i++) {
      const observation = JSON.parse(await s.executeAction({ code: once })) as {
        result: string;
      };
      expect(observation.result).toContain(signatureOf(ADD_SHOT));
    }
  }, 60_000);
});

describe("an imported capability", () => {
  const WORKFLOWS = sandboxCapabilitySpecifier("workflows");
  const run = (answer: unknown) =>
    ({ invoke: async () => answer }) as unknown as CapabilityRun;

  it("attaches the capability's signature to its first validation failure", async () => {
    const disclosure = createSignatureDisclosure();
    const dispatcher = createCapabilityDispatcher(
      run({
        error: "invalid_tool_arguments",
        message: "Invalid arguments for list_workflows: limit: expected number"
      }),
      ["workflows"],
      { disclosure }
    );
    const spec = (await loadCapabilityModule("workflows")).exports.find(
      (entry) => entry.spec.name === "list_workflows"
    )?.spec as ToolSignatureSource;
    const first = await dispatcher
      .call(WORKFLOWS, "list_workflows", [{ limit: "x" }])
      .catch((e: Error) => e.message);
    const second = await dispatcher
      .call(WORKFLOWS, "list_workflows", [{ limit: "y" }])
      .catch((e: Error) => e.message);
    expect(first).toContain(focusedToolSignature(spec));
    expect(second).toContain("limit: expected number");
    expect(second).not.toContain(focusedToolSignature(spec));
  });

  it("leaves another failure alone", async () => {
    const dispatcher = createCapabilityDispatcher(
      run({ error: "workflow not found" }),
      ["workflows"],
      { disclosure: createSignatureDisclosure() }
    );
    const failed = await dispatcher
      .call(WORKFLOWS, "list_workflows", [{}])
      .catch((e: Error) => e.message);
    expect(failed).toBe("list_workflows: workflow not found");
  });
});
