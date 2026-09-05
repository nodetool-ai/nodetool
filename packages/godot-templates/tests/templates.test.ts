import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gameAssetManifest } from "@nodetool-ai/protocol";
import { getTemplate, listTemplates } from "../src/index.js";

const SCANNED = [".tscn", ".tres", ".gd", ".godot"];
const RES_PATH = /res:\/\/[A-Za-z0-9_./-]+/g;

/** Every `res://` path in any scene, resource, script or project file, with the file that names it. */
function scanResPaths(dir: string): Array<{ file: string; path: string }> {
  const refs: Array<{ file: string; path: string }> = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (SCANNED.some((ext) => entry.name.endsWith(ext))) {
        for (const match of readFileSync(full, "utf8").matchAll(RES_PATH)) {
          refs.push({ file: relative(dir, full), path: match[0] });
        }
      }
    }
  };
  walk(dir);
  return refs;
}

const fileId = (slotId: string) => slotId.replaceAll(".", "_");

function expectedAssetPath(kind: string, id: string): string {
  switch (kind) {
    case "spritesheet":
      return `res://assets/sprites/${fileId(id)}.tres`;
    case "tileset":
      return `res://assets/tiles/${fileId(id)}.tres`;
    case "image":
      return `res://assets/images/${fileId(id)}.png`;
    case "sfx":
    case "music":
      return `res://assets/audio/${fileId(id)}.wav`;
    default:
      throw new Error(`unknown kind ${kind}`);
  }
}

const templates = listTemplates();

describe("template registry", () => {
  it("ships platformer, topdown and shmup", () => {
    expect(templates.map((t) => t.id)).toEqual(["platformer", "shmup", "topdown"]);
  });

  it("getTemplate rejects unknown ids", () => {
    expect(() => getTemplate("nope")).toThrow(/Unknown Godot template/);
  });

  it("platformer manifest is the protocol fixture, byte for byte", () => {
    const fixture = readFileSync(
      join(__dirname, "../../protocol/fixtures/game-assets/platformer.manifest.json"),
      "utf8"
    );
    expect(readFileSync(join(getTemplate("platformer").dir, "manifest.json"), "utf8")).toBe(fixture);
  });
});

describe.each(templates)("template $id", (template) => {
  const raw = JSON.parse(readFileSync(join(template.dir, "manifest.json"), "utf8"));

  it("manifest parses with gameAssetManifest and names its own template", () => {
    const parsed = gameAssetManifest.parse(raw);
    expect(parsed.template).toBe(template.id);
    expect(parsed.godot).toBe("4.3");
  });

  it("has a project.godot targeting 4.3 with the main scene and canvas_items stretch", () => {
    const project = readFileSync(join(template.dir, "project.godot"), "utf8");
    expect(project).toContain('config/features=PackedStringArray("4.3")');
    expect(project).toContain('run/main_scene="res://scenes/main.tscn"');
    expect(project).toContain('window/stretch/mode="canvas_items"');
    expect(project).toContain("window/size/viewport_width=960");
    expect(project).toContain("window/size/viewport_height=540");
  });

  it("every res:// reference exists on disk", () => {
    const refs = scanResPaths(template.dir);
    expect(refs.length).toBeGreaterThan(10);
    const missing = refs.filter((r) => !existsSync(join(template.dir, r.path.slice("res://".length))));
    expect(missing).toEqual([]);
  });

  it("every manifest slot lands on a path the scenes reference", () => {
    const referenced = new Set(scanResPaths(template.dir).map((r) => r.path));
    const unreferenced = template.manifest.slots
      .map((slot) => expectedAssetPath(slot.kind, slot.id))
      .filter((path) => !referenced.has(path));
    expect(unreferenced).toEqual([]);
  });

  it("every hook file exists", () => {
    for (const hook of template.manifest.hooks) {
      expect(existsSync(join(template.dir, hook)), hook).toBe(true);
    }
  });

  it("uses TileMapLayer, not the removed TileMap, wherever it has a tileset", () => {
    const hasTileset = template.manifest.slots.some((s) => s.kind === "tileset");
    const level = readFileSync(join(template.dir, "scenes/level_01.tscn"), "utf8");
    expect(level.includes('type="TileMapLayer"')).toBe(hasTileset);
    expect(level).not.toMatch(/type="TileMap"/);
  });
});
