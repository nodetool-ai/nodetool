import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { resolveModelBytes } from "../src/model-bytes.js";

const ASSET_ID = "7a5835f86af44d878e875730d37b05ca";
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

/** A context whose only byte source is the asset resolver. */
function assetContext(): ProcessingContext {
  return {
    storage: { retrieve: async () => null },
    resolveAssetBytes: async (uri: string) => ({
      bytes: uri === `asset://${ASSET_ID}` ? GLB : null,
      attempts: []
    })
  } as unknown as ProcessingContext;
}

describe("resolveModelBytes", () => {
  it("resolves an asset:// uri, the shape the Model 3D constant stores", async () => {
    const bytes = await resolveModelBytes(
      { uri: `asset://${ASSET_ID}`, asset_id: ASSET_ID },
      assetContext()
    );
    expect(bytes).toEqual(GLB);
  });

  it("resolves a ref that carries only an asset_id", async () => {
    const bytes = await resolveModelBytes({ asset_id: ASSET_ID }, assetContext());
    expect(bytes).toEqual(GLB);
  });

  it("prefers inline base64 data", async () => {
    const bytes = await resolveModelBytes({ data: "Z2xURg==" });
    expect(bytes).toEqual(GLB);
  });

  it("returns empty bytes for an empty ref", async () => {
    expect(await resolveModelBytes({})).toHaveLength(0);
    expect(await resolveModelBytes(null)).toHaveLength(0);
  });
});
