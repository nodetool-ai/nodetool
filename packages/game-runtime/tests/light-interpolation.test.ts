import { expect, it } from "vitest";
import { gameDocument, type GameSnapshot } from "@nodetool-ai/protocol";
import { createGameSession } from "../src/session.js";

const document = gameDocument.parse({ schemaVersion: 2, engineVersion: "1", id: "light-interpolation", revision: "1",
  entrySceneId: "scene", tickRate: 60, pixelsPerUnit: 32, inputActions: [],
  assets: { dot: { assetId: "builtin:dot", digest: "builtin:dot-v1", width: 8, height: 8 } },
  scenes: [{ id: "scene", name: "Scene", gravity: { x: 0, y: 0 },
    lighting: { ambient: { color: "#000000", intensity: 0 }, points: [] }, entities: [
      { id: "camera", transform2d: { x: 60, y: 0 }, camera2d: { width: 256, height: 16 } },
      { id: "emitter", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 60, y: 0 } },
        collider2d: { width: 0.25, height: 0.25 }, sprite: { assetId: "dot", width: 1, height: 1 },
        light2d: { color: "#ffffff", intensity: 1, radius: 0.75, offset: { x: 0.25, y: 0.5 } } }
    ] }] });
const idle = { pressed: [], justPressed: [] };

it("carries the owning entity's previous and current positions into attached lights", () => {
  const session = createGameSession(document, 1);
  try {
    const frame = session.step(idle).frame;
    expect(frame.sprites[0]).toMatchObject({ previousX: 0, x: 1 });
    expect(frame.lighting?.points[0]).toMatchObject({ previousX: 0.25, x: 1.25, y: 0.5 });
  } finally {
    session.dispose();
  }
});

it("restores moving-light presentation exactly at tick 60 through tick 120", () => {
  const session = createGameSession(document, 1);
  let restored: ReturnType<typeof createGameSession> | undefined;
  try {
    for (let tick = 0; tick < 60; tick++) session.step(idle);
    const saved: GameSnapshot = JSON.parse(JSON.stringify(session.snapshot()));
    restored = createGameSession(document, 1, saved);
    for (let tick = 60; tick < 120; tick++) {
      const live = session.step(idle);
      const replay = restored.step(idle);
      expect(replay.frame).toEqual(live.frame);
      expect(replay.events).toEqual(live.events);
      expect(restored.snapshot()).toEqual(session.snapshot());
      expect(live.frame.lighting?.points[0]).toMatchObject({ previousX: tick + 0.25, x: tick + 1.25 });
    }
  } finally {
    restored?.dispose();
    session.dispose();
  }
});

it.each(["light", "camera"])("keeps lights visible earlier in the interval when the %s crosses a view edge", (moving) => {
  const input = structuredClone(document);
  const camera = input.scenes[0]!.entities[0]!;
  const emitter = input.scenes[0]!.entities[1]!;
  camera.transform2d.x = 0;
  camera.camera2d = { width: 4, height: 4, zoom: 1 };
  emitter.transform2d.x = 1;
  emitter.light2d!.offset = { x: 0, y: 0 };
  emitter.body2d!.velocity = { x: moving === "light" ? 180 : 0, y: 0 };
  if (moving === "camera") camera.body2d = { type: "kinematic", velocity: { x: -180, y: 0 } };
  const session = createGameSession(input, 1);
  try {
    const frame = session.step(idle).frame;
    expect(frame.lighting?.points).toHaveLength(1);
    expect(frame.lighting?.points[0]?.x).toBe(moving === "light" ? 4 : 1);
    expect(frame.camera.x).toBe(moving === "camera" ? -3 : 0);
  } finally {
    session.dispose();
  }
});

it("uses the displayed camera history to retain and cull attached lights", () => {
  const input = structuredClone(document);
  input.scenes[0].entities[0].transform2d.x = 0;
  input.scenes[0].entities[0].camera2d = { width: 4, height: 4, zoom: 1 };
  input.scenes[0].entities[1].transform2d.x = 100;
  input.scenes[0].entities[1].body2d!.velocity = { x: 0, y: 0 };
  input.scenes[0].entities[1].light2d!.offset = { x: 0, y: 0 };
  const session = createGameSession(input, 1);
  try {
    const before = session.snapshot();
    const crossing = session.frame({ camera: { x: 0, y: 0, previousX: 100, previousY: 0, zoom: 1 } });
    expect(crossing.lighting?.points).toHaveLength(1);
    expect(crossing.lighting?.points[0]?.x).toBe(100);
    const stationary = session.frame({ camera: { x: 0, y: 0, previousX: 0, previousY: 0, zoom: 1 } });
    expect(stationary.lighting?.points).toHaveLength(0);
    expect(session.snapshot()).toEqual(before);
  } finally { session.dispose(); }
});
