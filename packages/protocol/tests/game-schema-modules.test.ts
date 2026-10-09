import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import * as game2d from "../src/game.js";
import * as game3d from "../src/game3d.js";

const baseline = JSON.parse(readFileSync(new URL("./fixtures/game-schemas.json", import.meta.url), "utf8"));

describe("game schema module compatibility", () => {
  it("retains legacy 3D defaults when metadata introduces nested preprocessing", () => {
    const document = game3d.gameDocument3D.parse({
      schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "legacy", revision: "one",
      entrySceneId: "scene", tickRate: 60, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 },
      inputActions: [], assets: {}, scenes: [{ id: "scene", name: "Legacy", activeCameraId: "camera", entities: [] }]
    });
    expect(document.prefabs).toEqual({});
    const legacySnapshot = {
      dimension: "3d", schemaVersion: 3, engineVersion: "2", gameRevision: "one", contentDigest: "digest",
      physicsBuild: "build", sceneId: "scene", tick: 0, rngState: 1, score: 0, won: false, spawnSequence: 0,
      scriptState: {}, pendingEvents: [], activeContacts: [], entities: [],
      camera: { entityId: "camera", yaw: 0, pitch: 0, transform: {} }, hud: [],
      physics: { encoding: "base64", bytes: "", bodies: {}, colliders: {} }
    };
    expect(game3d.gameSnapshot3D.parse(legacySnapshot).pendingCommands).toEqual([]);
    for (const field of ["pendingEvents", "activeContacts", "entities", "hud"]) {
      const incomplete: Record<string, unknown> = { ...legacySnapshot };
      delete incomplete[field];
      expect(game3d.gameSnapshot3D.safeParse(incomplete).success).toBe(false);
    }
  });

  it("preserves every exported legacy JSON schema", () => {
    const schemas = Object.fromEntries(Object.entries({ ...game2d, ...game3d })
      .filter(([, value]) => value instanceof z.ZodType)
      .map(([name, value]) => [name, z.toJSONSchema(value, { io: "input" })]));
    expect(Object.keys(baseline).length).toBeGreaterThan(0);
    expect(schemas).toEqual(baseline);
  });
});
