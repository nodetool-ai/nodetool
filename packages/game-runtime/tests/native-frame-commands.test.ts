import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nativeFrame, nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker } from "../src/native.js";

const executable = process.env.NODETOOL_NATIVE_GAME_WORKER ?? fileURLToPath(new URL("../../../native/game/build/game-worker", import.meta.url));
describe("native command frame boundaries", () => {
  it.each(["2d", "3d"] as const)("bounds health in actual %s frames and restores the same state", async dimension => {
    const document = nativeGameDocument.parse({ engine: "native-cpp-1", schemaVersion: dimension === "2d" ? 5 : 4, dimension, id: "health-boundary", title: "Health boundary", initialSceneId: "scene",
      scripts: [{ id: "script", source: "i=>({commands:i.input.commands||[]})" }],
      scenes: [{ id: "scene", entities: [{ id: "actor", gameplay: { health: 100 }, behaviors: [{ id: "behavior", scriptId: "script" }] }] }] });
    const worker = new NativeGameWorker({ executable });
    try {
      await worker.request("open", { sessionId: "health", document });
      await worker.request("start", { sessionId: "health", seed: 1 });
      for (const [amount, expected] of [[-101, 0], [1_000_000, 1_000_000], [1, 1_000_000], [-1_000_000, 0], [17, 17]]) {
        const result = await worker.request("step", { sessionId: "health", input: { commands: [{ kind: "health", amount }] } });
        const frame = nativeFrame.parse(result);
        expect(frame.entities.find(entity => entity.id === "actor")?.gameplay?.health).toBe(expected);
      }
      const saved = await worker.request("snapshot", { sessionId: "health" });
      await expect(worker.request("step", { sessionId: "health", input: { commands: [
        { kind: "health", amount: -100 }, { kind: "health", entityId: "missing", amount: 1 }
      ] } })).rejects.toThrow("Unknown health entity");
      expect(await worker.request("snapshot", { sessionId: "health" })).toEqual(saved);
      await worker.request("restore", { sessionId: "health", snapshot: saved });
      await worker.request("step", { sessionId: "health", input: { commands: [{ kind: "health", amount: -100 }] } });
      const restored = nativeFrame.parse(await worker.request("restore", { sessionId: "health", snapshot: saved }));
      expect(restored.entities.find(entity => entity.id === "actor")?.gameplay?.health).toBe(17);
      expect(document.scenes[0]?.entities[0]?.gameplay?.health).toBe(100);
    } finally { worker.close(); }
  });
});
