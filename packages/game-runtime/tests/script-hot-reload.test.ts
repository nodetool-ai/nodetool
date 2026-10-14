import { describe, expect, it, vi } from "vitest";
import { QuickJSContext } from "quickjs-emscripten-core";
import { gameDocument, gameEntity3D, gameInputFrame3D, type AnyGameDocument, type GameSnapshot, type GameSnapshot3D } from "@nodetool-ai/protocol";
import type { GameScriptReloadResult } from "../src/script-reload.js";
import { createGameSession3D } from "../src/session3d.js";
import { blockout } from "./fixtures-game3d.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { createScriptedGameSession } from "../src/session.js";

function fixture() {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, scenes: base.scenes.map(scene => ({ ...scene, entities: [
    { id: "worker", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source: "input => ({ state: (input.state || 0) + 1, commands: [] })", maxTickMs: 20 }] }
  ] })) });
}

async function verifyReloadReplay<Document extends AnyGameDocument, Snapshot extends GameSnapshot | GameSnapshot3D>(
  document: Document,
  open: (document: Document, seed: number, snapshot?: Snapshot) => Promise<{
    step(input: ReturnType<typeof gameInputFrame3D.parse>): { readonly events: readonly unknown[] };
    snapshot(): Snapshot;
    reloadScripts(candidate: Document): Promise<GameScriptReloadResult<Document>>;
    dispose(): void;
  }>
): Promise<void> {
  const session = await open(document, 1);
  const input = gameInputFrame3D.parse({ pressed: [] });
  try {
    for (let tick = 0; tick < 30; tick += 1) { session.step(input); }
    const edited = structuredClone(document);
    for (const entity of edited.scenes[0].entities) {
      for (const behavior of entity.behaviors) {
        if (behavior.kind === "script") { behavior.source = behavior.source.replace("+ 1 +", "+ 10 +"); }
      }
    }
    const accepted = await session.reloadScripts(edited);
    if (!accepted.ok) { throw new Error(accepted.error); }
    expect(accepted.changed).toBe(true);
    for (let tick = 30; tick < 60; tick += 1) { session.step(input); }
    const checkpoint = session.snapshot();
    expect(checkpoint.tick).toBe(60);
    const restored = await open(accepted.document, 1, checkpoint);
    try {
      let divergentSnapshots = 0;
      let divergentEvents = 0;
      for (let tick = 60; tick < 120; tick += 1) {
        const live = session.step(input);
        const replay = restored.step(input);
        if (JSON.stringify(live.events) !== JSON.stringify(replay.events)) { divergentEvents += 1; }
        if (JSON.stringify(session.snapshot()) !== JSON.stringify(restored.snapshot())) { divergentSnapshots += 1; }
      }
      expect({ divergentSnapshots, divergentEvents }).toEqual({ divergentSnapshots: 0, divergentEvents: 0 });
      expect(session.snapshot().tick).toBe(120);
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
}

describe("live script reload", () => {
  it("replays the 2D source edit at tick 30 through tick 120 from checkpoint 60 with seed 1", async () => {
    const document = fixture();
    document.scenes[0].entities[0].behaviors[0] = { kind: "script", source: "input => ({ state: (input.state || 0) + 1 + input.random(), commands: [{ kind: 'emit', event: 'step' }] })", maxTickMs: 20, maxCommands: 16 };
    await verifyReloadReplay(document, createScriptedGameSession);
  });

  it("replays the 3D source edit at tick 30 through tick 120 from checkpoint 60 with seed 1", async () => {
    const document = blockout();
    document.scenes[0].entities[1].behaviors = [{ kind: "script", source: "input => ({ state: (input.state || 0) + 1 + input.random(), commands: [{ kind: 'emit', event: 'step' }] })", maxTickMs: 20, maxCommands: 16 }];
    await verifyReloadReplay(document, createGameSession3D);
  });

  it("continues from the current tick and state and restores against the accepted source document", async () => {
    const document = fixture();
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step({ pressed: [] });
      const before = session.snapshot();
      const candidate = structuredClone(document);
      candidate.scenes[0].entities[0].behaviors[0] = { kind: "script", source: "input => ({ state: (input.state || 0) + 10, commands: [] })", maxTickMs: 20, maxCommands: 16 };
      const result = await session.reloadScripts(candidate);
      expect(result.ok).toBe(true);
      if (!result.ok) { throw new Error(result.error); }
      expect(session.snapshot()).toEqual({ ...before, gameRevision: result.document.revision });
      expect(result.document.revision).not.toBe(document.revision);
      await expect(createScriptedGameSession(document, 1, session.snapshot())).rejects.toThrow(/revision/);
      const restored = await createScriptedGameSession(result.document, 1, session.snapshot());
      try {
        restored.step({ pressed: [] });
        session.step({ pressed: [] });
        expect(restored.snapshot()).toEqual(session.snapshot());
        expect(Object.values(session.snapshot().scriptState)).toEqual([11]);
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });
  it("changes a speed constant while playing without resetting the tick", async () => {
    const document = fixture();
    document.scenes[0].entities[0].body2d = { type: "kinematic", velocity: { x: 0, y: 0 } };
    document.scenes[0].entities[0].behaviors[0] = { kind: "script", source: "input => ({ state: input.state, commands: [{ kind: 'setVelocity', x: 60, y: 0 }] })", maxTickMs: 20, maxCommands: 16 };
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step({ pressed: [] });
      expect(session.inspect({ entityId: "worker" }).entities[0].x).toBe(1);
      const candidate = structuredClone(document);
      candidate.scenes[0].entities[0].behaviors[0] = { kind: "script", source: "input => ({ state: input.state, commands: [{ kind: 'setVelocity', x: 120, y: 0 }] })", maxTickMs: 20, maxCommands: 16 };
      expect(await session.reloadScripts(candidate)).toMatchObject({ ok: true, changed: true });
      expect(session.snapshot().tick).toBe(1);
      session.step({ pressed: [] });
      expect(session.inspect({ entityId: "worker" }).entities[0].x).toBe(3);
      expect(session.snapshot().tick).toBe(2);
    } finally { session.dispose(); }
  });

  it("changes 3D source identity and restores the live physics snapshot against accepted code", async () => {
    const document = blockout();
    document.scenes[0].entities[1].behaviors = [{ kind: "script", source: "input => ({ state: (input.state || 0) + 1, commands: [] })", maxTickMs: 20, maxCommands: 16 }];
    const session = await createGameSession3D(document, 1);
    const input = gameInputFrame3D.parse({ pressed: [] });
    try {
      session.step(input);
      const before = session.snapshot();
      const candidate = structuredClone(document);
      candidate.scenes[0].entities[1].behaviors[0] = { kind: "script", source: "input => ({ state: (input.state || 0) + 10, commands: [] })", maxTickMs: 20, maxCommands: 16 };
      const result = await session.reloadScripts(candidate);
      expect(result.ok).toBe(true);
      if (!result.ok) { throw new Error(result.error); }
      expect(session.snapshot()).toEqual({ ...before, gameRevision: result.document.revision, contentDigest: session.snapshot().contentDigest });
      expect(session.snapshot().contentDigest).not.toBe(before.contentDigest);
      await expect(createGameSession3D(document, 1, session.snapshot())).rejects.toThrow(/digest|revision/);
      const restored = await createGameSession3D(result.document, 1, session.snapshot());
      try {
        restored.step(input);
        session.step(input);
        expect(restored.snapshot()).toEqual(session.snapshot());
        expect(Object.values(session.snapshot().scriptState)).toEqual([11]);
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });

  it.each(["material", "layer"])("keeps the returned 3D document valid for repeated reload and restore with named %s", async kind => {
    const document = blockout();
    const player = document.scenes[0].entities[1];
    if (!player.collider3d) { throw new Error("Missing player collider"); }
    if (kind === "material") {
      document.physicsMaterials = { rubber: { friction: 1.2, restitution: 0.8, frictionCombine: "max", restitutionCombine: "max" } };
      player.collider3d.physicsMaterial = "rubber";
    } else {
      document.collisionLayers = ["default", "player"];
      document.collisionMatrix = [["default", "player"]];
      player.collider3d.layer = "player";
    }
    player.behaviors = [{ kind: "script", source: "input => ({ state: (input.state || 0) + 1, commands: [] })", maxTickMs: 20, maxCommands: 16 }];
    const session = await createGameSession3D(document, 1);
    const input = gameInputFrame3D.parse({ pressed: [] });
    try {
      session.step(input);
      const firstCandidate = structuredClone(document);
      firstCandidate.scenes[0].entities[1].behaviors[0] = { kind: "script", source: "input => ({ state: (input.state || 0) + 10, commands: [] })", maxTickMs: 20, maxCommands: 16 };
      const first = await session.reloadScripts(firstCandidate);
      if (!first.ok) { throw new Error(first.error); }
      expect(first.document.scenes[0].entities[1].collider3d).toEqual(player.collider3d);
      const restored = await createGameSession3D(first.document, 1, session.snapshot()).then(value => {
        value.dispose();
        return "restored";
      }, error => error instanceof Error ? error.message : String(error));
      const secondCandidate = structuredClone(first.document);
      secondCandidate.scenes[0].entities[1].behaviors[0] = { kind: "script", source: "input => ({ state: (input.state || 0) + 20, commands: [] })", maxTickMs: 20, maxCommands: 16 };
      const second = await session.reloadScripts(secondCandidate);
      expect({ restored, second }).toEqual({ restored: "restored", second: expect.objectContaining({ ok: true, changed: true }) });
      if (!second.ok) { throw new Error(second.error); }
      const replay = await createGameSession3D(second.document, 1, session.snapshot());
      try {
        expect(replay.step(input).events).toEqual(session.step(input).events);
        expect(replay.snapshot()).toEqual(session.snapshot());
        expect(Object.values(session.snapshot().scriptState)).toEqual([21]);
      } finally { replay.dispose(); }
    } finally { session.dispose(); }
  });

  it("reloads one prefab definition for all existing 3D instances and future spawns", async () => {
    const document = blockout();
    document.prefabs.actor = { rootId: "worker", externalAssets: [], externalScenes: [], entities: [gameEntity3D.parse({ id: "worker", transform3d: {}, behaviors: [{ kind: "script", source: "input => ({ state: (input.state || 0) + 1, commands: [] })", maxTickMs: 20, maxCommands: 16 }] })] };
    document.scenes[0].entities[1].behaviors = [{ kind: "script", source: "input => ({ state: null, commands: input.tick === 0 || input.tick === 2 ? [{ kind: 'spawn', prefabId: 'actor' }] : [] })", maxTickMs: 20, maxCommands: 16 }];
    const session = await createGameSession3D(document, 1);
    const input = gameInputFrame3D.parse({ pressed: [] });
    try {
      session.step(input);
      session.step(input);
      const before = session.snapshot();
      const candidate = structuredClone(document);
      candidate.prefabs.actor.entities[0].behaviors[0] = { kind: "script", source: "input => ({ state: (input.state || 0) + 10, commands: [] })", maxTickMs: 20, maxCommands: 16 };
      const result = await session.reloadScripts(candidate);
      expect(result.ok).toBe(true);
      expect(session.snapshot().scriptState).toEqual(before.scriptState);
      session.step(input);
      session.step(input);
      expect(session.snapshot().scriptState[scriptSourceKey("scene", "actor#1/worker", 0)]).toBe(21);
      expect(session.snapshot().scriptState[scriptSourceKey("scene", "actor#2/worker", 0)]).toBe(10);
    } finally { session.dispose(); }
  });

  it.each(["input => (", "42", "(() => { while (true) {} })()", "({ onUpdate: 42 })", "({ onUpdate(input) { return { state: input.state }; } })"])(
    "keeps the callable and state after failed compilation: %s", async source => {
      const document = fixture();
      const session = await createScriptedGameSession(document, 1);
      try {
        session.step({ pressed: [] });
        const before = session.snapshot();
        const candidate = structuredClone(document);
        candidate.scenes[0].entities[0].behaviors[0] = { kind: "script", source, maxTickMs: 20, maxCommands: 16 };
        const result = await session.reloadScripts(candidate);
        expect(result.ok).toBe(false);
        expect(session.snapshot()).toEqual(before);
        session.step({ pressed: [] });
        expect(Object.values(session.snapshot().scriptState)).toEqual([2]);
      } finally { session.dispose(); }
    }
  );

  it("preserves lifecycle state and pending timers without rerunning start hooks", async () => {
    const document = fixture();
    const behavior = document.scenes[0].entities[0].behaviors[0];
    if (behavior.kind !== "script") { throw new Error("Missing script"); }
    behavior.source = `({ onStart() { after(2, "later"); return { state: 100 }; },
      later(input) { return { state: input.state + 1 }; }, onUpdate(input) { return { state: input.state + 1 }; } })`;
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step({ pressed: [] });
      const before = session.snapshot();
      const candidate = structuredClone(document);
      const next = candidate.scenes[0].entities[0].behaviors[0];
      if (next.kind !== "script") { throw new Error("Missing script"); }
      next.source = next.source.replaceAll("input.state + 1", "input.state + 10");
      const result = await session.reloadScripts(candidate);
      expect(result.ok).toBe(true);
      expect(session.snapshot().scriptState).toEqual(before.scriptState);
      session.step({ pressed: [] });
      session.step({ pressed: [] });
      expect(Object.values(session.snapshot().scriptState)).toEqual([{ $lifecycle: 1, state: 131, timers: [] }]);
    } finally { session.dispose(); }
  });

  it("rejects non-source edits and distinguishes different code edited from one revision", async () => {
    const document = fixture();
    const first = await createScriptedGameSession(document, 1);
    const second = await createScriptedGameSession(document, 1);
    try {
      const other = structuredClone(document);
      other.scenes[0].entities[0].transform2d.x = 100;
      expect(await first.reloadScripts(other)).toMatchObject({ ok: false, error: expect.stringContaining("only existing script source") });
      const a = structuredClone(document);
      const b = structuredClone(document);
      a.scenes[0].entities[0].behaviors[0] = { kind: "script", source: "input => ({ state: 10, commands: [] })", maxTickMs: 20, maxCommands: 16 };
      b.scenes[0].entities[0].behaviors[0] = { kind: "script", source: "input => ({ state: 20, commands: [] })", maxTickMs: 20, maxCommands: 16 };
      const acceptedA = await first.reloadScripts(a);
      const acceptedB = await second.reloadScripts(b);
      if (!acceptedA.ok || !acceptedB.ok) { throw new Error("Reload rejected"); }
      expect(acceptedA.document.revision).not.toBe(acceptedB.document.revision);
      await expect(createScriptedGameSession(acceptedB.document, 1, first.snapshot())).rejects.toThrow(/revision/);
      expect(await first.reloadScripts(acceptedA.document)).toMatchObject({ ok: true, changed: false });
    } finally { first.dispose(); second.dispose(); }
  });

  it("updates resident versus isolated execution classification while preserving explicit state", async () => {
    const document = fixture();
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step({ pressed: [] });
      const candidate = structuredClone(document);
      candidate.scenes[0].entities[0].behaviors[0] = { kind: "script", source: "(() => { let count = 0; return input => ({ state: (input.state || 0) + ++count, commands: [] }); })()", maxTickMs: 20, maxCommands: 16 };
      expect(await session.reloadScripts(candidate)).toMatchObject({ ok: true });
      session.step({ pressed: [] });
      session.step({ pressed: [] });
      expect(Object.values(session.snapshot().scriptState)).toEqual([3]);
      expect(await session.reloadScripts(document)).toMatchObject({ ok: true });
      session.step({ pressed: [] });
      expect(Object.values(session.snapshot().scriptState)).toEqual([4]);
    } finally { session.dispose(); }
  });

  it("compiles only changed sources and commits none when a later candidate fails", async () => {
    const document = fixture();
    const worker = document.scenes[0].entities[0];
    document.scenes[0].entities.push({ ...structuredClone(worker), id: "other" });
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const runner = await prepareGameScripts(document);
    const call = (entityId: string): GameScriptCall => ({
      sourceKey: scriptSourceKey("room", entityId, 0), stateKey: scriptSourceKey("room", entityId, 0), entityId,
      source: entityId, state: 1, maxCommands: 16, maxTickMs: 20, x: 0, y: 0, velocityX: 0, velocityY: 0,
      touching: { down: false, up: false, left: false, right: false }
    });
    const input = { tick: 0, pressed: [], justPressed: [], events: [], world: [] };
    try {
      runner.run([call("worker"), call("other")], input, 1);
      const retained = [...new Set(evaluate.mock.contexts)].filter(context => context.alive);
      expect(retained).toHaveLength(2);
      expect(() => runner.reloadSources([
        { sourceKey: call("worker").sourceKey, source: "input => ({ state: 10, commands: [] })" },
        { sourceKey: call("other").sourceKey, source: "input => (" }
      ])).toThrow();
      expect(retained.every(context => context.alive)).toBe(true);
      expect([...new Set(evaluate.mock.contexts)].filter(context => context.alive)).toEqual(retained);
      expect(runner.run([call("worker"), call("other")], input, 1).results.map(result => result.state)).toEqual([2, 2]);
      evaluate.mockClear();
      runner.reloadSources([{ sourceKey: call("worker").sourceKey, source: "input => ({ state: 10, commands: [] })" }]);
      expect(retained.map(context => context.alive)).toEqual([false, true]);
      expect(runner.run([call("worker"), call("other")], input, 1).results.map(result => result.state)).toEqual([10, 2]);
      expect(evaluate.mock.contexts.includes(retained[1])).toBe(false);
    } finally { runner.dispose(); evaluate.mockRestore(); }
  });

  it("keeps stepping during preparation and serializes overlapping edits", async () => {
    const document = fixture();
    const session = await createScriptedGameSession(document, 1);
    const candidate = (value: number) => {
      const edited = structuredClone(document);
      edited.scenes[0].entities[0].behaviors[0] = { kind: "script", source: `input => ({ state: (input.state || 0) + ${value}, commands: [] })`, maxTickMs: 20, maxCommands: 16 };
      return edited;
    };
    try {
      const first = session.reloadScripts(candidate(10));
      const second = session.reloadScripts(candidate(20));
      session.step({ pressed: [] });
      expect(Object.values(session.snapshot().scriptState)).toEqual([1]);
      const accepted = await first;
      const latest = await second;
      expect(accepted.ok && latest.ok).toBe(true);
      expect(session.snapshot().tick).toBe(1);
      session.step({ pressed: [] });
      expect(Object.values(session.snapshot().scriptState)).toEqual([21]);
    } finally { session.dispose(); }
  });

  it("cancels queued preparation and rejects disposal without changing the accepted callable", async () => {
    const document = fixture();
    const session = await createScriptedGameSession(document, 1);
    const controller = new AbortController();
    const canceled = session.reloadScripts(document, controller.signal);
    controller.abort();
    expect(await canceled).toMatchObject({ ok: false });
    session.step({ pressed: [] });
    const pending = session.reloadScripts(document);
    session.dispose();
    expect(await pending).toMatchObject({ ok: false, error: "Game session is disposed" });
  });
});
