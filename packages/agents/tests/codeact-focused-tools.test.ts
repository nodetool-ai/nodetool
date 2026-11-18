/**
 * Progressive disclosure of a focused document's tools. The turn block names
 * them with one line each (level 1), `nodetool.searchTools("select:…")`
 * returns a tool's full documentation (level 2), and a call that fails
 * argument validation carries the full signature once.
 *
 * Built from the same headless bridges the eval and training harnesses
 * register, so each case pins what the model is told about a real schema. The
 * level 2 cases are the ones that misled the student in its traces.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildCodeActTurnSection } from "../src/codeact/prompt.js";
import {
  FOCUSED_TOOL_CALLS,
  rankFocusedTools
} from "../src/codeact/focused-tool-usage.js";
import {
  firstSentence,
  focusedToolSignature,
  renderToolSignature,
  toolPurpose,
  toolSearchHit,
  type ToolSignatureSource
} from "../src/codeact/tool-api.js";
import {
  FOCUSED_SURFACES,
  focusedSurfaceTools,
  uiGraft,
  type FocusedSurface
} from "./fixtures/focused-surface-tools.js";

const surfaces = new Map<FocusedSurface, ToolSignatureSource[]>();

beforeAll(async () => {
  for (const surface of FOCUSED_SURFACES) {
    surfaces.set(surface, await focusedSurfaceTools(surface));
  }
});

function toolsOf(surface: FocusedSurface): ToolSignatureSource[] {
  const tools = surfaces.get(surface);
  if (!tools) throw new Error(`no tools for ${surface}`);
  return tools;
}

function tool(surface: FocusedSurface, name: string): ToolSignatureSource {
  const found = toolsOf(surface).find((t) => t.name === name);
  if (!found) throw new Error(`${surface} has no ${name}`);
  return found;
}

function block(surface: FocusedSurface, tools = toolsOf(surface)): string {
  return buildCodeActTurnSection({ tools, graftedSpecifiers: uiGraft(tools) });
}

/** What `searchTools("select:<name>")` answers for one tool. */
function selected(surface: FocusedSurface, name: string) {
  return toolSearchHit(tool(surface, name), "ui", "full");
}

/** The full documentation a select: hit carries, as one string. */
function selectedText(surface: FocusedSurface, name: string): string {
  const hit = selected(surface, name);
  return `${hit.signature ?? ""}\n${hit.description}\n${hit.import ?? ""}`;
}

describe("level 1: the turn block", () => {
  // 700 Qwen3.5 tokens. These blocks measure about 4.1 characters per token,
  // so the ceiling is in a unit that needs no tokenizer.
  it.each(FOCUSED_SURFACES)("keeps the %s block under 2,870 characters", (surface) => {
    expect(block(surface).length).toBeLessThanOrEqual(2870);
  });

  it.each(FOCUSED_SURFACES)("has no signatures and no full descriptions for %s", (surface) => {
    const text = block(surface);
    expect(text).not.toContain("- await ");
    for (const t of toolsOf(surface)) {
      expect(text).not.toContain(`${t.name}(`);
      const description = (t.description ?? "").trim().replace(/\s+/g, " ");
      if (description.length > 120) expect(text).not.toContain(description);
    }
  });

  it.each(FOCUSED_SURFACES)("names every %s tool, with a purpose for the used ones", (surface) => {
    const text = block(surface);
    const { described, named } = rankFocusedTools(toolsOf(surface));
    for (const t of described) {
      expect(text).toContain(`- ${t.name}: ${toolPurpose(t.description ?? "")}`);
    }
    for (const t of named) {
      expect(text).toContain(t.name);
      expect(text).not.toContain(`- ${t.name}:`);
    }
  });

  it("gives each purpose about 15 tokens or less", () => {
    for (const surface of FOCUSED_SURFACES) {
      for (const t of toolsOf(surface)) {
        expect(toolPurpose(t.description ?? "").length).toBeLessThanOrEqual(60);
      }
    }
  });

  it("says how to look a tool up before its first call, and the import line", () => {
    const text = block("storyboard");
    expect(text).toContain('nodetool.searchTools("select:<name>,<name>")');
    expect(text).toContain("several names in one call");
    expect(text).toContain(
      'import { <name>, … } from "@nodetool-ai/sandbox-nodetool/ui";'
    );
  });

  it("builds byte-identical text for a focus, whatever order its tools arrive in", () => {
    for (const surface of FOCUSED_SURFACES) {
      const tools = toolsOf(surface);
      const first = block(surface);
      expect(block(surface)).toBe(first);
      expect(block(surface, [...tools].reverse())).toBe(first);
    }
  });

  it("puts the most called tools first and the rest in name order", () => {
    const { described, named } = rankFocusedTools(toolsOf("timeline"));
    expect(described[0]?.name).toBe("ui_timeline_get_state");
    const calls = described.map((t) => FOCUSED_TOOL_CALLS.get(t.name) ?? 0);
    expect(calls).toEqual([...calls].sort((a, b) => b - a));
    expect(calls.every((n) => n > 0)).toBe(true);
    expect(named.map((t) => t.name)).toEqual(named.map((t) => t.name).sort());
    expect(named.every((t) => !FOCUSED_TOOL_CALLS.has(t.name))).toBe(true);
  });
});

describe("level 2: select: returns the full documentation", () => {
  it("does not end the first sentence at e.g. or inside parentheses", () => {
    expect(firstSentence("Set the style (e.g. bold). Then save.")).toBe(
      "Set the style (e.g. bold)."
    );
    expect(firstSentence("Pick a widget, e.g. Button. Then bind it.")).toBe(
      "Pick a widget, e.g. Button."
    );
    expect(firstSentence("One. Two.")).toBe("One.");
  });

  it("returns the whole description, the full signature and the import line", () => {
    const edit = tool("audio", "ui_audio_edit");
    const hit = selected("audio", "ui_audio_edit");
    expect(hit.description).toBe(edit.description);
    expect(hit.signature).toBe(focusedToolSignature(edit));
    expect(hit.import).toBe(
      'import { ui_audio_edit } from "@nodetool-ai/sandbox-nodetool/ui";'
    );
    expect(renderToolSignature(edit)).not.toContain("trim (keep only the range)");
  });

  it("ui_audio_edit names every op and what trim and delete keep", () => {
    const text = selectedText("audio", "ui_audio_edit");
    for (const op of ["trim", "delete", "silence", "fade_in", "fade_out", "normalize", "reverse", "gain"]) {
      expect(text).toContain(`"${op}"`);
    }
    expect(text).toContain("trim (keep only the range)");
    expect(text).toContain("delete (remove the range");
    expect(text).toContain("gain_db?: number");
  });

  it("ui_jsscript_set_code states the body contract", () => {
    const text = selectedText("jsscript", "ui_jsscript_set_code");
    expect(text).toContain("`inputs`");
    expect(text).toContain("await output(name, value)");
    expect(text).toContain("`return` is control flow only");
  });

  it("storyboard shots show the camera object and the motion string", () => {
    for (const name of ["ui_storyboard_add_shot", "ui_storyboard_update_shot"]) {
      const signature = selected("storyboard", name).signature;
      expect(signature).toMatch(
        /camera\?: \{framing\?: string, lens\?: string, angle\?: string, movement\?: string[^}]*\}/
      );
      expect(signature).toContain("motion?: string");
    }
  });

  it("ui_storyboard_set_screenplay shows the screenplay literal and the shot item shape", () => {
    expect(selected("storyboard", "ui_storyboard_set_screenplay").signature).toContain(
      'screenplay: {type: "screenplay", shots: {action: string'
    );
  });

  it("app widget events show {trigger, kind: \"run\", operationId}", () => {
    for (const name of ["ui_app_add_component", "ui_app_update_component"]) {
      const signature = selected("app", name).signature;
      expect(signature).toMatch(/events\?: \(?\{trigger: "click" \| "change", kind\?: [^}]*"run"/);
      expect(signature).toContain("operationId?: string");
    }
  });

  it("keeps a keyword hit compact and points it at select:", () => {
    const shot = tool("storyboard", "ui_storyboard_add_shot");
    const hit = toolSearchHit(shot, "ui", "compact");
    expect(hit.signature).toBeUndefined();
    expect(hit.description).toBe(toolPurpose(shot.description ?? ""));
    expect(hit.import).toBe(
      'import { ui_storyboard_add_shot } from "@nodetool-ai/sandbox-nodetool/ui";'
    );
    expect(hit.details).toBe(
      'nodetool.searchTools("select:ui_storyboard_add_shot") returns the signature and the full description.'
    );
  });
});

describe("signature shapes", () => {
  const schema = (inputSchema: unknown): ToolSignatureSource => ({ name: "t", inputSchema });

  it("renders const literals, every enum value and optional field types", () => {
    const values = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(
      focusedToolSignature(
        schema({
          type: "object",
          properties: {
            kind: { const: "screenplay" },
            mode: { type: "string", enum: values },
            note: { type: "string" }
          },
          required: ["kind", "mode"]
        })
      )
    ).toBe(`await t({kind: "screenplay", mode: ${values.map((v) => `"${v}"`).join(" | ")}, note?: string})`);
  });

  it("renders nested required fields and array item shapes", () => {
    expect(
      focusedToolSignature(
        schema({
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  at: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
                  tag: { anyOf: [{ type: "string" }, { type: "null" }] }
                },
                required: ["at"]
              }
            }
          },
          required: ["items"]
        })
      )
    ).toBe("await t({items: {at: {x: number}, tag?: string | null}[]})");
  });

  it("writes a long optional field one level deep and keeps required ones whole", () => {
    const wide = {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [`field${i}`, { type: "string" }])
      )
    };
    const signature = focusedToolSignature(
      schema({
        type: "object",
        properties: { style: wide, layout: wide },
        required: ["layout"]
      })
    );
    expect(signature).toContain("style?: object");
    expect(signature).toContain("layout: {field0?: string");
  });
});
