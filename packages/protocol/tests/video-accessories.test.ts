import { describe, expect, it } from "vitest";
import {
  keyframeFrameIndex,
  readKeyframes,
  readShots,
  readVideoElements,
  referenceMarkerStyle,
  tagElementMentions,
  tagReferenceNumbers
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

describe("referenceMarkerStyle", () => {
  it("picks the marker style per provider and model", () => {
    expect(referenceMarkerStyle("dreamina", "seedance-2.0")).toBe("bracket");
    expect(referenceMarkerStyle("kie", "kling-4.0/reference-to-video")).toBe("at_underscore");
    expect(referenceMarkerStyle("kie", "grok-imagine/image-to-video")).toBe("at");
    expect(referenceMarkerStyle("kie", "kling-3.0-omni/reference-to-video")).toBe("plain");
    expect(referenceMarkerStyle("kie", "happyhorse/reference-to-video")).toBe("character");
    expect(referenceMarkerStyle("kie", "happyhorse-1-1/reference-to-video")).toBe("character");
    expect(referenceMarkerStyle("fal", "alibaba/happy-horse/v1.1/reference-to-video")).toBe("character");
    expect(referenceMarkerStyle("comfy_cloud", "wan/happyhorse-1.1-r2v")).toBe("character");
    expect(tagReferenceNumbers("image 1 walks past image 2 in video 1, keep character3", "character")).toBe("character1 walks past character2 in video 1, keep character3");
    expect(referenceMarkerStyle("fal", "fal-ai/kling-video/o3/reference-to-video")).toBe("at_title");
    expect(referenceMarkerStyle("fal", "bytedance/seedance-2.0/reference-to-video")).toBe("at_title");
    expect(tagReferenceNumbers("put image 1 in video 2, keep @Image3", "at_title")).toBe("put @Image1 in @Video2, keep @Image3");
    expect(referenceMarkerStyle("fal", "fal-ai/veo3")).toBe("plain");
    // Comfy Router schema (wan__wan2.7-i2v.json) documents "Image 1" for
    // wan3.0 and no marker for wan2.7-r2v. Both stay plain, as do GPU ids and
    // unknown ids. HappyHorse is covered above.
    for (const id of [
      "wan/wan3.0-video",
      "wan/wan3.0-video-prime",
      "wan/wan2.7-r2v",
      "comfyui-gpu/wan2.2-r2v",
      "some/unknown-model"
    ]) {
      expect(referenceMarkerStyle("comfy_cloud", id)).toBe("plain");
    }
    expect(referenceMarkerStyle("gemini", "veo-3.1")).toBe("plain");
  });
});

describe("tagReferenceNumbers", () => {
  const prompt = "Image 1 walks past image 2 and Video 1 plays";
  it("leaves the plain style unchanged", () => {
    expect(tagReferenceNumbers(prompt, "plain")).toBe(prompt);
  });
  it("writes bracket markers", () => {
    expect(tagReferenceNumbers(prompt, "bracket")).toBe(
      "[Image 1] walks past [Image 2] and [Video 1] plays"
    );
  });
  it("writes at markers without a space", () => {
    expect(tagReferenceNumbers(prompt, "at")).toBe(
      "@image1 walks past @image2 and @video1 plays"
    );
  });
  it("writes at_underscore markers", () => {
    expect(tagReferenceNumbers(prompt, "at_underscore")).toBe(
      "@image_1 walks past @image_2 and @video_1 plays"
    );
  });
  it("does not rewrite styled markers twice", () => {
    expect(tagReferenceNumbers("[Image 2] and @image2", "bracket")).toBe("[Image 2] and @image2");
    expect(tagReferenceNumbers("[Image 2] and @image2", "at")).toBe("[Image 2] and @image2");
    expect(tagReferenceNumbers("@image_2 and @image2", "at_underscore")).toBe("@image_2 and @image2");
    expect(tagReferenceNumbers("@image_2", "bracket")).toBe("@image_2");
    const once = tagReferenceNumbers("image 3", "bracket");
    expect(tagReferenceNumbers(once, "bracket")).toBe(once);
  });
  it("does not match other words", () => {
    expect(tagReferenceNumbers("images 2, myimage 3, image 2x, image two", "bracket")).toBe(
      "images 2, myimage 3, image 2x, image two"
    );
  });
});
