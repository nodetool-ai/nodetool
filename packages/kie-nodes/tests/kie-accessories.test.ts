import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createKieNodeClass } from "../src/kie-factory.js";
import type { KieManifestEntry } from "../src/kie-factory.js";
import { scriptedKie } from "./scripted-kie.js";

const manifest = JSON.parse(
  readFileSync(new URL("../src/kie-manifest.json", import.meta.url), "utf-8")
) as KieManifestEntry[];

// Inline bytes, so every element medium goes through the provider's upload.
const media = (type: "image" | "video", name: string) => ({
  type,
  uri: "",
  data: new TextEncoder().encode(name)
});
const image = (name: string) => media("image", name);

let lastInput: Record<string, unknown> = {};

async function run(className: string, properties: Record<string, unknown>) {
  const spec = manifest.find((entry) => entry.className === className);
  if (!spec) throw new Error(`${className} is not in the manifest`);
  const NodeClass = createKieNodeClass(spec);
  const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
  Object.assign(node, properties);
  // Name each upload after the bytes it carried.
  const kie = scriptedKie({
    uploadUrl: (upload) => `kie:${new TextDecoder().decode(upload.bytes)}`
  });
  await node.process(kie.context);
  lastInput = kie.provider.endpointCalls.at(-1)!.input;
}

function sentInput(): Record<string, unknown> {
  return lastInput;
}

describe("KIE Kling 3.0 elements and shots", () => {
  it("sends elements as named element_input_urls lists", async () => {
    await run("Kling30", {
      prompt: "@hero walks in",
      duration: "5",
      kling_elements: [
        {
          type: "video_element",
          name: "hero",
          frontal_image: image("front"),
          reference_images: [image("side")],
          video: null,
          voice_id: ""
        },
        {
          type: "video_element",
          name: "",
          frontal_image: null,
          reference_images: [],
          video: media("video", "dog"),
          voice_id: ""
        }
      ]
    });
    expect(sentInput().kling_elements).toEqual([
      {
        name: "hero",
        description: "hero",
        element_input_urls: ["kie:front", "kie:side"]
      },
      {
        name: "Element2",
        description: "Element2",
        element_input_urls: ["kie:dog"]
      }
    ]);
  });

  it("turns on multi-shot mode and sets the duration to the shots' total", async () => {
    await run("Kling30", {
      prompt: "a story",
      multi_prompt: [
        [{ type: "shot", prompt: "one", duration: 2 }],
        { type: "shot", prompt: "two", duration: 4 }
      ]
    });
    const input = sentInput();
    expect(input.multi_prompt).toEqual([
      { prompt: "one", duration: 2 },
      { prompt: "two", duration: 4 }
    ]);
    expect(input.multi_shots).toBe(true);
    expect(input.duration).toBe("6");
  });

  it("uses the Omni switches and an integer duration", async () => {
    await run("Kling30OmniTextToVideo", {
      prompt: "a story",
      multi_prompt: [
        { type: "shot", prompt: "one", duration: 3 },
        { type: "shot", prompt: "two", duration: 5 }
      ]
    });
    const input = sentInput();
    expect(input.customize_multi_shots).toBe(true);
    expect(input.prefer_multi_shots).toBe(false);
    expect(input.duration).toBe(8);
  });
});
