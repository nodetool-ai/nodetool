import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { collect, MANIFESTS } from "../generate-model-directory.mjs";

const root = new URL("../../../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const directory = collect();

function kindsFor(provider, id) {
  return [
    ...directory.kinds.filter(group => group.providers.some(candidate =>
      candidate.provider === provider && candidate.models.some(model => model.id === id)))
      .map(group => group.kind),
    ...directory.canonicalModels.filter(model => model.routes.some(route =>
      route.provider === provider && route.id === id)).map(model => model.kind)
  ];
}

test("lists Dreamina's static instrumental model through its delegated factory", () => {
  assert.ok(kindsFor("dreamina", "instrumental").includes("audio"));
  const audio = directory.kinds.find(group => group.kind === "audio");
  assert.ok(audio);
  assert.ok(!audio.liveProviders.includes("dreamina"));
  assert.deepEqual(audio.providers.find(provider => provider.provider === "dreamina")?.models, [
    { id: "instrumental", name: "Dreamina Instrumental" }
  ]);
});

test("uses declared Fal modalities for structured and untyped outputs", () => {
  const manifest = readJson("packages/fal-nodes/src/fal-manifest.json");
  const cases = [
    ["fal-ai/whisper", "speech_to_text", "transcription"],
    ["fal-ai/demucs", "audio_to_audio", "audio"],
    ["fal-ai/hunyuan-part", "3d_to_3d", "3d"],
    ["bria/reimagine/3.2", "image_to_image", "image"],
    ["bria/ad-delayer", "image_to_json", "language"]
  ];
  for (const [id, modality, kind] of cases) {
    const source = manifest.find(model => model.endpointId === id);
    assert.ok(source, `Missing source fixture ${id}`);
    assert.equal(source.moduleName, modality);
    assert.deepEqual(kindsFor("fal_ai", id), [kind], id);
  }
});

test("retains every declared manifest id, including all any-output endpoints", () => {
  let inspected = 0;
  for (const { id: provider, manifest } of MANIFESTS) {
    const source = readJson(manifest);
    assert.ok(source.length > 0, manifest);
    for (const model of source) {
      const id = model.modelId ?? model.endpointId;
      assert.ok(id, `Missing manifest id in ${manifest}`);
      assert.ok(kindsFor(provider, id).length > 0, `${provider}:${id}`);
      inspected++;
    }
  }
  assert.ok(inspected > 0);
});

test("preserves every ranked provider route in its canonical group", () => {
  const rankings = readJson("packages/model-pricing/src/generated/model-rankings.json").models;
  const routes = directory.canonicalModels.flatMap(model =>
    model.routes.map(route => `${route.provider}:${route.id}`));
  assert.equal(new Set(routes).size, routes.length);
  assert.deepEqual([...routes].sort(), Object.keys(rankings).sort());
});

for (const [provider, manifestPath, id] of [
  ["fal_ai", "packages/fal-nodes/src/fal-manifest.json", "fal-ai/thinksound/audio"],
  ["replicate", "packages/replicate-nodes/src/replicate-manifest.json", "minimax/music-01"]
]) {
  test(`preserves the concrete audio output of ${provider}:${id}`, () => {
    const manifest = readJson(manifestPath);
    const source = manifest.find(model => (model.modelId ?? model.endpointId) === id);
    assert.ok(source, `Missing source fixture ${id}`);
    assert.equal(source.outputType, "audio");
    assert.ok(["video_to_video", "video-generate"].includes(source.moduleName));
    assert.deepEqual(kindsFor(provider, id), ["audio"]);
  });
}

test("keeps training and ambiguous structured endpoints in the explicit Other group", () => {
  const manifest = readJson("packages/fal-nodes/src/fal-manifest.json");
  for (const [id, moduleName, outputType] of [
    ["fal-ai/ltx2-video-trainer", "training", "video"],
    ["fal-ai/ffmpeg-api/metadata", "json_processing", "any"],
    ["fal-ai/qwen-3-tts/clone-voice/1.7b", "unknown", "any"]
  ]) {
    const source = manifest.find(model => model.endpointId === id);
    assert.ok(source, `Missing source fixture ${id}`);
    assert.equal(source.moduleName, moduleName);
    assert.equal(source.outputType, outputType);
    assert.deepEqual(kindsFor("fal_ai", id), ["other"]);
  }
});
