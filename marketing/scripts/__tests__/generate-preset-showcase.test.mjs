// Run: node --test marketing/scripts/__tests__/generate-preset-showcase.test.mjs
//
// The showcase data is built from run records that hold local paths and
// Dreamina credits. These tests pin that none of that reaches the generated
// file, and that --check fails on drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { buildShowcase, renderModule } from "../generate-preset-showcase.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "..", "generate-preset-showcase.mjs");
const GENERATED = resolve(
  __dirname,
  "../../src/data/presetShowcase.generated.ts"
);

const PREVIEW =
  "https://example.supabase.co/storage/v1/object/public/preset-previews/presets";
const HASH = "a".repeat(64);

function node(type, data = {}) {
  return { id: type, type, data };
}

/** A presets directory with one camera preset, one restyle and one studio. */
function fixture({ runExtra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "preset-showcase-"));
  for (const kind of ["camera", "effect", "look", "studio"]) {
    mkdirSync(join(dir, "catalog", kind), { recursive: true });
  }
  mkdirSync(join(dir, "runs"));
  const put = (file, value) => writeFileSync(join(dir, file), JSON.stringify(value));
  put("catalog/camera/camera.arc.json", {
    id: "camera.arc",
    kind: "camera",
    name: "arc",
    description: "Camera arcs.",
    slot: "move",
    preview: {
      url: `${PREVIEW}/camera.arc/${HASH}.mp4`,
      poster: `${PREVIEW}/camera.arc/${HASH}.png`,
      run: "runs/camera.arc.json"
    }
  });
  put("catalog/effect/effect.restyle-clay.json", {
    id: "effect.restyle-clay",
    kind: "effect",
    name: "Clay restyle",
    description: "Restyle as clay.",
    slot: "effect",
    preview: {
      url: `${PREVIEW}/effect.restyle-clay/${HASH}.mp4`,
      poster: `${PREVIEW}/effect.restyle-clay/${HASH}.png`,
      run: "runs/effect.restyle-clay.json"
    }
  });
  put("catalog/studio/studio.trailer.json", {
    id: "studio.trailer",
    kind: "studio",
    name: "Trailer",
    description: "A studio.",
    preset_ids: ["camera.arc"]
  });
  const base = {
    version: 1,
    status: "completed",
    provider: "dreamina",
    model: "dreamina_seedance_45_pro_draft",
    seed: 1,
    prompt: "A secret prompt at /home/someone/prompt.txt",
    credits: 12,
    cost_usd: 0.5,
    output_path: "/home/someone/.cache/arc.mp4",
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:01:00.000Z",
    ...runExtra
  };
  put("runs/camera.arc.json", {
    ...base,
    id: "camera.arc",
    workflow: {
      nodes: [
        node("nodetool.video.ImageToVideo", { resolution: "480p", duration: 4 })
      ]
    }
  });
  put("runs/effect.restyle-clay.json", {
    ...base,
    id: "effect.restyle-clay",
    source_url: `${PREVIEW}/camera.arc/${HASH}.mp4`,
    workflow: {
      nodes: [
        node("nodetool.video.ReferenceToVideo", { resolution: "480p" })
      ]
    }
  });
  return dir;
}

test("builds an entry for each preset with a preview and skips studios", () => {
  const dir = fixture();
  try {
    const entries = buildShowcase(dir);
    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["camera.arc", "effect.restyle-clay"]
    );
    assert.equal(entries[0].mode, "image_to_video");
    assert.equal(entries[0].resolution, "480p");
    assert.equal(entries[0].sourcePreset, null);
    assert.equal(entries[1].mode, "reference_to_video");
    assert.equal(entries[1].sourcePreset, "camera.arc");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run-record fields outside the allow-list never reach the output", () => {
  const dir = fixture();
  try {
    const output = renderModule(buildShowcase(dir));
    for (const leak of [
      "/home/",
      "someone",
      "credits",
      "cost_usd",
      "output_path",
      "secret prompt",
      "started_at"
    ]) {
      assert.ok(!output.includes(leak), `output leaks ${leak}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects an unknown model, an unfinished run and a non-https preview", () => {
  for (const runExtra of [
    { model: "dreamina_unknown_model" },
    { status: "rejected" }
  ]) {
    const dir = fixture({ runExtra });
    try {
      assert.throws(() => buildShowcase(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const dir = fixture();
  try {
    const file = join(dir, "catalog/camera/camera.arc.json");
    const preset = JSON.parse(readFileSync(file, "utf8"));
    preset.preview.url = preset.preview.url.replace("https://", "http://");
    writeFileSync(file, JSON.stringify(preset));
    assert.throws(() => buildShowcase(dir), /https/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--check passes on fresh output and fails on drift", () => {
  const dir = fixture();
  const out = join(dir, "out.ts");
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [SCRIPT, "--presets-dir", dir, "--out", out, ...args],
      { encoding: "utf8" }
    );
  try {
    assert.equal(run().status, 0);
    assert.equal(run("--check").status, 0);
    writeFileSync(out, `${readFileSync(out, "utf8")}// drift\n`);
    assert.equal(run("--check").status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the checked-in data covers every preview and has no path or cost fields", () => {
  const source = readFileSync(GENERATED, "utf8");
  assert.match(source, /"previewUrl": "https:\/\//);
  assert.ok((source.match(/"previewUrl"/g) ?? []).length > 0);
  assert.ok(!source.includes("/home/"), "generated data contains a /home/ path");
  for (const field of ["credits", "cost_usd", "output_path", "usd"]) {
    assert.ok(!source.includes(field), `generated data contains ${field}`);
  }
  assert.equal(
    renderModule(buildShowcase()),
    source,
    "generated data is stale: run npm run gen:presets"
  );
});
