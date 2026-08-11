/**
 * The two migration adapters. `toolFromCapability` is what lets a ported
 * namespace reach every belt unchanged; `capabilityFromTool` is what lets the
 * unported long tail reach a `CapabilityRun`. A round trip through both must
 * change nothing a caller can observe.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "../src/tools/base-tool.js";
import {
  capabilityFromTool,
  toolFromCapability
} from "../src/capabilities/adapters.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import type {
  CapabilityGate,
  CapabilityRun
} from "../src/capabilities/types.js";

const ctx = { userId: "u1" } as unknown as ProcessingContext;

const gate: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

function makeRun(context: ProcessingContext = ctx): CapabilityRun {
  return createCapabilityRun({ context, gate });
}

/** A stand-in for a not-yet-ported tool, with every observable surface set. */
class LegacyTool extends Tool {
  readonly name = "create_workflow";
  readonly description = "Create a workflow from a graph.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false
  };
  seen: { context: ProcessingContext; params: Record<string, unknown> }[] = [];

  override userMessage(params: Record<string, unknown>): string {
    return `Creating workflow ${String(params["name"])}`;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.seen.push({ context, params });
    return { id: "wf_1", name: params["name"] };
  }
}

describe("capabilityFromTool", () => {
  it("carries the tool's identity, schema and message template", () => {
    const tool = new LegacyTool();
    const { spec } = capabilityFromTool(tool);
    expect(spec.name).toBe(tool.name);
    expect(spec.description).toBe(tool.description);
    expect(spec.inputSchema).toEqual(tool.inputSchema);
    expect(spec.userMessage?.({ name: "demo" })).toBe(
      "Creating workflow demo"
    );
  });

  it("takes the category from the classification map the gate reads today", () => {
    expect(capabilityFromTool(new LegacyTool()).spec.category).toBe("write");
  });

  it("classifies an unlisted tool conservatively, as the map does", () => {
    class Unlisted extends Tool {
      readonly name = "some_brand_new_tool";
      readonly description = "x";
      async process(): Promise<unknown> {
        return null;
      }
    }
    expect(capabilityFromTool(new Unlisted()).spec.category).toBe("external");
  });

  it("runs the tool against the run's context", async () => {
    const tool = new LegacyTool();
    const { impl } = capabilityFromTool(tool);
    const run = makeRun();
    const result = await impl(run, { name: "demo" });
    expect(result).toEqual({ id: "wf_1", name: "demo" });
    expect(tool.seen).toEqual([{ context: ctx, params: { name: "demo" } }]);
  });
});

describe("toolFromCapability", () => {
  it("exposes the spec as a Tool and runs the implementation", async () => {
    const seen: Record<string, unknown>[] = [];
    const tool = toolFromCapability(
      {
        name: "list_widgets",
        description: "List widgets.",
        inputSchema: { type: "object", properties: {} },
        category: "read",
        userMessage: (args) => `Listing ${String(args["kind"])} widgets`
      },
      async (_run, args) => {
        seen.push(args);
        return { widgets: [] };
      },
      makeRun()
    );

    expect(tool.name).toBe("list_widgets");
    expect(tool.description).toBe("List widgets.");
    expect(tool.inputSchema).toEqual({ type: "object", properties: {} });
    expect(tool.userMessage({ kind: "small" })).toBe("Listing small widgets");
    expect(await tool.process(ctx, { kind: "small" })).toEqual({ widgets: [] });
    expect(seen).toEqual([{ kind: "small" }]);
  });

  it("falls back to the base message when the spec has no template", () => {
    const tool = toolFromCapability(
      {
        name: "list_widgets",
        description: "List widgets.",
        inputSchema: { type: "object", properties: {} },
        category: "read"
      },
      async () => null,
      makeRun()
    );
    expect(tool.userMessage({})).toBe("Running list_widgets");
    expect(tool.userMessage({ _message: "Doing it" })).toBe("Doing it");
  });

  it("builds a run per call when handed a factory", async () => {
    const contexts: ProcessingContext[] = [];
    const tool = toolFromCapability(
      {
        name: "list_widgets",
        description: "List widgets.",
        inputSchema: { type: "object", properties: {} },
        category: "read"
      },
      async (run) => {
        contexts.push(run.context);
        return null;
      },
      (context) => makeRun(context)
    );
    const other = { userId: "u2" } as unknown as ProcessingContext;
    await tool.process(ctx, {});
    await tool.process(other, {});
    expect(contexts).toEqual([ctx, other]);
  });

  it("renders a provider tool with the _message field injected", () => {
    const tool = toolFromCapability(
      {
        name: "list_widgets",
        description: "List widgets.",
        inputSchema: { type: "object", properties: { kind: { type: "string" } } },
        category: "read"
      },
      async () => null,
      makeRun()
    );
    const provider = tool.toProviderTool();
    expect(provider.name).toBe("list_widgets");
    const properties = (provider.inputSchema as { properties: object })
      .properties;
    expect(Object.keys(properties).sort()).toEqual(["_message", "kind"]);
  });
});

describe("round trip", () => {
  it("Tool → capability → Tool preserves every observable surface", async () => {
    const original = new LegacyTool();
    const { spec, impl } = capabilityFromTool(original);
    const rebuilt = toolFromCapability(spec, impl, makeRun());

    expect(rebuilt.name).toBe(original.name);
    expect(rebuilt.description).toBe(original.description);
    expect(rebuilt.inputSchema).toEqual(original.inputSchema);
    expect(rebuilt.userMessage({ name: "demo" })).toBe(
      original.userMessage({ name: "demo" })
    );
    expect(rebuilt.toProviderTool()).toEqual(original.toProviderTool());

    expect(await rebuilt.process(ctx, { name: "demo" })).toEqual(
      await original.process(ctx, { name: "demo" })
    );
    expect(Tool.resolveMessage(rebuilt, { name: "demo" })).toBe(
      Tool.resolveMessage(original, { name: "demo" })
    );
  });
});
