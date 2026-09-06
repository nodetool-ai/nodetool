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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
  "video-audio-continuity"
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

/** Snake_case tokens anywhere in the skill that read like a call. */
function skillCallNames(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/\b([a-z][a-z0-9_]*)\b/g)) {
    const name = match[1] as string;
    if (PLAIN_WORDS.has(name)) continue;
    if (!CALL_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    found.add(name);
  }
  return [...found].sort();
}

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
   * The preset catalog drifts the way the tool names do, and one direction is
   * invisible from the skill: a preset ships and the summary never learns
   * about it. `squash` and `hueShift` sat in the engine while
   * `motion-graphics` listed fifteen of seventeen, so a model reading the
   * skill had no idea they existed.
   */
  it("lists every shipped animation preset in motion-graphics", () => {
    const markdown = readFileSync(skillPath("motion-graphics"), "utf8");
    const missing = ANIMATION_PRESETS.map((preset) => preset.id).filter(
      (id) => !markdown.includes(`\`${id}\``)
    );
    expect(missing, "shipped but unlisted in the skill").toEqual([]);
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
  it("teaches the ops that build and order what it animates", () => {
    const markdown = readFileSync(skillPath("motion-graphics"), "utf8");
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
      expect(markdown, `${op} is unmentioned in motion-graphics`).toContain(
        `\`${op}\``
      );
    }
  });

  /** A stagger unit the skill never names is one no model will reach for. */
  it("names every stagger unit the engine splits on", () => {
    const markdown = readFileSync(skillPath("motion-graphics"), "utf8");
    const missing = STAGGER_UNITS.filter(
      (unit) => !markdown.includes(`\`${unit}\``)
    );
    expect(missing, "shipped but unnamed in the skill").toEqual([]);
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
