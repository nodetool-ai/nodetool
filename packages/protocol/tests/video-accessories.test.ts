import { describe, expect, it } from "vitest";
import {
  keyframeFrameIndex,
  readKeyframes,
  readShots,
  readVideoElements,
  tagElementMentions
} from "../src/video-accessories.js";

const image = (name: string) => ({ type: "image" as const, uri: `https://img/${name}.png` });

describe("readKeyframes", () => {
  it("flattens collected lists, drops unset images and sorts by time", () => {
    const keyframes = readKeyframes([
      [{ type: "keyframe", image: image("b"), time: 3 }],
      { type: "keyframe", image: { type: "image", uri: "" }, time: 1 },
      { type: "keyframe", image: image("a"), time: -2 }
    ]);
    expect(keyframes.map((k) => [k.image.uri, k.time])).toEqual([
      ["https://img/a.png", 0],
      ["https://img/b.png", 3]
    ]);
  });

  it("reads a JSON string", () => {
    expect(
      readKeyframes(JSON.stringify([{ image: image("a"), time: 1 }]))
    ).toHaveLength(1);
  });
});

describe("readVideoElements and readShots", () => {
  it("keeps elements with a frontal image or a video, in order", () => {
    const elements = readVideoElements([
      { name: " hero ", frontal_image: image("f"), reference_images: [image("r"), {}] },
      { name: "empty" },
      { video: { type: "video", uri: "https://vid/a.mp4" } }
    ]);
    expect(elements.map((e) => e.name)).toEqual(["hero", ""]);
    expect(elements[0].reference_images).toEqual([image("r")]);
  });

  it("keeps shots with a prompt", () => {
    expect(
      readShots([{ prompt: "a", duration: 3 }, { prompt: " ", duration: 2 }])
    ).toEqual([{ type: "shot", prompt: "a", duration: 3 }]);
  });
});

describe("keyframeFrameIndex", () => {
  it("rounds to the nearest frame inside the clip", () => {
    expect(keyframeFrameIndex(2.5, 24, 5)).toBe(60);
    expect(keyframeFrameIndex(9, 24, 5)).toBe(120);
  });
});

describe("tagElementMentions", () => {
  it("rewrites @name to @ElementN in list order, longest name first", () => {
    const elements = [{ name: "hero" }, { name: "hero2" }, { name: "" }];
    expect(
      tagElementMentions("@hero2 follows @Hero, then @heroic leaves", elements)
    ).toBe("@Element2 follows @Element1, then @heroic leaves");
  });
});
