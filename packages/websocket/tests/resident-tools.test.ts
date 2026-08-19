import { describe, it, expect } from "vitest";
import { RESOURCE_KINDS } from "@nodetool-ai/protocol";
import { nodetoolApiCoveredToolNames } from "@nodetool-ai/agents";
import {
  RESIDENT_TOOL_NAMES,
  CHAT_AGENT_SYSTEM_PROMPT,
  focusedUiToolNames
} from "../src/unified-websocket-runner.js";

describe("resident toolbelt", () => {
  it("keeps the tools with no `nodetool.*` form resident", () => {
    expect(RESIDENT_TOOL_NAMES.has("run_search")).toBe(true);
  });

  it("lists nothing the object model already wraps", () => {
    // Those names are filtered out of the CodeAct catalog, so naming one here
    // would be dead weight that reads as if it were documented.
    const covered = nodetoolApiCoveredToolNames(RESIDENT_TOOL_NAMES);
    expect([...covered]).toEqual([]);
  });

  it("keeps opening a document resident, so a closed document is never a dead end", () => {
    expect(RESIDENT_TOOL_NAMES.has("ui_open_document")).toBe(true);
  });

  it("keeps only the focused surface's registered UI tools resident", () => {
    const names = [
      "ui_app_add_component",
      "ui_app_get_snapshot",
      "ui_timeline_add_track",
      "ui_open_document"
    ];

    expect(
      focusedUiToolNames({ focused: { type: "app", id: "app-1" } }, names)
    ).toEqual(["ui_app_add_component", "ui_app_get_snapshot"]);
  });

  it("does not add UI tools when no document has focus", () => {
    expect(focusedUiToolNames(null, ["ui_app_add_component"])).toEqual([]);
  });

  it("teaches the build-and-verify loop as `nodetool.*` code", () => {
    for (const call of [
      "nodetool.workflows.validate",
      "nodetool.workflows.create",
      "nodetool.workflows.debug",
      "nodetool.apps.debug"
    ]) {
      expect(CHAT_AGENT_SYSTEM_PROMPT).toContain(call);
    }
  });

  it("grades the App Builder's live draft, not the saved row", () => {
    expect(CHAT_AGENT_SYSTEM_PROMPT).toContain("debug_app({document})");
  });

  it("sends do-the-work asks to the flow pack, not to a saved graph", () => {
    // A turn asked to "run a pipeline: generate an image, then remove its
    // background" authored a workflow, saved it, and never ran it; asked to
    // do it without a graph, it bent `media.editImage` into a background
    // remover instead of calling the node.
    const section = CHAT_AGENT_SYSTEM_PROMPT.split(
      "# Doing node work without a workflow"
    )[1];
    expect(section).toBeDefined();
    expect(section).toContain("@nodetool-ai/sandbox-flow");
    expect(section).toContain("background removal");
    expect(section).toContain("Authoring one does not");
    // The routing rule is stated before the authoring loop it routes away from.
    expect(
      CHAT_AGENT_SYSTEM_PROMPT.indexOf("# Doing node work without a workflow")
    ).toBeLessThan(CHAT_AGENT_SYSTEM_PROMPT.indexOf("# Building workflows"));
  });

  it("describes every resource kind, not just workflows", () => {
    const section = CHAT_AGENT_SYSTEM_PROMPT.split("# NodeTool resources")[1];
    expect(section).toBeDefined();
    for (const kind of RESOURCE_KINDS) {
      expect(section).toContain(`**${kind}**`);
    }
  });
});
