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
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
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
    expect(APP_CAPABILITIES.map((e) => e.spec.name)).toEqual(["debug_app"]);
  });

  it("classifies every capability the way the gate does today", () => {
    for (const entry of APP_CAPABILITIES) {
      expect(entry.spec.category).toBe(permissionCategoryFor(entry.spec.name));
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
