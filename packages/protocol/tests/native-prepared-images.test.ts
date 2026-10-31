import { describe, expect, it } from "vitest";
import { NATIVE_PREPARED_IMAGE_MAX_BYTES, nativePreparedImage, nativePreparedImageSource, nativePreparedModel } from "../src/native-game.js";
const source = { assetId: "0123456789abcdef0123456789abcdef", offset: 128, length: 512, digest: "a".repeat(64) };
describe("native prepared image provenance", () => {
  it("retains full manifest IDs, encoded byte ranges and their SHA256", () => {
    expect(nativePreparedImage.parse({ mimeType: "image/png", source })).toEqual({ mimeType: "image/png", source });
    expect(nativePreparedImage.safeParse({ mimeType: "image/jpeg", source: { ...source, offset: 0, length: NATIVE_PREPARED_IMAGE_MAX_BYTES } }).success).toBe(true);
    expect(nativePreparedImageSource.parse(source).assetId).toHaveLength(32);
  });
  it("rejects malformed ranges, unsafe numbers, noncanonical digests, paths and MIME types", () => {
    for (const patch of [{ offset: -1 }, { offset: .5 }, { offset: Number.MAX_SAFE_INTEGER + 1 }, { length: 0 }, { length: .5 }, { length: NATIVE_PREPARED_IMAGE_MAX_BYTES + 1 }, { offset: NATIVE_PREPARED_IMAGE_MAX_BYTES - 1, length: 2 }, { digest: "A".repeat(64) }, { digest: "a".repeat(63) }, { assetId: "../image.png" }, { uri: "https://example.com/image.png" }]) {
      expect(nativePreparedImageSource.safeParse({ ...source, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
    for (const mimeType of ["image/webp", "application/octet-stream", "image/jpg", ""]) { expect(nativePreparedImage.safeParse({ mimeType, source }).success).toBe(false); }
  });
  it("rejects expanded image byte arrays and preserves descriptor-only prepared-model responses", () => {
    expect(nativePreparedImage.safeParse({ mimeType: "image/png", bytes: [137, 80, 78, 71] }).success).toBe(false);
    expect(nativePreparedImage.safeParse({ mimeType: "image/png", source, bytes: [137] }).success).toBe(false);
    const model = { meshes: [], materials: [], images: [{ mimeType: "image/png", source }], nodes: [], roots: [], skins: [], animations: [], source: {} };
    expect(nativePreparedModel.parse(model).images).toEqual(model.images);
    expect(nativePreparedModel.safeParse({ ...model, images: [{ mimeType: "image/png", bytes: [137, 80] }] }).success).toBe(false);
  });
});
