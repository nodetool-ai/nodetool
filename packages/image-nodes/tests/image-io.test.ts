import { describe, it, expect } from "vitest";
import { toBase64Ref, base64ToBytes, bytesToBase64 } from "../src/nodes/image-io.js";

describe("toBase64Ref", () => {
  const png = new Uint8Array([1, 2, 3, 4]);

  it("produces a fresh image ref from the encoded bytes", () => {
    const ref = toBase64Ref(png);
    expect(ref.type).toBe("image");
    expect(base64ToBytes(ref.data as string)).toEqual(png);
  });

  it("drops the input's uri/asset_id so the output doesn't shadow its own data", () => {
    // Regression: a transform's output carried the *input* image's uri, and the
    // renderer (which prefers uri over data) showed the input, not the output.
    const ref = toBase64Ref(png, {
      type: "image",
      uri: "/api/storage/INPUT.png",
      asset_id: "INPUT",
      data: "stale-base64",
      mimeType: "image/x-raw-rgba",
      width: 9,
      height: 9
    });
    expect(ref.uri).toBeUndefined();
    expect(ref.asset_id).toBeUndefined();
    expect(ref.mimeType).toBeUndefined();
    expect(ref.width).toBeUndefined();
    expect(ref.height).toBeUndefined();
    expect(ref.data).toBe(bytesToBase64(png));
  });
});
