import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ProcessingContext } from "@nodetool-ai/runtime";
import * as adapters from "../src/capabilities/adapters.js";
import {
  createCapabilityRun,
  capabilityProviderTool
} from "../src/capabilities/invoke.js";
import { gateHeadlessTools } from "../src/evals/tool-loop-permission.js";
import { decidePermission } from "../src/tools/tool-permissions.js";
import type {
  PermissionCategory,
  PermissionMode
} from "../src/tools/tool-permissions.js";
import {
  gateLegacyTools,
  capabilityRunForLegacyTool
} from "../src/capabilities/legacy-tools.js";
import { capabilityForName } from "../src/capabilities/registry.js";
import { Tool } from "../src/tools/base-tool.js";

const categories: PermissionCategory[] = [
  "read",
  "write",
  "external",
  "execute"
];
const modes: PermissionMode[] = ["plan", "default", "auto"];

function context() {
  return new ProcessingContext({
    userId: "test-user",
    jobId: "permission-test"
  });
}

describe("native capability permissions", () => {
  for (const category of categories) {
    for (const mode of modes) {
      it(`${category} in ${mode} uses the production decision`, async () => {
        const impl = vi.fn(async () => ({ ok: true }));
        const requestApproval = vi.fn(async () => "allow" as const);
        const spec = {
          name: `native_${category}`,
          description: "Native action",
          inputSchema: { type: "object" },
          category
        };
        const run = createCapabilityRun({
          context: context(),
          gate: { mode, sessionAllow: new Set(), requestApproval },
          capabilities: [{ spec, impl }]
        });
        const result = await run.invoke(spec.name, {});
        const decision = decidePermission(mode, category);
        expect(impl).toHaveBeenCalledTimes(decision === "block" ? 0 : 1);
        expect(requestApproval).toHaveBeenCalledTimes(
          decision === "ask" ? 1 : 0
        );
        expect(result).toMatchObject(
          decision === "block"
            ? { error: "blocked_in_plan_mode" }
            : { ok: true }
        );
      });
    }
  }

  it("preserves metadata, validates before approval, and invokes exactly once", async () => {
    const impl = vi.fn(async (_run, args) => args);
    const requestApproval = vi.fn(async () => "allow_for_chat" as const);
    const spec = {
      name: "native_write",
      description: "Write a value",
      category: "write" as const,
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"]
      },
      zodSchema: z.object({ value: z.string() }),
      needsToolCallId: true,
      userMessage: (args: Record<string, unknown>) =>
        `Writing ${String(args.value)}`
    };
    const run = createCapabilityRun({
      context: context(),
      gate: { mode: "default", sessionAllow: new Set(), requestApproval },
      capabilities: [{ spec, impl }]
    });
    expect(capabilityProviderTool(spec)).toMatchObject({
      name: spec.name,
      description: spec.description,
      inputSchema: {
        properties: { value: { type: "string" }, _message: { type: "string" } }
      }
    });
    expect(await run.invoke(spec.name, {})).toMatchObject({
      error: "invalid_tool_arguments"
    });
    expect(impl).not.toHaveBeenCalled();
    expect(requestApproval).not.toHaveBeenCalled();
    expect(
      await run.invoke(spec.name, { value: "one", _tool_call_id: "call-1" })
    ).toEqual({ value: "one", _tool_call_id: "call-1" });
    expect(impl).toHaveBeenCalledTimes(1);
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: spec.name,
        category: "write",
        message: "Writing one"
      })
    );
    await run.invoke(spec.name, { value: "two" });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("retains the model's invocation message with a Zod schema", async () => {
    const requestApproval = vi.fn(async () => "deny" as const);
    const impl = vi.fn(async () => null);
    const run = createCapabilityRun({
      context: context(),
      gate: { mode: "default", sessionAllow: new Set(), requestApproval },
      capabilities: [
        {
          spec: {
            name: "native_write",
            description: "Write",
            inputSchema: {},
            category: "write",
            zodSchema: z.object({ value: z.string() })
          },
          impl
        }
      ]
    });
    expect(
      await run.invoke("native_write", {
        value: "one",
        _message: "Saving this value"
      })
    ).toMatchObject({ error: "permission_denied" });
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Saving this value",
        args: { value: "one" }
      })
    );
    expect(impl).not.toHaveBeenCalled();
  });
});

describe("headless capability permissions", () => {
  it("never constructs a legacy Tool or uses its adapter", async () => {
    const adapt = vi.spyOn(adapters, "capabilityFromTool");
    const execute = vi.fn(async (args: Record<string, unknown>) => args);
    const parameters = z.object({ value: z.string() });
    const tool = {
      name: "headless_write",
      description: "Write a value",
      category: "write" as const,
      parameters,
      userMessage: () => "Writing a value",
      needsToolCallId: true,
      execute
    };
    try {
      const gated = gateHeadlessTools([tool], { mode: "default" });
      expect(gated.tools[0]).not.toBeInstanceOf(Tool);
      expect(gated.tools[0]).toMatchObject({
        name: tool.name,
        description: tool.description,
        category: tool.category,
        needsToolCallId: true,
        parameters,
        userMessage: tool.userMessage
      });
      expect(
        await gated.tools[0].execute({ value: "one", _tool_call_id: "call-1" })
      ).toEqual({ value: "one", _tool_call_id: "call-1" });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(adapt).not.toHaveBeenCalled();
      expect(gated.requests()).toEqual([
        { toolName: tool.name, category: "write", decision: "allow" }
      ]);
    } finally {
      adapt.mockRestore();
    }
  });

  for (const category of categories) {
    for (const mode of modes) {
      for (const approve of ["allow", "deny"] as const) {
        it(`${category} in ${mode} with ${approve}`, async () => {
          const execute = vi.fn(async () => ({ ok: true }));
          const tool = {
            name: `headless_${category}`,
            description: "Headless action",
            category,
            parameters: z.object({}),
            execute
          };
          const gated = gateHeadlessTools([tool], { mode, approve });
          const result = await gated.tools[0].execute({});
          const decision = decidePermission(mode, category);
          const allowed =
            decision === "allow" || (decision === "ask" && approve === "allow");
          expect(execute).toHaveBeenCalledTimes(allowed ? 1 : 0);
          expect(gated.requests()).toHaveLength(decision === "ask" ? 1 : 0);
          expect(result).toMatchObject(
            allowed
              ? { ok: true }
              : {
                  error:
                    decision === "block"
                      ? "blocked_in_plan_mode"
                      : "permission_denied"
                }
          );
        });
      }
    }
  }
});

describe("legacy compatibility boundary", () => {
  it("extracts native metadata without calling Tool.process or adapting it again", async () => {
    const ctx = context();
    const impl = vi.fn(async () => ({ ok: true }));
    const source = vi.fn((context: ProcessingContext) =>
      createCapabilityRun({
        context,
        gate: {
          mode: "auto",
          sessionAllow: new Set(),
          requestApproval: async () => "allow"
        }
      })
    );
    const native = adapters.toolFromCapability(
      {
        name: "native_read",
        description: "Read",
        inputSchema: {},
        category: "read"
      },
      impl,
      source
    );
    const process = vi.spyOn(native, "process");
    const belt = gateLegacyTools([native], {
      mode: "default",
      sessionAllow: new Set(),
      requestApproval: async () => "deny"
    });
    const run = capabilityRunForLegacyTool(belt[0], ctx);
    expect(run).toBe(capabilityRunForLegacyTool(belt[0], ctx));
    await belt[0].process(ctx, {});
    await belt[0].process(ctx, {});
    expect(process).not.toHaveBeenCalled();
    expect(source).toHaveBeenCalledTimes(1);
    expect(impl).toHaveBeenCalledTimes(2);
    expect(() => adapters.capabilityFromTool(native)).toThrow(
      "Native capabilities must not pass"
    );
  });

  it("validates a legacy Tool through its transitional capability boundary", async () => {
    const impl = vi.fn(async () => ({ ok: true }));
    class LegacyWrite extends Tool {
      readonly name = "create_workflow";
      readonly description = "Create a workflow";
      override get schema() {
        return z.object({ name: z.string() });
      }
      process = impl;
    }
    const entry = adapters.capabilityFromTool(new LegacyWrite());
    const run = createCapabilityRun({
      context: context(),
      gate: {
        mode: "auto",
        sessionAllow: new Set(),
        requestApproval: async () => "deny"
      },
      capabilities: [entry]
    });
    expect(await run.invoke(entry.spec.name, {})).toMatchObject({
      error: "invalid_tool_arguments"
    });
    expect(impl).not.toHaveBeenCalled();
    expect(await run.invoke(entry.spec.name, { name: "demo" })).toEqual({
      ok: true
    });
    expect(impl).toHaveBeenCalledTimes(1);
  });
});

it("blocks a registered capability before loading or invoking its implementation", async () => {
  const entry = capabilityForName("write_file");
  expect(capabilityForName("write_file")).toBe(entry);
  const impl = vi.spyOn(entry, "impl");
  try {
    const run = createCapabilityRun({
      context: context(),
      gate: {
        mode: "plan",
        sessionAllow: new Set(),
        requestApproval: async () => "allow"
      }
    });
    expect(
      await run.invoke("write_file", {
        path: "blocked.txt",
        content: "blocked"
      })
    ).toMatchObject({ error: "blocked_in_plan_mode" });
    expect(impl).not.toHaveBeenCalled();
  } finally {
    impl.mockRestore();
  }
});
