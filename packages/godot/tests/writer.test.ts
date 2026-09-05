import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkGodotProject,
  frameRegion,
  readTres,
  writeGodotProject,
  type GodotProject
} from "../src/index.js";
import { GOLDEN_DIR, platformerInput } from "./fixture.js";

const UPDATE = process.env.UPDATE_GOLDEN === "1";

function goldenEntries(project: GodotProject): Array<[string, string]> {
  const entries: Array<[string, string]> = project.files.map((f) => [
    f.path,
    f.content
  ]);
  entries.push(["copies.json", `${JSON.stringify(project.copies, null, 2)}\n`]);
  return entries;
}

describe("writeGodotProject", () => {
  const project = writeGodotProject(platformerInput());

  it("matches the golden files byte for byte", () => {
    for (const [path, content] of goldenEntries(project)) {
      const file = resolve(GOLDEN_DIR, path);
      if (UPDATE || !existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
      }
      expect(readFileSync(file, "utf8"), path).toBe(content);
    }
  });

  it("emits one file or copy per slot", () => {
    expect(project.files.map((f) => f.path)).toEqual([
      "project.godot",
      "assets/sprites/enemy_walker.tres",
      "assets/audio/music_level.ogg.import",
      "assets/sprites/player.tres",
      "assets/audio/sfx_hurt.ogg.import",
      "assets/audio/sfx_jump.ogg.import",
      "assets/tiles/tiles_ground.tres"
    ]);
    expect(project.copies.map((c) => c.path)).toEqual([
      "assets/images/bg_far.png",
      "assets/sprites/enemy_walker.png",
      "assets/audio/music_level.ogg",
      "assets/sprites/player.png",
      "assets/audio/sfx_hurt.ogg",
      "assets/audio/sfx_jump.ogg",
      "assets/tiles/tiles_ground.png",
      "assets/images/title.png"
    ]);
  });

  it("writes project.godot for pixel art", () => {
    const text = project.files[0].content;
    expect(text).toContain("config_version=5");
    expect(text).toContain('config/name="Platformer"');
    expect(text).toContain('run/main_scene="res://scenes/level_01.tscn"');
    expect(text).toContain('config/features=PackedStringArray("4.3")');
    expect(text).toContain("textures/canvas_textures/default_texture_filter=0");
    const noMain = writeGodotProject({ ...platformerInput(), mainScene: undefined });
    expect(noMain.files[0].content).not.toContain("run/main_scene");
  });

  it("passes its own check", () => {
    expect(checkGodotProject(project)).toEqual([]);
  });

  it("is deterministic and localises an asset_id change to one slot", () => {
    expect(writeGodotProject(platformerInput())).toEqual(project);

    const input = platformerInput();
    const walker = input.filled.slots.find((s) => s.slot_id === "enemy.walker")!;
    walker.asset = { ...walker.asset, asset_id: "enemy_walker_v2" };
    const again = writeGodotProject(input);

    const changed = again.files
      .filter((f, i) => f.content !== project.files[i].content)
      .map((f) => f.path);
    expect(changed).toEqual(["assets/sprites/enemy_walker.tres"]);
    const changedCopies = again.copies
      .filter((c, i) => c.asset_id !== project.copies[i].asset_id)
      .map((c) => c.path);
    expect(changedCopies).toEqual(["assets/sprites/enemy_walker.png"]);
    expect(checkGodotProject(again)).toEqual([]);
  });

  it("rejects a filled manifest the template does not accept", () => {
    const input = platformerInput();
    input.filled.slots.pop();
    expect(() => writeGodotProject(input)).toThrow(/title: unfilled/);
  });

  it("computes row-major frame regions on the player sheet", () => {
    const sheet = { cell: [32, 32] as [number, number], columns: 8 };
    expect(frameRegion(sheet, 0)).toEqual({ x: 0, y: 0, w: 32, h: 32 });
    expect(frameRegion(sheet, 7)).toEqual({ x: 224, y: 0, w: 32, h: 32 });
    expect(frameRegion(sheet, 8)).toEqual({ x: 0, y: 32, w: 32, h: 32 });
    expect(frameRegion(sheet, 15)).toEqual({ x: 224, y: 32, w: 32, h: 32 });

    const player = project.files.find((f) => f.path === "assets/sprites/player.tres")!;
    const doc = readTres(player.content);
    const regions = doc.blocks
      .filter((b) => b.kind === "sub_resource")
      .map((b) => b.properties.region);
    expect(regions[0]).toBe("Rect2(0, 0, 32, 32)");
    expect(regions[7]).toBe("Rect2(224, 0, 32, 32)");
    expect(regions[8]).toBe("Rect2(0, 32, 32, 32)");
    expect(regions[15]).toBe("Rect2(224, 32, 32, 32)");
    expect(regions).toHaveLength(16);
  });

  it("writes the SpriteFrames animations with names, loop and speed", () => {
    const player = project.files.find((f) => f.path === "assets/sprites/player.tres")!;
    expect(player.content).toContain('"name": &"idle"');
    expect(player.content).toContain('"name": &"jump"');
    expect(player.content).toContain('"loop": false');
    expect(player.content).toContain('"speed": 8.0');
    expect(player.content).toMatch(/load_steps=18 format=3/);
  });

  it("declares every tile of the tileset atlas row-major", () => {
    const tiles = project.files.find((f) => f.path === "assets/tiles/tiles_ground.tres")!;
    const doc = readTres(tiles.content);
    const source = doc.blocks.find((b) => b.kind === "sub_resource")!;
    expect(source.attributes.type).toBe("TileSetAtlasSource");
    expect(source.properties.texture_region_size).toBe("Vector2i(16, 16)");
    const tileKeys = Object.keys(source.properties).filter((k) => /^\d+:\d+\/0$/.test(k));
    expect(tileKeys).toHaveLength(12);
    expect(tileKeys[0]).toBe("0:0/0");
    expect(tileKeys[4]).toBe("0:1/0");
    expect(tileKeys[11]).toBe("3:2/0");
    const resource = doc.blocks.find((b) => b.kind === "resource")!;
    expect(resource.properties.tile_size).toBe("Vector2i(16, 16)");
  });

  it("gives a collision polygon to every tile when the slot says all", () => {
    const tiles = project.files.find((f) => f.path === "assets/tiles/tiles_ground.tres")!;
    const source = readTres(tiles.content).blocks.find((b) => b.kind === "sub_resource")!;
    for (let i = 0; i < 12; i++) {
      const cell = `${i % 4}:${Math.floor(i / 4)}/0`;
      expect(source.properties[`${cell}/physics_layer_0/polygon_0/points`], cell).toBe(
        "PackedVector2Array(-8, -8, 8, -8, 8, 8, -8, 8)"
      );
    }
  });

  it("leaves walkable tiles without collision when the slot lists the solid ones", () => {
    const input = platformerInput();
    const ground = input.manifest.slots.find((s) => s.id === "tiles.ground");
    if (ground?.kind !== "tileset") throw new Error("tiles.ground is a tileset");
    ground.solid = [4, 5, 6, 7, 8, 9, 10, 11];
    const topdown = writeGodotProject(input);
    const tiles = topdown.files.find((f) => f.path === "assets/tiles/tiles_ground.tres")!;
    const source = readTres(tiles.content).blocks.find((b) => b.kind === "sub_resource")!;
    const tileKeys = Object.keys(source.properties).filter((k) => /^\d+:\d+\/0$/.test(k));
    expect(tileKeys).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      const cell = `${i % 4}:${Math.floor(i / 4)}/0`;
      const polygon = source.properties[`${cell}/physics_layer_0/polygon_0/points`];
      expect(polygon === undefined, cell).toBe(i < 4);
    }
    expect(checkGodotProject(topdown)).toEqual([]);
  });

  it("writes audio import sidecars with the loop flag", () => {
    const music = project.files.find((f) => f.path === "assets/audio/music_level.ogg.import")!;
    expect(music.content).toContain('importer="oggvorbisstr"');
    expect(music.content).toContain("loop=true");
    const jump = project.files.find((f) => f.path === "assets/audio/sfx_jump.ogg.import")!;
    expect(jump.content).toContain("loop=false");

    const input = platformerInput();
    const level = input.filled.slots.find((s) => s.slot_id === "music.level")!;
    level.asset = { ...level.asset, uri: "asset://music_level.wav" };
    const wav = writeGodotProject(input);
    const sidecar = wav.files.find((f) => f.path === "assets/audio/music_level.wav.import")!;
    expect(sidecar.content).toContain('importer="wav"');
    expect(sidecar.content).toContain("edit/loop_mode=1");
    expect(wav.copies.find((c) => c.path === "assets/audio/music_level.wav")).toBeDefined();
  });
});
