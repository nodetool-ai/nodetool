import { describe, expect, it } from "vitest";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createScriptedGameSession, validateGame } from "../src/index.js";

const IMAGE = { assetId: "builtin:dot", digest: "builtin:dot-v1", width: 8, height: 8 };

function game(entities: unknown[], extra: Partial<GameDocument> = {}): GameDocument {
  return gameDocument.parse({
    schemaVersion: 1, engineVersion: "1", id: "g", revision: "r1", entrySceneId: "main",
    pixelsPerUnit: 32, tickRate: 60, inputActions: ["fire"],
    assets: { dot: IMAGE, glow: { ...IMAGE, sampling: "linear" }, sound: { assetId: "builtin:sound", digest: "builtin:sound-v1", mediaKind: "audio", width: 1, height: 1 } },
    scenes: [{ id: "main", name: "Main", entities: [
      { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
      ...entities
    ] }],
    ...extra
  });
}

const idle = { pressed: [], justPressed: [] };

describe("script world and commands", () => {
  it("composes authored tracks, script overrides, and lifetime effects", async () => {
    const document = game([{ id: "spark", transform2d: { x: 0, y: 0 },
      sprite: { assetId: "dot", width: 1, height: 1, opacity: 1 },
      visualAnimation: { tracks: [
        { property: "rotation", from: 0, to: 2, durationTicks: 2 },
        { property: "scaleX", from: 1, to: 3, durationTicks: 2 },
        { property: "opacity", from: 1, to: 0.2, durationTicks: 2 }
      ] },
      behaviors: [{ kind: "lifetime", ticks: 2, fade: true, endScale: 2 },
        { kind: "script", source: "({ state }) => ({ state: 1, commands: [{ kind: 'setVisual', rotation: 5, scaleX: 2, opacity: 0.8 }] })" }] }
    ], { schemaVersion: 2 });
    const session = await createScriptedGameSession(document, 1);
    const sprite = session.step(idle).frame.sprites.find((item) => item.entityId === "spark");
    expect(sprite).toMatchObject({ rotation: 5, scaleX: 3, opacity: 0.4 });
    const restored = await createScriptedGameSession(document, 1, session.snapshot());
    expect(restored.frame()).toEqual(session.frame());
    session.dispose();
    restored.dispose();
  });
  it("gives scripts the positions of collider and camera entities", async () => {
    const session = await createScriptedGameSession(game([
      { id: "target", transform2d: { x: 3, y: -2 }, collider2d: { width: 1, height: 1 } },
      { id: "decor", transform2d: { x: 9, y: 9 }, sprite: { assetId: "dot", width: 1, height: 1 } },
      { id: "seeker", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source:
        "({ world }) => ({ state: world.map((item) => item.id + '@' + item.x + ',' + item.y).join(' '), commands: [] })" }] }
    ]), 1);
    session.step(idle);
    expect(session.snapshot().scriptState['["main","seeker",0]']).toBe("camera@0,0 target@3,-2");
    session.dispose();
  });

  it("spawns a prefab at a position with a velocity and moves it without a collider", async () => {
    const session = await createScriptedGameSession(game([
      { id: "spark", templateOnly: true, transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" },
        sprite: { assetId: "glow", width: 1, height: 1, blend: "additive" } },
      { id: "emitter", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source:
        "({ tick, state }) => ({ state: 1, commands: tick === 0 ? [{ kind: 'spawn', prefabId: 'spark', x: 2, y: 1, velocityX: 60, velocityY: 0 }] : [] })" }] }
    ]), 1);
    session.step(idle);
    const frame = session.step(idle).frame;
    const spark = frame.sprites.find((sprite) => sprite.entityId.startsWith("spark#"));
    expect(spark).toMatchObject({ x: 3, y: 1, blend: "additive", sampling: "linear" });
    session.dispose();
  });

  it("applies script visuals and positions, and keeps them through save and load", async () => {
    const document = game([
      { id: "ship", transform2d: { x: 0, y: 0 }, sprite: { assetId: "dot", width: 1, height: 1 }, behaviors: [{ kind: "script", source:
        "({ state }) => ({ state: 1, commands: [{ kind: 'setPosition', x: 4, y: 5 }, { kind: 'setVisual', rotation: 1.5, scaleX: 2, tint: '#ff0000', opacity: 0.5 }] })" }] }
    ]);
    const session = await createScriptedGameSession(document, 1);
    const sprite = session.step(idle).frame.sprites[0];
    expect(sprite).toMatchObject({ x: 4, y: 5, rotation: 1.5, scaleX: 2, scaleY: 1, tint: "#ff0000", opacity: 0.5 });
    const restored = await createScriptedGameSession(document, 1, session.snapshot());
    expect(restored.frame().sprites[0]).toMatchObject({ rotation: 1.5, scaleX: 2, tint: "#ff0000", opacity: 0.5 });
    session.dispose();
    restored.dispose();
  });

  it("shows script HUD labels, replaces built-in labels by id, and removes a label with empty text", async () => {
    const session = await createScriptedGameSession(game([
      { id: "gem", transform2d: { x: 50, y: 0 }, collider2d: { width: 1, height: 1 }, behaviors: [{ kind: "collectible" }] },
      { id: "hud", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source:
        "({ tick }) => ({ state: 1, commands: tick === 0 ? [{ kind: 'hud', id: 'score', text: 'Gems 0', x: 10, y: 10, size: 30, color: '#abcdef', align: 'center' }, { kind: 'hud', id: 'title', text: 'Hi', x: 1, y: 2 }] : [{ kind: 'hud', id: 'title', text: '', x: 0, y: 0 }] })" }] }
    ]), 1);
    expect(session.step(idle).frame.hud).toEqual([
      { id: "score", text: "Gems 0", x: 10, y: 10, size: 30, color: "#abcdef", align: "center" },
      { id: "title", text: "Hi", x: 1, y: 2 }
    ]);
    expect(session.step(idle).frame.hud.map((label) => label.id)).toEqual(["score"]);
    session.dispose();
  });

  it("ignores despawning an expired spawned instance but rejects unknown entities", async () => {
    const withTemplate = (target: string) => game([
      { id: "bolt", templateOnly: true, transform2d: { x: 0, y: 0 } },
      { id: "killer", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source:
        `({ state }) => ({ state: 1, commands: [{ kind: 'despawn', entityId: '${target}' }] })` }] }
    ]);
    const expired = await createScriptedGameSession(withTemplate("bolt#7"), 1);
    expect(() => expired.step(idle)).not.toThrow();
    expired.dispose();
    const unknown = await createScriptedGameSession(withTemplate("ghost"), 1);
    expect(() => unknown.step(idle)).toThrow(/missing entity ghost/);
    unknown.dispose();
  });
});

describe("built-in visual behaviors", () => {
  it("plays animator frames by entity age, looping or holding the last frame", () => {
    const frames = [0, 1, 2].map((index) => ({ x: index * 8, y: 0, width: 8, height: 8 }));
    const session = createGameSession(game([
      { id: "loop", transform2d: { x: 0, y: 0 }, sprite: { assetId: "dot", width: 1, height: 1 }, animator: { frames, ticksPerFrame: 2 } },
      { id: "once", transform2d: { x: 1, y: 0 }, sprite: { assetId: "dot", width: 1, height: 1 }, animator: { frames, ticksPerFrame: 2, loop: false } }
    ]), 1);
    const at = (ticks: number) => {
      let frame = session.frame();
      for (let tick = 0; tick < ticks; tick += 1) frame = session.step(idle).frame;
      return frame.sprites.map((sprite) => sprite.frame?.x);
    };
    expect(at(1)).toEqual([0, 0]);
    const exposed = session.frame().sprites[0].frame;
    if (!exposed) {
      throw new Error("Expected animation frame");
    }
    exposed.x = 999;
    expect(session.frame().sprites[0].frame?.x).toBe(0);
    expect(at(3)).toEqual([16, 16]);
    expect(at(4)).toEqual([8, 16]);
    session.dispose();
  });

  it("fades, scales, and despawns an entity after its lifetime", async () => {
    const session = await createScriptedGameSession(game([
      { id: "puff", templateOnly: true, transform2d: { x: 0, y: 0 }, sprite: { assetId: "dot", width: 1, height: 1 },
        behaviors: [{ kind: "lifetime", ticks: 4, endScale: 3 }] },
      { id: "emitter", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source:
        "({ tick }) => ({ state: 1, commands: tick === 0 ? [{ kind: 'spawn', prefabId: 'puff' }] : [] })" }] }
    ]), 1);
    session.step(idle);
    const middle = session.step(idle).frame.sprites.find((sprite) => sprite.entityId === "puff#1");
    expect(middle).toMatchObject({ opacity: 0.75, scaleX: 1.5 });
    for (let tick = 0; tick < 4; tick += 1) session.step(idle);
    expect(session.snapshot().entities.some((entity) => entity.id === "puff#1")).toBe(false);
    session.dispose();
  });

  it("lets only non-sensor bodies collect", () => {
    const run = (sensor: boolean) => {
      const session = createGameSession(game([
        { id: "mover", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1, sensor } },
        { id: "gem", transform2d: { x: 0.2, y: 0 }, collider2d: { width: 1, height: 1, sensor: true }, behaviors: [{ kind: "collectible" }] }
      ]), 1);
      const score = session.step(idle).frame.hud.find((label) => label.id === "score")?.text;
      session.dispose();
      return score;
    };
    expect(run(true)).toBe("Score: 0");
    expect(run(false)).toBe("Score: 1");
  });

  it("plays an audio source on a named trigger event", async () => {
    const session = await createScriptedGameSession(game([
      { id: "gun", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source:
        "({ justPressed }) => ({ state: 1, commands: justPressed.includes('fire') ? [{ kind: 'emit', event: 'shoot' }] : [] })" }] },
      { id: "sfx", transform2d: { x: 0, y: 0 }, audioSource: { assetId: "sound", onEvent: "shoot" } }
    ]), 1);
    expect(session.step(idle).events).toEqual([]);
    expect(session.step({ pressed: ["fire"], justPressed: ["fire"] }).events).toContainEqual(expect.objectContaining({
      kind: "audio", action: "start", assetId: "sound", loop: false, volume: 1,
      voiceId: "effect:main:sfx:2:1"
    }));
    session.dispose();
  });

  it("accepts a kinematic body without a collider and rejects a static one", () => {
    expect(validateGame(game([{ id: "p", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" } }])).valid).toBe(true);
    expect(validateGame(game([{ id: "w", transform2d: { x: 0, y: 0 }, body2d: { type: "static" } }])).errors)
      .toContain("Static body w needs a collider2d or solid tiles");
  });
});
