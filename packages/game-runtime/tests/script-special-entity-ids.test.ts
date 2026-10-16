import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameSnapshot, gameSnapshot3D, type AnyGameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { openGameSession } from "../src/open-session.js";
import { blockout } from "./fixtures-game3d.js";

function fixture(dimension: "2d" | "3d", id: string): AnyGameDocument {
  const script = { kind: "script", maxTickMs: 20, maxCommands: 4,
    source: `(input) => {
      const listed = input.world.find(item => item.id === input.entity.id);
      const queried = world.get(input.entity.id);
      return {state: {self: input.entity.props.value, listed: listed.props.value, queried: queried.props.value},
        commands: input.tick === 0 ? [{kind:'setProp',key:'value',value:2}] : []};
    }` };
  if (dimension === "2d") {
    const base = createTopDownRoomGame("special-entity-ids");
    return gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: [{ ...base.scenes[0], entities: [
      ...base.scenes[0].entities,
      { id, transform2d: { x: 20, y: 0 }, collider2d: { width: 1, height: 1, sensor: true }, props: { value: 1 }, behaviors: [script] }
    ] }] });
  }
  const base = blockout();
  return gameDocument3D.parse({ ...base, scenes: [{ ...base.scenes[0], entities: [
    ...base.scenes[0].entities,
    { id, transform3d: { position: { x: 20, y: 0, z: 0 } }, props: { value: 1 }, behaviors: [script] }
  ] }] });
}

describe.each(["2d", "3d"] as const)("%s script props for arbitrary entity IDs", (dimension) => {
  it.each(["__proto__", "constructor", "toString", "ordinary"])("preserves %s props across all read paths, updates and serialized replay", async (id) => {
    const document = fixture(dimension, id);
    const opened = await openGameSession(document, { seed: 1 });
    if (!opened.ok) { throw new Error(opened.diagnostics.map((issue) => issue.message).join(", ")); }
    const session = opened.opened.session;
    const input = { pressed: [] };
    try {
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toEqual([{ self: 1, listed: 1, queried: 1 }]);
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toEqual([{ self: 2, listed: 2, queried: 2 }]);
      for (let tick = 2; tick < 60; tick += 1) { session.step(input); }
      const checkpoint = session.snapshot();
      const stored: unknown = JSON.parse(JSON.stringify(checkpoint));
      const saved = "dimension" in checkpoint ? gameSnapshot3D.parse(stored) : gameSnapshot.parse(stored);
      const restored = await openGameSession(document, { seed: 1, snapshot: saved });
      if (!restored.ok) { throw new Error(restored.diagnostics.map((issue) => issue.message).join(", ")); }
      try {
        for (let tick = 60; tick < 120; tick += 1) {
          expect(restored.opened.session.step(input).events).toEqual(session.step(input).events);
          expect(restored.opened.session.snapshot()).toEqual(session.snapshot());
          expect(Object.values(session.snapshot().scriptState)).toEqual([{ self: 2, listed: 2, queried: 2 }]);
        }
      } finally { restored.opened.session.dispose(); }
    } finally { session.dispose(); }
  });
});
