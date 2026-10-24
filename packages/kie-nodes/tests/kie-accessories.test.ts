import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createKieNodeClass } from "../src/kie-factory.js";
import type { KieManifestEntry } from "../src/kie-factory.js";

vi.mock("../src/kie-base.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/kie-base.js")>();
  return {
    ...actual,
    getApiKey: () => "test-key",
    kieExecuteTask: vi.fn(async () => ({
      data: Buffer.from("video").toString("base64"),
      items: [Buffer.from("video").toString("base64")],
      taskId: "task"
    })),
    uploadImageInput: vi.fn(
      async (_key: string, ref: { uri: string }) => `kie:${ref.uri}`
    ),
    uploadVideoInput: vi.fn(
      async (_key: string, ref: { uri: string }) => `kie:${ref.uri}`
    )
  };
});

import { kieExecuteTask } from "../src/kie-base.js";

const manifest = JSON.parse(
  readFileSync(new URL("../src/kie-manifest.json", import.meta.url), "utf-8")
) as KieManifestEntry[];

const image = (name: string) => ({ type: "image", uri: `https://img/${name}.png` });

function run(className: string, properties: Record<string, unknown>) {
  const spec = manifest.find((entry) => entry.className === className);
  if (!spec) throw new Error(`${className} is not in the manifest`);
  const NodeClass = createKieNodeClass(spec);
  const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
  Object.assign(node, properties);
  node.setDynamic("_secrets", { KIE_API_KEY: "test" });
  return node.process();
}

function sentInput(): Record<string, unknown> {
  const call = vi.mocked(kieExecuteTask).mock.calls.at(-1)!;
  return call[2];
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
          video: { type: "video", uri: "https://vid/dog.mp4" },
          voice_id: ""
        }
      ]
    });
    expect(sentInput().kling_elements).toEqual([
      {
        name: "hero",
        description: "hero",
        element_input_urls: ["kie:https://img/front.png", "kie:https://img/side.png"]
      },
      {
        name: "Element2",
        description: "Element2",
        element_input_urls: ["kie:https://vid/dog.mp4"]
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
