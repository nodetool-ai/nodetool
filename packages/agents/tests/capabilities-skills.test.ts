import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, Skill, initTestDb } from "@nodetool-ai/models";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import {
  findInvokedSkillNames,
  formatInvokedSkillsForPrompt,
  formatSkillCatalogForPrompt
} from "../src/skill-prompt.js";

function ctx(userId: string | null = "u1") {
  return { userId } as unknown as ProcessingContext;
}

function call(name: string, args: Record<string, unknown>, user = "u1") {
  return toolForCapabilityName(name).process(ctx(user), args) as Promise<
    Record<string, unknown>
  >;
}

describe("skills capabilities", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

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
