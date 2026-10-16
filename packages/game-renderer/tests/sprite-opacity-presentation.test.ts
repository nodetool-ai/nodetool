import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createGameSession } from "@nodetool-ai/game-runtime";
import { visibleItems } from "../src/frame.js";

describe("authored opacity from the actual runtime presentation frame", () => {
  it("interpolates an implicit previous opacity of one like the explicit default", () => {
    const document = gameDocument.parse({ schemaVersion: 2, engineVersion: "1", id: "opacity", revision: "1",
      entrySceneId: "scene", tickRate: 60, pixelsPerUnit: 32, inputActions: [],
      assets: { dot: { assetId: "builtin:dot", digest: "builtin:dot-v1", width: 8, height: 8 } },
      scenes: [{ id: "scene", name: "Scene", entities: [
        { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
        ...[false, true].map((explicit) => ({ id: explicit ? "explicit" : "implicit", transform2d: { x: 0, y: 0 },
          sprite: { assetId: "dot", width: 1, height: 1, ...(explicit ? { opacity: 1 } : {}) },
          visualAnimation: { tracks: [{ property: "opacity", from: 1, to: 0, durationTicks: 2 }] } }))
      ] }] });
    const session = createGameSession(document, 1);
    const frame = session.step({ pressed: [], justPressed: [] }).frame;
    expect(frame.sprites.find((sprite) => sprite.entityId === "implicit")?.opacity).toBe(0.5);
    for (const [alpha, opacity] of [[0, 1], [0.5, 0.75], [1, 0.5]] as const) {
      const items = visibleItems(frame, alpha);
      expect(items.find((item) => item.item.entityId === "implicit")?.opacity).toBe(opacity);
      expect(items.find((item) => item.item.entityId === "explicit")?.opacity).toBe(opacity);
    }
  });
});
