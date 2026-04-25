import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { WhisperTranscribeLibNode } from "../src/index.js";

const nodewhisperMock = vi.fn();

vi.mock("nodejs-whisper", () => ({
  nodewhisper: (filePath: string, options: Record<string, unknown>) =>
    nodewhisperMock(filePath, options)
}));

function audioRef(bytes: Uint8Array): Record<string, unknown> {
  return {
    type: "audio",
    uri: "",
    asset_id: null,
    data: Buffer.from(bytes).toString("base64"),
    metadata: null
  };
}

function wavBytes(): Uint8Array {
  // Minimal 16kHz mono PCM WAV header (no audio body) so the magic-byte
  // sniffer in the node picks the `.wav` extension.
  const buf = Buffer.alloc(44);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(0, 40);
  return new Uint8Array(buf);
}

beforeEach(() => {
  nodewhisperMock.mockReset();
});

describe("WhisperTranscribeLibNode", () => {
  it("declares expected static metadata", () => {
    expect(WhisperTranscribeLibNode.nodeType).toBe("lib.whisper.Transcribe");
    expect(WhisperTranscribeLibNode.title).toBe("Whisper Transcribe (Local)");
    expect(WhisperTranscribeLibNode.metadataOutputTypes).toEqual({
      text: "str",
      segments: "list[audio_chunk]",
      words: "list[audio_chunk]"
    });
    expect(WhisperTranscribeLibNode.exposeAsTool).toBe(true);
  });

  it("throws a clear error when no audio is provided", async () => {
    const node = new WhisperTranscribeLibNode();
    node.assign({ audio: {} });
    await expect(node.process()).rejects.toThrow("Audio input is required");
  });

  it("rejects an unknown model name", async () => {
    const node = new WhisperTranscribeLibNode();
    node.assign({
      audio: audioRef(wavBytes()),
      model: "ultra-mega"
    });
    await expect(node.process()).rejects.toThrow(/Invalid Whisper model/);
  });

  it("calls nodewhisper with the right options and returns text", async () => {
    nodewhisperMock.mockImplementation(async () => "  Hello world. ");
    const node = new WhisperTranscribeLibNode();
    node.assign({
      audio: audioRef(wavBytes()),
      model: "base.en",
      language: "auto",
      translate: false,
      timestamps: false,
      withCuda: false
    });
    const result = await node.process();
    expect(result.text).toBe("Hello world.");
    expect(result.segments).toEqual([]);
    expect(result.words).toEqual([]);

    expect(nodewhisperMock).toHaveBeenCalledTimes(1);
    const [filePath, options] = nodewhisperMock.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(filePath.endsWith(".wav")).toBe(true);
    expect(options.modelName).toBe("base.en");
    expect(options.autoDownloadModelName).toBe("base.en");
    expect(options.withCuda).toBe(false);
    const wopts = options.whisperOptions as Record<string, unknown>;
    expect(wopts.outputInJsonFull).toBe(false);
    expect(wopts.translateToEnglish).toBe(false);
    expect(wopts.wordTimestamps).toBe(false);
    expect(wopts.noGpu).toBe(true);
    expect("language" in wopts).toBe(false);
  });

  it("forwards explicit language and translate options", async () => {
    nodewhisperMock.mockImplementation(async () => "Bonjour.");
    const node = new WhisperTranscribeLibNode();
    node.assign({
      audio: audioRef(wavBytes()),
      language: "fr",
      translate: true,
      withCuda: true
    });
    await node.process();
    const [, options] = nodewhisperMock.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(options.withCuda).toBe(true);
    const wopts = options.whisperOptions as Record<string, unknown>;
    expect(wopts.language).toBe("fr");
    expect(wopts.translateToEnglish).toBe(true);
    expect(wopts.noGpu).toBe(false);
  });

  it("parses segments and words from the JSON output when timestamps are enabled", async () => {
    nodewhisperMock.mockImplementation(
      async (filePath: string, options: Record<string, unknown>) => {
        const wopts = options.whisperOptions as Record<string, unknown>;
        expect(wopts.outputInJsonFull).toBe(true);
        expect(wopts.wordTimestamps).toBe(true);
        const json = {
          transcription: [
            {
              offsets: { from: 0, to: 1500 },
              text: " Hello world.",
              tokens: [
                { offsets: { from: 0, to: 500 }, text: " Hello" },
                { offsets: { from: 500, to: 1500 }, text: " world." },
                { offsets: { from: 0, to: 0 }, text: "[_BEG_]" }
              ]
            },
            {
              offsets: { from: 1500, to: 3000 },
              text: " Goodbye.",
              tokens: [
                { offsets: { from: 1500, to: 3000 }, text: " Goodbye." }
              ]
            }
          ]
        };
        await fs.writeFile(`${filePath}.json`, JSON.stringify(json), "utf-8");
        return "ignored-stdout";
      }
    );

    const node = new WhisperTranscribeLibNode();
    node.assign({
      audio: audioRef(wavBytes()),
      timestamps: true
    });
    const result = await node.process();
    expect(result.text).toBe("Hello world. Goodbye.");
    expect(result.segments).toEqual([
      { timestamp: [0, 1.5], text: "Hello world." },
      { timestamp: [1.5, 3], text: "Goodbye." }
    ]);
    expect(result.words).toEqual([
      { timestamp: [0, 0.5], text: " Hello" },
      { timestamp: [0.5, 1.5], text: " world." },
      { timestamp: [1.5, 3], text: " Goodbye." }
    ]);
  });

  it("falls back to the raw transcript when the JSON output is missing", async () => {
    nodewhisperMock.mockImplementation(async () => "fallback transcript");
    const node = new WhisperTranscribeLibNode();
    node.assign({
      audio: audioRef(wavBytes()),
      timestamps: true
    });
    const result = await node.process();
    expect(result.text).toBe("fallback transcript");
    expect(result.segments).toEqual([]);
    expect(result.words).toEqual([]);
  });

  it("cleans up temp files even when nodewhisper throws", async () => {
    let capturedDir = "";
    nodewhisperMock.mockImplementation(async (filePath: string) => {
      capturedDir = path.dirname(filePath);
      throw new Error("simulated failure");
    });
    const node = new WhisperTranscribeLibNode();
    node.assign({ audio: audioRef(wavBytes()) });
    await expect(node.process()).rejects.toThrow("simulated failure");
    expect(capturedDir).toContain(tmpdir());
    await expect(fs.access(capturedDir)).rejects.toThrow();
  });

  it("uses an mp3 extension when input is not WAV", async () => {
    nodewhisperMock.mockImplementation(async () => "ok");
    const node = new WhisperTranscribeLibNode();
    // arbitrary non-WAV bytes
    node.assign({ audio: audioRef(new Uint8Array([0xff, 0xfb, 0x90, 0x00])) });
    await node.process();
    const [filePath] = nodewhisperMock.mock.calls[0] as [string];
    expect(filePath.endsWith(".mp3")).toBe(true);
  });
});
