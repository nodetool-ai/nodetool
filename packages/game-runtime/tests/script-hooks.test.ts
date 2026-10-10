import { describe, expect, it } from "vitest";
import { gameDocument, gameEntity3D, gameInputFrame3D, type GameDocument, type GameDocument3D, type GameEvent, type GameInputFrame } from "@nodetool-ai/protocol";
import { openGameSession } from "../src/open-session.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { createScriptedGameSession, replayScriptedGame } from "../src/session.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";
import { blockout } from "./fixtures-game3d.js";

/** Logs every hook except onUpdate with its tick, and counts updates. */
const loggingHooks = (extra: string) => `({
  log(input, name, detail) {
    const state = input.state ?? { log: [], updates: 0 };
    return { state: { ...state, log: [...state.log, detail === undefined ? [input.tick, name] : [input.tick, name, detail]] } };
  },
  onStart(input) { after(5, "once"); every(10, "pulse"); return this.log(input, "onStart"); },
  onSceneEnter(input) { return this.log(input, "onSceneEnter"); },
  onTriggerEnter(input, contact) { return this.log(input, "onTriggerEnter", contact.otherId); },
  onTriggerExit(input, contact) { return this.log(input, "onTriggerExit", contact.otherId); },
  onContact(input, contact) { return input.state.log.length > 40 ? undefined : this.log(input, "onContact", contact.otherId + ":" + contact.phase); },
  once(input) { return this.log(input, "once"); },
  pulse(input) { return input.tick >= 40 ? undefined : this.log(input, "pulse"); },
  onUpdate(input) { return { state: { ...input.state, updates: input.state.updates + 1 } }; },
  ${extra}
})`;

const gemHooks = `({
  onUpdate(input) { return { state: (input.state ?? 0) + 1 }; },
  onDestroy(input) { return { state: -input.state, commands: [{ kind: "emit", event: "gem-gone" }, { kind: "hud", id: "gone", text: "gem gone", x: 0, y: 0 }] }; }
})`;

const boltHooks = `({
  onStart(input) { return { state: { started: input.tick } }; },
  onDestroy(input) { return { commands: [{ kind: "emit", event: "bolt-gone:" + input.entity.id }] }; }
})`;

function lifecycleGame(): GameDocument {
  const base = createTopDownRoomGame("a".repeat(32));
  const script = (source: string) => ({ kind: "script", source, maxCommands: 8, maxTickMs: 50 });
  return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities.map((entity) => entity.id === "player"
      ? { ...entity, behaviors: [...entity.behaviors, script(loggingHooks(""))] }
      : entity.id === "gem" ? { ...entity, behaviors: [...entity.behaviors, script(gemHooks)] } : entity),
    { id: "bolt", templateOnly: true, transform2d: { x: -3, y: 2 },
      behaviors: [{ kind: "lifetime", ticks: 4 }, script(boltHooks)] },
    { id: "launcher", transform2d: { x: -3, y: -2 },
      behaviors: [script("input => ({ state: null, commands: input.tick === 3 || input.tick === 70 ? [{ kind: 'spawn', prefabId: 'bolt' }] : [] })")] }
  ] })) });
}

const right: GameInputFrame = { pressed: ["right"], justPressed: [] };
const triggers = (events: readonly GameEvent[]) => events.flatMap((event) => event.kind === "trigger" ? [event.event] : []);

describe("lifecycle-object scripts", () => {
  it("runs hooks and timers in the documented order", async () => {
    const session = await createScriptedGameSession(lifecycleGame(), 1);
    try {
      const steps = Array.from({ length: 50 }, () => session.step(right));
      const collected = steps.findIndex((step) => step.events.some((event) => event.kind === "collected"));
      expect(collected).toBeGreaterThan(5);
      const playerKey = scriptSourceKey("room", "player", 2);
      const record = session.snapshot().scriptState[playerKey] as { state: { log: unknown[]; updates: number }; timers: unknown[] };
      expect(record.state.log).toEqual([
        [0, "onStart"], [0, "onSceneEnter"], [5, "once"], [10, "pulse"], [20, "pulse"],
        [collected + 1, "onTriggerEnter", "gem"], [collected + 2, "onTriggerExit", "gem"], [30, "pulse"]
      ].sort((a, b) => Number(a[0]) - Number(b[0])));
      expect(record.state.updates).toBe(50);
      expect(record.timers).toEqual([{ name: "pulse", at: 50, every: 10 }]);
      // The gem's onDestroy runs once, in the tick after it was collected, and its record stays marked.
      expect(steps.flatMap((step, tick) => triggers(step.events).filter((event) => event === "gem-gone").map(() => tick))).toEqual([collected + 1]);
      expect(session.snapshot().scriptState[scriptSourceKey("room", "gem", 1)]).toEqual({ $lifecycle: 1, state: -(collected + 1), timers: [], destroyed: true });
      expect(session.snapshot().hud).toContainEqual({ id: "gone", text: "gem gone", x: 0, y: 0 });
      // A spawned instance runs onStart, and its onDestroy runs after its lifetime removes it. Its record is then dropped.
      expect(steps.flatMap((step, tick) => triggers(step.events).filter((event) => event.startsWith("bolt-gone")).map((event) => [tick, event]))).toEqual([[9, "bolt-gone:bolt#1"]]);
      expect(Object.keys(session.snapshot().scriptState).filter((key) => key.includes("bolt"))).toEqual([]);
    } finally { session.dispose(); }
  });

  it("keeps a removed instance's pending onDestroy in the snapshot", async () => {
    const game = lifecycleGame();
    const first = await createScriptedGameSession(game, 1);
    try {
      for (let tick = 0; tick < 9; tick += 1) { first.step(right); }
      const saved = first.snapshot();
      expect(saved.entities.some((entity) => entity.id === "bolt#1")).toBe(false);
      expect(saved.scriptState[scriptSourceKey("room", "bolt#1", 1)]).toMatchObject({ $lifecycle: 1, removed: { entityId: "bolt#1" } });
      const restored = await createScriptedGameSession(game, 1, saved);
      try {
        expect(triggers(restored.step(right).events)).toContain("bolt-gone:bolt#1");
        expect(restored.snapshot()).toEqual((first.step(right), first.snapshot()));
      } finally { restored.dispose(); }
    } finally { first.dispose(); }
  });

  it("replays timers from tick 60 with identical snapshots and events", async () => {
    const game = lifecycleGame();
    const inputs = Array.from({ length: 120 }, (_, tick): GameInputFrame => ({ pressed: tick < 40 ? ["right"] : ["left"], justPressed: [] }));
    const full = await createScriptedGameSession(game, 1);
    try {
      const steps = inputs.slice(0, 60).map((input) => full.step(input));
      const atSixty = full.snapshot();
      expect(Object.values(atSixty.scriptState).some((record) => (record as { timers?: unknown[] }).timers?.length)).toBe(true);
      const tail = inputs.slice(60).map((input) => full.step(input));
      steps.push(...tail);
      const resumed = await replayScriptedGame(game, 1, inputs.slice(60), atSixty);
      expect(resumed.snapshot).toEqual(full.snapshot());
      expect(resumed.steps.map((step) => step.events)).toEqual(tail.map((step) => step.events));
      const again = await replayScriptedGame(game, 1, inputs);
      expect(again.snapshot).toEqual(full.snapshot());
      expect(again.steps.map((step) => step.events)).toEqual(steps.map((step) => step.events));
    } finally { full.dispose(); }
  });

  it("rejects malformed lifecycle objects when the session is prepared", async () => {
    const withSource = (source: string) => {
      const base = createTopDownRoomGame("a".repeat(32));
      return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "player"
        ? { ...entity, behaviors: [{ kind: "script", source, maxCommands: 8, maxTickMs: 50 }] } : entity) })) });
    };
    await expect(createScriptedGameSession(withSource("({ onTick() {} })"), 1)).rejects.toThrow(/unknown lifecycle hook onTick/);
    await expect(createScriptedGameSession(withSource("({ onUpdate() {}, onFixedUpdate() {} })"), 1)).rejects.toThrow(/define one of them/);
    await expect(createScriptedGameSession(withSource("({ helper() {} })"), 1)).rejects.toThrow(/at least one hook/);
    await expect(createScriptedGameSession(withSource("({ onStart: 3 })"), 1)).rejects.toThrow(/onStart must be a function/);
    await expect(createScriptedGameSession(withSource("[]"), 1)).rejects.toThrow(/function expression or a lifecycle object/);
  });

  it("rejects timers that do not name a non-hook method", async () => {
    for (const [call, message] of [["after(0, 'tick')", /integer from 1/], ["every(5, 'missing')", /must name a method/], ["after(5, 'onUpdate')", /must name a method/]] as const) {
      const source = `({ tick() {}, onUpdate(input) { ${call}; return { state: 1 }; } })`;
      const base = createTopDownRoomGame("a".repeat(32));
      const game = gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "player"
        ? { ...entity, behaviors: [{ kind: "script", source, maxCommands: 8, maxTickMs: 50 }] } : entity) })) });
      const session = await createScriptedGameSession(game, 1);
      try { expect(() => session.step(right)).toThrow(message); } finally { session.dispose(); }
    }
  });

  it("runs onFixedUpdate as onUpdate and rejects entity commands from onDestroy", async () => {
    const runner = await prepareGameScripts(lifecycleGame());
    try {
      expect([...runner.hookSources ?? []]).toEqual([
        scriptSourceKey("room", "player", 2), scriptSourceKey("room", "gem", 1), scriptSourceKey("room", "bolt", 1)
      ]);
    } finally { runner.dispose(); }
    const base = lifecycleGame();
    const fixed = gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "gem"
      ? { ...entity, behaviors: [entity.behaviors[0], { kind: "script", maxCommands: 8, maxTickMs: 50,
        source: "({ onFixedUpdate(input) { return { state: (input.state ?? 0) + 1 }; }, onDestroy() { return { commands: [{ kind: 'setVelocity', x: 1, y: 0 }] }; } })" }] }
      : entity) })) });
    const session = await createScriptedGameSession(fixed, 1);
    try {
      let tick = 0;
      let failure: unknown;
      for (; tick < 60 && failure === undefined; tick += 1) {
        try { session.step(right); } catch (error) { failure = error; }
      }
      expect(String(failure)).toMatch(/onDestroy for gem at tick \d+ cannot use setVelocity/);
    } finally { session.dispose(); }
  });

  it("passes contacts, scene entry and destroy facts only to lifecycle calls", async () => {
    const runner = await prepareGameScripts(lifecycleGame());
    const key = scriptSourceKey("room", "player", 2);
    const call: GameScriptCall = { sourceKey: key, stateKey: key, entityId: "player", source: "player", state: null, x: 0, y: 0, velocityX: 0, velocityY: 0,
      touching: { down: false, up: false, left: false, right: false }, maxCommands: 8, maxTickMs: 50,
      lifecycle: { sceneEnter: true, contacts: [{ otherId: "wall", phase: "enter", sensor: false }, { otherId: "gem", phase: "exit", sensor: true }, { otherId: "gem", phase: "enter", sensor: true }] } };
    try {
      const result = runner.run([call], { tick: 7, pressed: [], justPressed: [], events: [], world: [] }, 1);
      expect((result.results[0].state as { state: { log: unknown[] } }).state.log).toEqual([
        [7, "onStart"], [7, "onSceneEnter"], [7, "onContact", "wall:enter"], [7, "onTriggerExit", "gem"], [7, "onTriggerEnter", "gem"]
      ]);
    } finally { runner.dispose(); }
  });
});

describe("host-owned lifecycle records", () => {
  const spammer = "({ onUpdate() {}, onDestroy() { return { commands: Array.from({ length: 20 }, (_, index) => ({ kind: 'emit', event: 'spam' + index })) }; } })";
  const forged = (entityId: string) => ({ $lifecycle: 1, state: null, timers: [], removed: { sourceKey: scriptSourceKey("room", "spammer", 0),
    entityId, source: "spammer", maxCommands: 100000, maxTickMs: 50, x: 0, y: 0, velocityX: 0, velocityY: 0,
    touching: { down: false, up: false, left: false, right: false } } });
  function forgeryGame(): GameDocument {
    const base = createTopDownRoomGame("d".repeat(32));
    const script = (source: string) => ({ kind: "script", source, maxCommands: 8, maxTickMs: 50 });
    return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: [...scene.entities,
      { id: "spammer", transform2d: { x: 3, y: 3 }, behaviors: [script(spammer)] },
      { id: "forger", transform2d: { x: -3, y: 3 }, behaviors: [script(`input => ({ state: ${JSON.stringify(forged("forger"))}, commands: [] })`)] }
    ] })) });
  }

  it("ignores a removed record that a function script writes into its own state", async () => {
    const session = await createScriptedGameSession(forgeryGame(), 1);
    try {
      for (let tick = 0; tick < 5; tick += 1) {
        const step = session.step(right);
        expect(triggers(step.events)).toEqual([]);
        expect(step.scriptStats?.calls).toBe(2);
      }
    } finally { session.dispose(); }
  });

  it("takes destroy limits from the document, not from a restored record", async () => {
    const game = forgeryGame();
    const first = await createScriptedGameSession(game, 1);
    let saved;
    try { first.step(right); saved = first.snapshot(); } finally { first.dispose(); }
    // A tampered snapshot claims a removed instance of the lifecycle source with a raised command limit.
    const tampered = { ...saved, scriptState: { ...saved.scriptState, [scriptSourceKey("room", "ghost", 0)]: forged("ghost") } };
    const restored = await createScriptedGameSession(game, 1, tampered);
    try { expect(() => restored.step(right)).toThrow(/command limit exceeded for ghost/); } finally { restored.dispose(); }
    // A record whose key names an entity that still exists, or whose source is not a lifecycle source, gets no call.
    for (const [key, record] of [
      [scriptSourceKey("room", "spammer", 0), forged("spammer")],
      [scriptSourceKey("room", "ghost", 0), { ...forged("ghost"), removed: { ...forged("ghost").removed, sourceKey: scriptSourceKey("room", "forger", 0) } }]
    ] as const) {
      const session = await createScriptedGameSession(game, 1, { ...saved, scriptState: { ...saved.scriptState, [key]: record } });
      try { expect(triggers(session.step(right).events)).toEqual([]); } finally { session.dispose(); }
    }
  });

  it("rechecks timers on the host when the guest replaces the dispatcher's built-ins", async () => {
    const base = createTopDownRoomGame("e".repeat(32));
    const withSource = (source: string) => gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "player"
      ? { ...entity, behaviors: [{ kind: "script", source, maxCommands: 8, maxTickMs: 50 }] } : entity) })) });
    const injected = await createScriptedGameSession(withSource(`({ beat() {}, onUpdate() {
      Array.prototype.push = function () { this[this.length] = ["onStart", -3, true]; return this.length; };
      after(5, "beat");
    } })`), 1);
    try { expect(() => injected.step(right)).toThrow(/invalid timer/); } finally { injected.dispose(); }
    const game = withSource("({ beat() {}, onUpdate() {} })");
    const first = await createScriptedGameSession(game, 1);
    let saved;
    try { first.step(right); saved = first.snapshot(); } finally { first.dispose(); }
    const key = scriptSourceKey("room", "player", 0);
    const tampered = { ...saved, scriptState: { ...saved.scriptState, [key]: { $lifecycle: 1, state: null, timers: [{ name: "onStart", at: -1, every: -3 }] } } };
    const restored = await createScriptedGameSession(game, 1, tampered);
    try { expect(() => restored.step(right)).toThrow(/invalid timers/); } finally { restored.dispose(); }
  });
});

describe("3D lifecycle-object scripts", () => {
  const input = gameInputFrame3D.parse({ pressed: [] });

  function lifecycleGame3D(): GameDocument3D {
    const document = blockout();
    const player = document.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player) throw new Error("Player fixture is missing");
    player.behaviors = [{ kind: "script", maxTickMs: 50, maxCommands: 8, source: `({
      onStart() { every(7, "fire"); return { state: { fired: 0 } }; },
      fire(input) { return { state: { fired: input.state.fired + 1 }, commands: [{ kind: "spawn", prefabId: "bolt" }] }; },
      onUpdate() {}
    })` }];
    document.prefabs.bolt = { rootId: "bolt", externalAssets: [], externalScenes: [], entities: [
      gameEntity3D.parse({ id: "bolt", transform3d: { position: { x: 3, y: 1, z: 0 } }, behaviors: [
        { kind: "lifetime", ticks: 5, fade: false, endScale: 1 },
        { kind: "script", maxTickMs: 50, maxCommands: 8, source: `({
          onStart(input) { after(2, "arm"); return { state: { armed: false } }; },
          arm() { return { state: { armed: true } }; },
          onDestroy(input) { return { commands: [{ kind: "emit", event: "bolt-gone:" + input.entity.id + ":" + input.state.armed }] }; }
        })` }] })
    ] };
    return document;
  }

  async function open(document: GameDocument3D, snapshot?: Parameters<typeof openGameSession>[1]["snapshot"]) {
    const result = await openGameSession(document, { seed: 7, snapshot });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    if (result.opened.dimension !== "3d") throw new Error("Expected 3D session");
    return result.opened.session;
  }

  it("fires timers, spawns, and runs onDestroy, replaying from tick 60 without divergence", async () => {
    const document = lifecycleGame3D();
    const session = await open(document);
    try {
      const steps = Array.from({ length: 60 }, () => session.step(input));
      const gone = steps.flatMap((step, tick) => step.events.flatMap((event) => event.kind === "trigger" && event.event.startsWith("bolt-gone") ? [[tick, event.event]] : []));
      expect(gone.slice(0, 2)).toEqual([[14, "bolt-gone:bolt#1/bolt:true"], [21, "bolt-gone:bolt#2/bolt:true"]]);
      const atSixty = session.snapshot();
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
