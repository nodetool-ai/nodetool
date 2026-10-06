import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { decodeToPcm16 } from "../src/audio.js";
import { loadWhisperNode } from "../src/binding.js";

const model = process.env.WHISPER_CPP_TEST_MODEL;
it.skipIf(!model)(
  "transcribes known speech and verifies millisecond segment times",
  async (test) => {
    if (!model) {
      throw new Error("WHISPER_CPP_TEST_MODEL is required");
    }
    let binding;
    try {
      binding = await loadWhisperNode();
    } catch {
      test.skip("Optional whisper.node binding is not installed");
      return;
    }
    const audio = await readFile(
      new URL("./fixtures/jfk.wav", import.meta.url)
    );
    const pcm = await decodeToPcm16(audio);
    const context = await binding.initWhisper({
      filePath: model,
      useGpu: false
    });
    try {
      const result = await context.transcribeData(pcm, {
        language: "en",
        maxThreads: 4
      }).promise;
      expect(result.result.toLowerCase()).toContain("country");
      const end = result.segments.at(-1)?.t1;
      expect(end).toBeDefined();
      expect((end ?? 0) / 1000).toBeGreaterThan(10);
      expect((end ?? 0) / 1000).toBeLessThanOrEqual(
        pcm.byteLength / 2 / 16000 + 0.5
      );
    } finally {
      await context.release();
    }
  },
  120000
);
