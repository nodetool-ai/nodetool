import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { modelFamily, type ModelFamily } from "../src/index.js";

const fixtures: ReadonlyArray<readonly [string, string, ModelFamily]> = [
  ["fal", "fal-ai/kling-video/o1/standard/image-to-video", "kling"],
  ["fal", "bytedance/seedance-2.0/image-to-video", "seedance"],
  ["fal", "fal-ai/veo3.1/fast/first-last-frame-to-video", "veo"],
  ["fal", "fal-ai/sora-2/image-to-video/pro", "sora"],
  ["kie", "kling-2.6/text-to-video", "kling"],
  ["kie", "hailuo/2-3-image-to-video-pro", "minimax"],
  ["replicate", "wan-video/wan2.6-i2v-flash", "wan"],
  ["replicate", "lightricks/ltx-video", "ltx"],
  ["replicate", "openai/sora-2", "sora"],
  ["higgsfield", "bytedance/seedance-2.5/reference-to-video", "seedance"],
  ["higgsfield", "minimax/h3/text-to-video", "minimax"],
  ["higgsfield", "lightricks/ltx-2.5/text-to-video/fast", "ltx"],
  ["atlascloud", "alibaba/wan-2.6/text-to-video", "wan"],
  ["atlascloud", "ltx-2.3-quality/text-to-video", "ltx"]
];
it.each(fixtures)("pins %s model %s to %s and excludes every other family", (provider, id, family) => {
  const source = readFileSync(new URL(`../../${provider}-nodes/src/${provider}-manifest.json`, import.meta.url), "utf8");
  expect(source).toContain(JSON.stringify(id));
  expect(modelFamily(id)).toBe(family);
  expect(modelFamily(id.toUpperCase())).toBe(family);
  for (const other of ["kling", "seedance", "veo", "wan", "sora", "minimax", "ltx", "local-wan", "default"]) {
    if (other !== family) { expect(modelFamily(id)).not.toBe(other); }
  }
});
it("recognizes every shipped Dreamina Seedance 2.x id", () => {
  const source = readFileSync(new URL("../../runtime/src/providers/dreamina-models.ts", import.meta.url), "utf8");
  const ids = [...source.matchAll(/"(dreamina_seedance_[^"]+)"/g)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) { expect(modelFamily(id)).toBe("seedance"); }
});
it.each(["kling-image", "kling-v2.1", "seedance-20", "veo-30", "wan-2.6/text-to-image", "wan-2.6/image-edit", "fal-ai/ltx23-trainer-v2/outpaint", "unknown", "seedream-4.5", "dreamina_seedance_400"])("rejects unrelated model %s", (id) => {
  expect(modelFamily(id)).toBeNull();
});
it("reserves explicit default and local-wan selectors", () => {
  expect(modelFamily("default")).toBe("default");
  expect(modelFamily("local-wan")).toBe("local-wan");
  expect(modelFamily("local-wan")).not.toBe("wan");
  expect(modelFamily("default-model")).toBeNull();
});

it.each([
  [
    "fal",
    "fal-ai/sam-3/3d-align"
  ],
  [
    "kie",
    "bytedance/seedream-v4-text-to-image"
  ],
  [
    "replicate",
    "logerzhu/ad-inpaint"
  ],
  [
    "higgsfield",
    "higgsfield-ai/soul/v2/standard"
  ],
  [
    "atlascloud",
    "openai/gpt-image-2.5-sunburst/text-to-image"
  ]
])("excludes unrelated shipped %s model %s", (provider, id) => {
  const source = readFileSync(new URL(`../../${provider}-nodes/src/${provider}-manifest.json`, import.meta.url), "utf8");
  expect(source).toContain(JSON.stringify(id));
  expect(modelFamily(id)).toBeNull();
});
