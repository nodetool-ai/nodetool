import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  discoverASRModels,
  discoverVadModels,
  resolveModelPath
} from "../src/model-discovery.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "whisper-models-"));
  vi.stubEnv("HF_HUB_CACHE", dir);
  vi.stubEnv("WHISPER_CPP_MODELS_DIR", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
it("discovers symlinked ASR and VAD models separately and accepts picker ids unchanged", async () => {
  const snapshot = path.join(
    dir,
    "models--ggerganov--whisper.cpp/snapshots/one"
  );
  await mkdir(snapshot, { recursive: true });
  await writeFile(path.join(dir, "blob"), "model");
  await symlink(
    path.join(dir, "blob"),
    path.join(snapshot, "ggml-base.en.bin")
  );
  await writeFile(path.join(snapshot, "ggml-silero-v5.1.2.bin"), "vad");
  await writeFile(path.join(snapshot, "unrelated.bin"), "other");
  const models = await discoverASRModels();
  expect(models).toEqual([
    {
      id: path.join(snapshot, "ggml-base.en.bin"),
      name: "base.en",
      provider: "whisper_cpp"
    }
  ]);
  expect(await resolveModelPath(models[0].id)).toBe(models[0].id);
  expect((await discoverVadModels()).map((m) => m.name)).toEqual([
    "silero-v5.1.2"
  ]);
  await expect(resolveModelPath(path.join(dir, "blob"))).rejects.toThrow(
    "Unknown whisper.cpp model"
  );
});
it("adds the configured directory and retains the newest snapshot per filename", async () => {
  const first = path.join(
    dir,
    "models--ggerganov--whisper.cpp/snapshots/first"
  );
  const second = path.join(
    dir,
    "models--ggml-org--whisper.cpp/snapshots/second"
  );
  for (const snapshot of [first, second]) {
    await mkdir(snapshot, { recursive: true });
    await writeFile(path.join(snapshot, "ggml-base.en.bin"), "model");
  }
  await utimes(first, 100, 100);
  await utimes(second, 200, 200);
  await writeFile(path.join(dir, "ggml-small.bin"), "extra");
  expect((await discoverASRModels(dir)).map((m) => m.id)).toEqual([
    path.join(second, "ggml-base.en.bin"),
    path.join(dir, "ggml-small.bin")
  ]);
});
