/**
 * The `google` capability module: the twenty Drive/Gmail/Docs/Sheets/Calendar
 * capabilities.
 *
 * Nothing here talks to Google. What a port can break without a network is the
 * surface — a renamed wire name, a dropped schema field, a reclassified
 * capability — and the one behaviour the base class contributed: a failure
 * comes back as `{error}` instead of throwing, so an agent can re-authenticate
 * rather than abort the step. A run with no Google token exercises exactly
 * that path.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { GOOGLE_CAPABILITIES } from "../src/capabilities/google.js";
import {
  capabilityCategoryFor,
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { getGoogleWorkspaceTools } from "../src/tools/google-workspace-tools.js";

/** A context with no Google credential — `getSecret` finds nothing. */
function tokenlessContext(): ProcessingContext {
  return {
    getSecret: async () => undefined,
    get: () => undefined,
    set: () => {}
  } as unknown as ProcessingContext;
}

describe("the google capability module", () => {
  it("registers without drift and exports the twenty wire names", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
    const mod = await loadCapabilityModule("google");
    expect(mod.exports.map((e) => e.spec.name)).toEqual([
      "google_drive_search",
      "google_drive_get_file",
      "google_drive_read_file",
      "google_drive_create_file",
      "gmail_search",
      "gmail_get_message",
      "gmail_send_message",
      "gmail_modify_labels",
      "gmail_list_labels",
      "google_docs_read",
      "google_docs_create",
      "google_docs_append",
      "google_sheets_read",
      "google_sheets_append",
      "google_sheets_update",
      "google_sheets_create",
      "google_calendar_list_calendars",
      "google_calendar_list_events",
      "google_calendar_create_event",
      "google_calendar_delete_event"
    ]);
  });

  it("classes every capability exactly as the permission map does", () => {
    for (const entry of GOOGLE_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("leaves the deprecated classes with the surface they had", () => {
    const tools = new Map(getGoogleWorkspaceTools().map((t) => [t.name, t]));
    expect(tools.size).toBe(GOOGLE_CAPABILITIES.length);
    for (const entry of GOOGLE_CAPABILITIES) {
      const tool = tools.get(entry.spec.name);
      expect(tool).toBeDefined();
      expect(tool?.description).toBe(entry.spec.description);
      expect(tool?.inputSchema).toEqual(entry.spec.inputSchema);
      expect(tool?.userMessage({ query: "q", name: "n", title: "t" })).toBe(
        entry.spec.userMessage?.({ query: "q", name: "n", title: "t" })
      );
    }
  });

  it("returns the missing-token failure as a result, not a throw", async () => {
    const run = createCapabilityRun({
      context: tokenlessContext(),
      gate: UNGATED
    });
    for (const entry of GOOGLE_CAPABILITIES) {
      const result = (await run.invoke(entry.spec.name, {})) as {
        error?: string;
      };
      expect(typeof result.error).toBe("string");
    }
  });
});
