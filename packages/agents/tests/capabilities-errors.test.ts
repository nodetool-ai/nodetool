/**
 * The `errors` capability module: registered, drift-clean, read-only, and
 * scoped to the run's user.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { initTestDb, recordErrorTrace } from "@nodetool-ai/models";
import {
  ERROR_CAPABILITIES,
  module as errorsModule
} from "../src/capabilities/errors.js";
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
import type { Tool } from "../src/tools/base-tool.js";

const USER = "user-errors";
const ctx = { userId: USER } as unknown as ProcessingContext;

function asTool(name: string): Tool {
  const entry = ERROR_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no errors capability named "${name}"`);
  return toolFromCapability(entry.spec, entry.impl, () =>
    createCapabilityRun({ context: ctx, gate: UNGATED })
  );
}

beforeEach(() => {
  initTestDb();
});

describe("errors capability module", () => {
  it("is registered, drift-clean and read-only", async () => {
    const loaded = await loadCapabilityModule("errors");
    expect(loaded).toBe(errorsModule);
    expect(capabilityModuleIssues("errors", loaded)).toEqual([]);
    for (const entry of ERROR_CAPABILITIES) {
      expect(capabilityCategoryFor(entry.spec.name)).toBe("read");
    }
  });

  it("lists grouped traces for the run's user only", async () => {
    await recordErrorTrace({ userId: USER, source: "job", message: "Node 1 failed" });
    await recordErrorTrace({ userId: USER, source: "job", message: "Node 2 failed" });
    await recordErrorTrace({ userId: "someone-else", source: "job", message: "not mine" });
    const result = (await asTool("list_error_traces").process(ctx, {})) as {
      groups: Array<{ count: number; message: string }>;
    };
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].count).toBe(2);
  });

  it("reads one trace by short id without the user id", async () => {
    const row = await recordErrorTrace({
      userId: USER,
      source: "http",
      message: "boom",
      stack: "    at x (y.js:1:1)"
    });
    const trace = (await asTool("get_error_trace").process(ctx, {
      trace_id: row!.id.slice(0, 12)
    })) as Record<string, unknown>;
    expect(trace.id).toBe(row!.id);
    expect(trace.stack).toContain("at x");
    expect(trace).not.toHaveProperty("user_id");
  });

  it("exports a Markdown report", async () => {
    const row = await recordErrorTrace({ userId: USER, source: "job", errorType: "Error", message: "bad" });
    const result = (await asTool("export_error_report").process(ctx, {
      trace_ids: [row!.id]
    })) as { markdown: string; trace_ids: string[] };
    expect(result.trace_ids).toEqual([row!.id]);
    expect(result.markdown).toContain("### Error: bad");
  });
});
