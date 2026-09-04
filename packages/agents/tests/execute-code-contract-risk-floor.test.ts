/**
 * Auto mode no longer trusts the risk a code action declares about itself:
 * the imports the program makes set a floor. A `low` action importing a
 * write, execute or external capability asks like a `high` one would.
 */
import { describe, it, expect } from "vitest";
import {
  admitCodeAction,
  effectiveActionRisk,
  importedActionRisk
} from "../src/codeact/execute-code-contract.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
  PermissionMode
} from "../src/tools/tool-permissions.js";
import type { CapabilityGate } from "../src/capabilities/types.js";

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

const lowAction = (code: string) => ({
  title: "Tidying",
  risk: "low",
  description: "",
  code
});

describe("importedActionRisk", () => {
  it("is low for reads and local compute", () => {
    expect(
      importedActionRisk(
        `import { list_workflows, get_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";\n` +
          `return (await list_workflows({})).workflows.length;`
      )
    ).toBe("low");
    expect(importedActionRisk("return 1 + 1;")).toBe("low");
  });

  it("is high for a write import", () => {
    expect(
      importedActionRisk(
        `import { delete_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";\n` +
          `await delete_workflow({ workflow_id: "w1" });`
      )
    ).toBe("high");
  });

  it("is high for an execute import", () => {
    expect(
      importedActionRisk(
        `import { run_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";`
      )
    ).toBe("high");
  });

  it("is high for a namespace or default import of a module with actionable exports", () => {
    expect(
      importedActionRisk(
        `import * as workflows from "@nodetool-ai/sandbox-nodetool/workflows";`
      )
    ).toBe("high");
    expect(
      importedActionRisk(
        `import workflows from "@nodetool-ai/sandbox-nodetool/workflows";`
      )
    ).toBe("high");
  });

  it("leaves a session tool the permission table does not know at the declared risk", () => {
    expect(
      importedActionRisk(
        `import { ui_add } from "@nodetool-ai/sandbox-nodetool/ui";\nreturn (await ui_add({})).sum;`
      )
    ).toBe("low");
  });

  it("ignores a pack import outside the capability namespace", () => {
    expect(
      importedActionRisk(`import { parse } from "@nodetool-ai/sandbox-yaml";`)
    ).toBe("low");
  });

  it("is low for a body that does not parse — the sandbox reports the syntax error", () => {
    expect(importedActionRisk("import { from")).toBe("low");
  });
});

describe("effectiveActionRisk", () => {
  it("keeps a declared high", () => {
    expect(effectiveActionRisk({ risk: "high", code: "return 1;" })).toBe(
      "high"
    );
  });

  it("raises a declared low to the import floor", () => {
    expect(
      effectiveActionRisk(
        lowAction(
          `import { delete_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";`
        )
      )
    ).toBe("high");
  });

  it("fails closed without code", () => {
    expect(effectiveActionRisk({ risk: "low" })).toBe("high");
  });
});

describe("admitCodeAction in auto mode with the import floor", () => {
  it("asks for a self-declared low action that imports a write capability", async () => {
    const { gate, asked } = makeGate("auto", "deny");
    const admission = await admitCodeAction(
      gate,
      lowAction(
        `import { delete_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";\n` +
          `await delete_workflow({ workflow_id: "w1" });`
      )
    );
    expect(admission.allowed).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0].args["risk"]).toBe("high");
  });

  it("still runs a low action that only reads, unattended", async () => {
    const { gate, asked } = makeGate("auto", "deny");
    const admission = await admitCodeAction(
      gate,
      lowAction(
        `import { list_workflows } from "@nodetool-ai/sandbox-nodetool/workflows";\n` +
          `return await list_workflows({});`
      )
    );
    expect(admission.allowed).toBe(true);
    expect(asked).toEqual([]);
  });
});
