import { describe, expect, it } from "vitest";
import { gameDocument, type GameDocument, type GameEvent, type GameInputFrame } from "@nodetool-ai/protocol";
import { ADVENTURE_SCENE_ID, bindAdventureArt, createAdventureGame } from "../src/adventure.js";
import { createScriptedGameSession, type GameSession } from "../src/session.js";
import { validateGame } from "../src/validate.js";

const ID = "a".repeat(32);

/** Walkable tiles of the level, keyed by their world centre. */
function walkable(document: GameDocument): { open: Set<string>; hazards: Set<string> } {
  const entities = document.scenes[0]!.entities;
  const open = new Set(entities.find((entity) => entity.id === "floor")!.tilemap!.tiles.map((tile) => `${tile.x},${tile.y}`));
  const hazards = new Set(entities.filter((entity) => entity.id.startsWith("hazard"))
    .map((entity) => `${entity.transform2d.x},${entity.transform2d.y}`));
  return { open, hazards };
}

/** The next tile centre on a shortest path from `from` to `to`, avoiding hazards. */
function nextStep(level: { open: Set<string>; hazards: Set<string> }, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } | null {
  const [ox, oy] = [...level.open][0]!.split(",").map((value) => Number(value) - Math.floor(Number(value)));
  const snap = (value: number, offset: number) => Math.round(value - offset) + offset;
  const start = `${snap(from.x, ox!)},${snap(from.y, oy!)}`;
  const goal = `${snap(to.x, ox!)},${snap(to.y, oy!)}`;
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === goal) {
      let step = current;
      while (previous.get(step) !== start && previous.get(step) !== null) {
        step = previous.get(step)!;
      }
      const [x, y] = step.split(",").map(Number);
      return { x: x!, y: y! };
    }
    const [x, y] = current.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${x! + dx},${y! + dy}`;
      if (level.open.has(key) && (!level.hazards.has(key) || key === goal) && !previous.has(key)) {
        previous.set(key, current);
        queue.push(key);
      }
    }
  }
  return null;
}

/** Walk to every gem and then the exit, the way a careful player would. */
async function playThrough(document: GameDocument, maxTicks: number): Promise<{ won: boolean; events: GameEvent[]; ticks: number }> {
  const events: GameEvent[] = [];
  const session: GameSession = await createScriptedGameSession(document, 1, undefined, (event) => events.push(event));
  const level = walkable(document);
  try {
    for (let tick = 0; tick < maxTicks; tick += 1) {
      const snapshot = session.snapshot();
      if (snapshot.won) {
        return { won: true, events, ticks: tick };
      }
      const player = snapshot.entities.find((entity) => entity.id === "player")!;
      const gems = snapshot.entities.filter((entity) => entity.id.startsWith("gem") && entity.active);
      const target = gems.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0]
        ?? snapshot.entities.find((entity) => entity.id === "exit")!;
      const step = nextStep(level, player, target) ?? target;
      const pressed: string[] = [];
      if (step.x - player.x > 0.08) pressed.push("right");
      if (step.x - player.x < -0.08) pressed.push("left");
      if (step.y - player.y > 0.08) pressed.push("up");
      if (step.y - player.y < -0.08) pressed.push("down");
      const input: GameInputFrame = { pressed, justPressed: [] };
      session.step(input);
    }
    return { won: session.snapshot().won, events, ticks: maxTicks };
  } finally {
    session.dispose();
  }
}

describe("createAdventureGame", () => {
  for (const size of ["small", "medium", "large"] as const) {
    for (const difficulty of ["relaxed", "normal", "hard"] as const) {
      it(`builds a valid ${size} ${difficulty} level`, () => {
        const document = createAdventureGame(ID, { title: "Test", size, difficulty });
        const result = validateGame(document);
        expect(result.errors).toEqual([]);
        const entities = document.scenes[0]!.entities;
        expect(entities.filter((entity) => entity.id.startsWith("gem")).length).toBeGreaterThanOrEqual(5);
        expect(entities.filter((entity) => entity.id.startsWith("enemy")).length).toBeGreaterThan(0);
        expect(entities.some((entity) => entity.id === "exit")).toBe(true);
      });
    }
  }

  it("builds the same level from the same title", () => {
    expect(createAdventureGame(ID, { title: "Cellar" })).toEqual(createAdventureGame(ID, { title: "Cellar" }));
    expect(createAdventureGame(ID, { title: "Cellar" })).not.toEqual(createAdventureGame(ID, { title: "Attic" }));
  });

  it("can be won by collecting every gem and reaching the exit", async () => {
    const document = createAdventureGame(ID, { title: "Winnable", size: "small", difficulty: "relaxed" });
    const result = await playThrough(document, 6000);
    expect(result.won).toBe(true);
    const gems = document.scenes[0]!.entities.filter((entity) => entity.id.startsWith("gem")).length;
    expect(result.events.filter((event) => event.kind === "trigger" && event.event === "gem")).toHaveLength(gems);
    expect(result.events.some((event) => event.kind === "trigger" && event.event === "unlock")).toBe(true);
  }, 120_000);

  for (const size of ["medium", "large"] as const) {
    it(`places every gem and the exit within reach on a ${size} level`, async () => {
      // A player who cannot be hurt walks the whole route, so a failure here is the layout's.
      const base = createAdventureGame(ID, { title: `Reachable ${size}`, size, difficulty: "hard" });
      const document = gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) =>
        entity.id === "player"
          ? { ...entity, behaviors: entity.behaviors.map((behavior) => behavior.kind === "script" ? { ...behavior, values: { health: 20 } } : behavior) }
          : entity.id.startsWith("enemy") ? { ...entity, behaviors: entity.behaviors.map((behavior) => behavior.kind === "script" ? { ...behavior, values: { speed: 0.5, sight: 1 } } : behavior) }
            : entity) })) });
      expect((await playThrough(document, 9000)).won).toBe(true);
    }, 180_000);
  }

  it("shows only its own HUD tree, even on the first frame", async () => {
    const session = await createScriptedGameSession(createAdventureGame(ID, { title: "Hud" }), 1);
    try {
      expect(session.frame().hud).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  it("hurts the player on an enemy and restarts the level when health runs out", async () => {
    const base = createAdventureGame(ID, { title: "Losable", size: "small", difficulty: "hard" });
    // Park a chaser next to the start, so standing still loses.
    const scene = base.scenes[0]!;
    const player = scene.entities.find((entity) => entity.id === "player")!;
    const document = gameDocument.parse({ ...base, scenes: [{ ...scene, entities: scene.entities.map((entity) => entity.id === "enemy0"
      ? { ...entity, transform2d: { ...entity.transform2d, x: player.transform2d.x + 1.5, y: player.transform2d.y },
          props: { ...entity.props, homeX: player.transform2d.x + 1.5, homeY: player.transform2d.y },
          behaviors: entity.behaviors.map((behavior) => behavior.kind === "script" ? { ...behavior, values: { mode: "chase" } } : behavior) }
      : entity) }] });
    const events: GameEvent[] = [];
    const session = await createScriptedGameSession(document, 1, undefined, (event) => events.push(event));
    try {
      for (let tick = 0; tick < 900; tick += 1) {
        session.step({ pressed: [], justPressed: [] });
      }
    } finally {
      session.dispose();
    }
    expect(events.filter((event) => event.kind === "trigger" && event.event === "hurt").length).toBeGreaterThanOrEqual(3);
    expect(events.some((event) => event.kind === "trigger" && event.event === "lose")).toBe(true);
    expect(events.some((event) => event.kind === "sceneTransition" && event.sceneId === ADVENTURE_SCENE_ID)).toBe(true);
  }, 60_000);
});

describe("bindAdventureArt", () => {
  it("points sprites and wall tiles at generated frames and adds generated music", () => {
    const base = createAdventureGame(ID, { title: "Art" });
    const binding = (width: number, height: number) => ({ assetId: "b".repeat(32), digest: "c".repeat(64), width, height });
    const assets: GameDocument["assets"] = { ...base.assets, player: binding(400, 200) };
    for (let index = 0; index < 8; index += 1) {
      assets[`player.frame.${index}`] = { ...binding(400, 200), frame: { x: (index % 4) * 100, y: Math.floor(index / 4) * 100, width: 100, height: 100 } };
    }
    assets["wall"] = binding(128, 128);
    for (let mask = 0; mask < 16; mask += 1) {
      assets[`wall.tile.${mask}`] = { ...binding(128, 128), frame: { x: (mask % 4) * 32, y: Math.floor(mask / 4) * 32, width: 32, height: 32 } };
    }
    assets["music.level"] = { ...binding(1, 1), mediaKind: "audio" };
    const bound = bindAdventureArt({ ...base, assets });
    const player = bound.scenes[0]!.entities.find((entity) => entity.id === "player")!;
    expect(player.sprite!.frame).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    // Frame 0 is idle and frames 1-4 walk, filled row-major as the sheet prompt asks.
    expect(player.animator!.clips!["walk"]!.frames.map((frame) => [frame.x, frame.y])).toEqual([[100, 0], [200, 0], [300, 0], [0, 100]]);
    const walls = bound.scenes[0]!.entities.find((entity) => entity.id === "walls")!;
    expect(walls.tilemap!.tiles.every((tile) => tile.frame !== undefined)).toBe(true);
    expect(new Set(walls.tilemap!.tiles.map((tile) => JSON.stringify(tile.frame))).size).toBeGreaterThan(1);
    expect(bound.scenes[0]!.music?.assetId).toBe("music.level");
    // A placeholder enemy keeps its nominal frames.
    const enemy = bound.scenes[0]!.entities.find((entity) => entity.id === "enemy0")!;
    expect(enemy.animator).toEqual(base.scenes[0]!.entities.find((entity) => entity.id === "enemy0")!.animator);
    expect(validateGame(bound).errors).toEqual([]);
  });
});
