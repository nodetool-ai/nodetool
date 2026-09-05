/**
 * The `apps` capability module.
 *
 * The registry the two tools took as a constructor argument is `run.nodeRegistry`
 * now, so the behavioural check is the one that argument governed: without a
 * registry both refuse, and with one they reach the service.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { initTestDb } from "@nodetool-ai/models";
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
    expect(
      (edited.operations as { id: string }[]).map((o) => o.id)
    ).toEqual(["draft"]);
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
