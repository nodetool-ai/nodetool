import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { nativeFrame2D, nativeGame2dDocument, type NativeFrame2D } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker } from "@nodetool-ai/game-runtime/native";
import { nativeDrawPlan2D } from "../src/native-cpp/draw2d-plan.js";

const executable = process.env.NODETOOL_NATIVE_GAME_WORKER ?? fileURLToPath(new URL("../../../native/game/build/game-worker", import.meta.url));
const overrides: NonNullable<NativeFrame2D["entities"][number]["visualOverride"]>[] = [
  { rotation: Math.PI / 2 }, { rotation: -Math.PI / 2 }, { scaleX: 2 }, { scaleY: 3 },
  { frame: { x: 0, y: 0, width: 2, height: 2 } }, { tint: "#ff0000" }, { opacity: .25 }, { flipX: true }
];
it.each(overrides)("renders admitted setVisual override %j from actual native frames", async visual => {
  const document = nativeGame2dDocument.parse({ engine: "native-cpp-1", schemaVersion: 5, dimension: "2d", id: "visual-boundary", title: "Visual boundary", initialSceneId: "scene", gravity: { x: 0, y: 0 },
    assets: [{ id: "image", kind: "image", path: "image.png", size: 1, digest: "a".repeat(64) }],
    scripts: [{ id: "script", source: "i=>({commands:i.input.commands||[]})" }],
    scenes: [{ id: "scene", entities: [
      { id: "parent", transform: { x: 1, y: 2 }, body2d: { type: "kinematic", velocity: { x: 0, y: 0 } }, sprite: { assetId: "image", width: 2, height: 2, tint: "#ffffff" }, behaviors: [{ id: "behavior", scriptId: "script" }] },
      { id: "child", parentId: "parent", transform: { x: 2, y: 0 }, sprite: { assetId: "image", width: 2, height: 2, tint: "#ffffff" } }
    ] }] });
  const worker = new NativeGameWorker({ executable });
  try {
    await worker.request("open", { sessionId: "visual", document });
    await worker.request("start", { sessionId: "visual", seed: 1 });
    const before = nativeFrame2D.parse(await worker.request("frame", { sessionId: "visual" }));
    const frame = nativeFrame2D.parse(await worker.request("step", { sessionId: "visual", input: { commands: [{ kind: "setVisual", visual }] } }));
    const parent = frame.entities.find(entity => entity.id === "parent");
    expect(parent?.transform).toEqual(before.entities.find(entity => entity.id === "parent")?.transform);
    const angle = visual.rotation ?? 0;
    const sx = visual.scaleX ?? 1, sy = visual.scaleY ?? 1;
    expect(frame.worldTransforms.parent?.rotation).toBeCloseTo(angle);
    expect(frame.worldTransforms.parent?.scaleX).toBe(sx);
    expect(frame.worldTransforms.parent?.scaleY).toBe(sy);
    expect(frame.worldTransforms.child?.x).toBeCloseTo(1 + 2 * sx * Math.cos(angle));
    expect(frame.worldTransforms.child?.y).toBeCloseTo(2 + 2 * sx * Math.sin(angle));
    const plan = nativeDrawPlan2D(document, frame, new Map([["image", { width: 4, height: 4, image: {} as TexImageSource }]]), 100, 100);
    expect(plan.draws).toHaveLength(2);
    const first = plan.draws[0]!.first * 11;
    expect(plan.vertices[first + 8]).toBeCloseTo(1 - sx * Math.cos(angle) - sy * Math.sin(angle));
    expect(plan.vertices[first + 9]).toBeCloseTo(2 - sx * Math.sin(angle) + sy * Math.cos(angle));
    if ("opacity" in visual) { expect(plan.vertices[first + 7]).toBeCloseTo(.25); }
    if ("tint" in visual) { expect([...plan.vertices.slice(first + 4, first + 7)]).toEqual([1, 0, 0]); }
    if ("flipX" in visual) { expect(plan.vertices[first + 2]).toBe(1); }
    if ("frame" in visual) { expect(plan.vertices[first + 11 + 3]).toBe(.5); }
    const saved = await worker.request("snapshot", { sessionId: "visual" });
    await expect(worker.request("step", { sessionId: "visual", input: { commands: [
      { kind: "setVisual", visual: { scaleX: 4 } }, { kind: "setVisual", entityId: "missing", visual: { rotation: 1 } }
    ] } })).rejects.toThrow("Unknown visual entity");
    expect(await worker.request("snapshot", { sessionId: "visual" })).toEqual(saved);
    expect(document.scenes[0]?.entities[0]?.transform.rotation).toBe(0);
  } finally { worker.close(); }
});
