/**
 * The chat prompt's fixed cost: what each turn spends before the model works.
 * These pin the compact forms that keep it small, so a later change can't
 * quietly grow them back.
 */
import { describe, it, expect } from "vitest";
import { focusedToolSignature, toolSignature } from "../src/codeact/tool-api.js";
import {
  buildCodeActSystemPrompt,
  buildCodeActTurnSection,
  renderDeferredNames
} from "../src/codeact/prompt.js";
import { catalogLine } from "../src/skill-prompt.js";

const addTextClip = {
  name: "ui_timeline_add_text_clip",
  description: "Add a text clip. It lands on a new track unless trackId is given.",
  inputSchema: {
    type: "object",
    properties: {
      timeline_id: { type: "string" },
      text: { type: "string" },
      startMs: { type: "number" },
      style: {
        type: "object",
        properties: {
          fontFamily: { type: "string" },
          align: { type: "string", enum: ["left", "center", "right"] }
        }
      }
    },
    required: ["timeline_id", "text"]
  }
};

describe("focused tool list", () => {
  it("spells out the shapes the system catalog's signature leaves out", () => {
    expect(focusedToolSignature(addTextClip)).toBe(
      'await ui_timeline_add_text_clip({timeline_id: string, text: string, startMs?: number, style?: {fontFamily?: string, align?: "left" | "center" | "right"}})'
    );
  });

  it("names tools the usage table does not rank, with no signature or purpose", () => {
    const tools = Array.from({ length: 30 }, (_, i) => ({
      ...addTextClip,
      name: `ui_timeline_tool_${String(i).padStart(2, "0")}`
    }));
    const grafted = new Map(tools.map((t) => [t.name, "@nodetool-ai/sandbox-nodetool/ui"]));
    const text = buildCodeActTurnSection({ tools, graftedSpecifiers: grafted });
    expect(text).not.toContain("- await ");
    expect(text).not.toContain("Add a text clip");
    expect(text).toContain("ui_timeline_tool_00, ui_timeline_tool_01");
    expect(text).toContain('nodetool.searchTools("select:');
    expect(toolSignature(addTextClip)).toContain("fontFamily");
  });
});

describe("deferred tool names", () => {
  const names = [
    "list_skills",
    "load_skill",
    "ui_timeline_get_state",
    "ui_timeline_add_track",
    "ui_timeline_split_clip",
    "ui_timeline_move_clip",
    "ui_copy",
    "ui_paste"
  ];

  it("folds an editor's tool family into one line without a count", () => {
    const text = renderDeferredNames(names);
    expect(text).toContain("- `ui_timeline_*`: timeline editor");
    expect(text).toContain('nodetool.searchTools("<editor> <what you need>")');
    expect(text).not.toContain("ui_timeline_split_clip");
    // A count would change the system prompt when an editor adds a tool.
    expect(text).not.toMatch(/\d/);
  });

  it("keeps every server tool name exact for select: lookups", () => {
    const text = renderDeferredNames(names);
    expect(text.split("\n\n")[0]).toBe("list_skills, load_skill");
  });

  it("folds the remaining ui_* client tools into one line", () => {
    const text = renderDeferredNames(names);
    expect(text).not.toContain("ui_copy");
    expect(text).toContain("- other `ui_*` editor tools");
    expect(renderDeferredNames(["ui_svg_get", "ui_svg_set"])).toBe(
      'Find an editor\'s tools with `nodetool.searchTools("<editor> <what you need>")`:\n' +
        "- other `ui_*` editor tools"
    );
  });

  it("is the same text whatever the family sizes", () => {
    const more = [...names, "ui_timeline_trim_clip"];
    expect(renderDeferredNames(more)).toBe(renderDeferredNames(names));
  });
});

describe("skill catalog lines", () => {
  it("keeps the first sentence", () => {
    expect(catalogLine("Build a game. For a glTF model use another skill.")).toBe(
      "Build a game"
    );
  });

  it("cuts the first sentence at its first clause break", () => {
    expect(
      catalogLine(
        "Do or automate web tasks in NodeTool: search, read pages, extract data."
      )
    ).toBe("Do or automate web tasks in NodeTool");
    expect(
      catalogLine("Build, edit or render a sketch (image document), with layers.")
    ).toBe("Build, edit or render a sketch");
    // A break too early to leave a usable line is kept.
    expect(catalogLine("Use it: a short one.")).toBe("Use it: a short one");
  });

  it("caps a long first sentence", () => {
    const line = catalogLine(`${"word ".repeat(60)}end.`);
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line).not.toMatch(/ …$/);
    expect(line.endsWith("…")).toBe(true);
  });
});

describe("sandbox built-ins", () => {
  it("names only what the sandbox has beyond standard ECMAScript", () => {
    const prompt = buildCodeActSystemPrompt({ tools: [], variant: "chat" });
    const line = prompt.split("\n").find((l) => l.startsWith("Built-ins:"));
    expect(line).toBeDefined();
    expect(line).toContain("URLSearchParams");
    expect(line).not.toContain("Float64Array");
  });
});
