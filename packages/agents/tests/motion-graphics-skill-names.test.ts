/**
 * The `motion-graphics` skill names tools by hand, and a name it gets wrong is
 * a model calling something that does not exist.
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

import { listCapabilitySpecs } from "../src/capabilities/index.js";
import { EDIT_TIMELINE_SCHEMA } from "../src/capabilities/timelines.specs.js";

const SKILL_PATH = fileURLToPath(
  new URL("../../system-skills/motion-graphics/SKILL.md", import.meta.url)
);

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

describe("motion-graphics skill", () => {
  const markdown = readFileSync(SKILL_PATH, "utf8");
  const known = new Set<string>([
    ...listCapabilitySpecs().map((spec) => spec.name),
    ...editTimelineOps()
  ]);

  it("names only capabilities and edit_timeline ops that exist", () => {
    const named = skillCallNames(markdown);
    // A filter that matched nothing would pass this file silently.
    expect(named.length).toBeGreaterThan(10);
    const missing = named.filter((name) => !known.has(name));
    expect(missing, `named in the skill but registered nowhere`).toEqual([]);
  });
});
