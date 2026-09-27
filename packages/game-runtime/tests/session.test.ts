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

  it("resumes declarative tracks across delay and ping-pong boundaries", () => {
    const base = createTopDownRoomGame("8".repeat(32));
    const game = gameDocument.parse({ ...base, schemaVersion: 2, scenes: [{ ...base.scenes[0],
      entities: base.scenes[0].entities.map((entity) => entity.id === "gem" ? { ...entity,
        visualAnimation: { tracks: [
          { property: "rotation", from: 0, to: Math.PI * 2, durationTicks: 2, delayTicks: 1, repeat: true, pingPong: true, easing: "linear" },
          { property: "opacity", from: 1, to: 0, durationTicks: 2, delayTicks: 1, repeat: true, pingPong: true, easing: "linear" }
        ] } } : entity) }] });
    const continuous = createGameSession(game, 0);
    for (let index = 0; index < 3; index += 1) continuous.step(input());
    const save = continuous.snapshot();
    const resumed = createGameSession(game, 0, save);
    for (let index = 0; index < 8; index += 1) {
      expect(resumed.frame()).toEqual(continuous.frame());
      resumed.step(input());
      continuous.step(input());
    }
    expect(resumed.snapshot()).toEqual(continuous.snapshot());
    continuous.dispose();
    resumed.dispose();
  });

  it("rejects duplicate and invalid visual tracks", () => {
    const base = createTopDownRoomGame("9".repeat(32));
    const game = gameDocument.parse({ ...base, schemaVersion: 2, scenes: [{ ...base.scenes[0],
      entities: base.scenes[0].entities.map((entity) => entity.id === "gem" ? { ...entity,
        visualAnimation: { tracks: [
          { property: "scaleX", from: 1, to: -1, durationTicks: 2 },
          { property: "scaleX", from: 1, to: 2, durationTicks: 2 }
        ] } } : entity) }] });
    expect(validateGame(game).errors.join(" ")).toMatch(/duplicate scaleX track/);
    expect(validateGame(game).errors.join(" ")).toMatch(/scale values must be positive/);
  });

  it("projects scene lighting and rejects lighting on a version 1 document", () => {
    const base = createTopDownRoomGame("7".repeat(32));
    const lighting = { ambient: { color: "#202020", intensity: 0.5 },
      points: [{ x: 1, y: 2, color: "#ff0000", intensity: 2, radius: 3, falloff: 2 }] };
    const scene = { ...base.scenes[0], lighting };
    const game = gameDocument.parse({ ...base, schemaVersion: 2, scenes: [scene] });
    const session = createGameSession(game, 0);
    expect(session.frame().lighting).toEqual(lighting);
    expect(validateGame({ ...game, schemaVersion: 1 }).errors.join(" ")).toContain("requires schema version 2");
    session.dispose();
  });

  it("reproduces background positions from the saved tick", () => {
    const base = createTopDownRoomGame("6".repeat(32));
    const background = { id: "mist", assetId: "wall", width: 3, height: 3, layer: -2,
      origin: { x: -1, y: 1 }, parallax: { x: 0.4, y: 0 }, scrollRate: { x: -2, y: 0.5 }, mode: "repeat" };
    const game = gameDocument.parse({ ...base, schemaVersion: 2,
      scenes: [{ ...base.scenes[0], backgrounds: [background] }] });
    const session = createGameSession(game, 2);
    for (let index = 0; index < 20; index += 1) session.step(input());
    const resumed = createGameSession(game, 2, session.snapshot());
    expect(resumed.frame().backgrounds).toEqual(session.frame().backgrounds);
    expect(resumed.frame().tick).toBe(20);
    session.dispose();
    resumed.dispose();
  });

  it("keeps scene music at its logical start tick across save and load", () => {
    const base = createTopDownRoomGame("b".repeat(32));
    const game = gameDocument.parse({ ...base, schemaVersion: 2, scenes: [{ ...base.scenes[0], music: { assetId: "sfx.collect", volume: 0.4, fadeInTicks: 12, fadeOutTicks: 6 } }] });
    const session = createGameSession(game, 2);
    expect(session.snapshot().music).toEqual({ voiceId: `scene:${game.entrySceneId}:music`, assetId: "sfx.collect", startTick: 0,
      volume: 0.4, fadeInTicks: 12, fadeOutTicks: 6 });
    for (let index = 0; index < 90; index += 1) session.step(input());
    const saved = session.snapshot();
    const restored = createGameSession(game, 2, saved);
    expect(restored.snapshot().music).toEqual(saved.music);
    expect(restored.step(input()).events.filter((event) => event.kind === "audio")).toEqual([]);
    session.dispose();
    restored.dispose();
  });

  it("replaces scene music once at the transition tick", () => {
    const base = createTopDownRoomGame("music-transition");
    const room = base.scenes[0];
    const game = gameDocument.parse({ ...base, schemaVersion: 2,
      scenes: [
        { ...room, music: { assetId: "sfx.collect" }, entities: room.entities.map((entity) => {
          if (entity.id === "player") return { ...entity, behaviors: [...entity.behaviors,
            { kind: "sceneTransition", sceneId: "next", onEvent: "next" }] };
          if (entity.id === "gem") return { ...entity, transform2d: { ...entity.transform2d, x: 0 },
            behaviors: [{ kind: "trigger", event: "next" }] };
          return entity;
        }) },
        { id: "next", name: "Next", music: { assetId: "sfx.collect" }, entities: [] }
      ] });
    const session = createGameSession(game, 1);
    expect(session.snapshot().music?.voiceId).toBe("scene:room:music");
    session.step(input());
    const transition = session.step(input());
    expect(transition.events.filter((event) => event.kind === "sceneTransition")).toHaveLength(1);
    expect(session.snapshot().music).toMatchObject({ voiceId: "scene:next:music", startTick: 2 });
    session.step(input());
    expect(session.snapshot().music?.startTick).toBe(2);
    session.dispose();
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
