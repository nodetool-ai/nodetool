import { describe, expect, it } from "vitest";
import { applyGameOps, GameOpError, createTopDownRoomGame, validateGame, type GameDocumentOp } from "../src/index.js";

function game() {
  return { ...createTopDownRoomGame("edit-test"), schemaVersion: 2 as const };
}

const light = { x: 1, y: 2, color: "#ffffff", intensity: 1, radius: 3, falloff: 1 };
const background = { id: "bg", assetId: "player", width: 16, height: 9 };

describe("applyGameOps", () => {
  it("replaces a whole level and applies following edits atomically", () => {
    const original = game();
    const replacement = { ...game(), id: "builder-id", revision: "builder-revision", entrySceneId: "level", scenes: [{
      id: "level", name: "Large level", entities: Array.from({ length: 117 }, (_, number) => ({
        id: `item-${number}`, name: "", templateOnly: false,
        transform2d: { x: number, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, behaviors: [],
        ...(number === 0 ? { tilemap: { assetId: "wall", layer: 0, solid: true,
          tiles: Array.from({ length: 3446 }, (_, tile) => ({ x: tile, y: 0, width: 1, height: 1 })) } } : {})
      }))
    }] };
    const result = applyGameOps(original, [
      { op: "set_document", document: replacement },
      { op: "update_entity", entity_id: "item-116", set: { name: "Goal" } }
    ]);
    expect(result.id).toBe(original.id);
    expect(result.revision).toBe(original.revision);
    expect(result.scenes[0].entities).toHaveLength(117);
    expect(result.scenes[0].entities[0].tilemap?.tiles).toHaveLength(3446);
    expect(result.scenes[0].entities[116].name).toBe("Goal");
    expect(original).toEqual(game());
    expect(replacement.scenes[0].entities[116].name).toBe("");
    expect(() => applyGameOps(original, [
      { op: "set_document", document: replacement },
      { op: "update_entity", entity_id: "missing", set: { name: "Goal" } }
    ])).toThrow(/does not exist/);
    expect(original).toEqual(game());
  });

  it("reports invalid replacement references against the replacement op", () => {
    const replacement = game();
    replacement.scenes[0].entities[1].sprite!.assetId = "missing";
    try {
      applyGameOps(game(), [
        { op: "set_game", pixels_per_unit: 24 },
        { op: "set_document", document: replacement },
        { op: "update_entity", entity_id: "gem", set: { name: "Gem" } }
      ]);
      expect.fail("Invalid document was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(GameOpError);
      expect(error).toMatchObject({ opIndex: 1, path: ["scenes", 0, "entities", 1, "sprite", "assetId"] });
    }
  });

  it("adds, updates, duplicates, removes, and reparents entities without mutating input", () => {
    const original = game();
    const result = applyGameOps(original, [
      { op: "add_entity", scene_id: "room", entity: { id: "parent" } },
      { op: "add_entity", scene_id: "room", entity: { id: "child", parentId: "parent" } },
      { op: "update_entity", entity_id: "child", set: { transform2d: { x: 4 }, sprite: { assetId: "player", width: 1, height: 1 } } },
      { op: "update_entity", entity_id: "child", set: { sprite: { width: 2 } } },
      { op: "duplicate_entity", entity_id: "child", new_id: "copy", offset: { x: 2, y: -1 } },
      { op: "remove_entity", entity_id: "parent", children: "reparent" },
      { op: "update_entity", entity_id: "child", set: { sprite: null } }
    ]);
    expect(result.scenes[0].entities.find((entity) => entity.id === "child")?.transform2d).toMatchObject({ x: 4, y: 0 });
    expect(result.scenes[0].entities.find((entity) => entity.id === "child")?.sprite).toBeUndefined();
    expect(result.scenes[0].entities.find((entity) => entity.id === "copy")?.transform2d).toMatchObject({ x: 6, y: -1 });
    expect(original.scenes[0].entities.find((entity) => entity.id === "child")).toBeUndefined();
  });

  it("edits behaviors and scripts in order", () => {
    const result = applyGameOps(game(), [
      { op: "add_behavior", entity_id: "player", behavior: { kind: "script", source: "() => []" } },
      { op: "set_script", entity_id: "player", index: 2, source: "() => [{ type: 'win' }]", max_commands: 4 },
      { op: "update_behavior", entity_id: "player", index: 2, behavior: { maxTickMs: 12 } },
      { op: "move_behavior", entity_id: "player", index: 2, to_index: 0 },
      { op: "remove_behavior", entity_id: "player", index: 1 }
    ]);
    expect(result.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors[0]).toMatchObject({ kind: "script", source: "() => [{ type: 'win' }]", maxCommands: 4, maxTickMs: 12 });
  });

  it("reorders entities without changing their references or fields", () => {
    const original = applyGameOps(game(), [
      { op: "add_entity", scene_id: "room", entity: { id: "parent" } },
      { op: "add_entity", scene_id: "room", entity: { id: "child", parentId: "parent" } }
    ]);
    const moved = applyGameOps(original, [{ op: "move_entity", scene_id: "room", entity_id: "parent", to_index: 0 }]);
    expect(moved.scenes[0].entities[0]?.id).toBe("parent");
    expect(moved.scenes[0].entities.find((entity) => entity.id === "child")?.parentId).toBe("parent");
    expect(() => applyGameOps(original, [{ op: "move_entity", scene_id: "room", entity_id: "parent", to_index: 999 }])).toThrow(/out of range/);
    expect(original.scenes[0].entities[0]?.id).not.toBe("parent");
  });

  it("edits scenes, lighting, backgrounds, effects, game settings, and asset bindings", () => {
    const result = applyGameOps(game(), [
      { op: "bind_asset", slot: "new", binding: { assetId: "asset-new", digest: "sha", width: 32, height: 32 } },
      { op: "add_scene", scene_id: "second" },
      { op: "update_scene", scene_id: "second", set: { name: "Second room" } },
      { op: "set_lighting", scene_id: "second", lighting: { ambient: { color: "#ffffff", intensity: 0.5 }, points: [] } },
      { op: "add_light", scene_id: "second", light },
      { op: "update_light", scene_id: "second", index: 0, set: { radius: 4 } },
      { op: "add_background", scene_id: "second", background },
      { op: "update_background", scene_id: "second", id: "bg", set: { width: 20 } },
      { op: "move_background", scene_id: "second", id: "bg", to_index: 0 },
      { op: "set_effects", effects: [{ kind: "brightnessContrast", brightness: 0.1, contrast: 1, required: false }], hud_effect_order: "afterEffects" },
      { op: "set_game", entry_scene_id: "second", pixels_per_unit: 24, input_actions: ["left", "right", "up", "down"], collision_layers: ["player", "wall"] },
      { op: "unbind_asset", slot: "new" },
      { op: "remove_light", scene_id: "second", index: 0 },
      { op: "remove_background", scene_id: "second", id: "bg" }
    ]);
    expect(result.scenes[1]).toMatchObject({ name: "Second room", lighting: { points: [] }, backgrounds: [] });
    expect(result.collisionLayers).toEqual(["player", "wall"]);
    expect(result.renderEffects).toHaveLength(1);
    expect(result.assets.new).toBeUndefined();
    const removed = applyGameOps(result, [{ op: "set_game", entry_scene_id: "room" }, { op: "remove_scene", scene_id: "second" }]);
    expect(removed.scenes).toHaveLength(1);
  });

  it("rejects references, ambiguous targets, and bad indices with the failing op index", () => {
    const original = game();
    expect(() => applyGameOps(original, [
      { op: "add_entity", scene_id: "room", entity: { id: "temp" } },
      { op: "update_behavior", entity_id: "temp", index: 0, behavior: { speed: 2 } }
    ])).toThrowError(GameOpError);
    try {
      applyGameOps(original, [{ op: "remove_entity", entity_id: "player" }, { op: "remove_entity", entity_id: "missing" }]);
    } catch (error) {
      expect(error).toMatchObject({ opIndex: 1, path: ["entity_id"] });
    }
    expect(original.scenes[0].entities.some((entity) => entity.id === "player")).toBe(true);
    expect(() => applyGameOps(original, [{ op: "unbind_asset", slot: "player" }])).toThrow(/still referenced/);
    expect(() => applyGameOps(original, [{ op: "remove_scene", scene_id: "room" }])).toThrow(/last scene/);
    const withTransition = applyGameOps(original, [
      { op: "add_scene", scene_id: "second" },
      { op: "add_behavior", entity_id: "player", behavior: { kind: "sceneTransition", sceneId: "second", onEvent: "enter" } }
    ]);
    expect(() => applyGameOps(withTransition, [{ op: "remove_scene", scene_id: "second" }])).toThrow(/still references/);
    const withPrefab = applyGameOps(original, [
      { op: "add_entity", scene_id: "room", entity: { id: "prefab", templateOnly: true } },
      { op: "add_behavior", entity_id: "player", behavior: { kind: "spawn", prefabId: "prefab", onEvent: "spawn" } }
    ]);
    expect(() => applyGameOps(withPrefab, [{ op: "remove_entity", entity_id: "prefab" }])).toThrow(/still references/);
    const ambiguous = applyGameOps(original, [{ op: "add_scene", scene_id: "second", scene: { entities: [{ id: "player", name: "", templateOnly: false, transform2d: { x: 0, y: 0 }, behaviors: [] }] } }]);
    expect(() => applyGameOps(ambiguous, [{ op: "update_entity", entity_id: "player", set: { name: "renamed" } }])).toThrow(/multiple scenes/);
  });

  it("returns structured field paths for schema and reference errors", () => {
    expect(validateGame({ ...game(), pixelsPerUnit: -1 }).issues).toContainEqual(expect.objectContaining({ path: ["pixelsPerUnit"] }));
    const invalid = { ...game(), renderEffects: [{ kind: "lut", assetId: "player", size: 4 }] };
    expect(validateGame(invalid).issues).toContainEqual({ path: ["renderEffects", 0, "assetId"], message: "LUT dimensions must be 16×4" });
    const withDottedSlot = game();
    withDottedSlot.assets["sfx.collect"].required = true;
    expect(validateGame(withDottedSlot).issues).toContainEqual({ path: ["assets", "sfx.collect", "required"], message: "only fonts may set required" });
    try {
      applyGameOps(game(), [
        { op: "set_game", entry_scene_id: "missing" },
        { op: "set_effects", effects: [{ kind: "lut", assetId: "player", size: 4 }] }
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(GameOpError);
      expect(error).toMatchObject({ issues: [
        { opIndex: 1, path: ["renderEffects", 0, "assetId"] },
        { opIndex: 0, path: ["entrySceneId"] }
      ] });
    }
  });

  it("applies 1,000 ordered ops", () => {
    const ops: GameDocumentOp[] = Array.from({ length: 1000 }, (_, number) => ({ op: "add_entity", scene_id: "room", entity: { id: `item-${number}` } }));
    const result = applyGameOps(game(), ops);
    expect(result.scenes[0].entities).toHaveLength(game().scenes[0].entities.length + 1000);
    expect(result.scenes[0].entities.at(-1)?.id).toBe("item-999");
  });

  it("updates 1,000 distinct entities in one ordered edit", () => {
    const original = game();
    original.scenes[0].entities.push(...Array.from({ length: 1000 }, (_, number) => ({
      id: `item-${number}`, name: "", templateOnly: false,
      transform2d: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, behaviors: []
    })));
    const ops: GameDocumentOp[] = Array.from({ length: 1000 }, (_, number) => ({
      op: "update_entity", entity_id: `item-${number}`, set: { transform2d: { x: number } }
    }));
    const result = applyGameOps(original, ops);
    const positions = new Map(result.scenes[0].entities.map((entity) => [entity.id, entity.transform2d.x]));
    for (let number = 0; number < 1000; number += 1) {
      expect(positions.get(`item-${number}`)).toBe(number);
    }
    expect(original.scenes[0].entities.at(-1)?.transform2d.x).toBe(0);
  });
});
