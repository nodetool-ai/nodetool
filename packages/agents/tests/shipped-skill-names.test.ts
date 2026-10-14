/**
 * The shipped motion skills name tools by hand, and a name one gets wrong is a
 * model calling something that does not exist.
 *
 * Prose drifts in a direction code cannot: a capability gets renamed, an op is
 * folded into another, and the skill keeps teaching the old spelling. This
 * reads every snake_case identifier out of the skill — inside backticks, in a
 * fenced example, anywhere — keeps the ones shaped like a tool call, and
 * checks each against the two registries that decide what a call can name: the
 * capability specs and `edit_timeline`'s op list. Everything else in the skill
 * is a field, a value or a validator code, and `PLAIN_WORDS` is where those
 * are declared rather than guessed at.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { UNIFIED_COMMAND_TYPES } from "@nodetool-ai/protocol";
import { ANIMATION_PRESETS, STAGGER_UNITS } from "@nodetool-ai/timeline";

import { listCapabilitySpecs } from "../src/capabilities/index.js";
import { EDIT_TIMELINE_SCHEMA } from "../src/capabilities/timelines.specs.js";

/**
 * The shipped skills that name tools. `motion-graphics` carries the tool
 * contract; the craft skills beside it quote the same calls, and a rename
 * breaks them the same way. A skill added here without an entry is a skill
 * nothing checks.
 */
const SKILL_NAMES = [
  "motion-graphics",
  "motion-principles",
  "motion-direction",
  "frame-composition",
  "beat-sync-editing",
  "color-motion",
  "logo-reveal",
  "motion-background",
  "motion-curves",
  "caption-titles",
  "video-audio-continuity",
  "timeline-edit-ops"
] as const;

function skillPath(name: string): string {
  return fileURLToPath(
    new URL(`../../system-skills/${name}/SKILL.md`, import.meta.url)
  );
}

/**
 * Verb prefixes that make a snake_case token read as a call rather than a
 * field. A validator code (`stagger_compressed`, `parent_cycle`) or a
 * parameter (`tolerance_ms`) never starts with one.
 */
const CALL_PREFIXES = [
  "add_",
  "animate_",
  "clear_",
  "compare_",
  "create_",
  "delete_",
  "detect_",
  "duplicate_",
  "edit_",
  "get_",
  "insert_",
  "list_",
  "move_",
  "preview_",
  "render_",
  "restore_",
  "run_",
  "save_",
  "seek",
  "set_",
  "snap_",
  "split_",
  "trim_",
  "understand_",
  "validate_",
  "view_"
];

/**
 * Tokens that carry a call prefix and are not calls: schema fields and the one
 * op-list entry that reads like a verb. Every entry is a deliberate exemption,
 * not a name nobody checked.
 */
const PLAIN_WORDS = new Set([
  "preview_scale",
  "snapshot_name"
]);

/** The op names `edit_timeline` documents, read off its own schema. */
function editTimelineOps(): Set<string> {
  const ops = EDIT_TIMELINE_SCHEMA.properties?.["ops"];
  const description =
    typeof ops === "object" && ops !== null && "description" in ops
      ? String((ops as { description?: unknown }).description ?? "")
      : "";
  const listed = /Ops:\s*([^.]+)\./.exec(description);
  expect(listed, "edit_timeline's schema no longer lists its ops").not.toBeNull();
  const names = (listed?.[1] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^[a-z][a-z0-9_]*$/.test(entry));
  expect(names.length).toBeGreaterThan(10);
  return new Set(names);
}

/**
 * Suffixes that make a token read as a tool name in the all-skills pass: the
 * search and capture families (`web_search`, `image_search`,
 * `take_screenshot`) carry no verb prefix, which is how a retired
 * `google_search` went unchecked. The strict motion pass leaves them off,
 * since a field such as `reference_images` is not a call there.
 */
const CALL_SUFFIXES = ["_search", "_screenshot", "_news", "_images"];

/** Snake_case tokens anywhere in the skill that read like a call. */
function skillCallNames(
  markdown: string,
  options: { suffixes?: boolean } = {}
): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/\b([a-z][a-z0-9_]*)\b/g)) {
    const name = match[1] as string;
    if (PLAIN_WORDS.has(name)) continue;
    const prefixed = CALL_PREFIXES.some((prefix) => name.startsWith(prefix));
    const suffixed =
      options.suffixes === true &&
      CALL_SUFFIXES.some((suffix) => name.endsWith(suffix) && name !== suffix);
    if (!prefixed && !suffixed) continue;
    found.add(name);
  }
  return [...found].sort();
}

/** Property keys whose descriptions declare an op list in prose. */
const OP_LIST_FIELDS = new Set(["ops", "steps", "operations"]);

const WORD = /\b([a-z][a-z0-9_]*)\b/g;

/**
 * Walk a JSON schema and collect what it declares: property keys, enum and
 * const strings, and every word of an op-list field's description.
 */
function schemaVocabulary(schema: unknown, into: Set<string>, opList = false): void {
  if (Array.isArray(schema)) {
    for (const item of schema) schemaVocabulary(item, into, opList);
    return;
  }
  if (typeof schema !== "object" || schema === null) return;
  const node = schema as Record<string, unknown>;
  if (opList && typeof node["description"] === "string") {
    for (const match of node["description"].matchAll(WORD)) {
      into.add(match[1] as string);
    }
  }
  for (const value of [...(Array.isArray(node["enum"]) ? node["enum"] : []), node["const"]]) {
    if (typeof value === "string") into.add(value);
  }
  const properties = node["properties"];
  if (typeof properties === "object" && properties !== null) {
    for (const [key, child] of Object.entries(properties)) {
      into.add(key);
      schemaVocabulary(child, into, OP_LIST_FIELDS.has(key));
    }
  }
  for (const key of ["items", "anyOf", "oneOf", "allOf", "additionalProperties"]) {
    if (key in node) schemaVocabulary(node[key], into, opList);
  }
}

/**
 * What a skill may name: capability names, the keys and enum values their
 * input schemas declare, and the op names that op-list fields (`ops`,
 * `steps`) spell out in prose, since `edit_sketch`, `edit_model3d`,
 * `edit_timeline` and `edit_storyboard` have no enum to compare against.
 *
 * A word that appears only in some spec's free prose is not vocabulary. This
 * net used to take every word of every spec, so a retired name a description
 * still mentioned (`browser`'s "use `google_search` instead") counted as a
 * tool that exists.
 */
function registryVocabulary(): Set<string> {
  // WebSocket commands are a protocol the API reference teaches, not tools.
  const vocabulary = new Set<string>([...editTimelineOps(), ...UNIFIED_COMMAND_TYPES]);
  for (const spec of listCapabilitySpecs()) {
    vocabulary.add(spec.name);
    schemaVocabulary(spec.inputSchema, vocabulary);
    // A tool that takes an op list may name its ops in its own description
    // (`edit_native_game`'s `set_document`) rather than on the field.
    const properties = (spec.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    if (Object.keys(properties).some((key) => OP_LIST_FIELDS.has(key))) {
      for (const match of spec.description.matchAll(WORD)) {
        vocabulary.add(match[1] as string);
      }
    }
  }
  return vocabulary;
}

/** The skill's call-shaped names that are neither registered nor exempt. */
function unregisteredNames(markdown: string, vocabulary: Set<string>): string[] {
  return skillCallNames(markdown, { suffixes: true }).filter(
    (name) => !vocabulary.has(name) && !NOT_A_BACKEND_CALL.has(name)
  );
}

/**
 * Call-shaped tokens that are not calls into this registry. Every entry is a
 * deliberate exemption with the reason it is not a rename waiting to happen.
 */
const NOT_A_BACKEND_CALL = new Set([
  // An `edit_storyboard` op alias, resolved in storyboards.ts's OP_ALIASES
  // rather than named in a schema description.
  "set_entities",
  // A shot field on `add_shot` / `update_shot`, not a call.
  "render_mode",
  // Fragments of a family written as a prefix list: "`list_`/`get_`/`create_`/
  // `restore_`" and "`ui_storyboard_` + `get_state`".
  "get_",
  "list_",
  "create_",
  "restore_",
  // A browser tool (`ui_storyboard_set_screenplay`). The `ui_` family is
  // registered in the web client, which this package cannot import.
  "set_screenplay",
  // A WebSocket message type in the API reference (the command names come
  // from `UNIFIED_COMMAND_TYPES`).
  "run_job_request",
  // Named to say it does not exist: settings refuse a secret and there is no
  // `set_secret`. A test that demanded it exist would demand the bug back.
  "set_secret",
  // ManimGX Scene methods in the manimgx skill's Python examples. A scene
  // calls them, not a model, and they belong to Manim's API.
  "add_sound",
  "set_camera_orientation",
  // A chat tool the websocket package registers
  // (`packages/websocket/src/agent/run-node-tool.ts`), outside this registry.
  "run_node"
]);

/** Every shipped skill, so a new one is covered without being listed. */
function shippedSkillNames(): string[] {
  const dir = fileURLToPath(new URL("../../system-skills", import.meta.url));
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("every shipped skill", () => {
  const vocabulary = registryVocabulary();
  const skills = shippedSkillNames();

  it("ships more than the motion set", () => {
    expect(skills.length).toBeGreaterThan(SKILL_NAMES.length);
  });

  for (const skill of skills) {
    it(`${skill} names calls the registry still spells that way`, () => {
      const missing = unregisteredNames(
        readFileSync(skillPath(skill), "utf8"),
        vocabulary
      );
      expect(missing, "named in the skill but absent from the registry").toEqual(
        []
      );
    });
  }

  // The tightening is what this pins: a retired tool name a spec description
  // still mentions is not a tool, and a skill that names it must fail.
  it("refuses a retired tool name even where a description mentions it", () => {
    const prose = listCapabilitySpecs().some((spec) =>
      spec.description.includes("google_search")
    );
    expect(vocabulary.has("google_search"), `in prose: ${prose}`).toBe(false);
    expect(
      unregisteredNames("Search with `google_search`, then `take_screenshot`.", vocabulary)
    ).toEqual(["google_search"]);
  });

  // The filter is what pins the test: one that matched nothing would pass every
  // skill in silence.
  it("reads calls out of the surface skills at all", () => {
    const union = new Set(
      skills.flatMap((skill) => skillCallNames(readFileSync(skillPath(skill), "utf8")))
    );
    expect(union.size).toBeGreaterThan(100);
  });
});

describe("shipped motion skills", () => {
  const known = new Set<string>([
    ...listCapabilitySpecs().map((spec) => spec.name),
    ...editTimelineOps()
  ]);

  for (const skill of SKILL_NAMES) {
    it(`${skill} names only capabilities and edit_timeline ops that exist`, () => {
      const named = skillCallNames(readFileSync(skillPath(skill), "utf8"));
      // A filter that matched nothing would pass a file silently. A craft
      // skill names few calls; the union below is what pins the filter.
      expect(named.length).toBeGreaterThan(0);
      const missing = named.filter((name) => !known.has(name));
      expect(missing, "named in the skill but registered nowhere").toEqual([]);
    });
  }

  /**
   * The op/preset/stagger-unit vocabulary used to live entirely in
   * `motion-graphics`; it is now split across `motion-graphics` (the
   * code-authoring pack — scenes, `v.series`, the craft helpers) and
   * `timeline-edit-ops` (the `edit_timeline` reference — every op, every
   * preset's param list, the stagger grammar), so a name only one of them
   * owns is still found. The three checks below read the union rather than
   * one file, and — per `AGENTS.md`'s "one fact once" — motion-graphics does
   * not re-teach what timeline-edit-ops already owns.
   */
  const OP_PRESET_STAGGER_SKILLS = ["motion-graphics", "timeline-edit-ops"] as const;
  function combinedMarkdown(): string {
    return OP_PRESET_STAGGER_SKILLS.map((name) => readFileSync(skillPath(name), "utf8")).join(
      "\n"
    );
  }

  /**
   * The preset catalog drifts the way the tool names do, and one direction is
   * invisible from the skill set: a preset ships and no skill's summary
   * learns about it. `squash` and `hueShift` once sat in the engine while
   * the skill that then listed presets named fifteen of seventeen, so a
   * model reading it had no idea they existed.
   */
  it("lists every shipped animation preset across motion-graphics and timeline-edit-ops", () => {
    const markdown = combinedMarkdown();
    const missing = ANIMATION_PRESETS.map((preset) => preset.id).filter(
      (id) => !markdown.includes(`\`${id}\``)
    );
    expect(missing, "shipped but unlisted in either skill").toEqual([]);
  });

  /** The other direction: a preset quoted in an example that does not exist. */
  it("quotes only preset ids the engine ships", () => {
    const ids = new Set<string>([
      ...ANIMATION_PRESETS.map((preset) => preset.id),
      // Not a catalog entry — the escape hatch that carries `curves` or `code`.
      "custom"
    ]);
    for (const skill of SKILL_NAMES) {
      const markdown = readFileSync(skillPath(skill), "utf8");
      const quoted = [
        ...markdown.matchAll(/"preset"\s*:\s*"([A-Za-z][A-Za-z0-9]*)"/g)
      ].map((match) => match[1] as string);
      expect(
        quoted.filter((id) => !ids.has(id)),
        `${skill} quotes a preset the engine does not ship`
      ).toEqual([]);
    }
  });

  /**
   * The other direction again, for ops: the skill teaches how to build the
   * elements it then animates, and an op folded into another leaves the
   * instructions naming a call the model cannot make.
   */
  it("teaches, across motion-graphics and timeline-edit-ops, the ops that build and order what it animates", () => {
    const markdown = combinedMarkdown();
    const ops = editTimelineOps();
    for (const op of [
      "add_text_clip",
      "add_shape_clip",
      "add_track",
      "move_track",
      "set_time_remap",
      "list_animation_presets"
    ]) {
      expect(ops.has(op), `${op} is no longer an edit_timeline op`).toBe(true);
      expect(
        markdown,
        `${op} is unmentioned in motion-graphics and timeline-edit-ops`
      ).toContain(`\`${op}\``);
    }
  });

  /** A stagger unit no skill names is one no model will reach for. */
  it("names, across motion-graphics and timeline-edit-ops, every stagger unit the engine splits on", () => {
    const markdown = combinedMarkdown();
    const missing = STAGGER_UNITS.filter(
      (unit) => !markdown.includes(`\`${unit}\``)
    );
    expect(missing, "shipped but unnamed in either skill").toEqual([]);
  });

  it("reads calls out of the skills at all", () => {
    const union = new Set(
      SKILL_NAMES.flatMap((skill) =>
        skillCallNames(readFileSync(skillPath(skill), "utf8"))
      )
    );
    expect(union.size).toBeGreaterThan(20);
  });
});
