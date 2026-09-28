import { describe, expect, it } from "vitest";
import { InMemoryStorageAdapter, assetObjectKey } from "@nodetool-ai/storage";
import {
  getAssetFileName,
  normalizeAssetContentType,
  retrieveAssetBytes
} from "../src/lib/asset-paths.js";

describe("getAssetFileName", () => {
  it("maps image and audio types to their extensions", () => {
    expect(getAssetFileName("a1", "image/png")).toBe("a1.png");
    expect(getAssetFileName("a1", "audio/wav")).toBe("a1.wav");
  });

  it("maps glTF binary assets to .glb, not .bin", () => {
    expect(getAssetFileName("a1", "model/gltf-binary")).toBe("a1.glb");
  });

  it("maps glTF JSON assets to .gltf", () => {
    expect(getAssetFileName("a1", "model/gltf+json")).toBe("a1.gltf");
  });
});

describe("normalizeAssetContentType", () => {
  it("keeps a known content type", () => {
    expect(normalizeAssetContentType("image/png", "shot.png")).toBe("image/png");
    expect(
      normalizeAssetContentType("model/gltf-binary", "mesh.glb")
    ).toBe("model/gltf-binary");
  });

  it("infers model/gltf-binary from a .glb name when the type is generic", () => {
    expect(
      normalizeAssetContentType("application/octet-stream", "Duck.glb")
    ).toBe("model/gltf-binary");
    expect(normalizeAssetContentType("", "Mario.glb")).toBe("model/gltf-binary");
  });

  it("infers model/gltf+json from a .gltf name", () => {
    expect(
      normalizeAssetContentType("application/octet-stream", "scene.gltf")
    ).toBe("model/gltf+json");
  });

  it("infers image/svg+xml from a .svg name when the type is generic", () => {
    expect(
      normalizeAssetContentType("application/octet-stream", "logo.svg")
    ).toBe("image/svg+xml");
    expect(normalizeAssetContentType("", "icon.SVG")).toBe("image/svg+xml");
  });
});


describe("font asset retrieval", () => {
  it.each([
    ["font/ttf", "ttf"],
    ["font/otf", "otf"]
  ])("reads %s from its canonical extension and legacy .bin keys", async (contentType, extension) => {
    const adapter = new InMemoryStorageAdapter();
    const bytes = new Uint8Array([0, 1, 0, 0]);
    await adapter.store(assetObjectKey("player", `new-font.${extension}`), bytes, contentType);
    await adapter.store(assetObjectKey("player", "old-font.bin"), bytes, contentType);
    expect(getAssetFileName("new-font", contentType)).toBe(`new-font.${extension}`);
    expect(await retrieveAssetBytes(adapter, "player", "new-font", contentType)).toEqual(bytes);
    expect(await retrieveAssetBytes(adapter, "player", "old-font", contentType)).toEqual(bytes);
  });
});
