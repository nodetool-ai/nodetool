import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, Skill, initTestDb } from "@nodetool-ai/models";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import {
  findInvokedSkillNames,
  formatInvokedSkillsForPrompt,
  formatSkillCatalogForPrompt
} from "../src/skill-prompt.js";
import { clearSystemSkillCache } from "../src/system-skills.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ctx(userId: string | null = "u1") {
  return { userId } as unknown as ProcessingContext;
}

function call(name: string, args: Record<string, unknown>, user = "u1") {
  return toolForCapabilityName(name).process(ctx(user), args) as Promise<
    Record<string, unknown>
  >;
}

describe("skills capabilities", () => {
  // These cases are about the user's own rows, so they run against an empty
  // shipped-skill directory — otherwise every count here also counts whatever
  // `packages/system-skills` happens to hold.
  let emptySkillsDir: string;

  beforeEach(() => {
    initTestDb();
    emptySkillsDir = mkdtempSync(join(tmpdir(), "nodetool-noskills-"));
    process.env["NODETOOL_SYSTEM_SKILLS_DIR"] = emptySkillsDir;
    clearSystemSkillCache();
  });

  afterEach(() => {
    delete process.env["NODETOOL_SYSTEM_SKILLS_DIR"];
    clearSystemSkillCache();
    ModelObserver.clear();
    rmSync(emptySkillsDir, { recursive: true, force: true });
  });

  it("creates, lists, loads, updates and deletes a skill", async () => {
    const created = await call("create_skill", {
      name: "release-notes",
      description: "Use when writing release notes.",
      content: "# Release notes\n\nLead with what changed."
    });
    expect(created.success).toBe(true);

    const listed = await call("list_skills", {});
    expect(listed.count).toBe(1);
    expect(
      (listed.skills as Array<{ name: string; description: string }>)[0]
    ).toMatchObject({
      name: "release-notes",
      description: "Use when writing release notes."
    });

    const loaded = await call("load_skill", { name: "/release-notes" });
    expect(loaded.instructions).toContain("Lead with what changed.");

    const updated = await call("update_skill", {
      name: "release-notes",
      new_name: "changelog",
      content: "# Changelog\n\nOne line per change."
    });
    expect(updated).toMatchObject({ success: true, name: "changelog" });
    expect((await call("load_skill", { name: "changelog" })).instructions).toBe(
      "# Changelog\n\nOne line per change."
    );

    expect(await call("delete_skill", { name: "changelog" })).toMatchObject({
      success: true
    });
    expect((await call("list_skills", {})).count).toBe(0);
  });

  it("filters the list by query", async () => {
    await call("create_skill", {
      name: "release-notes",
      description: "Writing release notes.",
      content: "body"
    });
    await call("create_skill", {
      name: "bug-triage",
      description: "Triaging incoming bugs.",
      content: "body"
    });
    const listed = await call("list_skills", { query: "triag" });
    expect(listed.count).toBe(1);
  });

  it("refuses a duplicate name and reports a missing skill", async () => {
    await call("create_skill", {
      name: "release-notes",
      description: "Writing release notes.",
      content: "body"
    });
    expect(
      await call("create_skill", {
        name: "release-notes",
        description: "Another one.",
        content: "body"
      })
    ).toMatchObject({ success: false });
    expect(await call("load_skill", { name: "nope" })).toMatchObject({
      success: false
    });
  });

  it("never reaches another user's skills", async () => {
    await Skill.create<Skill>({
      user_id: "u2",
      name: "secret",
      description: "Someone else's skill.",
      content: "body"
    });
    expect((await call("list_skills", {})).count).toBe(0);
    expect(await call("load_skill", { name: "secret" })).toMatchObject({
      success: false
    });
    expect(await call("delete_skill", { name: "secret" })).toMatchObject({
      success: false
    });
    expect(await Skill.findByName("u2", "secret")).not.toBeNull();
  });

  it("refuses every capability without a user", async () => {
    for (const name of [
      "list_skills",
      "load_skill",
      "create_skill",
      "update_skill",
      "delete_skill"
    ]) {
      expect(await call(name, { name: "x" }, null as never)).toMatchObject({
        success: false
      });
    }
  });
});

describe("skill prompt blocks", () => {
  const skills = [
    { name: "release-notes", description: "Writing release notes." },
    { name: "bug-triage", description: "Triaging incoming bugs." }
  ];

  it("renders one catalog line per skill", () => {
    const block = formatSkillCatalogForPrompt(skills);
    expect(block).toContain("`/release-notes` — Writing release notes.");
    expect(block).toContain("`/bug-triage` — Triaging incoming bugs.");
    expect(formatSkillCatalogForPrompt([])).toBe("");
  });

  it("finds only known names invoked at a word boundary", () => {
    const names = skills.map((s) => s.name);
    expect(findInvokedSkillNames("/release-notes please", names)).toEqual([
      "release-notes"
    ]);
    expect(findInvokedSkillNames("check src/bug-triage", names)).toEqual([]);
    expect(findInvokedSkillNames("/unknown-skill", names)).toEqual([]);
    expect(
      findInvokedSkillNames("/bug-triage then /bug-triage again", names)
    ).toEqual(["bug-triage"]);
  });

  it("renders the invoked skill's body", () => {
    const block = formatInvokedSkillsForPrompt([
      { ...skills[0], content: "Lead with what changed." }
    ]);
    expect(block).toContain("### /release-notes");
    expect(block).toContain("Lead with what changed.");
    expect(formatInvokedSkillsForPrompt([])).toBe("");
  });
});

describe("system skills are immutable", () => {
  let dir: string;

  beforeEach(() => {
    initTestDb();
    dir = mkdtempSync(join(tmpdir(), "nodetool-sysskill-"));
    mkdirSync(join(dir, "launch-commercial"));
    writeFileSync(
      join(dir, "launch-commercial", "SKILL.md"),
      "---\nname: launch-commercial\ndescription: Ship a launch spot.\n---\n\nDo the thing.\n"
    );
    process.env["NODETOOL_SYSTEM_SKILLS_DIR"] = dir;
    clearSystemSkillCache();
  });

  afterEach(() => {
    delete process.env["NODETOOL_SYSTEM_SKILLS_DIR"];
    clearSystemSkillCache();
    ModelObserver.clear();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists a shipped skill beside the user's own, flagged as system", async () => {
    await call("create_skill", {
      name: "mine",
      description: "Mine.",
      content: "body"
    });
    const listed = await call("list_skills", {});
    const skills = listed.skills as Array<{ name: string; system: boolean }>;
    expect(skills.map((s) => s.name).sort()).toEqual([
      "launch-commercial",
      "mine"
    ]);
    expect(skills.find((s) => s.name === "launch-commercial")?.system).toBe(true);
    expect(skills.find((s) => s.name === "mine")?.system).toBe(false);
  });

  it("loads a shipped skill body", async () => {
    const loaded = await call("load_skill", { name: "launch-commercial" });
    expect(loaded.success).toBe(true);
    expect(loaded.instructions).toContain("Do the thing.");
    expect(loaded.system).toBe(true);
  });

  it("refuses to create a skill over a shipped name", async () => {
    const created = await call("create_skill", {
      name: "launch-commercial",
      description: "Mine now.",
      content: "hijacked"
    });
    expect(created.success).toBe(false);
    expect(String(created.error)).toMatch(/system skill/i);
    // And the shipped body is untouched.
    const loaded = await call("load_skill", { name: "launch-commercial" });
    expect(loaded.instructions).toContain("Do the thing.");
  });

  it("refuses to edit, rename over, or delete a shipped skill", async () => {
    const updated = await call("update_skill", {
      name: "launch-commercial",
      content: "hijacked"
    });
    expect(updated.success).toBe(false);
    expect(String(updated.error)).toMatch(/system skill/i);

    const deleted = await call("delete_skill", { name: "launch-commercial" });
    expect(deleted.success).toBe(false);
    expect(String(deleted.error)).toMatch(/system skill/i);

    await call("create_skill", {
      name: "mine",
      description: "Mine.",
      content: "body"
    });
    const renamed = await call("update_skill", {
      name: "mine",
      new_name: "launch-commercial"
    });
    expect(renamed.success).toBe(false);
    expect(String(renamed.error)).toMatch(/system skill/i);
  });

  it("lets a user row that already holds the name win, listed once", async () => {
    // Written directly: create_skill would now refuse the reserved name, which
    // is the point — this row is one that predates the skill shipping.
    await Skill.create({
      user_id: "u1",
      name: "launch-commercial",
      description: "The user's own.",
      content: "user body"
    });
    const listed = await call("list_skills", {});
    const skills = listed.skills as Array<{ name: string }>;
    expect(skills.filter((s) => s.name === "launch-commercial")).toHaveLength(1);

    const loaded = await call("load_skill", { name: "launch-commercial" });
    expect(loaded.instructions).toBe("user body");
    expect(loaded.system).toBe(false);
  });
});
