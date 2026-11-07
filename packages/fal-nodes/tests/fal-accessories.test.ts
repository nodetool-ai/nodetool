import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import type { FalManifestEntry } from "../src/fal-factory.js";

const assetToFalUrl = vi.fn(
  async (ref: Record<string, unknown>, _context?: unknown) =>
    ref.uri ? `uploaded:${String(ref.uri)}` : null
);
const endpointCall = vi.fn(async () => ({ video: { url: "https://fal/out.mp4" } }));

vi.mock("../src/fal-base.js", () => ({
  assetToFalUrl,
  falImageToRef: (image: Record<string, unknown>) => ({
    type: "image",
    uri: image.url
  }),
  callFalEndpoint: async (
    _context: unknown,
    request: { endpoint: string; args: Record<string, unknown> }
  ) => ({
    data: await endpointCall(request.endpoint, request.args),
    requestId: "req-test"
  }),
  falCapabilityForOutputType: () => "image_to_video",
  imageToDataUrl: async () => null,
  isRefSet: (ref: unknown) =>
    Boolean(ref && typeof ref === "object" && (ref as { uri?: string }).uri),
  removeNulls: (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      if (obj[key] == null || obj[key] === "") delete obj[key];
    }
  }
}));

const { createFalNodeClass } = await import("../src/fal-factory.js");

const manifest = JSON.parse(
  readFileSync(new URL("../src/fal-manifest.json", import.meta.url), "utf-8")
) as FalManifestEntry[];

function nodeFor(className: string, properties: Record<string, unknown>) {
  const spec = manifest.find((entry) => entry.className === className);
  if (!spec) throw new Error(`${className} is not in the manifest`);
  const NodeClass = createFalNodeClass(spec);
  const node = new NodeClass({});
  Object.assign(node, properties);
  return { node, NodeClass };
}

const image = (name: string) => ({ type: "image", uri: `https://img/${name}.png` });
const keyframe = (name: string, time: number) => ({
  type: "keyframe",
  image: image(name),
  time
});

function sentArgs(): Record<string, unknown> {
  const call = endpointCall.mock.calls.at(-1) as unknown as [
    string,
    Record<string, unknown>
  ];
  return call[1];
}

describe("fal keyframes", () => {
  beforeEach(() => {
    endpointCall.mockClear();
    assetToFalUrl.mockClear();
  });

  it("declares the keyframes input as a keyframe list handle", () => {
    const { NodeClass } = nodeFor("Flux3KeyframesToVideo", {});
    const metadata = getNodeMetadata(NodeClass);
    const property = metadata.properties.find((p) => p.name === "keyframes");
    expect(property?.type).toMatchObject({
      type: "list",
      type_args: [{ type: "keyframe" }]
    });
    expect(metadata.input_fields).toContain("keyframes");
  });

  it("uploads keyframe images and converts seconds to 24 fps frames, in time order", async () => {
    const { node } = nodeFor("Flux3KeyframesToVideo", {
      prompt: "a walk",
      duration: 5,
      // A collected list input can arrive nested and out of order.
      keyframes: [[keyframe("end", 5)], keyframe("start", 0), keyframe("mid", 2.5)]
    });
    await node.process();
    expect(sentArgs().keyframes).toEqual([
      { image_url: "uploaded:https://img/start.png", frame_index: 0 },
      { image_url: "uploaded:https://img/mid.png", frame_index: 60 },
      { image_url: "uploaded:https://img/end.png", frame_index: 120 }
    ]);
  });

  it("refuses two keyframes on the same frame", async () => {
    const { node } = nodeFor("Flux3KeyframesToVideo", {
      prompt: "a walk",
      duration: 5,
      keyframes: [keyframe("a", 6), keyframe("b", 9)]
    });
    await expect(node.process()).rejects.toThrow(/same frame/);
    expect(endpointCall).not.toHaveBeenCalled();
  });

  it("refuses a run with no keyframes", async () => {
    const { node } = nodeFor("Flux3KeyframesToVideo", {
      prompt: "a walk",
      keyframes: []
    });
    await expect(node.process()).rejects.toThrow(/at least one Keyframe/);
  });
});

describe("fal Kling elements and shots", () => {
  beforeEach(() => {
    endpointCall.mockClear();
  });

  const element = (name: string) => ({
    type: "video_element",
    name,
    frontal_image: image(`${name}-front`),
    reference_images: [image(`${name}-side`)],
    video: null,
    voice_id: ""
  });

  it("uploads elements and rewrites @name mentions to @ElementN", async () => {
    const { node, NodeClass } = nodeFor("KlingVideoV3ProImageToVideo", {
      prompt: "@hero waves at @dog",
      start_image: image("start"),
      elements: [element("hero"), element("dog")]
    });
    expect(getNodeMetadata(NodeClass).input_fields).toContain("elements");
    await node.process();
    const args = sentArgs();
    expect(args.prompt).toBe("@Element1 waves at @Element2");
    expect(args.elements).toEqual([
      {
        frontal_image_url: "uploaded:https://img/hero-front.png",
        reference_image_urls: ["uploaded:https://img/hero-side.png"]
      },
      {
        frontal_image_url: "uploaded:https://img/dog-front.png",
        reference_image_urls: ["uploaded:https://img/dog-side.png"]
      }
    ]);
  });

  it("sends shots instead of the prompt and sets the clip to their total length", async () => {
    const { node } = nodeFor("KlingVideoV3ProImageToVideo", {
      prompt: "ignored",
      start_image: image("start"),
      elements: [element("hero")],
      multi_prompt: [
        { type: "shot", prompt: "@hero enters", duration: 3 },
        { type: "shot", prompt: "@hero sits", duration: 4.4 }
      ]
    });
    await node.process();
    const args = sentArgs();
    expect(args.prompt).toBeUndefined();
    expect(args.multi_prompt).toEqual([
      { prompt: "@Element1 enters", duration: "3" },
      { prompt: "@Element1 sits", duration: "4" }
    ]);
    expect(args.duration).toBe("7");
    expect(args.shot_type).toBe("customize");
  });

  it("refuses shots that add up to a length the model cannot make", async () => {
    const { node } = nodeFor("KlingVideoV3ProImageToVideo", {
      start_image: image("start"),
      multi_prompt: [
        { type: "shot", prompt: "one", duration: 10 },
        { type: "shot", prompt: "two", duration: 10 }
      ]
    });
    await expect(node.process()).rejects.toThrow(/add up to 20 s/);
  });
});
