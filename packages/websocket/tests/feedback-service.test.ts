import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackSubmission } from "../src/feedback-api.js";
import {
  submitFeedback,
  type FeedbackServiceAdapters,
  type FeedbackServiceConfig
} from "../src/services/feedback-service.js";

const baseSubmission: FeedbackSubmission = {
  username: "rkt",
  feedbackType: "bug",
  message: "The app crashed while saving.",
  destinations: ["discord", "email"],
  attachments: []
};

describe("submitFeedback", () => {
  let adapters: FeedbackServiceAdapters;

  beforeEach(() => {
    adapters = {
      sendDiscordFeedback: vi.fn(async () => undefined),
      sendEmailFeedback: vi.fn(async () => undefined)
    };
  });

  it("delivers feedback to the requested configured destinations", async () => {
    const config: FeedbackServiceConfig = {
      discord: { enabled: true },
      email: { enabled: true }
    };

    const result = await submitFeedback(baseSubmission, {
      config,
      adapters
    });

    expect(adapters.sendDiscordFeedback).toHaveBeenCalledOnce();
    expect(adapters.sendEmailFeedback).toHaveBeenCalledOnce();
    expect(result.deliveredTo).toEqual(["discord", "email"]);
  });

  it("rejects requests when none of the requested destinations are configured", async () => {
    const config: FeedbackServiceConfig = {
      discord: { enabled: false },
      email: { enabled: false }
    };

    await expect(
      submitFeedback(baseSubmission, { config, adapters })
    ).rejects.toThrow("No feedback destinations are configured");

    expect(adapters.sendDiscordFeedback).not.toHaveBeenCalled();
    expect(adapters.sendEmailFeedback).not.toHaveBeenCalled();
  });
});
