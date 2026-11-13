/**
 * The acestep provider against a fake ace-server that reproduces the real
 * wire shapes (acestep-fake-server.ts). These tests reach the fake as a
 * remote server through ACESTEP_SERVER_URL; acestep-server.test.ts covers
 * the supervised local process.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AceStepProvider, synthAudioParts } from "../../src/providers/acestep-provider.js";
import {
  ACESTEP_BASE_DIT,
  ACESTEP_TURBO_DIT,
  aceStepDitFor
} from "../../src/providers/acestep-models.js";
import type { MusicTaskParams } from "../../src/providers/types.js";
import { PROBE_MANIFEST, runProbes } from "../../src/providers/contract/index.js";
import { startFakeAceServer, wavFrames, type FakeAceServer } from "./acestep-fake-server.js";

const servers: FakeAceServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function fake(options: Parameters<typeof startFakeAceServer>[0] = {}): Promise<FakeAceServer> {
  // A remote operator starts ace-server with --max-batch for several candidates.
  const server = await startFakeAceServer({ maxBatch: 4, ...options });
  servers.push(server);
  return server;
}

function provider(server: FakeAceServer): AceStepProvider {
  return new AceStepProvider({ ACESTEP_SERVER_URL: server.baseUrl }, { pollIntervalMs: 5 });
}

/** A 48 kHz stereo float WAV of `frames` frames. */
function floatWav(frames: number): Uint8Array {
  const data = frames * 8;
  const out = Buffer.alloc(44 + data);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + data, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(3, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(48000, 24);
  out.writeUInt32LE(48000 * 8, 28);
  out.writeUInt16LE(8, 32);
  out.writeUInt16LE(32, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(data, 40);
  for (let i = 0; i < frames * 2; i++) {
    out.writeFloatLE(Math.sin(i / 10) * 0.5, 44 + i * 4);
  }
  return new Uint8Array(out);
}

function fmtTag(bytes: Uint8Array): number {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).readUInt16LE(20);
}

const base: MusicTaskParams = {
  task: "text2music",
  model: ACESTEP_TURBO_DIT,
  caption: "warm lofi beat with rhodes",
  bpm: 120,
  key: "A minor",
  timeSignature: 4,
  durationSec: 16,
  seed: 42,
  candidates: 2,
  steps: 0
};

const posts = (server: FakeAceServer, path: string) =>
  server.requests.filter((request) => request.method === "POST" && request.path === path);

async function waitFor(condition: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("condition not met in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("acestep provider requests", () => {
  it("advertises music_task and nothing else beyond chat", () => {
    const capabilities = new AceStepProvider({ ACESTEP_SERVER_URL: "http://127.0.0.1:1" }).getCapabilities();
    expect(capabilities).toContain("music_task");
    expect(capabilities).not.toContain("text_to_music");
  });

  it("runs text2music as /lm then /synth with the returned requests (MM3 exit 4, MF13)", async () => {
    const server = await fake();
    const onRunning = vi.fn();
    const result = await provider(server).musicTask({ ...base, onRunning });

    expect(onRunning).toHaveBeenCalledTimes(1);
    const lm = posts(server, "/lm");
    expect(lm).toHaveLength(1);
    // The golden /lm body. Everything the language model needs to skip its
    // metadata pass is supplied (ARCHITECTURE.md:292-299).
    expect(lm[0]!.json).toEqual({
      task_type: "text2music",
      caption: "warm lofi beat with rhodes",
      lyrics: "[Instrumental]",
      bpm: 120,
      keyscale: "A minor",
      timesignature: "4",
      seed: 42,
      synth_model: ACESTEP_TURBO_DIT,
      output_format: "wav32",
      duration: 16,
      lm_batch_size: 2
    });

    const synth = posts(server, "/synth");
    expect(synth).toHaveLength(1);
    expect(synth[0]!.contentType).toContain("application/json");
    const items = synth[0]!.json as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    items.forEach((item, index) => {
      expect(item).toEqual({
        task_type: "text2music",
        caption: "warm lofi beat with rhodes",
        lyrics: "[Instrumental]",
        bpm: 120,
        keyscale: "A minor",
        timesignature: "4",
        seed: 42 + index,
        lm_seed: expect.any(Number),
        synth_model: ACESTEP_TURBO_DIT,
        output_format: "wav32",
        duration: 16,
        lm_batch_size: 2,
        audio_codes: expect.stringMatching(/^\d+(,\d+)+$/),
        solver: "euler",
        lm_mode: "generate",
        vocal_language: "unknown"
      });
    });

    expect(result.backend).toBe("acestep.cpp@07abf07");
    expect(result.candidates.map((candidate) => candidate.seed)).toEqual([42, 43]);
    expect(result.candidates.map((candidate) => candidate.audioCodes)).toEqual(items.map((item) => item.audio_codes));
    for (const candidate of result.candidates) {
      expect(fmtTag(candidate.audio)).toBe(3);
    }
    // The fake writes the seed into every sample, so the order is checkable.
    const firstSample = (bytes: Uint8Array) => Buffer.from(bytes).readFloatLE(44);
    expect(result.candidates.map((candidate) => firstSample(candidate.audio))).toEqual([
      Math.fround(0.042),
      Math.fround(0.043)
    ]);
    expect(result.timing.lmMs).toBeGreaterThan(0);
    expect(result.timing.synthMs).toBeGreaterThan(0);
    expect(result.timing.queueMs).toBeGreaterThanOrEqual(0);
  });

  it("renders every candidate when a remote server's --max-batch is below the request (M4)", async () => {
    // ace-server's default --max-batch is 1 (ace-server.cpp:198), so /lm
    // returns one result for four candidates.
    const server = await fake({ maxBatch: 1 });
    const result = await provider(server).musicTask({ ...base, candidates: 4 });

    const lm = posts(server, "/lm");
    expect(lm).toHaveLength(1);
    const synth = posts(server, "/synth");
    expect(synth).toHaveLength(1);
    const items = synth[0]!.json as Array<Record<string, unknown>> | Record<string, unknown>;
    const requests = Array.isArray(items) ? items : [items];
    expect(requests).toHaveLength(1);
    expect(requests[0]!.synth_batch_size).toBe(4);
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates.map((candidate) => candidate.seed)).toEqual([42, 43, 44, 45]);
    const codes = requests[0]!.audio_codes;
    expect(result.candidates.every((candidate) => candidate.audioCodes === codes)).toBe(true);
  });

  it("splits the missing candidates over the returned /lm results (M4)", async () => {
    const server = await fake({ maxBatch: 2 });
    const result = await provider(server).musicTask({ ...base, candidates: 3 });

    const items = posts(server, "/synth")[0]!.json as Array<Record<string, unknown>>;
    expect(items.map((item) => item.synth_batch_size ?? 1)).toEqual([2, 1]);
    expect(result.candidates).toHaveLength(3);
  });

  it("sends repaint to /synth only, with the source as the multipart audio part", async () => {
    const server = await fake();
    const source = floatWav(4800);
    const result = await provider(server).musicTask({
      ...base,
      task: "repaint",
      key: undefined,
      seed: 7,
      sourceAudio: source,
      regionStartSec: 4,
      regionEndSec: 8,
      steps: 12
    });

    expect(posts(server, "/lm")).toHaveLength(0);
    const synth = posts(server, "/synth");
    expect(synth).toHaveLength(1);
    expect(synth[0]!.contentType).toMatch(/^multipart\/form-data/);
    expect(synth[0]!.multipartRequestIsField).toBe(true);
    // The golden repaint body: no duration (the source sets it), an empty
    // keyscale for a project without a key, candidates as synth_batch_size.
    expect(synth[0]!.multipartRequest).toEqual({
      task_type: "repaint",
      caption: "warm lofi beat with rhodes",
      lyrics: "[Instrumental]",
      bpm: 120,
      keyscale: "",
      timesignature: "4",
      seed: 7,
      synth_model: ACESTEP_TURBO_DIT,
      output_format: "wav32",
      inference_steps: 12,
      repainting_start: 4,
      repainting_end: 8,
      synth_batch_size: 2
    });
    expect(Buffer.from(synth[0]!.audio!).equals(Buffer.from(source))).toBe(true);
    expect(synth[0]!.audioFilename).toBe("source.wav");
    expect(result.candidates.map((candidate) => candidate.seed)).toEqual([7, 8]);
    expect(result.candidates.every((candidate) => candidate.audioCodes === undefined)).toBe(true);
    expect(result.timing.lmMs).toBe(0);
    // The fake renders whole 1920-frame latents of the source (two here,
    // 3840 frames), scaled by 0.01.
    expect(wavFrames(result.candidates[0]!.audio)).toBe(38);
  });

  it("sends lego with track bass and the base DiT through /lm and /synth (MM5 exit 5)", async () => {
    const server = await fake();
    const source = floatWav(9600);
    const result = await provider(server).musicTask({
      ...base,
      task: "lego",
      // The panel may name the turbo DiT; lego needs the base DiT (BE-3).
      model: ACESTEP_TURBO_DIT,
      trackRole: "bass",
      sourceAudio: source,
      regionStartSec: 0,
      regionEndSec: 16,
      seed: 100
    });

    const lmBody = {
      task_type: "lego",
      caption: "warm lofi beat with rhodes",
      lyrics: "[Instrumental]",
      bpm: 120,
      keyscale: "A minor",
      timesignature: "4",
      seed: 100,
      synth_model: ACESTEP_BASE_DIT,
      output_format: "wav32",
      track: "bass",
      repainting_start: 0,
      repainting_end: 16,
      duration: 16,
      lm_batch_size: 2
    };
    expect(posts(server, "/lm").map((request) => request.json)).toEqual([lmBody]);
    const synth = posts(server, "/synth");
    expect(synth).toHaveLength(1);
    expect(synth[0]!.contentType).toMatch(/^multipart\/form-data/);
    const items = synth[0]!.multipartRequest as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toMatchObject({
        task_type: "lego",
        track: "bass",
        synth_model: ACESTEP_BASE_DIT,
        output_format: "wav32",
        repainting_start: 0,
        repainting_end: 16,
        audio_codes: expect.any(String)
      });
    }
    expect(Buffer.from(synth[0]!.audio!).equals(Buffer.from(source))).toBe(true);
    expect(result.candidates.map((candidate) => candidate.seed)).toEqual([100, 101]);
    expect(result.candidates.every((candidate) => typeof candidate.audioCodes === "string")).toBe(true);
  });

  it("replays stored audio codes without /lm (MM7 replay request)", async () => {
    const server = await fake();
    const result = await provider(server).musicTask({ ...base, audioCodes: "11,22,33", seed: 9, candidates: 1 });

    expect(posts(server, "/lm")).toHaveLength(0);
    expect(posts(server, "/synth").map((request) => request.json)).toEqual([
      {
        task_type: "text2music",
        caption: "warm lofi beat with rhodes",
        lyrics: "[Instrumental]",
        bpm: 120,
        keyscale: "A minor",
        timesignature: "4",
        seed: 9,
        synth_model: ACESTEP_TURBO_DIT,
        output_format: "wav32",
        duration: 16,
        audio_codes: "11,22,33",
        synth_batch_size: 1
      }
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.seed).toBe(9);
    expect(result.candidates[0]!.audioCodes).toBe("11,22,33");
  });

  it("picks a seed when none is given, so each take records the seed it used", async () => {
    const server = await fake();
    const result = await provider(server).musicTask({ ...base, seed: undefined, candidates: 1 });
    const sent = (posts(server, "/lm")[0]!.json as Record<string, unknown>).seed as number;
    expect(Number.isInteger(sent)).toBe(true);
    expect(sent).toBeGreaterThanOrEqual(0);
    expect(sent).toBeLessThanOrEqual(0xffffffff);
    expect(result.candidates[0]!.seed).toBe(sent);
  });

  it("asks for whole seconds that cover the window, so the output is not short (F2)", async () => {
    // The language model sees the duration as whole seconds (src/prompt.h:253)
    // and /synth sizes the output from the codes it writes.
    const server = await fake({ lengthScale: 1 });
    const durationSec = 10.71;
    const result = await provider(server).musicTask({ ...base, durationSec, candidates: 1 });
    expect((posts(server, "/lm")[0]!.json as Record<string, unknown>).duration).toBe(11);
    expect(wavFrames(result.candidates[0]!.audio)).toBeGreaterThanOrEqual(Math.ceil(durationSec * 48000));
  });

  it("fails a job whose model the server did not find at startup", async () => {
    // ace-server.cpp:735-743: the job fails, and only the log says why.
    const server = await fake({ models: ["Qwen3-Embedding-0.6B-Q8_0.gguf", "acestep-5Hz-lm-4B-Q8_0.gguf", ACESTEP_TURBO_DIT, "vae-BF16.gguf"] });
    await expect(provider(server).musicTask({ ...base, task: "lego", trackRole: "bass", sourceAudio: floatWav(9600), candidates: 1 })).rejects.toThrow(
      /ace-server job failed/
    );
    expect(posts(server, "/synth")).toHaveLength(1);
  });

  it("keeps a remote server's error body out of the message (item 9)", async () => {
    // Without a language model, POST /lm answers 501 (ace-server.cpp:625-628).
    const server = await fake({ models: ["Qwen3-Embedding-0.6B-Q8_0.gguf", ACESTEP_TURBO_DIT, "vae-BF16.gguf"] });
    const error = await provider(server).musicTask(base).then(
      () => null,
      (reason: unknown) => reason as Error
    );
    expect(error?.message).toMatch(/ace-server HTTP 501/);
    expect(error?.message).not.toContain("No LM models");
  });

  it("reports the backend's error body", async () => {
    const server = await fake({ maxBatch: 1 });
    // --max-batch 1 refuses an array of two (ace-server.cpp:636-639). The
    // provider never sends one to /lm, so ask for one through a raw request.
    const response = await fetch(`${server.baseUrl}/lm`, {
      method: "POST",
      body: JSON.stringify([{ caption: "a" }, { caption: "b" }])
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request array exceeds max_batch" });
    await expect(
      provider(server).musicTask({ ...base, caption: "   ", task: "text2music" })
    ).rejects.toThrow("ACE-Step needs a caption");
  });
});

describe("acestep provider job control", () => {
  it("cancels the backend job when the signal aborts (MM6 exit 4)", async () => {
    const server = await fake({ holdJobs: true });
    const controller = new AbortController();
    const pending = provider(server).musicTask({ ...base, signal: controller.signal });
    await waitFor(() => server.started.length === 1);
    const jobId = server.started[0]!.id;
    const abortedAt = Date.now();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - abortedAt).toBeLessThan(5000);
    const cancel = server.requests.find((request) => request.method === "POST" && request.path === "/job");
    expect(cancel?.query).toEqual({ id: jobId, cancel: "1" });
    expect(server.jobStatus(jobId)).toBe("cancelled");
    expect(posts(server, "/synth")).toHaveLength(0);
  });

  it("cancels a job whose submission was in flight when the signal aborted (item 7)", async () => {
    const server = await fake({ holdJobs: true, submitDelayMs: 300 });
    const controller = new AbortController();
    const pending = provider(server).musicTask({ ...base, signal: controller.signal });
    // The job is queued; its id has not reached the provider yet.
    await waitFor(() => server.started.length === 1);
    const jobId = server.started[0]!.id;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const cancel = server.requests.find((request) => request.method === "POST" && request.path === "/job");
    expect(cancel?.query).toEqual({ id: jobId, cancel: "1" });
    expect(server.jobStatus(jobId)).toBe("cancelled");
  });

  it("reports a second job as queued until the first finishes, then runs it (MM3 exit 6)", async () => {
    const server = await fake({ holdJobs: true });
    const ace = provider(server);
    const firstRunning = vi.fn();
    const secondRunning = vi.fn();
    const first = ace.musicTask({ ...base, seed: 1, onRunning: firstRunning });
    const second = ace.musicTask({ ...base, seed: 500, onRunning: secondRunning });

    await waitFor(() => server.started.length === 1);
    expect(firstRunning).toHaveBeenCalledTimes(1);
    expect(secondRunning).not.toHaveBeenCalled();
    // The second job is not sent while the first is unfinished, so its /lm
    // cannot run between the first job's /lm and /synth.
    expect(posts(server, "/lm")).toHaveLength(1);

    server.release();
    await waitFor(() => server.started.length === 2);
    expect(server.started[1]!.kind).toBe("synth");
    expect(secondRunning).not.toHaveBeenCalled();
    server.release();
    const firstResult = await first;
    await waitFor(() => secondRunning.mock.calls.length === 1);
    await waitFor(() => server.started.length === 3);
    server.release();
    await waitFor(() => server.started.length === 4);
    server.release();
    const secondResult = await second;

    expect(server.started.map((job) => job.kind)).toEqual(["lm", "synth", "lm", "synth"]);
    expect(firstResult.candidates[0]!.seed).toBe(1);
    expect(secondResult.candidates[0]!.seed).toBe(500);
    expect(secondResult.timing.queueMs).toBeGreaterThan(0);
  });

  it("resubmits a job the server no longer knows once, then fails", async () => {
    const server = await fake({ holdJobs: true });
    const ace = provider(server);
    const once = ace.musicTask({ ...base, candidates: 1 });
    await waitFor(() => server.started.length === 1);
    server.forgetJobs();
    await waitFor(() => server.started.length === 2);
    expect(posts(server, "/lm")).toHaveLength(2);
    server.release();
    await waitFor(() => server.started.length === 3);
    server.release();
    await expect(once).resolves.toMatchObject({ candidates: [expect.anything()] });

    const twice = ace.musicTask({ ...base, candidates: 1 });
    await waitFor(() => server.started.length === 4);
    server.forgetJobs();
    await waitFor(() => server.started.length === 5);
    server.forgetJobs();
    await expect(twice).rejects.toThrow(/lost the lm job twice/);
  });
});

describe("acestep result parsing", () => {
  it("refuses audio that is not 32-bit float WAV (MF4)", () => {
    const pcm16 = Buffer.alloc(44 + 8);
    pcm16.write("RIFF", 0, "ascii");
    pcm16.write("WAVE", 8, "ascii");
    pcm16.writeUInt16LE(1, 20);
    pcm16.writeUInt16LE(16, 34);
    const body = Buffer.concat([
      Buffer.from("--ace-batch-boundary\r\nContent-Type: audio/wav\r\n\r\n"),
      pcm16,
      Buffer.from("\r\n--ace-batch-boundary--\r\n")
    ]);
    expect(() => synthAudioParts(new Uint8Array(body), "multipart/mixed; boundary=ace-batch-boundary")).toThrow(
      /not the 32-bit float WAV/
    );
  });
});

describe("acestep contract probe", () => {
  const entries = PROBE_MANIFEST.filter((entry) => entry.provider === "acestep");

  it("passes against an ace-server and skips without one", async () => {
    const server = await fake();
    const live = await runProbes({ entries, env: { ACESTEP_PROBE_URL: server.baseUrl } });
    expect(live.results.map((result) => result.status)).toEqual(["passed"]);
    expect(server.requests.map((request) => `${request.method} ${request.path}`)).toEqual(["GET /job"]);

    const skipped = await runProbes({ entries, env: {} });
    expect(skipped.results.map((result) => [result.status, result.reason])).toEqual([
      ["skipped", "ACESTEP_PROBE_URL is not set"]
    ]);
  });
});

describe("acestep model routing (BE-3)", () => {
  it("uses the turbo DiT for text2music and repaint and the base DiT for lego", () => {
    expect(aceStepDitFor("text2music", "")).toBe(ACESTEP_TURBO_DIT);
    expect(aceStepDitFor("repaint", undefined)).toBe(ACESTEP_TURBO_DIT);
    expect(aceStepDitFor("lego", undefined)).toBe(ACESTEP_BASE_DIT);
    expect(aceStepDitFor("lego", ACESTEP_TURBO_DIT)).toBe(ACESTEP_BASE_DIT);
    expect(aceStepDitFor("lego", "acestep-v15-sft-Q8_0.gguf")).toBe("acestep-v15-sft-Q8_0.gguf");
    expect(aceStepDitFor("text2music", "acestep-v15-xl-turbo-Q8_0.gguf")).toBe("acestep-v15-xl-turbo-Q8_0.gguf");
  });
});
