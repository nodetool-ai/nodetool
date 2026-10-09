import { gameRenderFrame3D } from "@nodetool-ai/protocol";

import { BoundedPromiseCache, candidatesForSlot, lookAtQuaternion, modelThumbnailFrame, panelGenerationKind, waveformPeaks,
  type GameAssetCandidate } from "../panels/assets/gameAssetBrowserModel";

function rotate(rotation: readonly number[], vector: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const [x = 0, y = 0, z = 0, w = 1] = rotation;
  const ix = w * vector.x + y * vector.z - z * vector.y;
  const iy = w * vector.y + z * vector.x - x * vector.z;
  const iz = w * vector.z + x * vector.y - y * vector.x;
  const iw = -x * vector.x - y * vector.y - z * vector.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}

const candidate = (digest: string, mediaKind: GameAssetCandidate["media_kind"], slot?: string): GameAssetCandidate =>
  ({ digest, extension: "png", media_kind: mediaKind, path: `games/g/assets/${digest}.png`, size: 1, modified_at: "2026-01-01T00:00:00.000Z",
    bound_slots: [], recorded: slot !== undefined, slot });

describe("game asset browser model", () => {
  it("reduces audio to normalized peaks per bucket across channels", () => {
    const left = new Float32Array([0, 0.5, 0, 0, 0, 0, 0, 0.25]);
    const right = new Float32Array([0, 0, 0, -1, 0, 0, 0, 0]);
    expect(waveformPeaks([left, right], 4)).toEqual([0.5, 1, 0, 0.25]);
    expect(waveformPeaks([], 3)).toEqual([0, 0, 0]);
    expect(waveformPeaks([new Float32Array(4)], 2)).toEqual([0, 0]);
  });

  it("lists candidates of the slot's media kind with the slot's own recordings first", () => {
    const listed = candidatesForSlot([candidate("a", "image"), candidate("b", "audio", "player"), candidate("c", "image", "player"), candidate("d", "image", "gem")],
      "player", "image");
    expect(listed.map((entry) => entry.digest)).toEqual(["c", "a", "d"]);
  });

  it("runs image, speech and music generation in the panel and leaves the rest to the assistant", () => {
    expect(panelGenerationKind({ kind: "image", source: "template" }, "image", "2d")).toBe("image");
    expect(panelGenerationKind({ kind: "image", source: "template" }, "image", "3d")).toBeNull();
    expect(panelGenerationKind({ kind: "sfx", source: "template" }, "audio", "2d")).toBeNull();
    expect(panelGenerationKind(undefined, "audio", "2d")).toBe("music");
    expect(panelGenerationKind(undefined, "model", "3d")).toBeNull();
  });

  it("points a camera's -Z axis at the target", () => {
    const from = { x: 3, y: 2, z: 4 };
    const forward = rotate(lookAtQuaternion(from, { x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: -1 });
    const length = Math.hypot(3, 2, 4);
    expect(forward.x).toBeCloseTo(-3 / length);
    expect(forward.y).toBeCloseTo(-2 / length);
    expect(forward.z).toBeCloseTo(-4 / length);
  });

  it("frames a model's bounds in a valid render frame for the game renderer", () => {
    const bounds = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 4, z: 1 } };
    const frame = gameRenderFrame3D.parse(modelThumbnailFrame("model-digest", bounds, { background: "#101010", light: "#ffffff" }));
    expect(frame.entities).toEqual([expect.objectContaining({ model: expect.objectContaining({ assetId: "model-digest" }) })]);
    const { position, rotation } = frame.camera.transform;
    const forward = rotate(rotation, { x: 0, y: 0, z: -1 });
    const toCenter = { x: 0 - position.x, y: 2 - position.y, z: 0 - position.z };
    const distance = Math.hypot(toCenter.x, toCenter.y, toCenter.z);
    expect(forward.x).toBeCloseTo(toCenter.x / distance);
    expect(forward.y).toBeCloseTo(toCenter.y / distance);
    const radius = Math.hypot(2, 4, 2) / 2;
    const projection = frame.camera.projection;
    if (projection.kind !== "perspective") { throw new Error("Expected a perspective camera"); }
    expect(Math.asin(radius / distance)).toBeLessThanOrEqual((projection.fov * Math.PI) / 360);
    expect(projection.near).toBeLessThan(distance - radius);
    expect(projection.far).toBeGreaterThan(distance + radius);
  });

  it("retries a failed load and evicts the least recently used entry", async () => {
    const released: string[] = [];
    const cache = new BoundedPromiseCache<string>(2, (value) => { released.push(value); });
    let attempts = 0;
    const flaky = async (): Promise<string> => {
      attempts += 1;
      if (attempts === 1) { throw new Error("offline"); }
      return "loaded";
    };
    expect(await cache.get("a", flaky)).toBeNull();
    expect(await cache.get("a", flaky)).toBe("loaded");
    expect(await cache.get("a", flaky)).toBe("loaded");
    expect(attempts).toBe(2);
    await cache.get("b", async () => "b");
    await cache.get("a", async () => "unused");
    await cache.get("c", async () => "c");
    await Promise.resolve();
    expect(cache.size).toBe(2);
    expect(released).toEqual(["b"]);
    expect(await cache.get("a", async () => "reloaded")).toBe("loaded");
  });
});
