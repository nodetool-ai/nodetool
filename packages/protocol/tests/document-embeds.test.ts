import { describe, expect, it } from "vitest";

import {
  embedKindFromContentType,
  embedKindFromSrc,
  parseShotEmbedSrc,
  shotEmbedSrc
} from "../src/document-embeds.js";

describe("document embeds", () => {
  it("round-trips a shot embed", () => {
    const src = shotEmbedSrc("board1", "shot 2");
    expect(src).toBe("storyboard://board1/shots/shot%202");
    expect(parseShotEmbedSrc(src)).toEqual({ storyboardId: "board1", shotId: "shot 2" });
  });

  it("rejects other sources as shots", () => {
    expect(parseShotEmbedSrc("asset://abc")).toBeNull();
    expect(parseShotEmbedSrc("storyboard://board1")).toBeNull();
    expect(parseShotEmbedSrc("storyboard://board1/shots/a/b")).toBeNull();
    expect(parseShotEmbedSrc("storyboard://board1/shots/%E0")).toBeNull();
  });

  it("types a source by its extension", () => {
    expect(embedKindFromSrc("assets/cover.PNG")).toBe("image");
    expect(embedKindFromSrc("https://example.com/clip.mp4?x=1")).toBe("video");
    expect(embedKindFromSrc("../audio/voice.m4a#t=3")).toBe("audio");
    expect(embedKindFromSrc("robot.glb")).toBe("model3d");
    expect(embedKindFromSrc("data:video/webm;base64,AAAA")).toBe("video");
    expect(embedKindFromSrc("asset://0123456789abcdef0123456789abcdef")).toBeNull();
    expect(embedKindFromSrc("notes.pdf")).toBeNull();
  });

  it("types a content type", () => {
    expect(embedKindFromContentType("image/webp")).toBe("image");
    expect(embedKindFromContentType("audio/mpeg; codecs=mp3")).toBe("audio");
    expect(embedKindFromContentType("model/gltf-binary")).toBe("model3d");
    expect(embedKindFromContentType("application/pdf")).toBeNull();
    expect(embedKindFromContentType(undefined)).toBeNull();
  });
});
