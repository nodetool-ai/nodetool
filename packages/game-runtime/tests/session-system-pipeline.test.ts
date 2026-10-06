import { gameDocument3D } from "@nodetool-ai/protocol";
import { expect, it } from "vitest";
import { createTopDownRoomGame } from "../src/sample.js";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { stepPresentation3D } from "../src/systems/presentation3d.js";
import { stepPresentation2D } from "../src/systems/presentation2d.js";

const flatInput = { pressed: ["right"], justPressed: [] };
const spatialInput = {
  pressed: [],
  justPressed: [],
  axes: { moveX: 0.4 },
  look: { x: 0, y: 0 }
};

it("restores legacy 2D JSON with defaulted system state", () => {
  const document = createTopDownRoomGame("legacy-flat");
  const original = createGameSession(document, 3);
  try {
    original.step(flatInput);
    const legacy = structuredClone(original.snapshot());
    for (const field of ["activeContacts", "pendingEvents", "scriptState"]) {
      expect(Reflect.deleteProperty(legacy, field)).toBe(true);
    }
    const restored = createGameSession(document, 3, legacy);
    try {
      expect(restored.snapshot().activeContacts).toEqual([]);
      expect(restored.snapshot().pendingEvents).toEqual([]);
      expect(restored.snapshot().scriptState).toEqual({});
      expect(restored.step(flatInput).tick).toBe(legacy.tick + 1);
    } finally {
      restored.dispose();
    }
  } finally {
    original.dispose();
  }
});

it("restores authored 3D scene music when saved music is null or omitted", async () => {
  const base = createNative3DGame("legacy-music");
  const scene = base.scenes[0];
  const audio = createTopDownRoomGame("audio-source").assets["sfx.collect"];
  if (!scene || !audio) {
    throw new Error("Missing music test fixture");
  }
  const document = gameDocument3D.parse({
    ...base,
    assets: { ...base.assets, "sfx.collect": {
      mediaKind: "audio", assetId: audio.assetId, digest: audio.digest,
      required: audio.required
    } },
    scenes: [{ ...scene, music: { assetId: "sfx.collect", volume: 0.4 } }]
  });
  const original = await createGameSession3D(document, 3);
  try {
    original.step(spatialInput);
    for (const omitted of [false, true]) {
      const saved = structuredClone(original.snapshot());
      saved.music = null;
      if (omitted) {
        expect(Reflect.deleteProperty(saved, "music")).toBe(true);
      }
      const restored = await createGameSession3D(document, 3, saved);
      try {
        expect(restored.snapshot().music).toEqual({
          ...document.scenes[0]?.music,
          voiceId: `scene:${scene.id}:music`,
          startTick: saved.tick
        });
      } finally {
        restored.dispose();
      }
    }
  } finally {
    original.dispose();
  }
});

it("mirrors 2D presentation output without advancing simulation state", () => {
  const document = createTopDownRoomGame("presentation-flat");
  const scene = document.scenes[0];
  if (!scene) {
    throw new Error("Missing test scene");
  }
  const session = createGameSession(document, 3);
  try {
    const step = session.step(flatInput);
    const before = JSON.stringify(session.snapshot());
    const events = [...step.events];
    const context: Parameters<typeof stepPresentation2D>[0] = {
      document,
      scene,
      states: [],
      score: 0,
      won: false,
      hud: new Map(),
      tick: step.tick,
      events,
      frameFor: () => session.frame(),
      scriptStats: undefined,
      presentationEvents: [],
      result: undefined
    };
    const keys = Object.keys(context);
    stepPresentation2D(context);
    expect(Object.keys(context)).toEqual(keys);
    expect(context.tick).toBe(step.tick);
    expect(context.events).toBe(events);
    expect(context.presentationEvents).toEqual(step.events);
    expect(context.presentationEvents).not.toBe(step.events);
    expect(context.result).toEqual({
      tick: step.tick,
      events: step.events,
      frame: step.frame
    });
    expect(JSON.stringify(session.snapshot())).toBe(before);
  } finally {
    session.dispose();
  }
});
it("returns the actual system order and timings only when enabled", async () => {
  const flat = createGameSession(
    createTopDownRoomGame("flat"),
    3,
    undefined,
    undefined,
    { recordTimings: true }
  );
  const spatial = await createGameSession3D(
    createNative3DGame("spatial"),
    3,
    undefined,
    { recordTimings: true }
  );
  const untimed = createGameSession(createTopDownRoomGame("untimed"), 3);
  try {
    const flatTiming = flat.step(flatInput).timings;
    const spatialTiming = spatial.step(spatialInput).timings;
    expect(flatTiming?.systems.map((system) => system.system)).toEqual([
      "input",
      "scripts",
      "physics",
      "contacts",
      "gameplay",
      "presentation"
    ]);
    expect(spatialTiming?.systems.map((system) => system.system)).toEqual([
      "input",
      "scripts",
      "character",
      "physics",
      "contacts",
      "gameplay",
      "animation",
      "presentation"
    ]);
    expect(
      spatialTiming?.systems.every(
        (system) => Number.isFinite(system.durationMs) && system.durationMs >= 0
      )
    ).toBe(true);
    expect(spatialTiming?.totalMs).toBeGreaterThanOrEqual(0);
    expect(untimed.step(flatInput)).not.toHaveProperty("timings");
  } finally {
    flat.dispose();
    spatial.dispose();
    untimed.dispose();
  }
});
it("drains presentation events independently from deterministic snapshots", () => {
  const session = createGameSession(createTopDownRoomGame("events"), 3);
  try {
    let events = session.step(flatInput).events;
    for (let tick = 0; events.length === 0 && tick < 120; tick++) {
      events = session.step(flatInput).events;
    }
    expect(events.length).toBeGreaterThan(0);
    const snapshot = JSON.stringify(session.snapshot());
    expect(session.takePresentationEvents()).toEqual(events);
    expect(session.takePresentationEvents()).toEqual([]);
    expect(JSON.stringify(session.snapshot())).toBe(snapshot);
    expect(session.snapshot()).not.toHaveProperty("presentationEvents");
  } finally {
    session.dispose();
  }
});
it("restores session state through system lifecycles and reproduces the remaining replay", async () => {
  const document2d = createTopDownRoomGame("restore-flat");
  const document3d = createNative3DGame("restore-spatial");
  const flat = createGameSession(document2d, 3);
  const spatial = await createGameSession3D(document3d, 3);
  try {
    for (let tick = 0; tick < 10; tick++) {
      flat.step(flatInput);
      spatial.step(spatialInput);
    }
    const restoredFlat = createGameSession(document2d, 3, flat.snapshot());
    const restoredSpatial = await createGameSession3D(
      document3d,
      3,
      spatial.snapshot()
    );
    try {
      expect(restoredFlat.takePresentationEvents()).toEqual([]);
      expect(restoredSpatial.takePresentationEvents()).toEqual([]);
      for (let tick = 0; tick < 20; tick++) {
        expect(JSON.stringify(restoredFlat.step(flatInput))).toBe(
          JSON.stringify(flat.step(flatInput))
        );
        const restored = restoredSpatial.step(spatialInput);
        const uninterrupted = spatial.step(spatialInput);
        expect(
          JSON.stringify({
            tick: restored.tick,
            events: restored.events,
            frame: restored.frame
          })
        ).toBe(
          JSON.stringify({
            tick: uninterrupted.tick,
            events: uninterrupted.events,
            frame: uninterrupted.frame
          })
        );
        expect(JSON.stringify(restoredFlat.snapshot())).toBe(
          JSON.stringify(flat.snapshot())
        );
        expect(JSON.stringify(restoredSpatial.snapshot())).toBe(
          JSON.stringify(spatial.snapshot())
        );
      }
    } finally {
      restoredFlat.dispose();
      restoredSpatial.dispose();
    }
  } finally {
    flat.dispose();
    spatial.dispose();
  }
});

it("mirrors 3D presentation output without advancing simulation state", async () => {
  const session = await createGameSession3D(
    createNative3DGame("presentation"),
    3
  );
  try {
    const step = session.step(spatialInput);
    const before = JSON.stringify(session.snapshot());
    const events = [...step.events];
    const context: Parameters<typeof stepPresentation3D>[0] = {
      tick: step.tick,
      events,
      frame: () => session.frame(),
      scriptStats: undefined,
      presentationEvents: [],
      result: undefined
    };
    const keys = Object.keys(context);
    stepPresentation3D(context);
    expect(Object.keys(context)).toEqual(keys);
    expect(context.tick).toBe(step.tick);
    expect(context.events).toBe(events);
    expect(context.presentationEvents).toEqual(events);
    expect(context.presentationEvents).not.toBe(events);
    expect(context.result).toEqual({
      tick: step.tick,
      events,
      frame: step.frame
    });
    expect(JSON.stringify(session.snapshot())).toBe(before);
  } finally {
    session.dispose();
  }
});

it("preserves script animation commands and their transition start ticks", async () => {
  const document = createNative3DGame("animation-order");
  const authored = gameDocument3D.parse({
    ...document,
    assets: {
      ...document.assets,
      character: {
        mediaKind: "model",
        assetId: "11111111111111111111111111111111",
        digest: "prepared-character",
        bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        nodeIds: [],
        clipIds: ["idle-clip", "run-clip"],
        geometryBytes: 0,
        textureBytes: 0,
        triangles: 0
      }
    },
    scenes: document.scenes.map((scene) => ({
      ...scene,
      entities: scene.entities.map((entity) => {
        if (entity.id !== "player-visual") {
          return entity;
        }
        const visual = structuredClone(entity);
        delete visual.primitive;
        return {
          ...visual,
          model: { assetId: "character" },
          animator3d: {
            clips: { idle: "idle-clip", run: "run-clip" },
            initialClip: "idle"
          },
          behaviors: [
            {
              kind: "script",
              source: `(input) => ({ state: null, commands: [{ kind: "playAnimation", clip: input.tick < 2 ? "run" : "idle" }] })`,
              maxTickMs: 50
            }
          ]
        };
      })
    }))
  });
  const session = await createGameSession3D(authored, 3);
  try {
    session.step(spatialInput);
    const animation = () =>
      session
        .snapshot()
        .entities.find((entity) => entity.id === "player-visual")?.animation;
    expect(animation()).toMatchObject({
      clipId: "run-clip",
      startTick: 1,
      previousClipId: "idle-clip",
      previousStartTick: 0
    });
    session.step(spatialInput);
    expect(animation()?.startTick).toBe(1);
    session.step(spatialInput);
    expect(animation()).toMatchObject({
      clipId: "idle-clip",
      startTick: 3,
      previousClipId: "run-clip",
      previousStartTick: 1
    });
  } finally {
    session.dispose();
  }
});
