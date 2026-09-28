import { describe, expect, it } from "vitest";
import { gameDocument, gameEntity3D, gameInputFrame3D, type GameEvent, type GameEvent3D } from "@nodetool-ai/protocol";
import { openGameSession } from "../src/open-session.js";
import { blockout } from "./fixtures-game3d.js";

function games() {
  const two = gameDocument.parse({ schemaVersion: 1, engineVersion: "1", id: "sink-two", revision: "source", entrySceneId: "room",
    tickRate: 60, pixelsPerUnit: 32, inputActions: [], assets: {}, scenes: [{ id: "room", name: "Room", entities: [
      { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
      { id: "player", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1 }, behaviors: [{ kind: "winWhenCollected", count: 1 }] },
      { id: "gem", transform2d: { x: 0, y: 0 }, collider2d: { width: 1, height: 1, sensor: true }, behaviors: [{ kind: "collectible", score: 1 }] }
    ] }] });
  const three = blockout();
  three.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors.push({ kind: "winWhenCollected", count: 1 });
  three.scenes[0].entities.push(gameEntity3D.parse({ id: "gem", transform3d: {}, body3d: { type: "static" },
    collider3d: { kind: "sphere", radius: 2, sensor: true }, behaviors: [{ kind: "collectible", score: 1 }] }));
  return { "2d": two, "3d": three };
}

describe("common session event sink", () => {
  it.each(["2d", "3d"] as const)("forwards ordered %s events through the public dispatcher", async (dimension) => {
    const received: (GameEvent | GameEvent3D)[] = [];
    const result = await openGameSession(games()[dimension], { seed: 7, eventSink: (event) => { received.push(event); } });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    try {
      const step = result.opened.dimension === "3d" ? result.opened.session.step(gameInputFrame3D.parse({ pressed: [] })) :
        result.opened.session.step({ pressed: [], justPressed: [] });
      expect(step.events.some((event) => event.kind === "collected")).toBe(true);
      expect(step.events.some((event) => event.kind === "win")).toBe(true);
      expect(received).toEqual(step.events);
      expect(received[0]).not.toBe(step.events[0]);
    } finally { result.opened.session.dispose(); }
  });
});
