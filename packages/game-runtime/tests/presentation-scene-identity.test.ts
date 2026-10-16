import { expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createTopDownRoomGame } from "../src/index.js";

it("identifies the presented 2D scene without mutating the authoritative snapshot", () => {
  const base = createTopDownRoomGame("presentation-scene-identity");
  const room = base.scenes[0];
  const game = gameDocument.parse({ ...base, schemaVersion: 2, scenes: [
    { ...room, entities: room.entities.map((entity) => {
      if (entity.id === "player") {
        return { ...entity, behaviors: [...entity.behaviors, { kind: "sceneTransition", sceneId: "next", onEvent: "next" }] };
      }
      if (entity.id === "gem") {
        return { ...entity, transform2d: { ...entity.transform2d, x: 0 }, behaviors: [{ kind: "trigger", event: "next" }] };
      }
      return entity;
    }) },
    { id: "next", name: "Next", entities: [] }
  ] });
  const session = createGameSession(game, 1);
  try {
    const before = session.snapshot();
    expect(session.frame().sceneId).toBe("room");
    expect(session.snapshot()).toEqual(before);
    session.step({ pressed: [], justPressed: [] });
    const transition = session.step({ pressed: [], justPressed: [] });
    expect(transition.events.filter((event) => event.kind === "sceneTransition")).toHaveLength(1);
    expect(transition.frame.sceneId).toBe("next");
    expect(session.frame().sceneId).toBe("next");
    expect(session.snapshot().sceneId).toBe("next");
  } finally {
    session.dispose();
  }
});
