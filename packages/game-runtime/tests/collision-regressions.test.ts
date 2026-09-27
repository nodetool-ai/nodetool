import { describe, expect, it } from "vitest";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createScriptedGameSession } from "../src/index.js";

const idle = { pressed: [], justPressed: [] };

function game(entities: unknown[], scenes?: unknown[]): GameDocument {
  return gameDocument.parse({
    schemaVersion: 1, engineVersion: "1", id: "collision", revision: "r1", entrySceneId: "main",
    pixelsPerUnit: 32, tickRate: 60, inputActions: [], assets: {},
    scenes: scenes ?? [{ id: "main", name: "Main", entities }]
  });
}

describe("game collision and session boundaries", () => {
  it("stops a fast body at a thin wall and reports the impact normal", () => {
    const session = createGameSession(game([
      { id: "bullet", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 240, y: 0 } }, collider2d: { width: 0.2, height: 0.2 } },
      { id: "wall", transform2d: { x: 1, y: 0 }, body2d: { type: "static" }, collider2d: { width: 0.2, height: 1 } }
    ]), 0);
    const step = session.step(idle);
    expect(session.inspect({ entityId: "bullet" }).entities[0].x).toBeCloseTo(0.8);
    expect(step.events).toContainEqual(expect.objectContaining({ kind: "contact", entityId: "bullet", otherId: "wall", normalX: -1, normalY: 0 }));
    expect(session.step(idle).events).toContainEqual(expect.objectContaining({ kind: "contact", entityId: "bullet", otherId: "wall", phase: "stay" }));
    const stopped = session.snapshot();
    const bullet = stopped.entities.find((entity) => entity.id === "bullet");
    if (!bullet) {
      throw new Error("Missing bullet");
    }
    bullet.velocityX = 0;
    const resting = createGameSession(game([
      { id: "bullet", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 240, y: 0 } }, collider2d: { width: 0.2, height: 0.2 } },
      { id: "wall", transform2d: { x: 1, y: 0 }, body2d: { type: "static" }, collider2d: { width: 0.2, height: 1 } }
    ]), 0, stopped);
    expect(resting.step(idle).events).toContainEqual(expect.objectContaining({ kind: "contact", entityId: "bullet", otherId: "wall", phase: "stay" }));
    resting.dispose();
    session.dispose();
  });

  it("reports fast sensor crossings once, then an exit", () => {
    const session = createGameSession(game([
      { id: "bullet", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 240, y: 0 } }, collider2d: { width: 0.2, height: 0.2 } },
      { id: "gate", transform2d: { x: 1, y: 0 }, collider2d: { width: 0.2, height: 1, sensor: true }, behaviors: [{ kind: "trigger", event: "gate" }] }
    ]), 0);
    const first = session.step(idle);
    expect(first.events.filter((event) => event.kind === "contact")).toEqual([
      expect.objectContaining({ kind: "contact", entityId: "bullet", otherId: "gate", phase: "enter" })
    ]);
    expect(first.events.filter((event) => event.kind === "trigger")).toHaveLength(1);
    expect(session.step(idle).events).toContainEqual(expect.objectContaining({ kind: "contact", phase: "exit", entityId: "bullet", otherId: "gate" }));
    session.dispose();
  });

  it("orders swept contacts by impact time before entity order", () => {
    const session = createGameSession(game([
      { id: "bullet", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 240, y: 0 } }, collider2d: { width: 0.2, height: 0.2 } },
      { id: "far", transform2d: { x: 2, y: 0 }, collider2d: { width: 0.2, height: 1, sensor: true } },
      { id: "near", transform2d: { x: 1, y: 0 }, collider2d: { width: 0.2, height: 1, sensor: true } }
    ]), 0);
    expect(session.step(idle).events.filter((event) => event.kind === "contact").map((event) => event.otherId)).toEqual(["near", "far"]);
    session.dispose();
  });

  it("filters pairs using both collision masks", () => {
    const session = createGameSession(game([
      { id: "bullet", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 240, y: 0 } }, collider2d: { width: 0.2, height: 0.2, category: 2, mask: 4 } },
      { id: "ignored", transform2d: { x: 1, y: 0 }, body2d: { type: "static" }, collider2d: { width: 0.2, height: 1, category: 1, mask: 2 } },
      { id: "matched", transform2d: { x: 2, y: 0 }, body2d: { type: "static" }, collider2d: { width: 0.2, height: 1, category: 4, mask: 2 } }
    ]), 0);
    const step = session.step(idle);
    expect(session.inspect({ entityId: "bullet" }).entities[0].x).toBeCloseTo(1.8);
    expect(step.events.filter((event) => event.kind === "contact").map((event) => event.otherId)).toEqual(["matched"]);
    session.dispose();
  });

  it("uses relative motion for moving sensors and handles kinematic pickups in either order", () => {
    const moving = createGameSession(game([
      { id: "a", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 120, y: 0 } }, collider2d: { width: 0.2, height: 0.2 } },
      { id: "b", transform2d: { x: 1, y: 0 }, body2d: { type: "kinematic", velocity: { x: 120, y: 0 } }, collider2d: { width: 0.2, height: 0.2, sensor: true } }
    ]), 0);
    expect(moving.step(idle).events.filter((event) => event.kind === "contact")).toEqual([]);
    moving.dispose();

    const pickup = createGameSession(game([
      { id: "gem", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1, sensor: true }, behaviors: [{ kind: "collectible", score: 2 }] },
      { id: "player", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1 } }
    ]), 0);
    const events = pickup.step(idle).events;
    expect(events.filter((event) => event.kind === "contact")).toHaveLength(1);
    expect(events).toContainEqual({ kind: "collected", entityId: "gem", byId: "player", score: 2 });
    pickup.dispose();
  });

  it("starts authored entity age at scene entry and preserves it after restore", () => {
    const main = { id: "main", name: "Main", entities: [{ id: "switch", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "sceneTransition", sceneId: "next", onEvent: "go" }] }] };
    const next = { id: "next", name: "Next", entities: [{ id: "spark", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "lifetime", ticks: 5 }] }] };
    const document = game([], [main, next]);
    const initial = createGameSession(document, 0);
    const save = initial.snapshot();
    initial.dispose();
    save.tick = 10;
    save.pendingEvents = [{ kind: "trigger", event: "go", entityId: "switch" }];
    const session = createGameSession(document, 0, save);
    session.step(idle);
    expect(session.snapshot().entities[0].spawnTick).toBe(11);
    const restored = createGameSession(document, 0, session.snapshot());
    for (let index = 0; index < 5; index += 1) restored.step(idle);
    expect(restored.inspect({ entityId: "spark" }).entities[0].active).toBe(true);
    restored.step(idle);
    expect(restored.inspect({ entityId: "spark" }).entities[0].active).toBe(false);
    session.dispose();
    restored.dispose();
  });

  it("does not expose pending events or HUD internals through outputs", () => {
    const document = game([{ id: "receiver", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "sceneTransition", sceneId: "next", onEvent: "go" }] }], [
      { id: "main", name: "Main", entities: [{ id: "receiver", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "sceneTransition", sceneId: "next", onEvent: "go" }] }] },
      { id: "next", name: "Next", entities: [] }
    ]);
    const initial = createGameSession(document, 0);
    const save = initial.snapshot();
    initial.dispose();
    save.pendingEvents = [{ kind: "trigger", event: "go", entityId: "receiver" }];
    const session = createGameSession(document, 0, save);
    const output = session.snapshot();
    output.pendingEvents[0].entityId = "tampered";
    expect(session.snapshot().pendingEvents[0].entityId).toBe("receiver");
    expect(session.step(idle).events).toContainEqual({ kind: "sceneTransition", sceneId: "next" });
    session.dispose();
  });

  it("isolates event callbacks and nested script state from the live session", async () => {
    const document = game([{ id: "actor", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source:
      "({ tick }) => ({ state: { nested: { count: tick + 1 } }, commands: [{ kind: 'emit', event: 'ping' }, { kind: 'hud', id: 'label', text: 'Ready', x: 0, y: 0 }] })" }] }]);
    const seen: string[] = [];
    const session = await createScriptedGameSession(document, 0, undefined, (event) => {
      if (event.kind === "trigger") {
        seen.push(event.event);
        event.event = "tampered";
      }
    });
    const result = session.step(idle);
    expect(seen).toEqual(["ping"]);
    expect(result.events).toContainEqual({ kind: "trigger", event: "ping", entityId: "actor" });
    const save = session.snapshot();
    const state = save.scriptState['["main","actor",0]'];
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      throw new Error("Expected object script state");
    }
    const nested = state.nested;
    if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
      throw new Error("Expected nested script state");
    }
    nested.count = 999;
    save.hud[0].text = "tampered";
    result.frame.hud[0].text = "tampered";
    expect(session.snapshot().scriptState['["main","actor",0]']).toEqual({ nested: { count: 1 } });
    expect(session.frame().hud[0].text).toBe("Ready");
    session.dispose();
  });

  it("stops a dense collision tick at an explicit event limit", () => {
    const entities = Array.from({ length: 48 }, (_, index) => ({
      id: `bullet-${index}`, transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" },
      collider2d: { width: 0.2, height: 0.2, sensor: true }
    }));
    const session = createGameSession(game(entities), 0);
    expect(() => session.step(idle)).toThrow(/Game event limit exceeded/);
    expect(() => session.step(idle)).toThrow(/session stopped/);
    session.dispose();
  });

  it("does not save partial state after a script fails during a tick", async () => {
    const session = await createScriptedGameSession(game([
      { id: "actor", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source: "() => { throw new Error('boom') }" }] }
    ]), 0);
    expect(() => session.step(idle)).toThrow(/boom/);
    expect(() => session.snapshot()).toThrow(/session stopped/);
    expect(() => session.step(idle)).toThrow(/session stopped/);
    session.dispose();
  });
});
