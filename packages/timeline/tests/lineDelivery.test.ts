import { describe, expect, it } from "vitest";
import {
  createLineDeliveryRequest,
  lineDeliveryGenerateMediaData
} from "../src/lineDelivery.js";

describe("line delivery request", () => {
  it("captures known Script context and resolves the effective cast voice", () => {
    const result = createLineDeliveryRequest({
      scriptId: "script-1",
      line: {
        id: "line-2",
        speakerId: "speaker-1",
        text: "Keep moving.",
        direction: "Quietly, with urgency",
        targetDurationMs: 2400
      },
      castMember: {
        id: "speaker-1",
        voice: {
          provider: "openai",
          model: "gpt-4o-mini-tts",
          voice: "coral"
        }
      },
      language: "en-US",
      pace: "fast"
    });

    expect(result).toEqual({
      ok: true,
      request: {
        action: "change_line_delivery",
        modelTask: "text_to_speech",
        sourceContext: {
          scriptId: "script-1",
          lineId: "line-2",
          speakerId: "speaker-1",
          text: "Keep moving.",
          voice: {
            provider: "openai",
            model: "gpt-4o-mini-tts",
            voice: "coral"
          },
          direction: "Quietly, with urgency",
          language: "en-US",
          pace: "fast",
          targetDurationMs: 2400
        },
        instructions: "Quietly, with urgency",
        speed: 1.15
      }
    });
    if (result.ok) {
      expect(Object.isFrozen(result.request)).toBe(true);
      expect(Object.isFrozen(result.request.sourceContext)).toBe(true);
      expect(Object.isFrozen(result.request.sourceContext.voice)).toBe(true);
    }
  });

  it.each([
    {
      name: "script id",
      input: {
        scriptId: "",
        line: { id: "line-1", text: "Hello" },
        castMember: {
          id: "speaker-1",
          voice: { provider: "p", model: "m", voice: "v" }
        }
      },
      error: "Change line delivery requires a linked scriptId."
    },
    {
      name: "line id",
      input: {
        scriptId: "script-1",
        line: { text: "Hello" },
        castMember: {
          id: "speaker-1",
          voice: { provider: "p", model: "m", voice: "v" }
        }
      },
      error: "Change line delivery requires a linked lineId."
    },
    {
      name: "text",
      input: {
        scriptId: "script-1",
        line: { id: "line-1", text: "   " },
        castMember: {
          id: "speaker-1",
          voice: { provider: "p", model: "m", voice: "v" }
        }
      },
      error: "Change line delivery requires nonempty line text."
    },
    {
      name: "voice",
      input: {
        scriptId: "script-1",
        line: { id: "line-1", text: "Hello", speakerId: "speaker-1" },
        castMember: { id: "speaker-1", voice: null }
      },
      error:
        "Change line delivery requires an effective voice with provider, model, and voice."
    }
  ])("rejects missing $name with a clear error", ({ input, error }) => {
    expect(createLineDeliveryRequest(input)).toEqual({ ok: false, error });
  });

  it("uses a line voice override and maps every captured input to generate_media", () => {
    const result = createLineDeliveryRequest({
      scriptId: "script-9",
      line: {
        id: "line-4",
        speakerId: "speaker-2",
        text: "Exact authored words",
        direction: "Original direction",
        targetDurationMs: 3250,
        voiceOverride: {
          provider: "elevenlabs",
          model: "eleven_multilingual_v2",
          voice: "voice-7"
        }
      },
      castMember: {
        id: "speaker-2",
        voice: { provider: "ignored", model: "ignored", voice: "ignored" }
      },
      language: "de",
      pace: "slow",
      speed: 0.9,
      instructions: "More restrained"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(lineDeliveryGenerateMediaData(result.request)).toEqual({
      mode: "audio",
      provider: "elevenlabs",
      model: "eleven_multilingual_v2",
      voice: "voice-7",
      prompt: "Exact authored words",
      instructions: "More restrained",
      language: "de",
      speed: 0.9,
      duration: 3.25,
      line_delivery_context: {
        script_id: "script-9",
        line_id: "line-4",
        speaker_id: "speaker-2",
        text: "Exact authored words",
        direction: "Original direction",
        instructions: "More restrained",
        language: "de",
        pace: "slow",
        speed: 0.9,
        target_duration_ms: 3250,
        voice: {
          provider: "elevenlabs",
          model: "eleven_multilingual_v2",
          voice: "voice-7"
        }
      }
    });
  });
});
