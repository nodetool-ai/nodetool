import { describe, expect, it } from "vitest";
import { gameDocument, gameEntity3D, gameInputFrame3D, type GameDocument, type GameDocument3D, type GameEvent, type GameInputFrame } from "@nodetool-ai/protocol";
import { openGameSession } from "../src/open-session.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { planScriptHooks } from "../src/script-lifecycle.js";
import { createScriptedGameSession, replayScriptedGame } from "../src/session.js";
import { gameScriptCommand, prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";
import { blockout } from "./fixtures-game3d.js";

/** Logs each event an entity's onEvent hook receives as [tick, name, payload, sender]. */
const listener = `({
  onEvent(input, event) {
    const log = input.state ?? [];
    return { state: [...log, [input.tick, event.event, event.payload === undefined ? "none" : event.payload, event.entityId]] };
  },
  onUpdate() {}
})`;

/** Emits a tag-targeted ping, an entity-targeted ping, then a plain ping. */
const caller = `(input) => ({ state: null, commands:
  input.tick === 2 ? [{ kind: "emit", event: "ping", payload: { n: 1 }, target: { tag: "listener" } }]
  : input.tick === 3 ? [{ kind: "emit", event: "ping", payload: { n: 2 }, target: { entityId: "b" } }]
  : input.tick === 4 ? [{ kind: "emit", event: "ping" }] : [] })`;

function eventsGame(callerSource = caller): GameDocument {
  const base = createTopDownRoomGame("f".repeat(32));
  const script = (source: string) => ({ kind: "script", source, maxCommands: 8, maxTickMs: 50 });
  return gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities,
    { id: "caller", transform2d: { x: -5, y: 2 }, behaviors: [script(callerSource)] },
    { id: "a", tags: ["listener"], transform2d: { x: -5, y: -2 }, behaviors: [script(listener)] },
    { id: "b", transform2d: { x: 5, y: -2 }, behaviors: [script(listener)] },
    { id: "spark", templateOnly: true, transform2d: { x: 5, y: 2 }, behaviors: [{ kind: "lifetime", ticks: 600 }] },
    { id: "spawner", transform2d: { x: 5, y: 3 }, behaviors: [{ kind: "spawn", prefabId: "spark", onEvent: "ping" }] }
  ] })) });
}

const idle: GameInputFrame = { pressed: [], justPressed: [] };
const triggers = (events: readonly GameEvent[]) => events.filter((event) => event.kind === "trigger");

describe("typed script events", () => {
  it("keeps the plain emit event shape byte for byte", async () => {
    const session = await createScriptedGameSession(eventsGame(), 1);
    try {
      const steps = Array.from({ length: 5 }, () => session.step(idle));
      expect(JSON.stringify(triggers(steps[4].events))).toBe('[{"kind":"trigger","event":"ping","entityId":"caller"}]');
      expect(triggers(steps[2].events)).toStrictEqual([{ kind: "trigger", event: "ping", entityId: "caller", payload: { n: 1 }, target: { tag: "listener" } }]);
      expect(triggers(steps[3].events)).toStrictEqual([{ kind: "trigger", event: "ping", entityId: "caller", payload: { n: 2 }, target: { entityId: "b" } }]);
    } finally { session.dispose(); }
  });

  it("delivers payloads to onEvent hooks of the targeted entities on the next tick", async () => {
    const session = await createScriptedGameSession(eventsGame(), 1);
    try {
      for (let tick = 0; tick < 8; tick += 1) { session.step(idle); }
      const state = session.snapshot().scriptState;
      const log = (id: string) => (state[scriptSourceKey("room", id, 0)] as { state: unknown }).state;
      expect(log("a")).toEqual([[3, "ping", { n: 1 }, "caller"], [5, "ping", "none", "caller"]]);
      expect(log("b")).toEqual([[4, "ping", { n: 2 }, "caller"], [5, "ping", "none", "caller"]]);
    } finally { session.dispose(); }
  });

  it("applies the target to built-in event behaviors", async () => {
    const session = await createScriptedGameSession(eventsGame(), 1);
    try {
      const sparks = () => session.snapshot().entities.filter((entity) => entity.id.startsWith("spark#")).length;
      for (let tick = 0; tick < 5; tick += 1) { session.step(idle); }
      // The targeted pings at ticks 2 and 3 reach neither the untagged spawner nor any entity it names.
      expect(sparks()).toBe(0);
      session.step(idle);
      session.step(idle);
      expect(sparks()).toBe(1);
    } finally { session.dispose(); }
  });

  it("replays typed events from tick 60 with identical snapshots and events", async () => {
    const source = `(input) => ({ state: null, commands: input.tick % 6 === 5
      ? [{ kind: "emit", event: "beat", payload: { tick: input.tick, list: [1, "two", null] }, target: input.tick % 12 === 5 ? { tag: "listener" } : { entityId: "b" } }] : [] })`;
    const game = eventsGame(source);
    const inputs = Array.from({ length: 120 }, (): GameInputFrame => idle);
    const full = await createScriptedGameSession(game, 1);
    try {
      const steps = inputs.slice(0, 60).map((input) => full.step(input));
      const atSixty = full.snapshot();
      // The snapshot is taken with a typed event still pending for the next tick.
      expect(atSixty.pendingEvents).toContainEqual({ kind: "trigger", event: "beat", entityId: "caller", payload: { tick: 59, list: [1, "two", null] }, target: { entityId: "b" } });
      const tail = inputs.slice(60).map((input) => full.step(input));
      steps.push(...tail);
      const resumed = await replayScriptedGame(game, 1, inputs.slice(60), atSixty);
      expect(resumed.snapshot).toEqual(full.snapshot());
      expect(resumed.steps.map((step) => step.events)).toEqual(tail.map((step) => step.events));
      const again = await replayScriptedGame(game, 1, inputs);
      expect(again.snapshot).toEqual(full.snapshot());
      expect(again.steps.map((step) => step.events)).toEqual(steps.map((step) => step.events));
      const log = (full.snapshot().scriptState[scriptSourceKey("room", "a", 0)] as { state: unknown[] }).state;
      expect(log.slice(0, 2)).toEqual([[6, "beat", { tick: 5, list: [1, "two", null] }, "caller"], [18, "beat", { tick: 17, list: [1, "two", null] }, "caller"]]);
    } finally { full.dispose(); }
  });

  it("restores a pending typed event from a snapshot", async () => {
    const game = eventsGame();
    const first = await createScriptedGameSession(game, 1);
    try {
      for (let tick = 0; tick < 3; tick += 1) { first.step(idle); }
      const saved = JSON.parse(JSON.stringify(first.snapshot()));
      expect(saved.pendingEvents).toContainEqual({ kind: "trigger", event: "ping", entityId: "caller", payload: { n: 1 }, target: { tag: "listener" } });
      const restored = await createScriptedGameSession(game, 1, saved);
      try {
        restored.step(idle);
        first.step(idle);
        expect(restored.snapshot()).toEqual(first.snapshot());
      } finally { restored.dispose(); }
    } finally { first.dispose(); }
  });

  it("bounds payloads and targets", () => {
    const emit = (extra: Record<string, unknown>) => gameScriptCommand.safeParse({ kind: "emit", event: "ping", ...extra }).success;
    expect(emit({})).toBe(true);
    expect(emit({ payload: null })).toBe(true);
    expect(emit({ payload: { nested: [1, { deep: true }] }, target: { entityId: "b" } })).toBe(true);
    expect(emit({ target: { tag: "listener" } })).toBe(true);
    expect(emit({ payload: "x".repeat(1100) })).toBe(false);
    expect(emit({ payload: JSON.parse('{"__proto__":1}') })).toBe(false);
    expect(emit({ target: { tag: "" } })).toBe(false);
    expect(emit({ target: { entityId: "b", tag: "listener" } })).toBe(false);
    expect(emit({ target: "everyone" })).toBe(false);
  });

  it("fails the tick when a script emits an oversized payload", async () => {
    const session = await createScriptedGameSession(eventsGame(`() => ({ state: null, commands: [{ kind: "emit", event: "big", payload: "x".repeat(2000) }] })`), 1);
    try { expect(() => session.step(idle)).toThrow(/caller/); } finally { session.dispose(); }
  });

  it("runs onEvent after contact hooks and before due timers", async () => {
    const steps = planScriptHooks({ $lifecycle: 1, state: null, timers: [{ name: "beat", at: 3 }] },
      { contacts: [{ otherId: "wall", phase: "enter", sensor: false }], events: [2, 0] }, 3).steps;
    expect(steps).toEqual([["onContact", { otherId: "wall", phase: "enter", sensor: false }], ["onEvent", 2], ["onEvent", 0], ["beat"], ["onFixedUpdate"], ["onUpdate"]]);
    const runner = await prepareGameScripts(eventsGame());
    const key = scriptSourceKey("room", "a", 0);
    const call: GameScriptCall = { sourceKey: key, stateKey: key, entityId: "a", source: "a", state: null, x: 0, y: 0, velocityX: 0, velocityY: 0,
      touching: { down: false, up: false, left: false, right: false }, maxCommands: 8, maxTickMs: 50, lifecycle: { events: [1] } };
    try {
      expect([...runner.eventSources ?? []]).toEqual([scriptSourceKey("room", "a", 0), scriptSourceKey("room", "b", 0)]);
      const events = [{ kind: "trigger", event: "skip", entityId: "x" }, { kind: "trigger", event: "hit", entityId: "x", payload: [7] }];
      const result = runner.run([call], { tick: 7, pressed: [], justPressed: [], events, world: [] }, 1);
      expect((result.results[0].state as { state: unknown }).state).toEqual([[7, "hit", [7], "x"]]);
    } finally { runner.dispose(); }
  });
});

describe("3D typed script events", () => {
  const input = gameInputFrame3D.parse({ pressed: [] });

  function eventsGame3D(): GameDocument3D {
    const document = blockout();
    const player = document.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player) throw new Error("Player fixture is missing");
    player.behaviors = [{ kind: "script", maxTickMs: 50, maxCommands: 8, source: `(input) => ({ state: null, commands: input.tick % 10 === 1
      ? [{ kind: "emit", event: "alarm", payload: { level: input.tick }, target: { tag: "guard" } }] : [] })` }];
    document.scenes[0].entities.push(
      gameEntity3D.parse({ id: "guard", tags: ["guard"], transform3d: { position: { x: 4, y: 1, z: 0 } }, behaviors: [{ kind: "script", maxTickMs: 50, maxCommands: 8, source: listener }] }),
      gameEntity3D.parse({ id: "civilian", transform3d: { position: { x: -4, y: 1, z: 0 } }, behaviors: [{ kind: "script", maxTickMs: 50, maxCommands: 8, source: listener }] })
    );
    return document;
  }

  async function open(document: GameDocument3D, snapshot?: Parameters<typeof openGameSession>[1]["snapshot"]) {
    const result = await openGameSession(document, { seed: 7, snapshot });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    if (result.opened.dimension !== "3d") throw new Error("Expected 3D session");
    return result.opened.session;
  }

  it("delivers tag-targeted payloads and replays from tick 60 without divergence", async () => {
    const document = eventsGame3D();
    const session = await open(document);
    try {
      Array.from({ length: 60 }, () => session.step(input));
      const atSixty = session.snapshot();
      const log = (id: string) => (atSixty.scriptState[scriptSourceKey("scene", id, 0)] as { state: unknown } | undefined)?.state;
      expect(log("guard")).toEqual([2, 12, 22, 32, 42, 52].map((tick) => [tick, "alarm", { level: tick - 1 }, "player"]));
      expect(log("civilian")).toBeNull();
      const tail = Array.from({ length: 60 }, () => session.step(input));
      const resumed = await open(document, atSixty);
      try {
        const replayed = Array.from({ length: 60 }, () => resumed.step(input));
        expect(replayed.map((step) => step.events)).toEqual(tail.map((step) => step.events));
        expect(resumed.snapshot()).toEqual(session.snapshot());
      } finally { resumed.dispose(); }
    } finally { session.dispose(); }
  });
});
