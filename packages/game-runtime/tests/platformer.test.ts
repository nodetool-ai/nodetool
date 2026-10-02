import { describe, expect, it } from "vitest";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createScriptedGameSession, validateGame } from "../src/index.js";

const idle = { pressed: [], justPressed: [] };
const image = { assetId: "tiles", digest: "d", mediaKind: "image", width: 64, height: 16 };

function game(entities: unknown[], scene: Record<string, unknown> = {}): GameDocument {
  return gameDocument.parse({
    schemaVersion: 2, engineVersion: "1", id: "platformer", revision: "r1", entrySceneId: "main",
    pixelsPerUnit: 32, tickRate: 60, inputActions: ["left", "right", "jump"], assets: { tiles: image },
    scenes: [{ id: "main", name: "Main", gravity: { x: 0, y: -30 }, entities, ...scene }]
  });
}

/** A row of unit tiles centered on y, from x = first to x = last. */
function row(first: number, last: number, y: number, extra: Record<string, unknown> = {}): unknown[] {
  return Array.from({ length: last - first + 1 }, (_, index) => ({ x: first + index, y, width: 1, height: 1, ...extra }));
}

function ground(tiles: unknown[]): unknown {
  return { id: "ground", transform2d: { x: 0, y: 0 }, tilemap: { assetId: "tiles", tiles, solid: true } };
}

function body(id: string, x: number, y: number, extra: Record<string, unknown> = {}): unknown {
  return { id, transform2d: { x, y }, body2d: { type: "kinematic" }, collider2d: { width: 0.8, height: 0.8 }, ...extra };
}

function run(session: ReturnType<typeof createGameSession>, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) session.step(idle);
}

function entity(session: ReturnType<typeof createGameSession>, id: string) {
  const found = session.inspect({ entityId: id }).entities[0];
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

describe("platformer physics", () => {
  it.each([
    { axis: "x", direction: 1 }, { axis: "x", direction: -1 },
    { axis: "y", direction: 1 }, { axis: "y", direction: -1 }
  ] as const)("pushes monotonically through moving tiles regardless of order ($axis, $direction)", ({ axis, direction }) => {
    for (const reverse of [false, true]) {
      const positions = reverse ? [-2, 0] : [0, -2];
      const session = createGameSession(game([
        { id: "platform", transform2d: { x: axis === "x" ? -2 * direction : 0, y: axis === "y" ? -2 * direction : 0 },
          body2d: { type: "static", velocity: { x: axis === "x" ? 360 * direction : 0, y: axis === "y" ? 360 * direction : 0 } },
          tilemap: { assetId: "tiles", solid: true, tiles: positions.map((position) => ({
            x: axis === "x" ? position * direction : 0, y: axis === "y" ? position * direction : 0, width: 1, height: 1
          })) } },
        body("hero", 0, 0, { collider2d: { width: 1, height: 1 } })
      ], { gravity: { x: 0, y: 0 } }), 0);
      session.step(idle);
      expect(entity(session, "hero")[axis]).toBe(5 * direction);
      session.dispose();
    }
  });

  it("drops a body onto solid tiles, where it rests without building fall speed", () => {
    const session = createGameSession(game([ground(row(-3, 3, 0)), body("hero", 0, 3)]), 0);
    run(session, 120);
    const hero = entity(session, "hero");
    expect(hero.y).toBeCloseTo(0.9, 6);
    expect(hero.velocityY).toBe(0);
    session.dispose();
  });

  it("slides along a row of tiles without catching on the seams", () => {
    // A landing can leave the body a rounding error inside the floor, which exposes each tile's side face.
    const session = createGameSession(game([
      ground(row(-2, 40, 0)),
      body("hero", 0, 0.9 - 1e-9, { body2d: { type: "kinematic", velocity: { x: 6, y: 0 } } })
    ]), 0);
    run(session, 120);
    const hero = entity(session, "hero");
    expect(hero.x).toBeCloseTo(12, 6);
    expect(hero.velocityX).toBe(6);
    session.dispose();
  });

  it("stops at a tile wall and zeroes the velocity into it", () => {
    const session = createGameSession(game([
      ground([...row(-2, 10, 0), { x: 5, y: 1, width: 1, height: 1 }, { x: 5, y: 2, width: 1, height: 1 }]),
      body("hero", 0, 0.9, { body2d: { type: "kinematic", velocity: { x: 6, y: 0 } } })
    ]), 0);
    run(session, 60);
    const hero = entity(session, "hero");
    expect(hero.x).toBeCloseTo(4.1, 6);
    expect(hero.velocityX).toBe(0);
    session.dispose();
  });

  it("lands on a one-way tile from above and passes through it from below", () => {
    const falling = createGameSession(game([
      { id: "ledge", transform2d: { x: 0, y: 0 }, tilemap: { assetId: "tiles", tiles: row(-2, 2, 2, { oneWay: true }), solid: true } },
      body("hero", 0, 4)
    ]), 0);
    run(falling, 90);
    expect(entity(falling, "hero").y).toBeCloseTo(2.9, 6);
    falling.dispose();

    const rising = createGameSession(game([
      { id: "ledge", transform2d: { x: 0, y: 0 }, tilemap: { assetId: "tiles", tiles: row(-2, 2, 2, { oneWay: true }), solid: true } },
      body("hero", 0, 0, { body2d: { type: "kinematic", velocity: { x: 0, y: 14 } } })
    ]), 0);
    let peak = -Infinity;
    for (let tick = 0; tick < 150; tick += 1) {
      rising.step(idle);
      peak = Math.max(peak, entity(rising, "hero").y);
    }
    expect(peak).toBeGreaterThan(2.9);
    expect(entity(rising, "hero").y).toBeCloseTo(2.9, 6);
    rising.dispose();
  });

  it("carries a body standing on a patrolling platform", () => {
    const session = createGameSession(game([
      { id: "lift", transform2d: { x: 0, y: 0 }, body2d: { type: "static" }, collider2d: { width: 3, height: 0.5 },
        behaviors: [{ kind: "patrol", axis: "x", speed: 3, distance: 10 }] },
      body("hero", 0, 0.65)
    ]), 0);
    run(session, 60);
    const lift = entity(session, "lift");
    const hero = entity(session, "hero");
    expect(lift.x).toBeCloseTo(3, 6);
    expect(hero.x).toBeCloseTo(3, 6);
    expect(hero.y).toBeCloseTo(0.65, 6);
    session.dispose();
  });

  it("lifts a rider on a rising platform and keeps it on a sinking one", () => {
    const session = createGameSession(game([
      { id: "lift", transform2d: { x: 0, y: 0 }, body2d: { type: "static" }, collider2d: { width: 3, height: 0.5 },
        behaviors: [{ kind: "patrol", axis: "y", speed: 2, distance: 2 }] },
      body("hero", 0, 0.65)
    ]), 0);
    for (let tick = 0; tick < 240; tick += 1) {
      session.step(idle);
      const lift = entity(session, "lift");
      expect(entity(session, "hero").y - lift.y).toBeCloseTo(0.65, 3);
    }
    session.dispose();
  });

  it("turns a walker at ledges and walls", () => {
    const session = createGameSession(game([
      ground([...row(-3, 3, 0), { x: -3, y: 1, width: 1, height: 1 }]),
      body("walker", 0, 0.9, { behaviors: [{ kind: "patrol", axis: "x", speed: 2, distance: 50, turnAtLedges: true }] })
    ]), 0);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let tick = 0; tick < 600; tick += 1) {
      session.step(idle);
      const walker = entity(session, "walker");
      minX = Math.min(minX, walker.x);
      maxX = Math.max(maxX, walker.x);
      expect(walker.y).toBeCloseTo(0.9, 6);
    }
    expect(maxX).toBeLessThanOrEqual(3.5);
    expect(maxX).toBeGreaterThan(3);
    expect(minX).toBeCloseTo(-2.1, 1);
    session.dispose();
  });

  it("turns a walker whose patrol limit meets a wall", () => {
    const session = createGameSession(game([
      ground([...row(-4, 6, 0), { x: 3, y: 1, width: 1, height: 1 }]),
      body("walker", 0, 0.9, { collider2d: { width: 1, height: 0.8 }, behaviors: [{ kind: "patrol", axis: "x", speed: 2, distance: 2 }] })
    ]), 0);
    run(session, 240);
    const walker = entity(session, "walker");
    expect(walker.velocityX).not.toBe(0);
    expect(walker.x).toBeLessThan(1.9);
    session.dispose();
  });

  it("reports touching sides to scripts and plays animation clips with a flip", async () => {
    const frames = [{ x: 0, y: 0, width: 16, height: 16 }];
    const session = await createScriptedGameSession(game([
      ground([...row(-3, 3, 0), { x: 1, y: 1, width: 1, height: 1 }]),
      body("hero", 0.1, 0.9, {
        sprite: { assetId: "tiles", width: 1, height: 1 },
        animator: { frames, ticksPerFrame: 4, clips: { run: { frames: [{ x: 16, y: 0, width: 16, height: 16 }, { x: 32, y: 0, width: 16, height: 16 }], ticksPerFrame: 2 } } },
        behaviors: [{ kind: "script", maxTickMs: 30, source: `({ entity, state }) => ({
          state: entity.touching,
          commands: [{ kind: "playAnimation", clip: "run" }, { kind: "setVisual", flipX: true }]
        })` }]
      })
    ]), 0);
    session.step(idle);
    const second = session.step(idle);
    expect(session.snapshot().scriptState[JSON.stringify(["main", "hero", 0])]).toEqual({ down: true, up: false, left: false, right: true });
    const sprite = second.frame.sprites.find((item) => item.entityId === "hero");
    expect(sprite?.flipX).toBe(true);
    expect(sprite?.frame?.x).toBe(16);
    const third = session.step(idle).frame.sprites.find((item) => item.entityId === "hero");
    const fourth = session.step(idle).frame.sprites.find((item) => item.entityId === "hero");
    expect([third?.frame?.x, fourth?.frame?.x]).toEqual([32, 32]);

    const restored = await createScriptedGameSession(game([
      ground([...row(-3, 3, 0), { x: 1, y: 1, width: 1, height: 1 }]),
      body("hero", 0.1, 0.9, {
        sprite: { assetId: "tiles", width: 1, height: 1 },
        animator: { frames, ticksPerFrame: 4, clips: { run: { frames: [{ x: 16, y: 0, width: 16, height: 16 }, { x: 32, y: 0, width: 16, height: 16 }], ticksPerFrame: 2 } } },
        behaviors: [{ kind: "script", maxTickMs: 30, source: `({ state }) => ({ state, commands: [] })` }]
      })
    ]), 0, session.snapshot());
    expect(restored.frame().sprites.find((item) => item.entityId === "hero")).toMatchObject({ flipX: true, frame: { x: 32 } });
    restored.dispose();
    session.dispose();
  });

  it("turns a faceMotion sprite toward its horizontal velocity", () => {
    const session = createGameSession(game([
      ground(row(-6, 6, 0)),
      body("walker", 0, 0.9, { sprite: { assetId: "tiles", width: 1, height: 1, faceMotion: "left" },
        behaviors: [{ kind: "patrol", axis: "x", speed: 2, distance: 1 }] })
    ]), 0);
    const flips: boolean[] = [];
    for (let tick = 0; tick < 70; tick += 1) {
      flips.push(session.step(idle).frame.sprites.find((item) => item.entityId === "walker")?.flipX === true);
    }
    // Moving right first, the left-facing art is mirrored; after the turn it is not.
    expect(flips[0]).toBe(true);
    expect(flips.at(-1)).toBe(false);
    session.dispose();
  });

  it("rejects a clip the animator does not define", async () => {
    const session = await createScriptedGameSession(game([
      body("hero", 0, 3, {
        sprite: { assetId: "tiles", width: 1, height: 1 },
        animator: { frames: [{ x: 0, y: 0, width: 16, height: 16 }], ticksPerFrame: 4 },
        behaviors: [{ kind: "script", maxTickMs: 30, source: `() => ({ state: null, commands: [{ kind: "playAnimation", clip: "fly" }] })` }]
      })
    ]), 0);
    expect(() => session.step(idle)).toThrow("missing animation clip fly");
    session.dispose();
  });

  it("adds nearby entity lights to the scene lighting and culls far tiles", () => {
    const lighting = { ambient: { color: "#101020", intensity: 0.3 }, points: [{ x: 0, y: 0, color: "#ffffff", intensity: 1, radius: 2, falloff: 1 }] };
    const session = createGameSession(game([
      { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
      ground(row(-200, 200, -4)),
      { id: "torch", transform2d: { x: 3, y: 1 }, light2d: { color: "#ffaa55", intensity: 2, radius: 3, offset: { x: 0, y: 0.5 } } },
      { id: "farTorch", transform2d: { x: 90, y: 1 }, light2d: { color: "#ffaa55", intensity: 2, radius: 3 } }
    ], { lighting }), 0);
    const frame = session.step(idle).frame;
    expect(frame.lighting?.points).toEqual([
      lighting.points[0],
      { x: 3, y: 1.5, color: "#ffaa55", intensity: 2, radius: 3, falloff: 1 }
    ]);
    expect(frame.tiles.length).toBeGreaterThan(16);
    expect(frame.tiles.length).toBeLessThan(40);
    session.dispose();
  });

  it("gates the platformer fields behind schema version 2", () => {
    const result = validateGame({
      ...game([body("hero", 0, 0, { collider2d: { width: 1, height: 1, oneWay: true } })]),
      schemaVersion: 1
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("scenes.0.gravity: requires schema version 2");
    expect(result.errors.join("\n")).toContain("collider2d.oneWay: requires schema version 2");
  });
});
