/**
 * Gate parity: the two doors into the one ladder must decide the same way.
 *
 * PR 10 moved the gate out of the wrapper class and into `invoke`, and
 * `gateTools` became a shim that routes a `Tool` through it. So there is one
 * implementation and two entrances, and the risk is that the shim loses
 * something on the way in — a capability that quietly loses its prompt, or
 * gains one. Every assertion here therefore runs twice: once through
 * `invoke`, once through `gateTools(toolFromCapability(...))`, over the same
 * capability, with the same scripted approver. The transcripts must be equal.
 *
 * One canary per category, named after a real tool so the classification map
 * and the spec's `category` agree by construction.
 *
 * Design: docs/tool-class-retirement-design.md § Verification.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { Tool } from "../src/tools/base-tool.js";
import { TOOL_CALL_ID_FIELD } from "../src/tools/subtask-fields.js";
import type { SandboxClock } from "../src/js-sandbox.js";
import type {
  CapabilityExport,
  CapabilityGate,
  PermissionCategory
} from "../src/capabilities/types.js";
import {
  type ApprovalDecision,
  type ApprovalRequest,
  type PermissionMode
} from "../src/tools/tool-permissions.js";
import { capabilityCategoryFor } from "../src/capabilities/registry.js";
import { gateTools } from "../src/capabilities/gate-tools.js";

const ctx = {} as ProcessingContext;

/** One canary per category; the name pins it in the classification map too. */
const CANARIES: Record<PermissionCategory, string> = {
  read: "get_workflow",
  write: "create_workflow",
  execute: "run_workflow",
  external: "http_request"
};

interface Recorder {
  /** Every approval prompt the gate raised. */
  prompts: ApprovalRequest[];
  /** Args of every implementation run that actually happened. */
  runs: Record<string, unknown>[];
}

function makeCapability(
  name: string,
  category: PermissionCategory,
  runs: Record<string, unknown>[]
): CapabilityExport {
  return {
    spec: {
      name,
      description: `canary ${name}`,
      inputSchema: { type: "object", properties: {} },
      category,
      userMessage: (args) => `Canary ${name} on ${String(args["target"])}`
    },
    impl: async (_run, args) => {
      runs.push(args);
      return { ok: true, name };
    }
  };
}

function makeGate(
  mode: PermissionMode,
  answer: ApprovalDecision,
  prompts: ApprovalRequest[],
  sessionAllow = new Set<string>()
): CapabilityGate {
  return {
    mode,
    sessionAllow,
    requestApproval: async (request) => {
      prompts.push(request);
      return answer;
    }
  };
}

/** Drive one call through `invoke`, recording what the gate did. */
async function throughInvoke(
  name: string,
  category: PermissionCategory,
  mode: PermissionMode,
  answer: ApprovalDecision,
  args: Record<string, unknown>,
  sessionAllow = new Set<string>()
): Promise<{ result: unknown; transcript: Recorder }> {
  const transcript: Recorder = { prompts: [], runs: [] };
  const capability = makeCapability(name, category, transcript.runs);
  const run = createCapabilityRun({
    context: ctx,
    gate: makeGate(mode, answer, transcript.prompts, sessionAllow),
    capabilities: [capability]
  });
  return { result: await run.invoke(name, args), transcript };
}

/** The same call through the wrapper class, over the same capability. */
async function throughGatedTool(
  name: string,
  category: PermissionCategory,
  mode: PermissionMode,
  answer: ApprovalDecision,
  args: Record<string, unknown>,
  sessionAllow = new Set<string>()
): Promise<{ result: unknown; transcript: Recorder }> {
  const transcript: Recorder = { prompts: [], runs: [] };
  const capability = makeCapability(name, category, transcript.runs);
  const gate = makeGate(mode, answer, transcript.prompts, sessionAllow);
  const tool = toolFromCapability(capability.spec, capability.impl, (context) =>
    createCapabilityRun({ context, gate, capabilities: [capability] })
  );
  const gated = gateTools([tool], gate)[0];
  return { result: await gated.process(ctx, args), transcript };
}

/** Both paths, asserted equal, then handed back for the case's own checks. */
async function bothPaths(
  name: string,
  category: PermissionCategory,
  mode: PermissionMode,
  answer: ApprovalDecision,
  args: Record<string, unknown> = { target: "x" }
): Promise<{ result: unknown; transcript: Recorder }> {
  const viaInvoke = await throughInvoke(name, category, mode, answer, args);
  const viaTool = await throughGatedTool(name, category, mode, answer, args);
  expect(viaInvoke.result).toEqual(viaTool.result);
  expect(viaInvoke.transcript).toEqual(viaTool.transcript);
  return viaInvoke;
}

describe("canary classification", () => {
  it("each canary's spec category is what the registry-aware lookup answers", () => {
    for (const [category, name] of Object.entries(CANARIES)) {
      expect(capabilityCategoryFor(name)).toBe(category);
    }
  });
});

describe("gate parity in default mode", () => {
  it("read runs with no prompt", async () => {
    const { result, transcript } = await bothPaths(
      CANARIES.read,
      "read",
      "default",
      "deny"
    );
    expect(transcript.prompts).toEqual([]);
    expect(transcript.runs).toHaveLength(1);
    expect(result).toEqual({ ok: true, name: CANARIES.read });
  });

  for (const category of ["write", "execute", "external"] as const) {
    it(`${category} round-trips an approval and then runs`, async () => {
      const name = CANARIES[category];
      const { result, transcript } = await bothPaths(
        name,
        category,
        "default",
        "allow"
      );
      expect(transcript.prompts).toHaveLength(1);
      expect(transcript.prompts[0]).toEqual({
        toolName: name,
        category,
        args: { target: "x" },
        message: `Canary ${name} on x`
      });
      expect(transcript.runs).toHaveLength(1);
      expect(result).toEqual({ ok: true, name });
    });

    it(`${category} denied returns permission_denied without running`, async () => {
      const name = CANARIES[category];
      const { result, transcript } = await bothPaths(
        name,
        category,
        "default",
        "deny"
      );
      expect(transcript.prompts).toHaveLength(1);
      expect(transcript.runs).toEqual([]);
      expect(result).toMatchObject({ error: "permission_denied" });
    });

    it(`${category} is blocked in plan mode`, async () => {
      const name = CANARIES[category];
      const { result, transcript } = await bothPaths(
        name,
        category,
        "plan",
        "allow"
      );
      expect(transcript.prompts).toEqual([]);
      expect(transcript.runs).toEqual([]);
      expect(result).toMatchObject({ error: "blocked_in_plan_mode" });
    });

    it(`${category} runs unprompted in auto mode`, async () => {
      const name = CANARIES[category];
      const { transcript } = await bothPaths(name, category, "auto", "deny");
      expect(transcript.prompts).toEqual([]);
      expect(transcript.runs).toHaveLength(1);
    });
  }

  it("read is never blocked, even in plan mode", async () => {
    const { transcript } = await bothPaths(
      CANARIES.read,
      "read",
      "plan",
      "deny"
    );
    expect(transcript.runs).toHaveLength(1);
  });
});

describe("gate parity on the session allow-set", () => {
  it("allow_for_chat prompts once, then runs unprompted", async () => {
    for (const drive of [throughInvoke, throughGatedTool]) {
      const sessionAllow = new Set<string>();
      const first = await drive(
        CANARIES.write,
        "write",
        "default",
        "allow_for_chat",
        { target: "x" },
        sessionAllow
      );
      expect(first.transcript.prompts).toHaveLength(1);
      expect(sessionAllow.has(CANARIES.write)).toBe(true);

      const second = await drive(
        CANARIES.write,
        "write",
        "default",
        "deny",
        { target: "y" },
        sessionAllow
      );
      expect(second.transcript.prompts).toEqual([]);
      expect(second.transcript.runs).toHaveLength(1);
    }
  });
});

describe("gate parity on the security monitor", () => {
  it("never consults the monitor for a read, and blocks on a verdict", async () => {
    const consulted: string[] = [];
    const monitor = async (action: { name: string }) => {
      consulted.push(action.name);
      return {
        block: true,
        tier: "hard" as const,
        severity: "high" as const,
        reason: "canary"
      };
    };

    const readRuns: Record<string, unknown>[] = [];
    const readCapability = makeCapability(CANARIES.read, "read", readRuns);
    const writeRuns: Record<string, unknown>[] = [];
    const writeCapability = makeCapability(CANARIES.write, "write", writeRuns);
    const gate: CapabilityGate = {
      mode: "auto",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "deny",
      securityMonitor: monitor
    };
    const run = createCapabilityRun({
      context: ctx,
      gate,
      capabilities: [readCapability, writeCapability]
    });

    await run.invoke(CANARIES.read, {});
    expect(consulted).toEqual([]);
    expect(readRuns).toHaveLength(1);

    const blocked = await run.invoke(CANARIES.write, {});
    expect(consulted).toEqual([CANARIES.write]);
    expect(writeRuns).toEqual([]);
    expect(blocked).toMatchObject({ error: "blocked_by_security_monitor" });

    // Same two calls through the wrapper class.
    const gatedRead = gateTools(
      [
        toolFromCapability(readCapability.spec, readCapability.impl, run),
        toolFromCapability(writeCapability.spec, writeCapability.impl, run)
      ],
      gate
    );
    consulted.length = 0;
    readRuns.length = 0;
    writeRuns.length = 0;
    await gatedRead[0].process(ctx, {});
    expect(consulted).toEqual([]);
    expect(readRuns).toHaveLength(1);
    const blockedToo = await gatedRead[1].process(ctx, {});
    expect(consulted).toEqual([CANARIES.write]);
    expect(writeRuns).toEqual([]);
    expect(blockedToo).toEqual(blocked);
  });
});

describe("invoke lookup", () => {
  it("throws naming the capability nobody registered", async () => {
    const run = createCapabilityRun({
      context: ctx,
      gate: makeGate("auto", "allow", [])
    });
    await expect(run.invoke("no_such_capability", {})).rejects.toThrow(
      /no capability is registered for "no_such_capability"/
    );
  });

  it("strips the reserved _message before the approval prompt", async () => {
    const { transcript } = await bothPaths(
      CANARIES.write,
      "write",
      "default",
      "allow",
      { target: "x", _message: "Doing the thing" }
    );
    expect(transcript.prompts[0].args).toEqual({ target: "x" });
    expect(transcript.prompts[0].message).toBe("Doing the thing");
    // The implementation still sees the raw args, as `Tool.process` does.
    expect(transcript.runs[0]).toEqual({ target: "x", _message: "Doing the thing" });
  });
});

/** A clock that records every suspension, and whether one is open right now. */
function recordingClock(): SandboxClock & {
  events: string[];
  suspended: () => boolean;
} {
  const events: string[] = [];
  let depth = 0;
  return {
    events,
    suspended: () => depth > 0,
    suspend() {
      depth++;
      events.push("suspend");
      let resumed = false;
      return () => {
        if (resumed) return;
        resumed = true;
        depth--;
        events.push("resume");
      };
    },
    suspendedMs: () => 0
  };
}

describe("the gate suspends the sandbox clock", () => {
  it("stops the clock for the length of an approval prompt", async () => {
    const clock = recordingClock();
    const runs: Record<string, unknown>[] = [];
    const capability = makeCapability(CANARIES.write, "write", runs);
    let suspendedDuringPrompt = false;
    const run = createCapabilityRun({
      context: ctx,
      gate: {
        mode: "default",
        sessionAllow: new Set<string>(),
        requestApproval: async () => {
          suspendedDuringPrompt = clock.suspended();
          return "allow";
        },
        clock
      },
      capabilities: [capability]
    });

    await run.invoke(CANARIES.write, {});
    expect(suspendedDuringPrompt).toBe(true);
    // Exactly one suspension, closed before the implementation ran.
    expect(clock.events).toEqual(["suspend", "resume"]);
    expect(clock.suspended()).toBe(false);
    expect(runs).toHaveLength(1);
  });

  it("stops it for a monitor consult and leaves reads alone", async () => {
    const clock = recordingClock();
    const runs: Record<string, unknown>[] = [];
    const gate: CapabilityGate = {
      mode: "auto",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "allow",
      securityMonitor: async () => ({
        block: false,
        tier: "soft" as const,
        severity: "low" as const
      }),
      clock
    };
    const run = createCapabilityRun({
      context: ctx,
      gate,
      capabilities: [
        makeCapability(CANARIES.write, "write", runs),
        makeCapability(CANARIES.read, "read", runs)
      ]
    });

    await run.invoke(CANARIES.read, {});
    expect(clock.events).toEqual([]);

    await run.invoke(CANARIES.write, {});
    expect(clock.events).toEqual(["suspend", "resume"]);
  });

  it("suspends the same way through the gateTools shim", async () => {
    const clock = recordingClock();
    const runs: Record<string, unknown>[] = [];
    const capability = makeCapability(CANARIES.write, "write", runs);
    const gate: CapabilityGate = {
      mode: "default",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "allow",
      clock
    };
    const tool = toolFromCapability(capability.spec, capability.impl, (context) =>
      createCapabilityRun({ context, gate, capabilities: [capability] })
    );
    await gateTools([tool], gate)[0].process(ctx, {});
    expect(clock.events).toEqual(["suspend", "resume"]);
  });
});

/** A tool that needs the LLM's tool-call id, the way `run_subtask` does. */
class NeedsToolCallIdTool extends Tool {
  readonly name = "run_subtask";
  readonly description = "canary";
  override readonly needsToolCallId = true;
  seen: Record<string, unknown> | null = null;
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.seen = params;
    return { ok: true };
  }
}

describe("the gateTools shim preserves the tool's own surface", () => {
  it("threads _tool_call_id through to a needsToolCallId tool", async () => {
    const inner = new NeedsToolCallIdTool();
    const gated = gateTools([inner], {
      mode: "default",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "allow"
    })[0];

    expect(gated.needsToolCallId).toBe(true);
    await Tool.executeTool(gated, ctx, { _message: "hi" }, { toolCallId: "call_7" });
    expect(inner.seen).toEqual({ [TOOL_CALL_ID_FIELD]: "call_7" });
  });

  it("forwards name, description, schema and the provider tool", () => {
    const inner = new NeedsToolCallIdTool();
    const gated = gateTools([inner], {
      mode: "auto",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "allow"
    })[0];

    expect(gated.name).toBe(inner.name);
    expect(gated.description).toBe(inner.description);
    expect(gated.schema).toBe(inner.schema);
    expect(gated.inputSchema).toEqual(inner.inputSchema);
    expect(gated.toProviderTool()).toEqual(inner.toProviderTool());
    expect(gated.userMessage({})).toBe(inner.userMessage({}));
  });
});
