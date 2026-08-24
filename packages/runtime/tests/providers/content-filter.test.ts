/**
 * Classification of provider content-filter refusals.
 *
 * The point of the class is that it separates a refusal from a hard error, so
 * both halves are pinned here: the phrasings providers actually send, and the
 * ordinary failures that must NOT be read as refusals — misclassifying a 401
 * as retryable burns three attempts on a credential that will never work.
 */

import { describe, it, expect } from "vitest";
import {
  ContentFilterRefusal,
  contentFilterRetryDelayMs,
  isContentFilterRefusal,
  isContentFilterRefusalError
} from "../../src/providers/content-filter.js";

describe("isContentFilterRefusal", () => {
  it("recognizes the class", () => {
    const err = new ContentFilterRefusal("filtered", {
      provider: "gemini",
      model: "veo-3.1-generate-preview",
      reasons: ["58061214"]
    });
    expect(isContentFilterRefusalError(err)).toBe(true);
    expect(isContentFilterRefusal(err)).toBe(true);
    expect(err.provider).toBe("gemini");
    expect(err.reasons).toEqual(["58061214"]);
  });

  it.each([
    // The message from the issue, verbatim.
    "Gemini video generation failed: videos were filtered out because they violated Vertex AI's usage guidelines",
    "raiMediaFilteredCount: 1",
    "Candidate blocked: PROHIBITED_CONTENT",
    "The response was blocked due to safety concerns",
    "Your request was rejected as a result of our safety system.",
    "400 content_policy_violation",
    "moderation_blocked",
    "The response was filtered due to the prompt triggering Azure OpenAI's content management policy",
    "NSFW content detected in the output image",
    "Input flagged as sensitive",
    "Your prompt contains sensitive words",
    "Blocked by the safety filter",
    "This prompt violates our usage policy"
  ])("recognizes %s", (message) => {
    expect(isContentFilterRefusal(new Error(message))).toBe(true);
    expect(isContentFilterRefusal(message)).toBe(true);
  });

  it.each([
    "401 Incorrect API key provided",
    "403 Your request was blocked.",
    "429 Rate limit reached for this model",
    "fetch failed",
    "Video generation timed out",
    "No video URI in response",
    "No operation name for polling",
    "Poll failed 500: upstream error"
  ])("does not classify %s", (message) => {
    expect(isContentFilterRefusal(new Error(message))).toBe(false);
  });

  it("classifies nothing when there is no message to read", () => {
    expect(isContentFilterRefusal(undefined)).toBe(false);
    expect(isContentFilterRefusal(null)).toBe(false);
    expect(isContentFilterRefusal({})).toBe(false);
    expect(isContentFilterRefusal(new Error(""))).toBe(false);
  });

  it("backs off between attempts and stops climbing", () => {
    expect(contentFilterRetryDelayMs(1)).toBe(1_000);
    expect(contentFilterRetryDelayMs(2)).toBe(2_000);
    expect(contentFilterRetryDelayMs(20)).toBe(8_000);
  });
});
