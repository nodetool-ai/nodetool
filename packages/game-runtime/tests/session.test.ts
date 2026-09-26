import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createTopDownRoomGame, replayGame, validateGame } from "../src/index.js";

const input = (pressed: string[] = []) => ({ pressed, justPressed: [] });

describe("native game runtime", () => {
  it("replays movement, collection, win, and audio deterministically", () => {
    const game = createTopDownRoomGame("a".repeat(32));
    const inputs = Array.from({ length: 40 }, () => input(["right"]));
    const first = replayGame(game, 23, inputs);
    const second = replayGame(game, 23, inputs);
    expect(first).toEqual(second);
    expect(first.snapshot.score).toBe(1);
    expect(first.snapshot.won).toBe(true);
    expect(first.steps.flatMap((step) => step.events).filter((event) => event.kind === "collected")).toHaveLength(1);
    expect(first.steps.flatMap((step) => step.events).some((event) => event.kind === "audio")).toBe(true);
  });

  it("loads a save and continues at the same fixed tick", () => {
    const game = createTopDownRoomGame("b".repeat(32));
    const session = createGameSession(game, 10);
    for (let tick = 0; tick < 20; tick += 1) {
      session.step(input(["right"]));
    }
    const save = session.snapshot();
    const resumed = createGameSession(game, 10, save);
    for (let tick = 0; tick < 20; tick += 1) {
      session.step(input(["right"]));
      resumed.step(input(["right"]));
    }
    expect(resumed.snapshot()).toEqual(session.snapshot());
    expect(resumed.snapshot().tick).toBe(40);
    session.dispose();
    resumed.dispose();
  });

  it("blocks movement through walls", () => {
    const game = createTopDownRoomGame("c".repeat(32));
    const result = replayGame(game, 0, Array.from({ length: 400 }, () => input(["right"])));
    const player = result.snapshot.entities.find((entity) => entity.id === "player");
    expect(player?.x).toBeLessThan(6.7);
  });

  it("rejects broken references and cycles", () => {
    const game = createTopDownRoomGame("d".repeat(32));
    const bad = structuredClone(game);
    bad.scenes[0].entities[0].parentId = "player";
    bad.scenes[0].entities[1].parentId = "camera";
    bad.scenes[0].entities[1].sprite = { ...bad.scenes[0].entities[1].sprite, assetId: "missing", width: 1, height: 1, layer: 0 };
    const result = validateGame(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("Parent cycle");
    expect(result.errors.join(" ")).toContain("missing asset");
  });

  it("rejects unknown components instead of dropping them", () => {
    const game = createTopDownRoomGame("e".repeat(32));
    const invalid: unknown = {
      ...game,
      scenes: [{ ...game.scenes[0], entities: [{ ...game.scenes[0].entities[0], body3d: { mass: 1 } }, ...game.scenes[0].entities.slice(1)] }]
    };
    const result = validateGame(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("body3d");
  });

  it("rejects a save from another source revision", () => {
    const game = createTopDownRoomGame("f".repeat(32));
    const session = createGameSession(game, 0);
    const save = session.snapshot();
    expect(() => createGameSession({ ...game, revision: "new" }, 0, save)).toThrow("Save revision");
    session.dispose();
  });

  it("restores a pending trigger before a deterministic prefab spawn", () => {
    const base = createTopDownRoomGame("1".repeat(32));
    const room = base.scenes[0];
    const game = gameDocument.parse({
      ...base,
      scenes: [{
        ...room,
        entities: [
          { ...room.entities[0], behaviors: [{ kind: "spawn", prefabId: "spark", onEvent: "gem-picked" }] },
          ...room.entities.slice(1).map((entity) => entity.id === "gem" ? { ...entity, behaviors: [...entity.behaviors, { kind: "trigger", event: "gem-picked" }] } : entity),
          { id: "spark", templateOnly: true, transform2d: { x: 3, y: 0 }, sprite: { assetId: "gem", width: 0.25, height: 0.25, layer: 3 } }
        ]
      }]
    });
    const session = createGameSession(game, 7);
    for (let index = 0; index < 40; index += 1) {
      const result = session.step(input(["right"]));
      if (result.events.some((event) => event.kind === "trigger")) break;
    }
    const save = session.snapshot();
    expect(save.pendingEvents.some((event) => event.kind === "trigger")).toBe(true);
    const resumed = createGameSession(game, 7, save);
    session.step(input());
    resumed.step(input());
    expect(resumed.snapshot()).toEqual(session.snapshot());
    expect(session.snapshot().entities.filter((entity) => entity.sourceId === "spark")).toHaveLength(1);
    session.dispose();
    resumed.dispose();
  });

  it("renders a child sprite with its static parent's world transform", () => {
    const base = createTopDownRoomGame("2".repeat(32));
    const room = base.scenes[0];
    const game = gameDocument.parse({
      ...base,
      scenes: [{
        ...room,
        entities: [
          ...room.entities,
          { id: "group", transform2d: { x: 2, y: 3, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 } },
          { id: "child", parentId: "group", transform2d: { x: 1, y: 0, rotation: 0.25, scaleX: 0.5, scaleY: 0.5 }, sprite: { assetId: "gem", width: 1, height: 1 } }
        ]
      }]
    });
    const session = createGameSession(game, 0);
    const child = session.step(input()).frame.sprites.find((sprite) => sprite.entityId === "child");
    expect(child?.x).toBeCloseTo(2);
    expect(child?.y).toBeCloseTo(5);
    expect(child?.rotation).toBeCloseTo(Math.PI / 2 + 0.25);
    expect(child?.scaleX).toBe(1);
    expect(child?.scaleY).toBe(1);
    session.dispose();
  });

  it("rejects moving parents until nested motion has a defined rule", () => {
    const base = createTopDownRoomGame("3".repeat(32));
    const room = base.scenes[0];
    const invalid = gameDocument.parse({
      ...base,
      scenes: [{ ...room, entities: [...room.entities, { id: "child", parentId: "player", transform2d: { x: 1, y: 0 } }] }]
    });
    expect(validateGame(invalid).errors.join(" ")).toContain("Moving parent player is not supported");
  });

  it("rejects a collider beneath a rotated parent", () => {
    const base = createTopDownRoomGame("5".repeat(32));
    const room = base.scenes[0];
    const game = gameDocument.parse({
      ...base,
      scenes: [{
        ...room,
        entities: [
          ...room.entities,
          { id: "rotated-group", transform2d: { x: 0, y: 0, rotation: 0.5 } },
          { id: "sensor", parentId: "rotated-group", transform2d: { x: 1, y: 0 }, collider2d: { width: 1, height: 1, sensor: true } }
        ]
      }]
    });
    expect(validateGame(game).errors.join(" ")).toContain("Collider sensor cannot be rotated or scaled");
  });

  it("handles a deep parent chain without recursive traversal", () => {
    const base = createTopDownRoomGame("4".repeat(32));
    const chain = Array.from({ length: 5000 }, (_, index) => ({
      id: `nested-${index}`,
      ...(index > 0 ? { parentId: `nested-${index - 1}` } : {}),
      transform2d: { x: 1, y: 0 }
    }));
    const game = gameDocument.parse({
      ...base,
      scenes: [{ ...base.scenes[0], entities: [...base.scenes[0].entities, ...chain] }]
    });
    const session = createGameSession(game, 0);
    expect(session.inspect({ entityId: "nested-4999" }).entities[0].x).toBe(5000);
    session.dispose();
  });
});
