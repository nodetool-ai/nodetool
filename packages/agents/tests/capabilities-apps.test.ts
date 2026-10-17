/**
 * The `apps` capability module.
 *
 * The registry the two tools took as a constructor argument is `run.nodeRegistry`
 * now, so the behavioural check is the one that argument governed: without a
 * registry both refuse, and with one they reach the service.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { capabilitySpec } from "../src/capabilities/index.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";
import { initTestDb, Workflow } from "@nodetool-ai/models";
import {
  APP_CAPABILITIES,
  module as appsModule
} from "../src/capabilities/apps.js";
import {
  UNGATED,
  createCapabilityRun,
  toolFromCapability
} from "../src/capabilities/index.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import type { Tool } from "../src/tools/base-tool.js";

const ctx = { userId: "user-apps" } as unknown as ProcessingContext;

/** A registry that resolves nothing — enough to get past the "no registry" gate. */
const stubRegistry = {
  has: () => false,
  getMetadata: () => undefined,
  resolve: () => {
    throw new Error("stub registry resolves nothing");
  },
  resolveMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

function asTool(name: string, registry?: NodeRegistry): Tool {
  const entry = APP_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no apps capability named "${name}"`);
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry })
  );
}

beforeEach(() => {
  initTestDb();
});

describe("apps capability module", () => {
  it("is registered and drift-clean", async () => {
    const loaded = await loadCapabilityModule("apps");
    expect(loaded).toBe(appsModule);
    expect(capabilityModuleIssues("apps", loaded)).toEqual([]);
  });

  it("carries the wire names the tools carried", () => {
    expect(APP_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "debug_app",
      "list_apps",
      "get_app",
      "create_app",
      "edit_app",
      "delete_app"
    ]);
  });

  it("classifies every capability the way the gate does today", () => {
    for (const entry of APP_CAPABILITIES) {
      expect(entry.spec.category).toBe(capabilityCategoryFor(entry.spec.name));
    }
  });

  it("renders as a Tool, spec for spec", () => {
    for (const tool of [toolForCapabilityName("debug_app")] as Tool[]) {
      const entry = APP_CAPABILITIES.find((e) => e.spec.name === tool.name);
      expect(entry).toBeDefined();
      expect(tool.description).toBe(entry!.spec.description);
      expect(tool.inputSchema).toEqual(entry!.spec.inputSchema);
    }
  });

  it("keeps the user-facing message templates", () => {
    const byName = (name: string) =>
      APP_CAPABILITIES.find((e) => e.spec.name === name)!.spec;
    expect(
      byName("debug_app").userMessage?.({ application_id: "app-1", run: false })
    ).toBe("Checking app app-1 wiring");
  });
});

describe("create_app and edit_app", () => {
  it("creates the app untitled — the name lives on the row, not in the page", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Note drafter"
    })) as Record<string, unknown>;
    const read = (await asTool("get_app").process(ctx, {
      application_id: String(created.application_id)
    })) as Record<string, unknown>;
    const document = read.document as {
      ui: { root: { props: Record<string, unknown> } };
    };
    // The runtime renders a root title as a heading of its own, so stamping the
    // name here gave every new app a heading nobody placed.
    expect(document.ui.root.props.title).toBeUndefined();
  });

  /** The whole authoring loop a headless agent has: create, edit, read back. */
  it("creates an app and edits it through the App Builder tools", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Note drafter",
      description: "Drafts a note"
    })) as Record<string, unknown>;
    expect(created.ok).toBe(true);
    expect(created.id).toBe(created.application_id);
    const id = String(created.application_id);

    const edited = (await asTool("edit_app").process(ctx, {
      application_id: id,
      steps: [
        {
          tool: "add_operation",
          input: { id: "draft", name: "Draft", target_workflow_id: "wf-1" }
        },
        { tool: "ui_app_add_component", input: { type: "Heading" } }
      ]
    })) as Record<string, unknown>;
    expect(edited.ok).toBe(true);
    expect(edited.saved).toBe(true);
    expect((edited.operations as { id: string }[]).map((o) => o.id)).toEqual([
      "draft"
    ]);
    expect((edited.components as { type: string }[])[0]?.type).toBe("Heading");

    // The edit is in the row, not just in the answer.
    const read = (await asTool("get_app").process(ctx, {
      application_id: id
    })) as Record<string, unknown>;
    const document = read.document as {
      operations: { id: string }[];
      ui: { content: { type: string }[] };
    };
    expect(document.operations.map((o) => o.id)).toEqual(["draft"]);
    expect(document.ui.content.map((c) => c.type)).toEqual(["Heading"]);
  });

  it("reports a step that names no tool, and saves the rest", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Partial"
    })) as Record<string, unknown>;
    const result = (await asTool("edit_app").process(ctx, {
      application_id: String(created.application_id),
      steps: [
        { tool: "add_component", input: { type: "Heading" } },
        { tool: "no_such_tool", input: {} }
      ]
    })) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.saved).toBe(true);
    const steps = result.steps as Record<string, unknown>[];
    expect(steps[0]?.ok).toBe(true);
    expect(String(steps[1]?.error)).toContain("No such App Builder tool");
  });

  it("rejects malformed step wrappers without saving earlier edits", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Malformed"
    })) as Record<string, unknown>;
    const id = String(created.application_id);
    const result = (await asTool("edit_app").process(ctx, {
      application_id: id,
      steps: [
        { tool: "declare_variable", input: { name: "accidental" } },
        { tool: "set_title", args: { title: "Ignored" } }
      ]
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("input");
    const read = (await asTool("get_app").process(ctx, {
      application_id: id
    })) as { document: { variables: unknown[] } };
    expect(read.document.variables).toEqual([]);
  });

  it("validates every tool argument before executing the batch", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Invalid arguments"
    })) as Record<string, unknown>;
    const id = String(created.application_id);
    const result = (await asTool("edit_app").process(ctx, {
      application_id: id,
      steps: [
        { tool: "declare_variable", input: { name: "accidental" } },
        {
          tool: "add_component",
          input: {
            type: "Button",
            props: { events: [{ event: "click", action: "run" }] }
          }
        }
      ]
    })) as Record<string, unknown>;
    expect(result.saved).toBe(false);
    const read = (await asTool("get_app").process(ctx, {
      application_id: id
    })) as { document: { variables: unknown[] } };
    expect(read.document.variables).toEqual([]);
  });

  it("persists full workflow IDs and reads bindings from legacy saved prefixes", async () => {
    const workflow = await Workflow.create<Workflow>({
      user_id: "user-apps",
      name: "Echo",
      graph: {
        nodes: [
          {
            id: "input",
            type: "nodetool.input.StringInput",
            data: { name: "message" }
          },
          {
            id: "output",
            type: "nodetool.output.Output",
            data: { name: "result" }
          }
        ],
        edges: []
      }
    });
    const created = (await asTool("create_app").process(ctx, {
      name: "Echo",
      from_workflow_id: workflow.id.slice(0, 12)
    })) as Record<string, unknown>;
    const read = (await asTool("get_app").process(ctx, {
      application_id: String(created.application_id)
    })) as { document: ApplicationDocument };
    expect(read.document.operations[0]?.workflowId).toBe(workflow.id);

    const legacyDocument = structuredClone(read.document);
    legacyDocument.operations[0]!.workflowId = workflow.id.slice(0, 12);
    const legacy = (await asTool("create_app").process(ctx, {
      name: "Legacy Echo",
      document: legacyDocument
    })) as Record<string, unknown>;
    for (const app of [created, legacy]) {
      const result = (await asTool("edit_app").process(ctx, {
        application_id: String(app.application_id),
        steps: [{ tool: "get_binding_targets", input: {} }]
      })) as {
        steps: {
          result: {
            operations: {
              inputs: { binding: string }[];
              outputs: { binding: string }[];
            }[];
          };
        }[];
      };
      expect(result.steps[0]?.result.operations[0]?.inputs).toEqual([
        expect.objectContaining({ binding: "op:main/in:input" })
      ]);
      expect(result.steps[0]?.result.operations[0]?.outputs).toEqual([
        expect.objectContaining({ binding: "op:main/out:output" })
      ]);
    }
  });

  it("loads bindings by canonical ID when workflow_ids supplies a prefix", async () => {
    const workflow = await Workflow.create<Workflow>({
      user_id: "user-apps",
      name: "Echo",
      graph: {
        nodes: [
          {
            id: "input",
            type: "nodetool.input.StringInput",
            data: { name: "message" }
          }
        ],
        edges: []
      }
    });
    const created = (await asTool("create_app").process(ctx, {
      name: "Echo"
    })) as Record<string, unknown>;
    const result = (await asTool("edit_app").process(ctx, {
      application_id: String(created.application_id),
      workflow_ids: [workflow.id.slice(0, 12)],
      steps: [
        {
          tool: "add_operation",
          input: { id: "echo", target_workflow_id: workflow.id }
        },
        { tool: "get_binding_targets", input: {} }
      ]
    })) as {
      steps: {
        result: {
          operations: { ioAvailable: boolean; inputs: { binding: string }[] }[];
        };
      }[];
    };
    expect(result.steps[1]?.result.operations[0]).toMatchObject({
      ioAvailable: true,
      inputs: [expect.objectContaining({ binding: "op:echo/in:input" })]
    });
  });

  it("rejects ambiguous workflow prefixes and never guesses shorter prefixes", async () => {
    const prefix = "0123456789ab";
    for (const suffix of ["0".repeat(20), "1".repeat(20)]) {
      await Workflow.create<Workflow>({
        id: prefix + suffix,
        user_id: "user-apps",
        name: "Echo",
        graph: { nodes: [], edges: [] }
      });
    }
    const created = (await asTool("create_app").process(ctx, {
      name: "Bindings"
    })) as Record<string, unknown>;
    const id = String(created.application_id);
    await expect(
      asTool("edit_app").process(ctx, {
        application_id: id,
        workflow_ids: [prefix],
        steps: []
      })
    ).rejects.toThrow("matches more than one");
    const result = (await asTool("edit_app").process(ctx, {
      application_id: id,
      workflow_ids: [prefix.slice(0, 11)],
      steps: [
        {
          tool: "add_operation",
          input: { id: "echo", target_workflow_id: prefix.slice(0, 11) }
        },
        { tool: "get_binding_targets", input: {} }
      ]
    })) as { steps: { result: { operations: { ioAvailable: boolean }[] } }[] };
    expect(result.steps[1]?.result.operations[0]?.ioAvailable).toBe(false);
  });

  it("reports tool-declared failures while saving successful steps", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Partial"
    })) as Record<string, unknown>;
    const result = (await asTool("edit_app").process(ctx, {
      application_id: String(created.application_id),
      steps: [
        { tool: "add_component", input: { type: "Heading" } },
        {
          tool: "update_component",
          input: { id: "missing", props: { text: "fail" } }
        }
      ]
    })) as { ok: boolean; saved: boolean; steps: { ok: boolean }[] };
    expect(result).toMatchObject({ ok: false, saved: true });
    expect(result.steps.map((step) => step.ok)).toEqual([true, false]);
  });

  it("answers with the tool catalog when given no steps", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Catalog"
    })) as Record<string, unknown>;
    const result = (await asTool("edit_app").process(ctx, {
      application_id: String(created.application_id)
    })) as Record<string, unknown>;
    const tools = result.tools as { name: string }[];
    expect(tools.map((tool) => tool.name)).toContain("ui_app_add_component");
  });

  it("refuses an edit written against a stale read", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Stale"
    })) as Record<string, unknown>;
    const result = (await asTool("edit_app").process(ctx, {
      application_id: String(created.application_id),
      base_updated_at: "1999-01-01T00:00:00.000Z",
      steps: [{ tool: "add_component", input: { type: "Heading" } }]
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("concurrency conflict");
  });

  it("reports another user's app as missing", async () => {
    const created = (await asTool("create_app").process(ctx, {
      name: "Not yours"
    })) as Record<string, unknown>;
    const other = { userId: "user-other" } as unknown as ProcessingContext;
    const result = (await asTool("edit_app").process(other, {
      application_id: String(created.application_id),
      steps: []
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("not yours");
  });
});

describe("apps capabilities against the run", () => {
  it("refuses without a node registry on the run", async () => {
    const result = (await asTool("debug_app").process(ctx, {
      application_id: "app-1"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("no node registry");
  });

  it("reaches the service once the run carries one", async () => {
    const result = (await asTool("debug_app", stubRegistry).process(ctx, {
      application_id: "app-1"
    })) as Record<string, unknown>;
    // Past the registry gate: the service now answers about the missing app.
    expect(String(result.error)).toContain("No application found");
  });
});

describe("spec text the shipped skills rely on", () => {
  it("debug_app does not send an agent to poll an HTTP route", () => {
    const description = capabilitySpec("debug_app")?.description ?? "";
    expect(description).not.toMatch(
      /read GET \/api\/debug\/sessions\/<id> until/
    );
    expect(description).toContain("`timeout_ms`");
  });
});
