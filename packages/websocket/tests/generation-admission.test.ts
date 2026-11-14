import { beforeEach, describe, expect, it, vi } from "vitest";

const admitSpend = vi.fn();
const admitQuota = vi.fn();

vi.mock("../src/credit-gate.js", () => ({
  admitSpend: (...args: unknown[]) => admitSpend(...args)
}));
vi.mock("../src/quota-gate.js", () => ({
  admitQuota: (...args: unknown[]) => admitQuota(...args)
}));

import {
  GenerationRefusedError,
  admitGenerationRequest
} from "../src/lib/generation-admission.js";

beforeEach(() => {
  admitSpend.mockReset().mockResolvedValue({ allowed: true });
  admitQuota.mockReset().mockResolvedValue({ allowed: true });
});

describe("admitGenerationRequest", () => {
  it("checks credits only for the managed provider", async () => {
    await admitGenerationRequest("u1", {
      provider: "fal_ai",
      capability: "text_to_image",
      model: "flux"
    });
    expect(admitSpend).not.toHaveBeenCalled();
    expect(admitQuota).toHaveBeenCalledWith("u1", [
      { kind: "media", provider: "fal_ai" }
    ]);

    await admitGenerationRequest("u1", {
      provider: "nodetool",
      capability: "text_to_image",
      model: "nodetool-flux"
    });
    expect(admitSpend).toHaveBeenCalledWith("u1", 0, ["nodetool-flux"]);
  });

  it("counts text capabilities against the token budget", async () => {
    await admitGenerationRequest("u1", {
      provider: "openrouter",
      capability: "generate_message",
      model: "m"
    });
    expect(admitQuota).toHaveBeenCalledWith("u1", [
      { kind: "tokens", provider: "openrouter" }
    ]);
  });

  it("refuses with the credit gate's reason", async () => {
    admitSpend.mockResolvedValue({
      allowed: false,
      refusal: "insufficient_credits",
      reason: "You are out of credits."
    });
    await expect(
      admitGenerationRequest("u1", {
        provider: "nodetool",
        capability: "text_to_video",
        model: "veo"
      })
    ).rejects.toThrow(new GenerationRefusedError("You are out of credits."));
    expect(admitQuota).not.toHaveBeenCalled();
  });

  it("refuses with the quota gate's reason", async () => {
    admitQuota.mockResolvedValue({
      allowed: false,
      kind: "permission",
      reason: "You are not allowed to generate media."
    });
    await expect(
      admitGenerationRequest("u1", {
        provider: "fal_ai",
        capability: "text_to_image",
        model: "flux"
      })
    ).rejects.toThrow("You are not allowed to generate media.");
  });
});
