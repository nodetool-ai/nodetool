import { describe, expect, it } from "vitest";
import { gameDocument, gameEntity, type GameDocument, type GameInputFrame } from "@nodetool-ai/protocol";
import { autoplayNativeGame, createTopDownRoomGame, gameLevelStats, MAX_GAME_ROUTE_TICKS, replayScriptedGame, type GameRouteInput } from "../src/index.js";

function inputs(route: readonly GameRouteInput[]): GameInputFrame[] {
  return route.flatMap((input) => Array.from({ length: input.ticks }, (_, index) => ({ pressed: input.pressed, justPressed: index === 0 ? input.justPressed : [] })));
}

function room(changes: (document: GameDocument) => void): GameDocument {
  const document = createTopDownRoomGame("autoplay-test");
  changes(document);
  return gameDocument.parse(document);
}

describe("native game autoplay", () => {
  it("finds a win and returns a deterministic replayable route", async () => {
    const document = createTopDownRoomGame("autoplay-test");
    const first = await autoplayNativeGame(document, { win: true });
    const second = await autoplayNativeGame(document, { win: true });
    expect(first.status).toBe("reached");
    expect(first.winTick).toBe(first.tick);
    expect(first.route).toEqual(second.route);
    const replay = await replayScriptedGame(document, 1, inputs(first.route));
    expect(replay.snapshot).toEqual(first.snapshot);
    expect(replay.snapshot.won).toBe(true);
    expect(first.reachedTargets).toContain("gem");
  });

  it("steers around a wall rather than repeatedly pushing against it", async () => {
    const document = room((game) => {
      game.scenes[0].entities.push(gameEntity.parse({
        id: "obstacle", transform2d: { x: 1, y: 0 }, body2d: { type: "static" }, collider2d: { width: 0.5, height: 2 }
      }));
    });
    const result = await autoplayNativeGame(document, { win: true, maxTicks: 600 });
    expect(result.status).toBe("reached");
    expect(result.route.some((input) => input.pressed.includes("up") || input.pressed.includes("down"))).toBe(true);
    expect((await replayScriptedGame(document, 1, inputs(result.route))).snapshot.won).toBe(true);
  });

  it("reports a failed bounded search for an enclosed target without claiming it impossible", async () => {
    const document = room((game) => {
      const right = game.scenes[0].entities.find((entity) => entity.id === "wall-right");
      if (!right) {
        throw new Error("Missing wall");
      }
      right.transform2d.x = 1;
      right.collider2d = { width: 1, height: 9, sensor: false, category: 1, mask: 0xffffffff };
    });
    const result = await autoplayNativeGame(document, { win: true, maxTicks: 600 });
    expect(result).toMatchObject({ status: "failed", reason: "path_budget", winTick: null });
    if (result.status === "failed") {
      expect(result.message).toContain("does not prove");
    }
  });

  it("runs and replays a route longer than the former 3600-tick limit", async () => {
    const document = room((game) => {
      game.scenes[0].entities = game.scenes[0].entities.filter((entity) => !entity.id.startsWith("wall"));
      const gem = game.scenes[0].entities.find((entity) => entity.id === "gem");
      if (!gem) {
        throw new Error("Missing gem");
      }
      gem.transform2d.x = 192;
    });
    const result = await autoplayNativeGame(document, { win: true, maxTicks: 4_000 });
    expect(result.status).toBe("reached");
    expect(result.winTick).toBeGreaterThan(3_600);
    expect(result.tick).toBeLessThan(4_000);
    expect(result.route.length).toBeLessThan(5);
    expect((await replayScriptedGame(document, 1, inputs(result.route))).snapshot).toEqual(result.snapshot);
  });

  it("reaches every collider matching a target prefix", async () => {
    const document = room((game) => {
      const gem = game.scenes[0].entities.find((entity) => entity.id === "gem");
      if (!gem) {
        throw new Error("Missing gem");
      }
      game.scenes[0].entities.push({ ...structuredClone(gem), id: "gem-two", transform2d: { ...gem.transform2d, x: -2 } });
    });
    const result = await autoplayNativeGame(document, { targetPrefix: "gem" });
    expect(result.status).toBe("reached");
    expect(result.reachedTargets).toEqual(expect.arrayContaining(["gem", "gem-two"]));
    expect((await replayScriptedGame(document, 1, inputs(result.route))).snapshot).toEqual(result.snapshot);
  });

  it("uses scripted platformer controls and observes an actual victory trigger", async () => {
    const document = gameDocument.parse({
      schemaVersion: 2, engineVersion: "1", id: "jump-test", revision: "r1", entrySceneId: "main", pixelsPerUnit: 32, tickRate: 60,
      inputActions: ["left", "right", "jump"], assets: {}, scenes: [{ id: "main", name: "Main", gravity: { x: 0, y: -30 }, entities: [
        { id: "hero", transform2d: { x: 0, y: 0.9 }, body2d: { type: "kinematic" }, collider2d: { width: 0.8, height: 0.8 }, behaviors: [{ kind: "script", source:
          `({pressed, justPressed, entity, events}) => ({state: null, commands: [
            {kind: "setVelocity", x: (pressed.includes("right") ? 4 : 0) - (pressed.includes("left") ? 4 : 0), y: justPressed.includes("jump") && entity.touching.down ? 12 : entity.velocityY},
            ...(events.some(e => e.kind === "contact" && (e.entityId === "goal" || e.otherId === "goal")) ? [{kind: "emit", event: "victory"}] : [])
          ]})` }] },
        { id: "floor", transform2d: { x: 0, y: 0 }, body2d: { type: "static" }, collider2d: { width: 12, height: 1 } },
        { id: "barrier", transform2d: { x: 2, y: 1 }, body2d: { type: "static" }, collider2d: { width: 1, height: 1 } },
        { id: "goal", transform2d: { x: 4, y: 0.9 }, collider2d: { width: 0.5, height: 0.8, sensor: true }, behaviors: [{ kind: "collectible" }] }
      ] }] });
    const result = await autoplayNativeGame(document, { win: true, maxTicks: 600 });
    expect(result.status, result.status === "failed" ? result.message : "").toBe("reached");
    expect(result.winTick).not.toBeNull();
    expect(result.route.some((input) => input.justPressed.includes("jump"))).toBe(true);
    const replay = await replayScriptedGame(document, 1, inputs(result.route));
    expect(replay.snapshot).toEqual(result.snapshot);
    expect(replay.steps.some((step) => step.events.some((event) => event.kind === "trigger" && event.event === "victory"))).toBe(true);
  });

  it("returns unsupported for unknown scripted goals and missing controllable bodies", async () => {
    const noTargets = room((game) => { game.scenes[0].entities = game.scenes[0].entities.filter((entity) => entity.id !== "gem"); });
    expect(await autoplayNativeGame(noTargets)).toMatchObject({ status: "failed", reason: "unsupported" });
    const noPlayer = room((game) => { game.scenes[0].entities = game.scenes[0].entities.filter((entity) => entity.id !== "player"); });
    expect(await autoplayNativeGame(noPlayer, { maxTicks: 121 })).toMatchObject({ status: "failed", reason: "unsupported" });
    expect(await autoplayNativeGame(noTargets, { targetPrefix: "missing" })).toMatchObject({ status: "failed", reason: "target_not_found" });
  });

  it("steers toward an authored victory trigger without guessing a scripted goal", async () => {
    const document = room((game) => {
      const gem = game.scenes[0].entities.find((entity) => entity.id === "gem");
      if (!gem) {
        throw new Error("Missing gem");
      }
      gem.behaviors = [{ kind: "trigger", event: "victory" }];
    });
    const result = await autoplayNativeGame(document, { win: true });
    expect(result.status).toBe("reached");
    expect(result.winTick).toBe(result.tick);
    const replay = await replayScriptedGame(document, 1, inputs(result.route));
    expect(replay.snapshot).toEqual(result.snapshot);
    expect(replay.steps.at(-1)?.events.some((event) => event.kind === "trigger" && event.event === "victory")).toBe(true);
  });

  it("bounds route ticks and honors cancellation", async () => {
    expect(await autoplayNativeGame(createTopDownRoomGame("test"), { maxTicks: 1 })).toMatchObject({ status: "failed", reason: "tick_budget", tick: 1 });
    const controller = new AbortController();
    controller.abort();
    expect(await autoplayNativeGame(createTopDownRoomGame("test"), { signal: controller.signal })).toMatchObject({ status: "failed", reason: "cancelled", tick: 0, route: [] });
    await expect(autoplayNativeGame(createTopDownRoomGame("test"), { maxTicks: MAX_GAME_ROUTE_TICKS + 1 })).rejects.toThrow("maxTicks");
    await expect(autoplayNativeGame(createTopDownRoomGame("test"), { targetPrefix: "gem", win: true })).rejects.toThrow("not both");
  });

  it("cooperatively observes cancellation after steering starts", async () => {
    const document = room((game) => {
      game.scenes[0].entities = game.scenes[0].entities.filter((entity) => !entity.id.startsWith("wall"));
      const gem = game.scenes[0].entities.find((entity) => entity.id === "gem");
      if (!gem) {
        throw new Error("Missing gem");
      }
      gem.transform2d.x = 192;
    });
    const controller = new AbortController();
    const pending = autoplayNativeGame(document, { maxTicks: 4_000, signal: controller.signal });
    const timer = setTimeout(() => controller.abort(), 20);
    try {
      const result = await pending;
      expect(result).toMatchObject({ status: "failed", reason: "cancelled" });
      expect(result.tick).toBeGreaterThan(0);
      expect(result.tick).toBeLessThan(4_000);
    } finally {
      clearTimeout(timer);
    }
  });

  it("reports authored level stats", () => {
    expect(gameLevelStats(createTopDownRoomGame("test"))).toEqual({ scenes: 1, entities: 7, tiles: 0, solidTiles: 0, collectibles: 1, scripts: 0, prefabs: 0 });
  });

  it("steers through a document with a large indexed tilemap", async () => {
    const document = room((game) => {
      game.schemaVersion = 2;
      game.scenes[0].entities.push(gameEntity.parse({ id: "terrain", transform2d: { x: 0, y: 0 },
        tilemap: { assetId: "wall", solid: true, tiles: Array.from({ length: 4_000 }, (_, index) => ({ x: index, y: -20, width: 1, height: 1 })) } }));
    });
    const result = await autoplayNativeGame(document, { win: true, maxTicks: 120 });
    expect(result.status).toBe("reached");
    expect(result.levelStats).toMatchObject({ tiles: 4_000, solidTiles: 4_000 });
    expect((await replayScriptedGame(document, 1, inputs(result.route))).snapshot).toEqual(result.snapshot);
  });
});
