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

// The WanGP v19.02 registry (616e605). Wan2GP model ids are its `defaults/`
// file stems, which the `wangp` provider reports unchanged. `wan` keeps the
// legacy fun_camera id from 362c3467.
const wan2gp = JSON.parse(readFileSync(new URL("./wan2gp-models.json", import.meta.url), "utf8")) as {
  wan: string[];
  excluded: string[];
  video: ReadonlyArray<{ model_type: string; family: string; name: string }>;
};
it.each(wan2gp.wan)("maps bare Wan2GP model %s exactly to local-wan", (id) => {
  expect(modelFamily(id)).toBe("local-wan");
  expect(modelFamily(id.toUpperCase())).toBe("local-wan");
  expect(modelFamily(id)).not.toBe("wan");
  for (const neighbor of [`prefix_${id}`, `${id}_next`, `${id}/route`, `${id}.1`, `wangp/${id}`]) {
    expect(modelFamily(neighbor)).not.toBe("local-wan");
  }
});
it.each(wan2gp.excluded)("does not claim non-Wan defaults model %s", (id) => {
  expect(modelFamily(id)).not.toBe("local-wan");
});
it.each(["t2v_2_3", "i2v_2_3", "ti2v_2_3_fastwan", "t2v_13B", "fun_camera_13B"])("leaves unlisted Wan neighbors %s unclaimed", (id) => {
  expect(modelFamily(id)).toBeNull();
});

// The video models of WanGP v19.02 and the family each one compiles to.
const WAN2GP_FAMILY: Readonly<Record<string, ModelFamily | null>> = {
  wan: "local-wan",
  wan2_2: "local-wan",
  ltx2: "ltx",
  minimax_h3: "minimax"
};
// Wan2GP files these under a family whose prompting the NodeTool family does
// not cover. They compile with default wording and a warning.
const WAN2GP_EXCEPTIONS: Readonly<Record<string, ModelFamily | null>> = {
  // LTX-2 finetunes and LTX-Video 0.9, named without the `ltx2` line marker.
  joyai_echo: null,
  joyai_echo_surgical: null,
  ltxv_13B: null,
  ltxv_distilled: null,
  // Viggle's character animator, built on H3 but prompted as an animator.
  viggle_animate: null
};

it("reads the recorded WanGP v19.02 video registry", () => {
  expect(wan2gp.video.length).toBe(173);
  expect(wan2gp.video.filter((model) => WAN2GP_FAMILY[model.family] === "local-wan").map((model) => model.model_type))
    .toEqual(expect.arrayContaining(["t2v_2_2", "i2v_2_2", "ti2v_2_2_fastwan", "uni3c", "prism", "vace_14B"]));
});

it.each(wan2gp.video.map((model) => [model.model_type, model.family] as const))(
  "maps Wan2GP model %s (family %s)",
  (modelType, family) => {
    const expected = Object.hasOwn(WAN2GP_EXCEPTIONS, modelType)
      ? WAN2GP_EXCEPTIONS[modelType]
      : (WAN2GP_FAMILY[family] ?? null);
    expect(modelFamily(modelType)).toBe(expected);
  }
);

it("keeps hosted MiniMax and Hailuo routes on minimax and local H3 off Wan", () => {
  for (const id of ["minimax/h3/text-to-video", "minimax-h3/image-to-video", "hailuo/2-3-image-to-video-pro", "minimax/video-01", "t2v-01-director"]) {
    expect(modelFamily(id)).toBe("minimax");
  }
  expect(modelFamily("minimax_h3_fl2va_pruned")).toBe("minimax");
  expect(modelFamily("minimax_h3_fl2va_pruned")).not.toBe("local-wan");
  expect(modelFamily("minimax_h30")).toBeNull();
  expect(modelFamily("minimax_h3.5")).toBeNull();
});

it("matches Wan2GP ids exactly, not as prefixes or substrings", () => {
  expect(modelFamily("T2V_2_2")).toBe("local-wan");
  for (const id of ["t2v_2_2_custom_finetune", "my_t2v_2_2", "fal-ai/t2v", "t2v-01", "animate-anything"]) {
    expect(modelFamily(id)).not.toBe("local-wan");
  }
});

it("claims no shipped hosted model id for the local Wan2GP families", () => {
  const local = new Set(wan2gp.video.map((model) => model.model_type.toLowerCase()));
  let checked = 0;
  for (const provider of ["fal", "kie", "replicate", "higgsfield", "atlascloud", "together", "topaz"]) {
    const source = readFileSync(new URL(`../../${provider}-nodes/src/${provider}-manifest.json`, import.meta.url), "utf8");
    for (const [, id] of source.matchAll(/"(?:endpointId|modelId|model_id|model|id|endpoint)"\s*:\s*"([^"]+)"/g)) {
      checked += 1;
      expect(local.has(id.toLowerCase())).toBe(false);
      expect(modelFamily(id)).not.toBe("local-wan");
    }
  }
  expect(checked).toBeGreaterThan(100);
});
