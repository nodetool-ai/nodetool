/**
 * PythonProvider must hand the caller's AbortSignal to the bridge for TTS and
 * text-to-audio, as it does for image and video, so an abort sends the worker
 * a `cancel` frame. It must also keep the signal out of the wire params: an
 * AbortSignal is not msgpack data.
 */

import { describe, it, expect, vi } from "vitest";

import { PythonProvider } from "../../src/providers/python-provider.js";
import type { PythonBridgeBase } from "../../src/python-bridge-base.js";

function makeBridge() {
  return {
    providerTTSEncoded: vi.fn().mockResolvedValue(new Uint8Array([1, 2])),
    providerTextToAudio: vi.fn().mockResolvedValue(new Uint8Array([1, 2])),
    providerTTS: vi.fn(async function* () {
      yield new Uint8Array([0, 0]);
    })
  };
}

function makeProvider(bridge: ReturnType<typeof makeBridge>): PythonProvider {
  return new PythonProvider({
    _id: "huggingface",
    _bridge: bridge as unknown as PythonBridgeBase,
    _capabilities: ["text_to_speech", "text_to_speech_encoded"]
  });
}

describe("PythonProvider audio cancellation", () => {
  it("passes the signal to providerTTSEncoded and keeps it out of params", async () => {
    const bridge = makeBridge();
    const signal = new AbortController().signal;
    await makeProvider(bridge).textToSpeechEncoded({
      text: "hi",
      model: "kokoro",
      signal
    });
    const [, params, , passed] = bridge.providerTTSEncoded.mock.calls[0]!;
    expect(passed).toBe(signal);
    expect(Object.hasOwn(params as object, "signal")).toBe(false);
  });

  it("passes the signal to providerTextToAudio and keeps it out of params", async () => {
    const bridge = makeBridge();
    const signal = new AbortController().signal;
    await makeProvider(bridge).textToMusic({
      prompt: "calm piano",
      model: { id: "musicgen", name: "musicgen", provider: "huggingface" },
      signal
    } as Parameters<PythonProvider["textToMusic"]>[0]);
    const [, params, , passed] = bridge.providerTextToAudio.mock.calls[0]!;
    expect(passed).toBe(signal);
    expect(Object.hasOwn(params as object, "signal")).toBe(false);
    expect((params as Record<string, unknown>)["model"]).toBe("musicgen");
  });

  it("passes the signal to the streaming providerTTS call", async () => {
    const bridge = makeBridge();
    const signal = new AbortController().signal;
    for await (const _ of makeProvider(bridge).textToSpeech({
      text: "hi",
      model: "kokoro",
      signal
    })) {
      // drain
    }
    expect(bridge.providerTTS.mock.calls[0]![4]).toBe(signal);
  });
});
