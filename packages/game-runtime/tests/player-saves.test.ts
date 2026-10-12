import { describe, expect, it } from "vitest";
import {
  gameDocument,
  gameEntity3D,
  gameInputFrame,
  gameInputFrame3D,
  gameSaveData,
  gameSnapshot,
  MAX_GAME_SAVE_DATA_BYTES,
  MAX_GAME_SAVE_KEYS,
  MAX_GAME_SAVE_LOADS_PER_FRAME,
  MAX_GAME_SAVE_SLOTS,
  MAX_GAME_SAVE_SNAPSHOT_BYTES,
  type GameDocument,
  type GameDocument3D,
  type GameInputFrame,
  type GameInputFrame3D
} from "@nodetool-ai/protocol";

import { openGameSession } from "../src/open-session.js";
import { createMemoryGameSaveStorage, GamePlayerSaves, MAX_GAME_SAVE_QUEUE, type GameSaveStorage } from "../src/player-saves.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { createScriptedGameSession, type GameSession } from "../src/session.js";
import { blockout } from "./fixtures-game3d.js";

const idle: GameInputFrame = { pressed: [], justPressed: [] };

/**
 * Loads progress slot main at tick 70 and keeps the loaded best score in its state, emitting it as an event.
 * At tick 90 it writes a progress save with a snapshot and a settings save under the same slot name.
 */
const SAVER = `(input) => {
  const state = input.state ?? { best: null };
  const commands = [];
  for (const result of input.loaded ?? []) {
    if (result.scope === "progress" && result.slot === "main") {
      state.best = result.data === null ? -1 : result.data.best;
      commands.push({ kind: "emit", event: "loaded", payload: { best: state.best, tick: input.tick } });
    }
  }
  if (input.tick === 70) { commands.push({ kind: "load", slot: "main" }); }
  if (input.tick === 90) {
    commands.push({ kind: "save", slot: "main", data: { best: state.best + 1 }, snapshot: true },
      { kind: "save", slot: "main", scope: "settings", data: { volume: 0.5 } });
  }
  return { state, commands };
}`;

function game2D(source: string, maxCommands = 8): GameDocument {
  const base = createTopDownRoomGame("f".repeat(32));
  return gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities,
    { id: "saver", transform2d: { x: -5, y: 2 }, behaviors: [{ kind: "script", source, maxCommands, maxTickMs: 50 }] }
  ] })) });
}

function game3D(source: string): GameDocument3D {
  const document = blockout();
  document.scenes[0].entities.push(gameEntity3D.parse({ id: "saver", transform3d: { position: { x: 4, y: 1, z: 0 } },
    behaviors: [{ kind: "script", maxTickMs: 50, maxCommands: 8, source }] }));
  return document;
}

async function open3D(document: GameDocument3D, snapshot?: Parameters<typeof openGameSession>[1]["snapshot"]) {
  const result = await openGameSession(document, { seed: 1, snapshot });
  if (!result.ok) { throw new Error(JSON.stringify(result.diagnostics)); }
  if (result.opened.dimension !== "3d") { throw new Error("Expected a 3D session"); }
  return result.opened.session;
}

interface Steppable<Frame> {
  step(input: Frame): { readonly tick: number; readonly events: readonly unknown[]; readonly saveRequests?: Parameters<GamePlayerSaves["handle"]>[0] };
  snapshot(): unknown;
}

/** The host loop: attach finished loads, step, then hand the step's requests to storage outside the tick. */
async function play<Frame extends { readonly loaded?: GameInputFrame["loaded"] }>(session: Steppable<Frame>, saves: GamePlayerSaves, empty: Frame, ticks: number) {
  const frames: Frame[] = [];
  const steps: { events: readonly unknown[]; snapshot: unknown }[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const frame = saves.withLoaded(empty);
    frames.push(frame);
    const result = session.step(frame);
    saves.handle(result.saveRequests, () => session.snapshot());
    await saves.idle();
    steps.push({ events: result.events, snapshot: session.snapshot() });
  }
  return { frames, steps };
}

async function seeded(): Promise<{ storage: ReturnType<typeof createMemoryGameSaveStorage>; saves: GamePlayerSaves }> {
  const storage = createMemoryGameSaveStorage();
  const saves = new GamePlayerSaves(storage);
  await saves.save("progress", "main", { best: 30 });
  return { storage, saves };
}

describe("save data bounds", () => {
  it("accepts a JSON object within the limits and rejects everything else", () => {
    expect(gameSaveData.parse({ level: 3, flags: [true, null], nested: { name: "a" } })).toEqual({ level: 3, flags: [true, null], nested: { name: "a" } });
    expect(gameSaveData.safeParse([1, 2]).success).toBe(false);
    expect(gameSaveData.safeParse("text").success).toBe(false);
    expect(gameSaveData.safeParse(null).success).toBe(false);
    expect(gameSaveData.safeParse({ when: new Date(0) }).success).toBe(false);
    expect(gameSaveData.safeParse({ run: () => 1 }).success).toBe(false);
    expect(gameSaveData.safeParse({ value: Number.NaN }).success).toBe(false);
    expect(gameSaveData.safeParse(JSON.parse("{\"__proto__\": {\"x\": 1}}")).success).toBe(false);
  });

  it("limits serialized bytes, key count at every depth and nesting depth", () => {
    const text = "x".repeat(MAX_GAME_SAVE_DATA_BYTES);
    expect(gameSaveData.safeParse({ text: text.slice(0, MAX_GAME_SAVE_DATA_BYTES - 20) }).success).toBe(true);
    expect(gameSaveData.safeParse({ text }).error?.issues[0]?.message).toMatch(/exceeds 16384 bytes/);
    const keys = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`k${index}`, 1]));
    expect(gameSaveData.safeParse({ ...keys(MAX_GAME_SAVE_KEYS - 1), inner: {} }).success).toBe(true);
    expect(gameSaveData.safeParse({ ...keys(MAX_GAME_SAVE_KEYS - 1), inner: { one: 1 } }).error?.issues[0]?.message).toMatch(/exceeds 256 keys \(257\)/);
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let depth = 1; depth < 16; depth += 1) { const next = {}; deep.d = next; deep = next; }
    expect(gameSaveData.safeParse(root).success).toBe(true);
    deep.d = { tooDeep: true };
    expect(gameSaveData.safeParse(root).error?.issues[0]?.message).toMatch(/depth 16/);
  });

  it("bounds slots per scope and the stored snapshot, and rejects bad slot names", async () => {
    const saves = new GamePlayerSaves(createMemoryGameSaveStorage());
    for (let index = 0; index < MAX_GAME_SAVE_SLOTS; index += 1) { await saves.save("progress", `slot-${index}`, { index }); }
    await expect(saves.save("progress", "one-more", {})).rejects.toThrow(/limited to 16 slots/);
    await saves.save("progress", "slot-0", { index: 99 });
    await saves.save("settings", "one-more", {});
    await expect(saves.save("progress", "has space", {})).rejects.toThrow(/Save slot must be/);
    await expect(saves.save("progress", "slot-1", {}, { blob: "x".repeat(MAX_GAME_SAVE_SNAPSHOT_BYTES) })).rejects.toThrow(/snapshot exceeds 4194304 bytes/);
    expect((await saves.load("progress", "slot-0"))?.data).toEqual({ index: 99 });
  });

  it("carries at most two loads on one input frame and keeps the rest for the next frame", async () => {
    expect(gameInputFrame.safeParse({ pressed: [], loaded: [1, 2, 3].map((n) => ({ scope: "progress", slot: `s${n}`, data: null })) }).success).toBe(false);
    expect(gameInputFrame3D.safeParse({ pressed: [], loaded: [{ scope: "progress", slot: "a", data: { big: "x".repeat(MAX_GAME_SAVE_DATA_BYTES) } }] }).success).toBe(false);
    const saves = new GamePlayerSaves(createMemoryGameSaveStorage());
    saves.handle(["a", "b", "c"].map((slot) => ({ kind: "load", tick: 0, entityId: "e", scope: "progress", slot })), () => null);
    await saves.idle();
    expect(saves.withLoaded(idle).loaded?.map((entry) => entry.slot)).toEqual(["a", "b"]);
    expect(saves.withLoaded(idle).loaded).toEqual([{ scope: "progress", slot: "c", data: null }]);
    expect(saves.withLoaded(idle)).toBe(idle);
    expect(MAX_GAME_SAVE_LOADS_PER_FRAME).toBe(2);
  });

  it("answers a load of invalid stored data with null and reports the error", async () => {
    const storage = createMemoryGameSaveStorage();
    const broken: GameSaveStorage = { ...storage, read: async () => ({ version: 1, data: { nested: "x".repeat(MAX_GAME_SAVE_DATA_BYTES) } }) };
    const errors: string[] = [];
    const saves = new GamePlayerSaves(broken, { onError: (error) => errors.push(error.message) });
    saves.handle([{ kind: "load", tick: 4, entityId: "e", scope: "progress", slot: "main" }], () => null);
    await saves.idle();
    expect(saves.withLoaded(idle).loaded).toEqual([{ scope: "progress", slot: "main", data: null }]);
    expect(errors).toEqual(["Stored progress save main has invalid data"]);
  });
});

describe("save queue", () => {
  /** Memory storage whose writes wait for `release`, so operations stay queued. */
  function heldStorage(): { storage: GameSaveStorage; release(): void; entries: ReturnType<typeof createMemoryGameSaveStorage>["entries"] } {
    const memory = createMemoryGameSaveStorage();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    return { storage: { ...memory, write: async (scope, slot, record) => { await held; await memory.write(scope, slot, record); } }, release: () => release(), entries: memory.entries };
  }

  it("rejects operations past the queue limit and answers a rejected load with null", async () => {
    const { storage, release } = heldStorage();
    const errors: string[] = [];
    const saves = new GamePlayerSaves(storage, { onError: (error) => errors.push(error.message) });
    const queued = Array.from({ length: MAX_GAME_SAVE_QUEUE }, (_, index) => saves.save("progress", `slot-${index}`, { index }));
    await expect(saves.save("progress", "late", {})).rejects.toThrow(`Game save queue is full (${MAX_GAME_SAVE_QUEUE} pending)`);
    await expect(saves.load("progress", "slot-0")).rejects.toThrow(/queue is full/);
    saves.handle([{ kind: "load", tick: 3, entityId: "e", scope: "progress", slot: "slot-0" }], () => null);
    release();
    await Promise.all(queued);
    await saves.idle();
    expect(errors).toEqual([`Game save queue is full (${MAX_GAME_SAVE_QUEUE} pending)`]);
    expect(saves.withLoaded(idle).loaded).toEqual([{ scope: "progress", slot: "slot-0", data: null }]);
    expect(await saves.slots("progress")).toHaveLength(MAX_GAME_SAVE_QUEUE);
    expect(MAX_GAME_SAVE_QUEUE).toBe(8);
  });

  it("keeps at most one snapshot save pending and takes no snapshot for a rejected one", async () => {
    const { storage, release, entries } = heldStorage();
    const errors: string[] = [];
    const saves = new GamePlayerSaves(storage, { onError: (error) => errors.push(error.message) });
    let taken = 0;
    const snapshot = (): unknown => ({ taken: ++taken });
    const save = (slot: string, withSnapshot: boolean) => ({ kind: "save" as const, tick: 1, entityId: "e", scope: "progress" as const, slot, data: {}, snapshot: withSnapshot });
    saves.handle([save("a", true), save("b", true), save("c", false)], snapshot);
    release();
    await saves.idle();
    expect(taken).toBe(1);
    expect(errors).toEqual(["A snapshot save is already pending"]);
    expect(entries().progress).toEqual({ a: { version: 1, data: {}, snapshot: { taken: 1 } }, c: { version: 1, data: {} } });
    saves.handle([save("b", true)], snapshot);
    await saves.idle();
    expect(entries().progress.b).toEqual({ version: 1, data: {}, snapshot: { taken: 2 } });
  });

  it("checks the slot limit inside the queue, so concurrent saves cannot exceed it", async () => {
    const storage = createMemoryGameSaveStorage();
    const saves = new GamePlayerSaves(storage);
    for (let index = 0; index < MAX_GAME_SAVE_SLOTS - 1; index += 1) { await saves.save("progress", `slot-${index}`, {}); }
    const results = await Promise.allSettled(["x", "y", "z"].map((slot) => saves.save("progress", slot, {})));
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "rejected"]);
    saves.handle([{ kind: "save", tick: 2, entityId: "e", scope: "progress", slot: "w", data: {}, snapshot: false }], () => null);
    await saves.idle();
    expect(await saves.slots("progress")).toHaveLength(MAX_GAME_SAVE_SLOTS);
  });

  it("stores no snapshot and takes none when the host turns snapshots off", async () => {
    const storage = createMemoryGameSaveStorage();
    const saves = new GamePlayerSaves(storage, { storeSnapshots: false });
    let taken = 0;
    saves.handle([{ kind: "save", tick: 2, entityId: "e", scope: "progress", slot: "main", data: { room: 3 }, snapshot: true }], () => ({ taken: ++taken }));
    await saves.idle();
    expect(taken).toBe(0);
    expect(storage.entries().progress).toEqual({ main: { version: 1, data: { room: 3 } } });
  });

  it("leaves a frame that already carries loaded unchanged and keeps pending loads for the next frame", async () => {
    const saves = new GamePlayerSaves(createMemoryGameSaveStorage());
    saves.handle([{ kind: "load", tick: 5, entityId: "e", scope: "settings", slot: "main" }], () => null);
    await saves.idle();
    const recorded: GameInputFrame = { ...idle, loaded: [{ scope: "progress", slot: "old", data: { best: 1 } }] };
    expect(saves.withLoaded(recorded)).toBe(recorded);
    const empty: GameInputFrame = { ...idle, loaded: [] };
    expect(saves.withLoaded(empty)).toBe(empty);
    expect(saves.withLoaded(idle).loaded).toEqual([{ scope: "settings", slot: "main", data: null }]);
  });
});

describe("2D save and load commands", () => {
  it("returns requests on the step result without counting them against maxCommands or storing them in the snapshot", async () => {
    const source = `() => ({ state: null, commands: [{ kind: "setVelocity", x: 1, y: 0 }, { kind: "save", slot: "main", data: { secret: "s3" } }, { kind: "load", slot: "other", scope: "settings" }] })`;
    const session = await createScriptedGameSession(game2D(source, 1), 1);
    try {
      const result = session.step(idle);
      expect(result.saveRequests).toEqual([
        { kind: "save", tick: 0, entityId: "saver", scope: "progress", slot: "main", data: { secret: "s3" }, snapshot: false },
        { kind: "load", tick: 0, entityId: "saver", scope: "settings", slot: "other" }
      ]);
      expect(result.scriptStats?.commands).toBe(1);
      expect(JSON.stringify(session.snapshot())).not.toContain("s3");
    } finally { session.dispose(); }
  });

  it("omits saveRequests on a tick without save or load commands", async () => {
    const session = await createScriptedGameSession(game2D("() => ({ state: null, commands: [] })"), 1);
    try { expect(session.step(idle)).not.toHaveProperty("saveRequests"); } finally { session.dispose(); }
  });

  it.each([
    ["more than four requests in a tick", `Array.from({ length: 5 }, () => ({ kind: "load", slot: "a" }))`, /exceed 4 per tick/],
    ["data over the key limit", `[{ kind: "save", slot: "a", data: Object.fromEntries(Array.from({ length: 257 }, (_, i) => ["k" + i, i])) }]`, /exceeds 256 keys/],
    ["data that is not an object", `[{ kind: "save", slot: "a", data: [1] }]`, /Invalid save command at index 0/],
    ["a settings save with a snapshot", `[{ kind: "save", slot: "a", scope: "settings", data: {}, snapshot: true }]`, /settings saves cannot store a snapshot/],
    ["a bad slot name", `[{ kind: "load", slot: "../x" }]`, /Invalid load command at index 0/]
  ])("fails the tick on %s", async (_name, commands, message) => {
    const session = await createScriptedGameSession(game2D(`() => ({ state: null, commands: ${commands} })`), 1);
    try { expect(() => session.step(idle)).toThrow(message); } finally { session.dispose(); }
  });

  it("delivers a load on a later frame and replays it from tick 60 using only the recorded frames", async () => {
    const { storage, saves } = await seeded();
    const document = game2D(SAVER);
    const session = await createScriptedGameSession(document, 1);
    let atSixty: ReturnType<GameSession["snapshot"]> | undefined;
    const run = await (async () => {
      try {
        const head = await play(session, saves, idle, 60);
        atSixty = session.snapshot();
        const tail = await play(session, saves, idle, 60);
        return { frames: [...head.frames, ...tail.frames], steps: [...head.steps, ...tail.steps] };
      } finally { session.dispose(); }
    })();
    const loadedAt = run.frames.findIndex((frame) => frame.loaded !== undefined);
    expect(loadedAt).toBe(71);
    expect(run.frames[71].loaded).toEqual([{ scope: "progress", slot: "main", data: { best: 30 } }]);
    expect(run.steps[71].events).toContainEqual(expect.objectContaining({ kind: "trigger", event: "loaded", payload: { best: 30, tick: 71 } }));

    // The progress save stored the end-of-tick snapshot. The settings save kept its own record under the same slot name.
    const stored = storage.entries();
    expect(stored.progress.main.data).toEqual({ best: 31 });
    expect(gameSnapshot.parse(stored.progress.main.snapshot).tick).toBe(91);
    expect(stored.settings).toEqual({ main: { version: 1, data: { volume: 0.5 } } });

    // A replay feeds the recorded frames and never touches storage.
    if (!atSixty) { throw new Error("Missing tick 60 snapshot"); }
    const resumed = await createScriptedGameSession(document, 1, atSixty);
    try {
      const replayed = run.frames.slice(60).map((frame) => ({ events: resumed.step(frame).events, snapshot: resumed.snapshot() }));
      expect(replayed).toEqual(run.steps.slice(60));
    } finally { resumed.dispose(); }

    // Without the recorded load the replay diverges, so the load entered the simulation only through the frame.
    const blind = await createScriptedGameSession(document, 1, atSixty);
    try {
      for (let tick = 60; tick < 120; tick += 1) { blind.step(idle); }
      expect(blind.snapshot()).not.toEqual(run.steps[119].snapshot);
    } finally { blind.dispose(); }
  });

  it("restores the stored progress snapshot into a new session", async () => {
    const { storage, saves } = await seeded();
    const document = game2D(SAVER);
    const session = await createScriptedGameSession(document, 1);
    try { await play(session, saves, idle, 92); } finally { session.dispose(); }
    const record = await saves.load("progress", "main");
    const restored = await createScriptedGameSession(document, 1, gameSnapshot.parse(record?.snapshot));
    try { expect(restored.snapshot().tick).toBe(91); } finally { restored.dispose(); }
    expect(storage.entries().progress.main.data).toEqual({ best: 31 });
  });
});

describe("settings saves", () => {
  it("keep a separate namespace from progress saves", async () => {
    const saves = new GamePlayerSaves(createMemoryGameSaveStorage());
    await saves.save("progress", "main", { level: 4 }, { tick: 10 });
    await saves.save("settings", "main", { volume: 0.25 });
    await expect(saves.save("settings", "main", { volume: 1 }, { tick: 10 })).rejects.toThrow(/Settings saves cannot store a snapshot/);
    expect(await saves.load("settings", "main")).toEqual({ version: 1, data: { volume: 0.25 } });
    expect(await saves.load("progress", "main")).toEqual({ version: 1, data: { level: 4 }, snapshot: { tick: 10 } });
    await saves.remove("progress", "main");
    expect(await saves.load("progress", "main")).toBeNull();
    expect(await saves.slots("settings")).toEqual(["main"]);
  });

  it("drop queued loads when the host clears saves for a reset", async () => {
    const saves = new GamePlayerSaves(createMemoryGameSaveStorage());
    saves.handle([{ kind: "load", tick: 0, entityId: "e", scope: "settings", slot: "main" }], () => null);
    saves.clear();
    await saves.idle();
    expect(saves.withLoaded(idle)).toBe(idle);
  });
});

describe("recorded loads on session input", () => {
  const tooMany = [1, 2, 3].map((n) => ({ scope: "progress" as const, slot: `s${n}`, data: null }));

  it("rejects more than two loads on one 2D input frame", async () => {
    const session = await createScriptedGameSession(game2D("() => ({ state: null, commands: [] })"), 1);
    try { expect(() => session.step({ ...idle, loaded: tooMany })).toThrow(/"origin": "array"[\s\S]*"maximum": 2/); } finally { session.dispose(); }
  });

  it("rejects more than two loads on one 3D input frame, through the input system's frame parse", async () => {
    const session = await open3D(game3D("() => ({ state: null, commands: [] })"));
    try { expect(() => session.step({ ...gameInputFrame3D.parse({ pressed: [] }), loaded: tooMany })).toThrow(/"origin": "array"[\s\S]*"maximum": 2/); } finally { session.dispose(); }
  });
});

describe("3D save and load commands", () => {
  const empty: GameInputFrame3D = gameInputFrame3D.parse({ pressed: [] });

  it("delivers a load on a later frame, stores the 3D snapshot and replays from tick 60 using only the recorded frames", async () => {
    const { storage, saves } = await seeded();
    const document = game3D(SAVER);
    const session = await open3D(document);
    let atSixty: ReturnType<typeof session.snapshot> | undefined;
    let run: Awaited<ReturnType<typeof play<GameInputFrame3D>>>;
    try {
      const head = await play(session, saves, empty, 60);
      atSixty = session.snapshot();
      const tail = await play(session, saves, empty, 60);
      run = { frames: [...head.frames, ...tail.frames], steps: [...head.steps, ...tail.steps] };
    } finally { session.dispose(); }
    expect(run.frames.findIndex((frame) => frame.loaded !== undefined)).toBe(71);
    expect(run.steps[71].events).toContainEqual(expect.objectContaining({ kind: "trigger", event: "loaded", payload: { best: 30, tick: 71 } }));
    const stored = storage.entries();
    expect(stored.progress.main.data).toEqual({ best: 31 });
    expect((stored.progress.main.snapshot as { tick: number }).tick).toBe(91);
    expect(stored.settings.main.data).toEqual({ volume: 0.5 });

    const resumed = await open3D(document, atSixty);
    try {
      const replayed = run.frames.slice(60).map((frame) => ({ events: resumed.step(frame).events, snapshot: resumed.snapshot() }));
      expect(replayed).toEqual(run.steps.slice(60));
    } finally { resumed.dispose(); }
    const blind = await open3D(document, atSixty);
    try {
      for (let tick = 60; tick < 120; tick += 1) { blind.step(empty); }
      expect(blind.snapshot()).not.toEqual(run.steps[119].snapshot);
    } finally { blind.dispose(); }
  });

  it("fails the tick on a settings save with a snapshot", async () => {
    const session = await open3D(game3D(`() => ({ state: null, commands: [{ kind: "save", slot: "a", scope: "settings", data: {}, snapshot: true }] })`));
    try { expect(() => session.step(empty)).toThrow(/settings saves cannot store a snapshot/); } finally { session.dispose(); }
  });
});
