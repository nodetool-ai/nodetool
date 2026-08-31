/**
 * handleMediaGenerationMessage: the image / video / audio / image_edit /
 * image_to_video routes a `chat_message` with a `media_generation` payload
 * takes, their refusal branches, cancellation, and the provider-failure catch.
 *
 * Assets are written through the real file storage adapter into a temp
 * directory (ASSET_FOLDER), so no module is mocked.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTestDb, Message } from "@nodetool-ai/models";
import { noMediaModelSelectedMessage } from "@nodetool-ai/protocol";
import {
  makeChatTurnHarness,
  fakeProvider,
  type ChatTurnHarness
} from "./chat-turn-test-harness.js";

beforeAll(() => {
  // The lazily-created asset adapter must land in a scratch dir, not the
  // user's data dir. Set before anything touches storage in this worker.
  process.env.ASSET_FOLDER = mkdtempSync(join(tmpdir(), "chat-turn-media-"));
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mediaTurn(
  threadId: string,
  mediaGeneration: Record<string, unknown>,
  content = "a red fox in snow"
): Record<string, unknown> {
  return {
    thread_id: threadId,
    content,
    media_generation: mediaGeneration
  };
}

function assistantFrames(
  harness: ChatTurnHarness
): Array<Record<string, unknown>> {
  return harness.session
    .messagesOfType("message")
    .filter((m) => m.role === "assistant");
}

describe("media generation refusals", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("refuses a media turn with no model selected", async () => {
    const harness = makeChatTurnHarness({
      session: { resolveProvider: async () => fakeProvider({}) }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-nomodel", { mode: "image" })
    );
    const [err] = harness.session.messagesOfType("error");
    expect(err.message).toBe(noMediaModelSelectedMessage("image"));
    expect(assistantFrames(harness)).toHaveLength(0);
  });

  it("refuses an empty prompt", async () => {
    const harness = makeChatTurnHarness({
      session: { resolveProvider: async () => fakeProvider({}) }
    });
    await harness.handler.handleChatMessage(
      mediaTurn(
        "t-media-noprompt",
        { mode: "image", provider: "mock", model: "img-1" },
        ""
      )
    );
    const [err] = harness.session.messagesOfType("error");
    expect(err.message).toBe("Please enter a prompt");
  });

  it("names an unsupported mode instead of running it", async () => {
    const harness = makeChatTurnHarness({
      session: { resolveProvider: async () => fakeProvider({}) }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-unknown", {
        mode: "hologram",
        provider: "mock",
        model: "img-1"
      })
    );
    const [err] = harness.session.messagesOfType("error");
    expect(String(err.message)).toContain('"hologram" is not yet supported');
  });

  it("reports a provider failure as a generation error", async () => {
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            textToImages: async () => {
              throw new Error("model melted");
            }
          })
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-fail", {
        mode: "image",
        provider: "mock",
        model: "img-1"
      })
    );
    const [err] = harness.session.messagesOfType("error");
    expect(err.message).toBe("Generation failed: model melted");
    expect(assistantFrames(harness)).toHaveLength(0);
  });
});

describe("image generation", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("stores each variation as an asset and answers with asset references", async () => {
    let requestedVariations = 0;
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            textToImages: async (_params, variations) => {
              requestedVariations = Number(variations);
              return [PNG, PNG];
            }
          })
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-img", {
        mode: "image",
        provider: "mock",
        model: "img-1",
        variations: 99,
        width: 512,
        height: 512
      })
    );

    // The variation count is clamped to 8.
    expect(requestedVariations).toBe(8);
    const [assistant] = assistantFrames(harness);
    const content = assistant.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    for (const block of content) {
      expect(block.type).toBe("image_url");
      const image = block.image as Record<string, unknown>;
      expect(typeof image.asset_id).toBe("string");
      // Raw bytes never ride the frame.
      expect(image.data).toBeUndefined();
    }
    // Progress chunk before, done chunk after.
    const chunks = harness.session.messagesOfType("chunk");
    expect(chunks[0].done).toBe(false);
    expect(
      (chunks[0].content_metadata as Record<string, unknown>).media_generation
    ).toBeDefined();
    expect(chunks[chunks.length - 1].done).toBe(true);
    // Persisted for the next turn.
    const [rows] = await Message.paginate("t-media-img", { limit: 10 });
    expect(rows.some((m) => m.role === "assistant")).toBe(true);
  });

  it("routes through imageToImages when an entity carries reference images", async () => {
    let calledWith: Uint8Array[] | null = null;
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            imageToImages: async (images) => {
              calledWith = images as Uint8Array[];
              return [PNG];
            }
          })
      },
      deps: {
        resolveEntityReferenceImages: async () => [PNG]
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-entity", {
        mode: "image",
        provider: "mock",
        model: "img-1"
      })
    );
    expect(calledWith).toHaveLength(1);
    expect(assistantFrames(harness)).toHaveLength(1);
  });

  it("stops persisting when the turn is cancelled mid-generation", async () => {
    const controller = new AbortController();
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            textToImages: async () => {
              // Stop lands while the provider is still working.
              controller.abort();
              return [PNG];
            }
          })
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-cancel", {
        mode: "image",
        provider: "mock",
        model: "img-1"
      }),
      undefined,
      controller.signal
    );
    // No done chunk, no assistant message, nothing persisted beyond the user row.
    expect(
      harness.session.messagesOfType("chunk").filter((c) => c.done === true)
    ).toHaveLength(0);
    expect(assistantFrames(harness)).toHaveLength(0);
    const [rows] = await Message.paginate("t-media-cancel", { limit: 10 });
    expect(rows.filter((m) => m.role === "assistant")).toHaveLength(0);
  });
});

describe("video generation", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("uses text-to-video when no source image is attached", async () => {
    let textToVideoCalled = false;
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            textToVideo: async () => {
              textToVideoCalled = true;
              return PNG;
            }
          })
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-vid", {
        mode: "video",
        provider: "mock",
        model: "vid-1",
        aspect_ratio: "16:9",
        resolution: "720p",
        duration: 5
      })
    );
    expect(textToVideoCalled).toBe(true);
    const [assistant] = assistantFrames(harness);
    const [block] = assistant.content as Array<Record<string, unknown>>;
    expect(block.type).toBe("video");
    const video = block.video as Record<string, unknown>;
    expect(video.format).toBe("mp4");
    expect(video.duration).toBe(5);
    expect(typeof video.asset_id).toBe("string");
  });

  it("routes to image-to-video when the message carries a source image", async () => {
    let i2vCalled = false;
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            imageToVideo: async () => {
              i2vCalled = true;
              return PNG;
            },
            textToVideo: async () => {
              throw new Error("must not fall back to text-to-video");
            }
          })
      },
      deps: {
        resolveSourceImageBytes: async () => PNG
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-i2v", {
        mode: "video",
        provider: "mock",
        model: "vid-1"
      })
    );
    expect(i2vCalled).toBe(true);
    expect(assistantFrames(harness)).toHaveLength(1);
  });
});

describe("image_edit and image_to_video", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("refuses image_edit without a source image", async () => {
    const harness = makeChatTurnHarness({
      session: { resolveProvider: async () => fakeProvider({}) }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-edit-nosrc", {
        mode: "image_edit",
        provider: "mock",
        model: "img-1"
      })
    );
    const [err] = harness.session.messagesOfType("error");
    expect(String(err.message)).toContain("A source image is required");
  });

  it("refuses a zero-length source image the same way", async () => {
    const harness = makeChatTurnHarness({
      session: { resolveProvider: async () => fakeProvider({}) },
      deps: { resolveSourceImageBytes: async () => new Uint8Array(0) }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-edit-empty", {
        mode: "image_edit",
        provider: "mock",
        model: "img-1"
      })
    );
    const [err] = harness.session.messagesOfType("error");
    expect(String(err.message)).toContain("A source image is required");
  });

  it("edits against the source image plus entity references", async () => {
    let sources: Uint8Array[] | null = null;
    const entityBytes = new Uint8Array([1, 2, 3]);
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            imageToImages: async (images) => {
              sources = images as Uint8Array[];
              return [PNG];
            }
          })
      },
      deps: {
        resolveSourceImageBytes: async () => PNG,
        resolveEntityReferenceImages: async () => [entityBytes]
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-edit", {
        mode: "image_edit",
        provider: "mock",
        model: "img-1",
        strength: 0.6,
        num_inference_steps: 12
      })
    );
    expect(sources).toEqual([PNG, entityBytes]);
    const [assistant] = assistantFrames(harness);
    const content = assistant.content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe("image_url");
  });

  it("animates a source image with image_to_video", async () => {
    let i2vCalled = false;
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            imageToVideo: async () => {
              i2vCalled = true;
              return PNG;
            }
          })
      },
      deps: { resolveSourceImageBytes: async () => PNG }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-i2v2", {
        mode: "image_to_video",
        provider: "mock",
        model: "vid-1",
        duration: 3
      })
    );
    expect(i2vCalled).toBe(true);
    const [assistant] = assistantFrames(harness);
    const [block] = assistant.content as Array<Record<string, unknown>>;
    expect(block.type).toBe("video");
    expect((block.video as Record<string, unknown>).duration).toBe(3);
  });
});

describe("audio generation", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("prefers the provider's encoded audio and keeps its mime type", async () => {
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            textToSpeechEncoded: async () => ({
              data: new Uint8Array([1, 2, 3]),
              mimeType: "audio/mpeg"
            })
          })
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-audio-enc", {
        mode: "audio",
        provider: "mock",
        model: "tts-1",
        voice: "alloy",
        // Requesting wav while the provider returns mp3 exercises the
        // native-format fallback warning path.
        audio_format: "wav"
      })
    );
    const [assistant] = assistantFrames(harness);
    const [block] = assistant.content as Array<Record<string, unknown>>;
    expect(block.type).toBe("audio");
    expect((block.audio as Record<string, unknown>).mimeType).toBe(
      "audio/mpeg"
    );
  });

  it("wraps streamed PCM into a WAV container when nothing encoded exists", async () => {
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            textToSpeechEncoded: async () => null,
            textToSpeech: async function* () {
              yield { samples: new Int16Array([0, 1000, -1000]), sampleRate: 16000 };
              yield { samples: new Int16Array([500, -500]) };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-audio-pcm", {
        mode: "audio",
        provider: "mock",
        model: "tts-1"
      })
    );
    const [assistant] = assistantFrames(harness);
    const [block] = assistant.content as Array<Record<string, unknown>>;
    expect((block.audio as Record<string, unknown>).mimeType).toBe(
      "audio/wav"
    );
  });

  it("returns raw PCM when the client asked for pcm", async () => {
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            textToSpeechEncoded: async () => null,
            textToSpeech: async function* () {
              yield { samples: new Int16Array([1, 2, 3]), sampleRate: 24000 };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(
      mediaTurn("t-media-audio-raw", {
        mode: "audio",
        provider: "mock",
        model: "tts-1",
        audio_format: "pcm"
      })
    );
    const [assistant] = assistantFrames(harness);
    const [block] = assistant.content as Array<Record<string, unknown>>;
    expect((block.audio as Record<string, unknown>).mimeType).toBe(
      "audio/pcm"
    );
  });
});
