/**
 * The belt must carry the timeline and sketch capabilities the object model
 * advertises, and the chat prompt tells an agent to use.
 *
 * The failure this pins: a chat authored a five-track motion-graphics sequence
 * with `create_timeline` + `edit_timeline`, then called
 * `nodetool.timelines.validate` and `nodetool.timelines.preview` — both
 * documented methods, both refused with `tool "…" is not in this toolbelt`.
 * The agent fell back to `ui_timeline_get_clip_frames`, which needs the
 * document open in a browser, and finished by telling the user it could not
 * look at its own work. Authoring was on the belt; checking and seeing were
 * not.
 */
import { describe, it, expect } from "vitest";

import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";
import { getAllMcpTools } from "../src/tools/mcp-tools.js";
import { NODETOOL_API_NAMESPACE_TOOLS } from "../src/codeact/nodetool-api.js";

/** Every name the websocket chat turn assembles from this package. */
function chatBeltNames(): Set<string> {
  return new Set([
    ...BUILTIN_TOOL_NAMES,
    ...getAllMcpTools({}).map((tool) => tool.name)
  ]);
}

describe("timeline and sketch belt coverage", () => {
  it("serves every timeline method the object model advertises", () => {
    const names = chatBeltNames();
    const advertised = NODETOOL_API_NAMESPACE_TOOLS["timelines"] ?? [];
    expect(advertised.filter((name) => !names.has(name))).toEqual([]);
  });

  it("serves every sketch method the object model advertises", () => {
    const names = chatBeltNames();
    const advertised = NODETOOL_API_NAMESPACE_TOOLS["sketches"] ?? [];
    expect(advertised.filter((name) => !names.has(name))).toEqual([]);
  });

  /**
   * A context is the whole dependency for these, so they belong beside the
   * other timeline built-ins rather than behind an injected registry — a Code
   * node and a JS script get them too.
   */
  it("keeps the context-only capabilities as built-ins", () => {
    expect(BUILTIN_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "validate_timeline",
        "preview_timeline_frame",
        "compare_timeline_frames",
        "set_timeline_document",
        "validate_sketch"
      ])
    );
  });

  /**
   * The capability table in `docs/plans/motion-graphics.md` § Agent surface.
   * The plan's whole second outcome is that an agent can direct motion work
   * headlessly, and every row of it is a name that has to be on a belt.
   */
  it("serves every capability the motion-graphics plan names", () => {
    const names = chatBeltNames();
    const planned = [
      "set_timeline_document",
      "edit_timeline",
      "list_compositions",
      "get_composition",
      "save_composition",
      "render_timeline",
      "preview_timeline_frame",
      "compare_timeline_frames",
      "validate_timeline",
      "detect_audio_events"
    ];
    expect(planned.filter((name) => !names.has(name))).toEqual([]);
  });

  /**
   * The structural ops the plan adds reach the agent through `edit_timeline`,
   * which dispatches to the one bridge the `ui_timeline_*` tools and the eval
   * share (invariant I11). An op missing there is missing everywhere.
   */
  it("dispatches every structural op the plan names", async () => {
    const { createTimelineToolBridge } = await import(
      "../src/evals/surfaces/timeline.js"
    );
    const names = new Set(
      createTimelineToolBridge().tools.map((tool) => tool.name)
    );
    const ops = [
      "add_group",
      "set_parent",
      "set_transition",
      "set_mask",
      "set_matte",
      "set_effects",
      "set_time_remap",
      "add_marker",
      "delete_marker",
      "snap_to_beats",
      "insert_composition",
      "animate_clip"
    ];
    expect(
      ops.filter((op) => !names.has(`ui_timeline_${op}`))
    ).toEqual([]);
  });

  /**
   * `render_timeline` runs a workflow, so it needs the node registry the run
   * tools need. It is the one timeline capability that cannot be a built-in,
   * and a belt without it leaves an agent authoring cuts it can never export.
   */
  it("puts render_timeline beside the run tools, not on the built-ins", () => {
    expect(BUILTIN_TOOL_NAMES).not.toContain("render_timeline");
    const names = getAllMcpTools({}).map((tool) => tool.name);
    expect(names).toContain("render_timeline");
  });
});
