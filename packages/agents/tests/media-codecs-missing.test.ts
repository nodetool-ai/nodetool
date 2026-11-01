import { describe, expect, it, vi } from "vitest";

// A lean install has no media-codecs runtime package. Loading the media
// module fails the way Node reports an absent package.
vi.mock("@nodetool-ai/runtime/media", () => {
  throw new Error("Cannot find package 'node-av' imported from /lean/node_modules/@nodetool-ai/runtime/dist/media/av.js");
});

describe("media capabilities without media-codecs", () => {
  it("load, so generation tools work without the codecs", async () => {
    const media = await import("../src/capabilities/media.js");
    expect(media).toBeDefined();
  });

  it("name the install command when an edit needs the codecs", async () => {
    const { importMediaEdit } = await import("../src/capabilities/media.js");
    await expect(importMediaEdit()).rejects.toThrow(/packs add media-codecs --yes/);
  });
});
