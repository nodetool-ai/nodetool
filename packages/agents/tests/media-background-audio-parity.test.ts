import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BaseProvider,
  ProcessingContext,
  createWorkspace,
  generationRegistry,
  recordGenerationReceipt,
  type Message,
  type ProviderStreamItem
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { encodeWav, parseWavBytes } from "@nodetool-ai/audio-nodes";
import { generateMusic, generateSpeech } from "../src/capabilities/media.js";
import { ungatedCapabilityRun } from "../src/capabilities/invoke.js";

const WAV = encodeWav(new Float32Array([0.125, -0.25, 0.375]), 24000);
type Route = "encoded" | "null" | "error" | "both fail" | "accepted error";
class AudioProvider extends BaseProvider {
  encodedCalls = 0;
  streamCalls = 0;
  musicCalls = 0;
  constructor(readonly route: Route) {
    super("audio-test");
  }
  override async textToSpeechEncoded() {
    this.encodedCalls++;
    if (this.route === "encoded") return { data: WAV, mimeType: "audio/wav" };
    if (this.route === "accepted error") {
      recordGenerationReceipt({ provider_request_id: "paid-request" });
      throw new Error("poll failed after acceptance");
    }
    if (this.route === "error" || this.route === "both fail")
      throw new Error("encoded unavailable");
    return null;
  }
  override async *textToSpeech() {
    this.streamCalls++;
    if (this.route === "both fail") throw new Error("stream unavailable");
    yield { samples: new Int16Array([4096, -8192, 12288]), sampleRate: 24000 };
  }
  override async textToMusic() {
    this.musicCalls++;
    return { data: WAV, mimeType: "audio/wav" };
  }
  async generateMessage(): Promise<Message> {
    throw new Error("unused");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("unused");
  }
}
function setup(route: Route, assets = true) {
  const storage = new InMemoryStorageAdapter();
  const workspace = createWorkspace(storage);
  const terminal = vi.fn();
  const context = new ProcessingContext({
    jobId: "audio-job",
    userId: "audio-user",
    workspace,
    generationLifecycle: { onGenerationTerminal: terminal }
  });
  const provider = new AudioProvider(route);
  context.registerProvider("audio-test", provider);
  const saved: Uint8Array[] = [];
  const savedNames: string[] = [];
  if (assets)
    context.setModelInterfaces({
      createAsset: async ({ content, name }) => {
        saved.push(content);
        savedNames.push(name);
        return { id: "a".repeat(32) };
      }
    });
  return { context, provider, saved, savedNames, workspace, terminal };
}
async function invoke(
  s: ReturnType<typeof setup>,
  kind: "speech" | "music",
  background: boolean,
  outputFile?: string
) {
  const capability = kind === "speech" ? generateSpeech : generateMusic;
  const response = await capability.impl(ungatedCapabilityRun(s.context), {
    provider: "audio-test",
    model: "audio-model",
    ...(kind === "speech" ? { text: "hello" } : { prompt: "quiet piano" }),
    background,
    ...(outputFile ? { output_file: outputFile } : {})
  });
  if (
    !response ||
    typeof response !== "object" ||
    !("generation_id" in response) ||
    typeof response.generation_id !== "string"
  ) {
    throw new Error(`Missing generation response: ${JSON.stringify(response)}`);
  }
  // Register happens asynchronously after the background receipt is returned.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const outcome = await generationRegistry.wait(response.generation_id, 1000);
  return { response, outcome };
}
beforeEach(() => generationRegistry.reset());

describe("audio generation foreground/background parity", () => {
  it.each(["encoded", "null", "error"] as const)(
    "preserves playable speech and one terminal lifecycle for %s route",
    async (route) => {
      const foreground = setup(route);
      const front = await invoke(foreground, "speech", false);
      const background = setup(route);
      const back = await invoke(background, "speech", true);
      expect(front.outcome?.status).toBe("completed");
      expect(back.outcome?.status).toBe("completed");
      expect(back.outcome?.asset_ids).toHaveLength(1);
      expect(background.saved).toHaveLength(1);
      expect(background.saved[0]).toEqual(foreground.saved[0]);
      expect(parseWavBytes(background.saved[0])?.samples.length).toBe(3);
      expect(parseWavBytes(background.saved[0])?.sampleRate).toBe(24000);
      expect(background.provider.encodedCalls).toBe(1);
      expect(background.provider.streamCalls).toBe(route === "encoded" ? 0 : 1);
      expect(background.terminal).toHaveBeenCalledOnce();
      expect(foreground.terminal).toHaveBeenCalledOnce();
    }
  );

  it.each([false, true])(
    "fails when both speech routes fail, background=%s",
    async (background) => {
      const s = setup("both fail");
      const { outcome } = await invoke(s, "speech", background);
      expect(outcome?.status).toBe("failed");
      expect(s.saved).toHaveLength(0);
      expect(s.provider.encodedCalls).toBe(1);
      expect(s.provider.streamCalls).toBe(1);
    }
  );

  it.each(["speech", "music"] as const)(
    "writes the requested nested workspace copy for %s in both modes",
    async (kind) => {
      for (const background of [false, true]) {
        const s = setup("encoded");
        const { outcome } = await invoke(
          s,
          kind,
          background,
          "audio/nested/bed.wav"
        );
        expect(await s.workspace.read("audio/nested/bed.wav")).toEqual(WAV);
        expect(s.saved[0]).toEqual(WAV);
        expect(outcome?.status).toBe("completed");
      }
    }
  );

  it.each(["speech", "music"] as const)(
    "supports a writable workspace without an asset interface for %s",
    async (kind) => {
      const s = setup("encoded", false);
      const { outcome } = await invoke(s, kind, true, "audio/bed.wav");
      expect(await s.workspace.read("audio/bed.wav")).toEqual(WAV);
      expect(outcome?.status).toBe("completed");
    }
  );

  it("reports a copy failure separately and does not regenerate the successful asset", async () => {
    const s = setup("encoded");
    vi.spyOn(s.workspace, "write").mockRejectedValue(
      new Error("workspace read only")
    );
    const { outcome } = await invoke(s, "music", true, "audio/bed.wav");
    expect(outcome?.status).toBe("completed");
    expect(outcome?.asset_ids).toHaveLength(1);
    expect(outcome).toMatchObject({
      delivery: {
        status: "failed",
        error: expect.stringContaining("workspace read only")
      }
    });
    expect(s.provider.musicCalls).toBe(1);
  });

  it("does not repeat paid speech after asset persistence fails", async () => {
    const s = setup("encoded");
    s.context.setModelInterfaces({
      createAsset: async () => {
        throw new Error("asset storage unavailable");
      }
    });
    const { outcome } = await invoke(s, "speech", true, "audio/recovered.wav");
    expect(await s.workspace.read("audio/recovered.wav")).toEqual(WAV);
    expect(outcome?.status).toBe("completed");
    expect(outcome?.delivery).toEqual({
      status: "completed",
      path: "audio/recovered.wav"
    });
    expect(s.provider.encodedCalls).toBe(1);
    expect(s.provider.streamCalls).toBe(0);
    expect(s.terminal).toHaveBeenCalledOnce();
  });

  it("preserves the WAV destination when streaming PCM fulfills an mp3 request", async () => {
    const s = setup("null");
    const { outcome } = await invoke(s, "speech", true, "audio/spoken.mp3");
    expect(
      parseWavBytes((await s.workspace.read("audio/spoken.wav"))!)?.samples
        .length
    ).toBe(3);
    expect(await s.workspace.read("audio/spoken.mp3")).toBeNull();
    expect(outcome?.delivery?.path).toBe("audio/spoken.wav");
    expect(s.savedNames).toEqual(["spoken.wav"]);
  });

  it("writes a fallback workspace file when no output path or asset interface is supplied", async () => {
    const s = setup("encoded", false);
    const { outcome } = await invoke(s, "music", true);
    expect(outcome?.delivery?.status).toBe("completed");
    const destination = outcome?.delivery?.path;
    expect(destination).toMatch(/^generated-music-.*\.wav$/);
    expect(await s.workspace.read(destination!)).toEqual(WAV);
  });

  it("settles only after the requested workspace write completes", async () => {
    const s = setup("encoded");
    let release: () => void = () => {};
    let writing: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      writing = resolve;
    });
    const original = s.workspace.write.bind(s.workspace);
    vi.spyOn(s.workspace, "write").mockImplementation(async (...args) => {
      writing();
      await gate;
      return original(...args);
    });
    const response = await generateMusic.impl(ungatedCapabilityRun(s.context), {
      provider: "audio-test",
      model: "audio-model",
      prompt: "music",
      background: true,
      output_file: "audio/wait.wav"
    });
    if (
      !response ||
      typeof response !== "object" ||
      !("generation_id" in response) ||
      typeof response.generation_id !== "string"
    )
      throw new Error("missing generation");
    await entered;
    expect(generationRegistry.outcome(response.generation_id)).toBeNull();
    expect(generationRegistry.isRunning(response.generation_id)).toBe(true);
    expect(s.terminal).not.toHaveBeenCalled();
    release();
    expect(
      (await generationRegistry.wait(response.generation_id, 1000))?.delivery
    ).toEqual({ status: "completed", path: "audio/wait.wav" });
  });

  it.each(["encoded", "stream"] as const)(
    "keeps cancellation authoritative after an ignored %s abort",
    async (route) => {
      const s = setup(route === "encoded" ? "encoded" : "null");
      let release: () => void = () => {};
      let ready: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      if (route === "encoded") {
        vi.spyOn(s.provider, "textToSpeechEncoded").mockImplementation(
          async () => {
            ready();
            await gate;
            return { data: WAV, mimeType: "audio/wav" };
          }
        );
      } else {
        vi.spyOn(s.provider, "textToSpeech").mockImplementation(
          async function* () {
            yield { samples: new Int16Array([4096]), sampleRate: 24000 };
            ready();
            await gate;
          }
        );
      }
      const response = await generateSpeech.impl(
        ungatedCapabilityRun(s.context),
        {
          provider: "audio-test",
          model: "audio-model",
          text: "hello",
          background: true
        }
      );
      if (
        !response ||
        typeof response !== "object" ||
        !("generation_id" in response) ||
        typeof response.generation_id !== "string"
      )
        throw new Error("missing generation");
      await entered;
      expect(
        generationRegistry.cancel(response.generation_id, s.context.userId)
      ).toBe(true);
      release();
      expect(
        (await generationRegistry.wait(response.generation_id, 1000))?.status
      ).toBe("cancelled");
      expect(s.saved).toHaveLength(0);
    }
  );

  it("never submits streaming speech after an encoded provider accepted a durable request", async () => {
    const s = setup("accepted error");
    const { outcome } = await invoke(s, "speech", true);
    expect(outcome?.status).toBe("failed");
    expect(s.provider.encodedCalls).toBe(1);
    expect(s.provider.streamCalls).toBe(0);
  });
});
