/**
 * Auto mode reads the risk a code action declares about itself: a `low` action
 * runs unattended, a `high` one asks the user once before any of it runs.
 * These drive the admission directly and through a real chat session.
 */
import { describe, it, expect, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  admitCodeAction,
  declaredActionRisk,
  executeCodeDescription,
  EXECUTE_CODE_INPUT_SCHEMA,
  EXECUTE_CODE_TOOL_NAME
} from "../src/codeact/execute-code-contract.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
  PermissionMode
} from "../src/tools/tool-permissions.js";
import type { CapabilityGate } from "../src/capabilities/types.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { createMockContext } from "./_helpers/mock-context.js";

function makeGate(
  mode: PermissionMode,
  answer: ApprovalDecision = "allow"
): { gate: CapabilityGate; asked: ApprovalRequest[] } {
  const asked: ApprovalRequest[] = [];
  const gate: CapabilityGate = {
    mode,
    sessionAllow: new Set<string>(),
    requestApproval: async (request: ApprovalRequest) => {
      asked.push(request);
      return answer;
    }
  };
  return { gate, asked };
}

const lowAction = {
  title: "Counting rows",
  risk: "low",
  description: "",
  code: "return 1;"
};
const highAction = {
  title: "Deleting the old workflows",
  risk: "high",
  description:
    "Deletes the 3 archived workflows listed above. They cannot be restored.",
  code: "return 1;"
};

describe("the execute_code contract", () => {
  it("carries risk as a required enum", () => {
    const schema = EXECUTE_CODE_INPUT_SCHEMA;
    expect(schema.properties.risk.enum).toEqual(["low", "high"]);
    expect(schema.required).toEqual(["title", "risk", "description", "code"]);
    // OpenAI structured outputs reject a strict schema that leaves a property
    // out of `required`.
    expect(Object.keys(schema.properties).sort()).toEqual(
      [...schema.required].sort()
    );
  });
});

describe("executeCodeDescription", () => {
  it("reads what the model wrote, trimmed", () => {
    expect(executeCodeDescription(highAction)).toBe(
      "Deletes the 3 archived workflows listed above. They cannot be restored."
    );
    expect(executeCodeDescription({ description: "  spaced  " })).toBe(
      "spaced"
    );
  });

  it("is empty when there is none to read", () => {
    expect(executeCodeDescription(lowAction)).toBe("");
    expect(executeCodeDescription({})).toBe("");
    expect(executeCodeDescription(null)).toBe("");
    expect(executeCodeDescription({ description: 42 })).toBe("");
  });
});

describe("declaredActionRisk", () => {
  it("reads a declared low", () => {
    expect(declaredActionRisk(lowAction)).toBe("low");
  });

  it("fails closed on anything else", () => {
    expect(declaredActionRisk(highAction)).toBe("high");
    expect(declaredActionRisk({})).toBe("high");
    expect(declaredActionRisk(null)).toBe("high");
    expect(declaredActionRisk({ risk: "LOW" })).toBe("high");
    expect(declaredActionRisk({ risk: "medium" })).toBe("high");
    expect(declaredActionRisk({ risk: true })).toBe("high");
  });
});

describe("admitCodeAction", () => {
  it("admits everything without a gate", async () => {
    await expect(admitCodeAction(undefined, highAction)).resolves.toEqual({
      allowed: true
    });
  });

  it("asks nothing in plan or default mode — the per-call ladder is the gate", async () => {
    for (const mode of ["plan", "default"] as PermissionMode[]) {
      const { gate, asked } = makeGate(mode);
      await expect(admitCodeAction(gate, highAction)).resolves.toEqual({
        allowed: true
      });
      expect(asked).toEqual([]);
    }
  });

  it("runs a low-risk action unattended in auto mode", async () => {
    const { gate, asked } = makeGate("auto");
    await expect(admitCodeAction(gate, lowAction)).resolves.toEqual({
      allowed: true
    });
    expect(asked).toEqual([]);
  });

  it("asks once for a high-risk action in auto mode", async () => {
    const { gate, asked } = makeGate("auto", "allow");
    await expect(admitCodeAction(gate, highAction)).resolves.toEqual({
      allowed: true
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({
      toolName: EXECUTE_CODE_TOOL_NAME,
      category: "execute",
      message: "Deleting the old workflows",
      // What the dialog asks about: the effect, not the program.
      description:
        "Deletes the 3 archived workflows listed above. They cannot be restored."
    });
    // The program is still there to unfold.
    expect(asked[0].args).toEqual({
      title: "Deleting the old workflows",
      risk: "high",
      code: "return 1;"
    });
    // Approving one call grants nothing beyond it.
    await admitCodeAction(gate, highAction);
    expect(asked).toHaveLength(2);
  });

  it("refuses a denied action with repair instructions", async () => {
    const { gate } = makeGate("auto", "deny");
    const admission = await admitCodeAction(gate, highAction);
    expect(admission.allowed).toBe(false);
    expect(admission.allowed === false && admission.error).toMatch(
      /declined to run this code action/
    );
  });

  it("stops asking after allow_for_chat", async () => {
    const { gate, asked } = makeGate("auto", "allow_for_chat");
    await admitCodeAction(gate, highAction);
    await admitCodeAction(gate, highAction);
    expect(asked).toHaveLength(1);
    expect(gate.sessionAllow.has(EXECUTE_CODE_TOOL_NAME)).toBe(true);
  });

  it("reads an unlabeled action as high risk", async () => {
    const { gate, asked } = makeGate("auto", "deny");
    const admission = await admitCodeAction(gate, {
      title: "Tidying up",
      code: "return 1;"
    });
    expect(admission.allowed).toBe(false);
    expect(asked).toHaveLength(1);
    // No description written, so the dialog has only the title to ask about.
    expect(asked[0].description).toBe("");
  });
});

describe("a chat session in auto mode", () => {
  const tools = [
    {
      name: "ui_add",
      description: "Add two numbers.",
      inputSchema: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } }
      }
    }
  ];
  const code =
    `import { ui_add } from "@nodetool-ai/sandbox-nodetool/ui";\n` +
    `return (await ui_add({ a: 2, b: 3 })).sum;`;

  function makeSession(gate: CapabilityGate, executeTool: typeof noopTool) {
    const context = createMockContext() as unknown as ProcessingContext;
    return createChatCodeActSession({
      tools,
      executeTool,
      context,
      capabilityRun: createCapabilityRun({ context, gate })
    });
  }

  const noopTool = async (_call: ChatCodeActToolCall): Promise<unknown> =>
    JSON.stringify({ sum: 5 });

  it("never runs the program the user denied", async () => {
    const executeTool = vi.fn(noopTool);
    const { gate } = makeGate("auto", "deny");
    const session = makeSession(gate, executeTool);

    const observation = JSON.parse(
      await session.executeAction({ title: "Adding", risk: "high", code })
    ) as { ok: boolean; error?: string; toolCalls: number };

    expect(observation.ok).toBe(false);
    expect(observation.error).toMatch(/declined/);
    expect(observation.toolCalls).toBe(0);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("runs a low-risk program with no prompt", async () => {
    const executeTool = vi.fn(noopTool);
    const { gate, asked } = makeGate("auto", "deny");
    const session = makeSession(gate, executeTool);

    const observation = JSON.parse(
      await session.executeAction({ title: "Adding", risk: "low", code })
    ) as { ok: boolean; result?: unknown };

    expect(observation.ok).toBe(true);
    expect(observation.result).toBe(5);
    expect(asked).toEqual([]);
  });
});
