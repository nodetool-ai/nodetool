import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bundle } from "@remotion/bundler";
import { renderFrames, renderStill, selectComposition } from "@remotion/renderer";

const serveUrlPromise = bundle({
  entryPoint: join(import.meta.dirname, "focusCamera.fixture.tsx"),
});

test("FocusCamera renders the same changing frame directly and after forward and backward seeks", async () => {
  const serveUrl = await serveUrlPromise;
  const composition = await selectComposition({ serveUrl, id: "FocusCameraFixture" });
  let sequential: Buffer | undefined;
  await renderFrames({
    serveUrl,
    composition,
    inputProps: {},
    outputDir: null,
    frameRange: [0, 45],
    concurrency: 1,
    imageFormat: "png",
    onStart: () => undefined,
    onFrameUpdate: () => undefined,
    onFrameBuffer: (buffer, frame) => {
      if (frame === 45) sequential = buffer;
    },
  });
  const direct = await renderStill({
    serveUrl,
    composition,
    inputProps: {},
    frame: 45,
    imageFormat: "png",
  });
  assert.ok(sequential);
  assert.deepEqual(direct.buffer, sequential);
});

test("FocusCamera fails a final render for an unresolved DOM target", async () => {
  const serveUrl = await serveUrlPromise;
  const composition = await selectComposition({
    serveUrl,
    id: "FocusCameraFixture",
    inputProps: { invalid: true },
  });
  const output = await mkdtemp(join(tmpdir(), "focus-camera-negative-"));
  try {
    await assert.rejects(
      renderStill({
        serveUrl,
        composition,
        inputProps: { invalid: true },
        frame: 45,
        imageFormat: "png",
        output: join(output, "invalid.png"),
      }),
      /cannot resolve component:missing/
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("GraphFocusCamera renders the same media-backed frame directly and after forward and backward seeks", async () => {
  const serveUrl = await serveUrlPromise;
  const composition = await selectComposition({ serveUrl, id: "GraphFocusCameraFixture" });
  let sequential: Buffer | undefined;
  await renderFrames({
    serveUrl,
    composition,
    inputProps: {},
    outputDir: null,
    frameRange: [0, 45],
    concurrency: 1,
    imageFormat: "png",
    onStart: () => undefined,
    onFrameUpdate: () => undefined,
    onFrameBuffer: (buffer, frame) => {
      if (frame === 45) sequential = buffer;
    },
  });
  const direct = await renderStill({
    serveUrl,
    composition,
    inputProps: {},
    frame: 45,
    imageFormat: "png",
  });
  assert.ok(sequential);
  assert.deepEqual(direct.buffer, sequential);
});
