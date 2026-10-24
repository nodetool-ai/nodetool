import { describe, expect, it } from "vitest";
import {
  ElementNode,
  KeyframeNode,
  ShotNode
} from "../src/nodes/accessories.js";

const image = (name: string) => ({ type: "image" as const, uri: `https://img/${name}.png` });
const emptyImage = { type: "image" as const, uri: "", asset_id: null, data: null };
const emptyVideo = { type: "video" as const, uri: "", asset_id: null, data: null };

describe("Keyframe", () => {
  it("outputs the image at its time", async () => {
    const node = new KeyframeNode({});
    node.assign({ image: image("a"), time: 2.5 });
    await expect(node.process()).resolves.toEqual({
      output: { type: "keyframe", image: image("a"), time: 2.5 }
    });
  });
});

describe("Element", () => {
  it("keeps the frontal image and at most three reference views", async () => {
    const node = new ElementNode({});
    node.assign({
      name: "hero",
      frontal_image: image("front"),
      reference_images: [image("1"), image("2"), image("3"), image("4")],
      video: emptyVideo,
      entity: null
    });
    const { output } = await node.process();
    expect(output.name).toBe("hero");
    expect(output.frontal_image).toEqual(image("front"));
    expect(output.reference_images).toEqual([image("1"), image("2"), image("3")]);
    expect(output.video).toBeNull();
  });

  it("fills an empty element from an entity's images, name and voice", async () => {
    const node = new ElementNode({});
    node.assign({
      name: "",
      frontal_image: emptyImage,
      reference_images: [],
      video: emptyVideo,
      entity: {
        type: "entity",
        id: "",
        kind: "character",
        name: "Mara",
        descriptor: "a tall courier",
        reference_images: [image("mara-front"), image("mara-side")],
        voice_id: "voice-1"
      }
    });
    const { output } = await node.process();
    expect(output).toMatchObject({
      name: "Mara",
      frontal_image: image("mara-front"),
      reference_images: [image("mara-side")],
      voice_id: "voice-1"
    });
  });

  it("refuses an element with nothing to show", async () => {
    const node = new ElementNode({});
    node.assign({
      frontal_image: emptyImage,
      reference_images: [],
      video: emptyVideo,
      entity: null
    });
    await expect(node.process()).rejects.toThrow(/frontal image, a video/);
  });
});

describe("Shot", () => {
  it("appends itself to the shots before it", async () => {
    const node = new ShotNode({});
    node.assign({
      previous: [{ type: "shot", prompt: "first", duration: 3 }],
      prompt: "second",
      duration: 4
    });
    await expect(node.process()).resolves.toEqual({
      output: [
        { type: "shot", prompt: "first", duration: 3 },
        { type: "shot", prompt: "second", duration: 4 }
      ]
    });
  });

  it("refuses an empty prompt", async () => {
    const node = new ShotNode({});
    node.assign({ previous: [], prompt: "  ", duration: 4 });
    await expect(node.process()).rejects.toThrow(/needs a prompt/);
  });
});
