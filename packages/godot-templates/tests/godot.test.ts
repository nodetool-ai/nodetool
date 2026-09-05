import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GodotMissingError,
  checkScripts,
  findGodot,
  importProject,
  listTemplates,
  runGodotHeadless,
  smokeProject
} from "../src/index.js";

const godot = findGodot();
if (!godot) {
  describe("real Godot", () => {
    it.skip("no Godot binary found: set GODOT_BIN or put godot on PATH to run the import/check/smoke suite", () => {});
    it("runGodotHeadless throws GodotMissingError", async () => {
      await expect(runGodotHeadless({ projectDir: ".", args: [] })).rejects.toBeInstanceOf(
        GodotMissingError
      );
    });
  });
}

describe.runIf(godot)("real Godot", () => {
  let work: string;
  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "godot-templates-"));
  });
  afterAll(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it("reports the binary in use", () => {
    expect(godot).toBeTruthy();
  });

  describe.each(listTemplates())("$id", (template) => {
    let dir: string;
    beforeAll(() => {
      dir = join(work, template.id);
      cpSync(template.dir, dir, { recursive: true });
    });

    it("imports", async () => {
      const result = await importProject(dir);
      expect(result.code, result.stderr).toBe(0);
    });

    it("every script passes --check-only", async () => {
      const result = await checkScripts(dir);
      expect(result.results.length).toBeGreaterThan(3);
      const failed = result.results.filter((r) => r.code !== 0);
      expect(failed.map((r) => `${r.script}\n${r.stderr}`)).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it("smoke test runs 60 frames and exits 0", async () => {
      const result = await smokeProject(dir);
      expect(result.code, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("SMOKE OK");
    });
  });

  it("checkScripts fails on a broken script", async () => {
    const dir = join(work, "broken");
    cpSync(listTemplates()[0].dir, dir, { recursive: true });
    writeFileSync(join(dir, "scripts/player.gd"), "extends CharacterBody2D\nfunc _ready( -> void:\n\tpass\n");
    const result = await checkScripts(dir);
    expect(result.ok).toBe(false);
    const broken = result.results.find((r) => r.script === "res://scripts/player.gd");
    expect(broken?.code).not.toBe(0);
    const others = result.results.filter((r) => r.script !== "res://scripts/player.gd");
    expect(others.every((r) => r.code === 0)).toBe(true);
  });

  it("smokeProject fails when a promised node is missing", async () => {
    const dir = join(work, "missing-node");
    cpSync(listTemplates()[0].dir, dir, { recursive: true });
    await importProject(dir);
    writeFileSync(
      join(dir, "test/smoke.gd"),
      'extends SceneTree\nfunc _initialize() -> void:\n\tprinterr("SMOKE FAIL: forced")\n\tquit(1)\n'
    );
    const result = await smokeProject(dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("SMOKE FAIL");
  });
});
