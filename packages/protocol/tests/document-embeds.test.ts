import { describe, expect, it } from "vitest";

import {
  embedKindFromContentType,
  embedKindFromSrc,
  parseResourceEmbedSrc,
  resourceEmbedSrc
} from "../src/document-embeds.js";

describe("document embeds", () => {
  it("round-trips shot, timeline and script embeds", () => {
    const shot = { kind: "shot", storyboardId: "board1", shotId: "s2" } as const;
    expect(resourceEmbedSrc(shot)).toBe("storyboard://board1#shot=s2");
    expect(parseResourceEmbedSrc("storyboard://board1#shot=s2")).toEqual(shot);
    expect(resourceEmbedSrc({ kind: "timeline", timelineId: "tl1" })).toBe("timeline://tl1");
    expect(parseResourceEmbedSrc(" timeline://tl1 ")).toEqual({ kind: "timeline", timelineId: "tl1" });
    expect(resourceEmbedSrc({ kind: "script", scriptId: "sc1" })).toBe("script://sc1");
    expect(parseResourceEmbedSrc("script://sc1")).toEqual({ kind: "script", scriptId: "sc1" });
  });

  it("rejects media and documents it cannot embed", () => {
    expect(parseResourceEmbedSrc("asset://abc")).toBeNull();
    expect(parseResourceEmbedSrc("assets/clip.mp4")).toBeNull();
    expect(parseResourceEmbedSrc("storyboard://board1")).toBeNull();
    expect(parseResourceEmbedSrc("storyboard://board1#clip=c1")).toBeNull();
    expect(parseResourceEmbedSrc("timeline://tl1#clip=c1")).toBeNull();
    expect(parseResourceEmbedSrc("sketch://sk1")).toBeNull();
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
