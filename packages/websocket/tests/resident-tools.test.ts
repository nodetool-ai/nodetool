import { describe, it, expect } from "vitest";
import { RESOURCE_KINDS } from "@nodetool-ai/protocol";
import {
  GRAPH_MODEL_PROMPT_SECTION,
  buildNodetoolApiPromptSection,
  nodetoolApiCoveredToolNames
} from "@nodetool-ai/agents";
import {
  RESIDENT_TOOL_NAMES,
  CHAT_AGENT_SYSTEM_PROMPT,
  focusedUiToolNames
} from "../src/websocket-client-session.js";
import {
  APP_GUIDANCE_SECTION,
  WORKFLOW_GUIDANCE_SECTION,
  WORKFLOW_POINTER_SECTION,
  buildChatAgentSystemPrompt,
  buildUiGuidanceSection,
  workflowGuidanceForTurn
} from "../src/session/chat-prompt.js";

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

  it("keeps the graph tools resident on a focused workflow canvas", () => {
    // The graph tools carry no `ui_workflow_` prefix, so the node editor's
    // chat used to get none of them and authored new saved workflows instead.
    const names = [
      "ui_get_graph",
      "ui_add_node",
      "ui_connect_nodes",
      "ui_run_workflow",
      "ui_new_workflow",
      "ui_workflow_plan",
      "ui_app_add_component"
    ];

    expect(
      focusedUiToolNames({ focused: { type: "workflow", id: "wf-1" } }, names)
    ).toEqual([
      "ui_get_graph",
      "ui_add_node",
      "ui_connect_nodes",
      "ui_run_workflow",
      "ui_new_workflow",
      "ui_workflow_plan"
    ]);
    expect(
      focusedUiToolNames({ focused: { type: "app", id: "app-1" } }, names)
    ).toEqual(["ui_app_add_component"]);
  });

  it("keeps the non-destructive Markdown document tools in the turn block when a document has focus", () => {
    const names = [
      "read_document",
      "edit_document",
      "list_document_versions",
      "create_document_version",
      "rename_document_version",
      "delete_document_version",
      "restore_document_version",
      "export_document",
      "ui_app_add_component"
    ];

    expect(
      focusedUiToolNames(
        {
          focused: { type: "document", id: "doc-1", title: "Untitled.md" },
          source: "document_assistant"
        },
        names
      )
    ).toEqual([
      "read_document",
      "edit_document",
      "list_document_versions",
      "create_document_version",
      "rename_document_version",
      "restore_document_version",
      "export_document"
    ]);
    expect(
      focusedUiToolNames({ focused: { type: "app", id: "app-1" } }, names)
    ).toEqual(["ui_app_add_component"]);
  });

  it("explains staged proposal behavior by default and when staged, and direct mode only when direct", () => {
    const defaultGuidance = buildUiGuidanceSection({
      focused: { type: "document", id: "doc-1", title: "Notes.md" },
      source: "document_assistant"
    });
    expect(defaultGuidance).toContain("staged as a reviewable proposal");
    expect(defaultGuidance).not.toContain("apply at once");

    const stagedGuidance = buildUiGuidanceSection({
      focused: { type: "document", id: "doc-1", title: "Notes.md" },
      source: "document_assistant",
      document_edit_mode: "staged"
    });
    expect(stagedGuidance).toContain("staged as a reviewable proposal");
    expect(stagedGuidance).not.toContain("apply at once");

    const directGuidance = buildUiGuidanceSection({
      focused: { type: "document", id: "doc-1", title: "Notes.md" },
      source: "document_assistant",
      document_edit_mode: "direct"
    });
    expect(directGuidance).toContain("apply at once");
  });

  it("builds on the open canvas before the saved-workflow loop", () => {
    const section = WORKFLOW_GUIDANCE_SECTION.split("# Building workflows")[1];
    expect(section).toBeDefined();
    const editorRule = section.indexOf("ui_add_node");
    expect(editorRule).toBeGreaterThan(-1);
    expect(editorRule).toBeLessThan(section.indexOf("nodetool.workflows.validate"));
    expect(section).toContain("ui_new_workflow");
    expect(section).toContain("wait: true");
    expect(section).toContain("ui_focus_nodes");
    expect(section).toContain("ui_undo");
  });

  it("carries the workflow guide only on turns that can build a workflow", () => {
    expect(workflowGuidanceForTurn({ focused: { type: "workflow", id: "wf-1" } })).toBe(
      WORKFLOW_GUIDANCE_SECTION
    );
    expect(workflowGuidanceForTurn({ focused: { type: "app", id: "app-1" } })).toBe(
      APP_GUIDANCE_SECTION
    );
    for (const type of ["timeline", "storyboard", "sketch", "script"] as const) {
      expect(workflowGuidanceForTurn({ focused: { type, id: `${type}-1` } })).toBeNull();
    }
  });

  it("points a turn with nothing focused at the workflow skill instead of the guide", () => {
    // Workspace chat carried the whole guide on every turn, most of which
    // build no workflow. It now carries a short pointer.
    expect(workflowGuidanceForTurn(null)).toBe(WORKFLOW_POINTER_SECTION);
    expect(workflowGuidanceForTurn({ open: [] })).toBe(WORKFLOW_POINTER_SECTION);
    expect(WORKFLOW_POINTER_SECTION).toContain("`load_skill`");
    expect(WORKFLOW_POINTER_SECTION).toContain("`nodetool-workflow-builder`");
    expect(WORKFLOW_POINTER_SECTION.length).toBeLessThan(WORKFLOW_GUIDANCE_SECTION.length / 4);
  });

  it("edits and deletes a saved workflow with the calls that exist", () => {
    // The guide said "There is no update call", so a turn asked to rename a
    // workflow or change its tags searched for a tool it had been told was
    // missing. `update_workflow` and `delete_workflow` exist.
    for (const section of [WORKFLOW_GUIDANCE_SECTION, WORKFLOW_POINTER_SECTION]) {
      expect(section).not.toContain("no update call");
      expect(section).toContain("update_workflow({workflow_id");
      expect(section).toContain("delete_workflow({workflow_id})");
      expect(section).toContain("@nodetool-ai/sandbox-nodetool/workflows");
    }
  });

  it("documents the graph object model in the workflow guide", () => {
    expect(WORKFLOW_GUIDANCE_SECTION).toContain(GRAPH_MODEL_PROMPT_SECTION);
    expect(CHAT_AGENT_SYSTEM_PROMPT).not.toContain("openWorkflow");
  });

  it("does not add UI tools when no document has focus", () => {
    expect(focusedUiToolNames(null, ["ui_app_add_component"])).toEqual([]);
    // The 3D editor has no focus type; its chat source selects its tools.
    expect(
      focusedUiToolNames({ source: "model3d_assistant" }, ["ui_3d_add_object", "ui_app_add_component"])
    ).toEqual(["ui_3d_add_object"]);
  });

  it("teaches the build-and-verify loop as `nodetool.*` code", () => {
    for (const call of [
      "nodetool.workflows.validate",
      "nodetool.workflows.create",
      "nodetool.workflows.debug",
      "nodetool.apps.debug"
    ]) {
      expect(WORKFLOW_GUIDANCE_SECTION).toContain(call);
    }
  });

  it("grades the App Builder's live draft, not the saved row", () => {
    expect(WORKFLOW_GUIDANCE_SECTION).toContain("debug_app({document})");
    expect(APP_GUIDANCE_SECTION).toContain("debug_app({document})");
  });

  it("gives an app turn the app debugging part and a pointer to the workflow skill", () => {
    expect(APP_GUIDANCE_SECTION.startsWith("# Debugging mini apps")).toBe(true);
    expect(APP_GUIDANCE_SECTION).toContain("nodetool.apps.debug");
    expect(APP_GUIDANCE_SECTION).toContain("`nodetool-workflow-builder`");
    expect(APP_GUIDANCE_SECTION).not.toContain("# Building workflows");
    expect(APP_GUIDANCE_SECTION).not.toContain(GRAPH_MODEL_PROMPT_SECTION);
    expect(WORKFLOW_GUIDANCE_SECTION).toContain(
      APP_GUIDANCE_SECTION.split("\n\n")[0]
    );
    expect(APP_GUIDANCE_SECTION.length).toBeLessThan(WORKFLOW_GUIDANCE_SECTION.length / 5);
  });

  it("sends do-the-work asks to the flow pack, not to a saved graph", () => {
    // A turn asked to "run a pipeline: generate an image, then remove its
    // background" authored a workflow, saved it, and never ran it; asked to
    // do it without a graph, it bent `media.editImage` into a background
    // remover instead of calling the node. The routing rule rides with the
    // CodeAct section that documents the flow and DSL packs, because it only
    // applies when the session allows them.
    const section = buildNodetoolApiPromptSection(["generate_image"], {
      nativeFlow: true,
      graphDsl: true
    });
    expect(section).toContain("# Which surface runs the work");
    expect(section).toContain("the user wants the RESULT");
    expect(section).toContain("background remover");
    expect(section).toContain("Authoring it does not run it");
    expect(CHAT_AGENT_SYSTEM_PROMPT).not.toContain("# Doing node work");
    // The authoring loop rides behind the user's message, not in the system
    // prompt.
    expect(CHAT_AGENT_SYSTEM_PROMPT).not.toContain("# Building workflows");
    expect(WORKFLOW_GUIDANCE_SECTION.startsWith("# Building workflows")).toBe(true);
  });

  it("routes an attached image to editImage, not to a fresh generation", () => {
    // A turn given a reference image and "same exact style as the one you made
    // earlier" only ever called text-to-image, then told the user to burn the
    // caption on in Canva.
    const section = CHAT_AGENT_SYSTEM_PROMPT.split("# Attached images")[1];
    expect(section).toBeDefined();
    expect(section).toContain("nodetool.media.editImage");
    expect(section).toContain("reference_files");
    expect(section).toContain("renderText");
  });

  it("names every resource kind a reply can link", () => {
    const section = CHAT_AGENT_SYSTEM_PROMPT.split("# Media and links")[1];
    expect(section).toBeDefined();
    for (const kind of RESOURCE_KINDS) {
      expect(section).toContain(kind);
    }
  });

  it("states the import rule only in the CodeAct prompt", () => {
    // "Each capability is an import, no `tools.<name>()`" is stated once, next
    // to the import lines. The chat prompt and the guides do not repeat it.
    for (const text of [
      CHAT_AGENT_SYSTEM_PROMPT,
      WORKFLOW_GUIDANCE_SECTION,
      WORKFLOW_POINTER_SECTION,
      APP_GUIDANCE_SECTION
    ]) {
      expect(text).not.toContain("tools.<name>");
    }
  });

  it("keeps the system prompt free of turn-dependent text", () => {
    // The chat turn builds the system message with no ui context; the prompt
    // for a mode is one constant string, whatever the user has open.
    for (const mode of ["default", "auto", "plan"] as const) {
      const prompt = buildChatAgentSystemPrompt(mode);
      expect(prompt.startsWith(CHAT_AGENT_SYSTEM_PROMPT)).toBe(true);
      expect(prompt).toBe(buildChatAgentSystemPrompt(mode));
      expect(prompt).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
      expect(prompt).not.toContain("## What the user is looking at");
    }
    // The chat turn's system message is the base prompt alone: the mode's
    // rules ride in the turn context, so a mode switch keeps the prefix.
    expect(CHAT_AGENT_SYSTEM_PROMPT).not.toContain("Permission mode");
  });
});
