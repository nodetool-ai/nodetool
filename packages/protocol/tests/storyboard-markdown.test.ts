import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  normalizeStoryboardScreenplay,
  storyboardDocument,
  type StoryboardDocumentSchema
} from "../src/api-schemas/storyboards.js";
import {
  parseStoryboardMarkdown,
  storyboardToMarkdown,
  tokenizeStoryboardLine,
  type StoryboardMarkdownEntity
} from "../src/storyboard-markdown.js";

const EXAMPLES = fileURLToPath(new URL("../../base-nodes/nodetool/examples/storyboards/", import.meta.url));

/** Key order is not part of a document. */
const sortKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]))
      : value;

const NOVA = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const DOME = "1a2b3c4d5e6f708192a3b4c5d6e7f809";
const ids = { sp: "a0000000000000000000000000000001", act1: "a0000000000000000000000000000002", act2: "a0000000000000000000000000000003",
  s1: "a0000000000000000000000000000004", s2: "a0000000000000000000000000000005", empty: "a0000000000000000000000000000006",
  sh1: "b0000000000000000000000000000001", sh2: "b0000000000000000000000000000002", sh3: "b0000000000000000000000000000003" };
const entities = new Map<string, StoryboardMarkdownEntity>([
  [NOVA, { id: NOVA, name: "Nova", kind: "character", descriptor: "A young astronaut in a worn orange suit" }],
  [DOME, { id: DOME, name: "Greenhouse Dome", kind: "location" }]
]);

/** A board with every part the Markdown carries: acts, scenes, entities, takes, transitions, continuities. */
function fullBoard(): StoryboardDocumentSchema {
  const screenplay = normalizeStoryboardScreenplay({
    type: "screenplay",
    id: ids.sp,
    title: "Mars Greenhouse",
    logline: "The first tomato on Mars.",
    music_prompt: "Sparse piano, warm pads",
    acts: [
      { type: "act", id: ids.act1, title: "Act I (Setup)", objective: "Show how fragile the greenhouse is." },
      { type: "act", id: ids.act2, title: "Act II" }
    ],
    scenes: [
      { type: "scene", id: ids.s1, slugline: "INT. GREENHOUSE DOME - DAWN", lighting: "Cold blue dawn through the panels", act_id: ids.act1 },
      { type: "scene", id: ids.s2, slugline: "EXT. CRATER RIM - DAY", act_id: ids.act2 },
      { type: "scene", id: ids.empty, slugline: "INT. AIRLOCK", act_id: ids.act2 }
    ],
    motion_design: {
      transitions: [{ from_shot_id: ids.sh1, to_shot_id: ids.sh2, direction: "Match cut on the light" }],
      continuities: [{ id: "c1", shot_ids: [ids.sh1, ids.sh2], direction: "One breath of the score" }]
    },
    shots: [
      {
        id: ids.sh1, slug: "First light", scene_id: ids.s1, status: "keyframe_ready",
        action: "Nova kneels by a single green shoot under the dome.\n\nDust drifts in the light.",
        camera: { framing: "wide", lens: "35mm", preset_ids: ["push-in"] },
        motion: "Slow push in", sound: "Fans hum", duration_seconds: 5, duration_source: "manual",
        entity_ids: [NOVA], location_id: DOME,
        keyframe: { type: "image", uri: "asset://c0000000000000000000000000000001.png", asset_id: "c0000000000000000000000000000001", render_inputs: { kind: "keyframe" } },
        keyframe_versions: [
          { type: "image", uri: "asset://c0000000000000000000000000000002.png", asset_id: "c0000000000000000000000000000002" },
          { type: "image", uri: "asset://c0000000000000000000000000000001.png", asset_id: "c0000000000000000000000000000001", render_inputs: { kind: "keyframe" } }
        ],
        script_line_ids: ["l1", "l2"]
      },
      { id: ids.sh2, slug: "The shoot", scene_id: ids.s1, action: "Close on the shoot.", render_mode: "direct", entity_ids: [], notes: "Hold for the beat" },
      { id: ids.sh3, slug: "Crater rim", scene_id: ids.s2, action: "The dome is a bead of light on the rim.", entity_ids: [NOVA, DOME] }
    ]
  });
  return {
    screenplay, shots: screenplay.shots, brief: "A twenty second opening.", style: "Warm practicals against cold Martian blue",
    entityIds: [NOVA, DOME], aspectRatio: "2.39:1", setupStage: "done", genre: "Science fiction",
    directorModel: null, imageModel: null, videoModel: null
  } as unknown as StoryboardDocumentSchema;
}

describe("storyboard Markdown round trip", () => {
  const files = readdirSync(EXAMPLES).filter((f) => f.endsWith(".storyboard.json"));

  it("reads every shipped example board", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s: document → Markdown → document is exact", (file) => {
    const doc = (JSON.parse(readFileSync(join(EXAMPLES, file), "utf8")) as { document: StoryboardDocumentSchema }).document;
    const markdown = storyboardToMarkdown(doc);
    const read = parseStoryboardMarkdown(markdown, { base: doc });
    expect(read.missingIds).toEqual([]);
    expect(sortKeys(read.document)).toEqual(sortKeys(doc));
    expect(storyboardToMarkdown(read.document)).toBe(markdown);
  });

  it("is exact for a board with acts, entities, takes, transitions and continuities", () => {
    const doc = fullBoard();
    expect(storyboardDocument.safeParse(doc).success).toBe(true);
    const markdown = storyboardToMarkdown(doc, { entities });
    const read = parseStoryboardMarkdown(markdown, { base: doc, entities });
    expect(read.warnings).toEqual([]);
    expect(sortKeys(read.document)).toEqual(sortKeys(doc));
    expect(storyboardToMarkdown(read.document, { entities })).toBe(markdown);
  });

  it("writes the board as readable Markdown", () => {
    const markdown = storyboardToMarkdown(fullBoard(), { entities });
    expect(markdown).toContain(`# Act I (Setup) {#${ids.act1}}\nShow how fragile the greenhouse is.`);
    expect(markdown).toContain(`## INT. GREENHOUSE DOME - DAWN {#${ids.s1}}\n- **Lighting:** Cold blue dawn`);
    expect(markdown).toContain(`### First light {#${ids.sh1}}\n![Still](asset://c0000000000000000000000000000001.png)`);
    expect(markdown).toContain(`[Nova](entity://${NOVA}) kneels`);
    expect(markdown).toContain(`- **Location:** [Greenhouse Dome](entity://${DOME})`);
    expect(markdown).toContain("- **Transition:** Match cut on the light");
    expect(markdown).toContain(`- **Continuity:** until [Shot 2](#${ids.sh2}) — One breath of the score {#c1}`);
    // A scene with no shot yet is kept, after the shots.
    expect(markdown.trimEnd().endsWith(`## INT. AIRLOCK {#${ids.empty}}`)).toBe(true);
  });
});

describe("parseStoryboardMarkdown", () => {
  const read = (markdown: string, base: StoryboardDocumentSchema | null = null) =>
    parseStoryboardMarkdown(markdown, { base, entities, generateId: (() => { let n = 0; return () => `new${++n}`; })() });

  it("reads a board typed from scratch into a valid document", () => {
    const result = read([
      "# Night Shift",
      "A nurse on her last round.",
      "",
      "# Act I",
      "## INT. WARD - NIGHT",
      "### Corridor",
      `The corridor is empty. @Nova is not here; [Nova](entity://${NOVA}) waits outside.`,
      "- **Lens:** 50mm",
      "- **Duration:** 3.5s",
      "### Door",
      "A door swings shut.",
      "- **Transition:** Hard cut"
    ].join("\n"));
    expect(storyboardDocument.safeParse(result.document).success).toBe(true);
    const sp = result.document.screenplay;
    expect(sp?.title).toBe("Night Shift");
    expect(result.document.brief).toBe("A nurse on her last round.");
    expect(sp?.acts).toEqual([{ type: "act", id: "new2", title: "Act I" }]);
    expect(sp?.scenes).toEqual([{ type: "scene", id: "new3", slugline: "INT. WARD - NIGHT", act_id: "new2" }]);
    const [first] = result.document.shots;
    expect(first).toMatchObject({ id: "new4", index: 0, slug: "Corridor", status: "planned", scene_id: "new3", camera: { lens: "50mm" }, duration_seconds: 3.5, duration_source: "manual", entity_ids: [NOVA] });
    expect(first.action).toBe("The corridor is empty. @Nova is not here; Nova waits outside.");
    expect(sp?.motion_design).toBeUndefined();
    expect(result.warnings.map((w) => w.message)).toEqual([expect.stringContaining("leads to the next shot")]);
    // Every heading without an id is reported with the id to write into it.
    expect(result.missingIds.map((m) => m.line)).toEqual([0, 3, 4, 5, 9]);
  });

  it("keeps a shot's id when text is typed after it", () => {
    const result = read("### Water {#keep1} returns\nA stream.");
    expect(result.document.shots[0]).toMatchObject({ id: "keep1", slug: "Water returns" });
    expect(result.missingIds).toEqual([]);
  });

  it("gives a duplicated id a new one", () => {
    const result = read("### One {#dup}\nA.\n### Two {#dup}\nB.");
    expect(result.shotOrder).toEqual(["dup", "new1"]);
    expect(result.missingIds).toEqual([{ line: 2, id: "new1", replace: { start: 7, text: " {#dup}" } }]);
  });

  it("keeps takes by id when the selected still changes", () => {
    const base = fullBoard();
    const markdown = storyboardToMarkdown(base, { entities }).replace(
      "![Still](asset://c0000000000000000000000000000001.png)",
      "![Still](asset://d0000000000000000000000000000001.webp)"
    );
    const shot = read(markdown, base).document.shots[0];
    expect(shot.keyframe).toEqual({ type: "image", uri: "asset://d0000000000000000000000000000001.webp", asset_id: "d0000000000000000000000000000001" });
    expect(shot.keyframe_versions).toHaveLength(3);
    expect(shot.script_line_ids).toEqual(["l1", "l2"]);
    expect(shot.status).toBe("keyframe_ready");
  });

  it("clears the selection but keeps the takes when the still line is deleted", () => {
    const base = fullBoard();
    const markdown = storyboardToMarkdown(base, { entities }).replace("![Still](asset://c0000000000000000000000000000001.png)\n", "");
    const shot = read(markdown, base).document.shots[0];
    expect(shot.keyframe).toBeNull();
    expect(shot.keyframe_versions).toHaveLength(2);
  });

  it("follows a reordering of shots", () => {
    const base = fullBoard();
    const markdown = storyboardToMarkdown(base, { entities });
    const at = markdown.indexOf(`### The shoot`), end = markdown.indexOf(`## EXT. CRATER RIM`);
    const moved = markdown.slice(0, markdown.indexOf("### First light")) + markdown.slice(at, end) + markdown.slice(markdown.indexOf("### First light"), at) + markdown.slice(end);
    const result = read(moved, base);
    expect(result.shotOrder).toEqual([ids.sh2, ids.sh1, ids.sh3]);
    expect(result.document.shots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(storyboardDocument.safeParse(result.document).success).toBe(true);
  });

  it("saves an unknown shot label in the notes and warns", () => {
    const result = read("### Shot\nAction.\n- **Mood:** tense");
    expect(result.document.shots[0].notes).toBe("Mood: tense");
    expect(result.warnings[0].message).toContain('"Mood" is not a storyboard field');
  });

  it("reads an empty text as an empty board", () => {
    const result = read("");
    expect(result.document.shots).toEqual([]);
    expect(storyboardDocument.safeParse(result.document).success).toBe(true);
  });
});

describe("long lines", () => {
  // CodeQL flagged the line patterns as polynomial. Each now matches only the
  // syntax prefix and slices the rest, so long inputs stay fast.
  it("reads a long media reference and long runs of spaces in linear time", () => {
    const uri = "asset://a.mp4#" + ".m4v#".repeat(50000);
    const lines = [`### Shot {#s1}`, `![Clip](${uri})`, "Action.", `- **Motion:**${" ".repeat(50000)}slow`, `#${" ".repeat(50000)}Act`, `*${" ".repeat(50000)}note`];
    const started = Date.now();
    const result = parseStoryboardMarkdown(lines.join("\n"));
    lines.forEach((line) => tokenizeStoryboardLine(line));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.document.shots[0].clip?.uri).toBe(uri);
    expect(result.document.shots[0].motion).toBe("slow");
  });
});

describe("tokenizeStoryboardLine", () => {
  it("adds up to the line and marks mentions, ids and shot references", () => {
    const line = `- **Continuity:** until [Shot 2](#${ids.sh2}) with [Nova](entity://${NOVA}) {#c1}`;
    const tokens = tokenizeStoryboardLine(line, entities);
    expect(tokens.map((t) => t.text).join("")).toBe(line);
    expect(tokens.find((t) => t.kind === "entity")).toEqual({ kind: "entity", text: "Nova", entityKind: "character" });
    expect(tokens.find((t) => t.kind === "shotref")?.text).toBe("Shot 2");
    expect(tokens.find((t) => t.kind === "id")?.text).toBe(" {#c1}");
    expect(tokens.find((t) => t.kind === "label")?.text).toBe("Continuity");
  });

  it("marks a mention of an entity outside the library as missing", () => {
    expect(tokenizeStoryboardLine("[Ghost](entity://abc)").find((t) => t.kind === "entity")?.entityKind).toBe("missing");
  });
});
