/**
 * Tests for skills-api.ts — frontmatter parsing, skill name validation,
 * and skill/font endpoint handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleSkillsRequest, handleFontsRequest } from "../src/skills-api.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "skills-api-test-"));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRequest(method = "GET"): Request {
  return new Request("http://localhost/api/skills", { method });
}

// ---------------------------------------------------------------------------
// handleSkillsRequest
// ---------------------------------------------------------------------------

describe("handleSkillsRequest", () => {
  it("returns 405 for non-GET methods", () => {
    const res = handleSkillsRequest(makeRequest("POST"));
    expect(res.status).toBe(405);
  });

  it("returns empty skill list when no skill dirs exist", async () => {
    const originalEnv = process.env.NODETOOL_AGENT_SKILL_DIRS;
    // Point to a non-existent directory
    process.env.NODETOOL_AGENT_SKILL_DIRS = path.join(tmpDir, "nonexistent");

    try {
      const res = handleSkillsRequest(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(body.skills)).toBe(true);
    } finally {
      if (originalEnv !== undefined) {
        process.env.NODETOOL_AGENT_SKILL_DIRS = originalEnv;
      } else {
        delete process.env.NODETOOL_AGENT_SKILL_DIRS;
      }
    }
  });

  it("discovers .md skill files from configured directories", async () => {
    const skillDir = path.join(tmpDir, "skills");
    await fsp.mkdir(skillDir, { recursive: true });

    await fsp.writeFile(
      path.join(skillDir, "my-tool.md"),
      `---
name: my-tool
description: A test tool
---
This is the body of the skill.
`,
    );

    const originalEnv = process.env.NODETOOL_AGENT_SKILL_DIRS;
    process.env.NODETOOL_AGENT_SKILL_DIRS = skillDir;

    try {
      const res = handleSkillsRequest(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBeGreaterThanOrEqual(1);

      const skill = body.skills.find(
        (s: { name: string }) => s.name === "my-tool",
      );
      expect(skill).toBeDefined();
      expect(skill.description).toBe("A test tool");
      expect(skill.instructions).toContain("body of the skill");
    } finally {
      if (originalEnv !== undefined) {
        process.env.NODETOOL_AGENT_SKILL_DIRS = originalEnv;
      } else {
        delete process.env.NODETOOL_AGENT_SKILL_DIRS;
      }
    }
  });

  it("skips files with invalid skill names", async () => {
    const skillDir = path.join(tmpDir, "skills2");
    await fsp.mkdir(skillDir, { recursive: true });

    // Name contains "claude" — should be blocked
    await fsp.writeFile(
      path.join(skillDir, "claude-helper.md"),
      "This skill should be blocked.",
    );

    // Name with uppercase — invalid
    await fsp.writeFile(
      path.join(skillDir, "MyTool.md"),
      "This has invalid name.",
    );

    // Valid skill
    await fsp.writeFile(
      path.join(skillDir, "valid-tool.md"),
      "A valid skill.",
    );

    const originalEnv = process.env.NODETOOL_AGENT_SKILL_DIRS;
    process.env.NODETOOL_AGENT_SKILL_DIRS = skillDir;

    try {
      const res = handleSkillsRequest(makeRequest());
      const body = await res.json();
      const names = body.skills.map((s: { name: string }) => s.name);
      expect(names).not.toContain("claude-helper");
      expect(names).not.toContain("MyTool");
      expect(names).toContain("valid-tool");
    } finally {
      if (originalEnv !== undefined) {
        process.env.NODETOOL_AGENT_SKILL_DIRS = originalEnv;
      } else {
        delete process.env.NODETOOL_AGENT_SKILL_DIRS;
      }
    }
  });

  it("extracts first paragraph as description when no frontmatter description", async () => {
    const skillDir = path.join(tmpDir, "skills3");
    await fsp.mkdir(skillDir, { recursive: true });

    await fsp.writeFile(
      path.join(skillDir, "no-desc.md"),
      `---
name: no-desc
---
# Heading

This is the first real paragraph.

More content here.
`,
    );

    const originalEnv = process.env.NODETOOL_AGENT_SKILL_DIRS;
    process.env.NODETOOL_AGENT_SKILL_DIRS = skillDir;

    try {
      const res = handleSkillsRequest(makeRequest());
      const body = await res.json();
      const skill = body.skills.find(
        (s: { name: string }) => s.name === "no-desc",
      );
      expect(skill).toBeDefined();
      expect(skill.description).toBe("This is the first real paragraph.");
    } finally {
      if (originalEnv !== undefined) {
        process.env.NODETOOL_AGENT_SKILL_DIRS = originalEnv;
      } else {
        delete process.env.NODETOOL_AGENT_SKILL_DIRS;
      }
    }
  });

  it("uses filename as name when no frontmatter name", async () => {
    const skillDir = path.join(tmpDir, "skills4");
    await fsp.mkdir(skillDir, { recursive: true });

    await fsp.writeFile(
      path.join(skillDir, "filename-tool.md"),
      "Just body content, no frontmatter.",
    );

    const originalEnv = process.env.NODETOOL_AGENT_SKILL_DIRS;
    process.env.NODETOOL_AGENT_SKILL_DIRS = skillDir;

    try {
      const res = handleSkillsRequest(makeRequest());
      const body = await res.json();
      const skill = body.skills.find(
        (s: { name: string }) => s.name === "filename-tool",
      );
      expect(skill).toBeDefined();
    } finally {
      if (originalEnv !== undefined) {
        process.env.NODETOOL_AGENT_SKILL_DIRS = originalEnv;
      } else {
        delete process.env.NODETOOL_AGENT_SKILL_DIRS;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// handleFontsRequest
// ---------------------------------------------------------------------------

describe("handleFontsRequest", () => {
  it("returns 405 for non-GET methods", () => {
    const res = handleFontsRequest(
      new Request("http://localhost/api/fonts", { method: "POST" }),
    );
    expect(res.status).toBe(405);
  });

  it("returns a sorted deduplicated font list", async () => {
    const res = handleFontsRequest(
      new Request("http://localhost/api/fonts", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.fonts)).toBe(true);
    // Verify sorting
    const fonts = body.fonts as string[];
    for (let i = 1; i < fonts.length; i++) {
      expect(fonts[i] >= fonts[i - 1]).toBe(true);
    }
    // Verify no duplicates
    expect(new Set(fonts).size).toBe(fonts.length);
  });
});
