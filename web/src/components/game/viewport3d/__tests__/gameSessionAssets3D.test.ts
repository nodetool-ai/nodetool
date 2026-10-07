import { gameDocument3D } from "@nodetool-ai/protocol";
import { asResolvedMediaUrl, resolveMediaUri } from "../../../../utils/resolveMediaUri";
import { readGameAssetBytes3D } from "../gameSessionAssets3D";

jest.mock("../../../../utils/resolveMediaUri", () => ({
  ...jest.requireActual<typeof import("../../../../utils/resolveMediaUri")>("../../../../utils/resolveMediaUri"),
  resolveMediaUri: jest.fn()
}));

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

function document(assetId: string) {
  return gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "assets",
    revision: "saved", entrySceneId: "level", tickRate: 60, inputActions: [],
    presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 },
    assets: { model: { mediaKind: "model", assetId, digest: "0".repeat(64), required: true,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, nodeIds: ["root"], clipIds: [],
      geometryBytes: 1, textureBytes: 0, triangles: 1 } },
    scenes: [{ id: "level", name: "Level", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
    ] }] });
}

it("resolves the captured binding and shares only bytes for the same binding", async () => {
  const cache = new Map<string, Uint8Array>();
  jest.mocked(resolveMediaUri).mockImplementation(async (uri) => asResolvedMediaUrl(`https://owned.example/${typeof uri === "string" ? uri.slice(8) : ""}`) ?? "");
  global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }) as Response);
  const first = document("a".repeat(32));
  const signal = new AbortController().signal;
  const bytes = await readGameAssetBytes3D(first, "model", signal, cache);
  expect(await readGameAssetBytes3D(first, "model", signal, cache)).toBe(bytes);
  await readGameAssetBytes3D(document("b".repeat(32)), "model", signal, cache);
  expect(resolveMediaUri).toHaveBeenNthCalledWith(1, `asset://${"a".repeat(32)}`);
  expect(resolveMediaUri).toHaveBeenNthCalledWith(2, `asset://${"b".repeat(32)}`);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(cache.size).toBe(2);
});

it("does not fetch or populate the cache after asset URL preparation is aborted", async () => {
  let resolve: (url: Awaited<ReturnType<typeof resolveMediaUri>>) => void = jest.fn();
  jest.mocked(resolveMediaUri).mockImplementation(() => new Promise((release) => { resolve = release; }));
  global.fetch = jest.fn();
  const controller = new AbortController();
  const cache = new Map<string, Uint8Array>();
  const read = readGameAssetBytes3D(document("a".repeat(32)), "model", controller.signal, cache);
  controller.abort();
  resolve(asResolvedMediaUrl("https://owned.example/model.glb") ?? "");
  await expect(read).rejects.toMatchObject({ name: "AbortError" });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(cache.size).toBe(0);
});
