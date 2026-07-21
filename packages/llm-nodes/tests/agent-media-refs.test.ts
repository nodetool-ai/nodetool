import { describe, it, expect } from "vitest";
// Import from source (not the package's stale dist) so the test exercises the
// current normalizeBinaryRef / buildUserMessage.
import {
  normalizeBinaryRef,
  buildUserMessage
} from "../src/nodes/agent-utils.js";

describe("normalizeBinaryRef", () => {
  it("returns null for non-objects", () => {
    expect(normalizeBinaryRef(null)).toBeNull();
    expect(normalizeBinaryRef("x")).toBeNull();
    expect(normalizeBinaryRef(42)).toBeNull();
  });

  it("keeps a uri-backed ref", () => {
    expect(normalizeBinaryRef({ uri: "https://x.com/a.png" })).toEqual({
      uri: "https://x.com/a.png"
    });
  });

  it("keeps a data-backed ref", () => {
    expect(normalizeBinaryRef({ data: "abc" })).toEqual({ data: "abc" });
  });

  it("encodes an asset_id-only ref (empty uri) as an asset:// uri", () => {
    expect(
      normalizeBinaryRef({
        type: "image",
        uri: "",
        data: null,
        asset_id: "asset-123"
      })
    ).toEqual({ uri: "asset://asset-123" });
  });

  it("prefers an explicit uri over asset_id", () => {
    expect(
      normalizeBinaryRef({ uri: "asset://real", asset_id: "asset-123" })
    ).toEqual({ uri: "asset://real" });
  });

  it("returns null when asset_id is null or empty and there is no uri/data", () => {
    expect(
      normalizeBinaryRef({ uri: "", data: null, asset_id: null })
    ).toBeNull();
    expect(normalizeBinaryRef({ asset_id: "" })).toBeNull();
  });
});

describe("buildUserMessage", () => {
  it("keeps an asset_id-only image as an image_url part with an asset:// uri", () => {
    const msg = buildUserMessage(
      "describe this",
      { type: "image", uri: "", data: null, asset_id: "asset-abc" },
      null
    );
    expect(msg.role).toBe("user");
    const parts = Array.isArray(msg.content) ? msg.content : [];
    const imagePart = parts.find(
      (p): p is { type: "image_url"; image: { uri?: string } } =>
        (p as { type?: string }).type === "image_url"
    );
    expect(imagePart?.image.uri).toBe("asset://asset-abc");
  });

  it("keeps an asset_id-only audio as an audio part with an asset:// uri", () => {
    const msg = buildUserMessage("transcribe", null, {
      type: "audio",
      uri: "",
      data: null,
      asset_id: "audio-xyz"
    });
    const parts = Array.isArray(msg.content) ? msg.content : [];
    const audioPart = parts.find(
      (p): p is { type: "audio"; audio: { uri?: string } } =>
        (p as { type?: string }).type === "audio"
    );
    expect(audioPart?.audio.uri).toBe("asset://audio-xyz");
  });
});
