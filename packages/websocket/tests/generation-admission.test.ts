import { beforeEach, describe, expect, it, vi } from "vitest";

const admitSpend = vi.fn();
const admitQuota = vi.fn();
const reserveSpend = vi.fn();
const releaseSpend = vi.fn();
const getModelUnitPrice = vi.fn();

vi.mock("../src/credit-gate.js", () => ({
  admitSpend: (...args: unknown[]) => admitSpend(...args),
  reserveSpend: (...args: unknown[]) => reserveSpend(...args),
  releaseSpend: (...args: unknown[]) => releaseSpend(...args)
}));
vi.mock("@nodetool-ai/model-pricing", () => ({
  getModelUnitPrice: (...args: unknown[]) => getModelUnitPrice(...args)
}));
vi.mock("../src/quota-gate.js", () => ({
  admitQuota: (...args: unknown[]) => admitQuota(...args)
}));

import type { ProcessingContext, ProcessingMessage } from "@nodetool-ai/runtime";
import {
  GenerationRefusedError,
  admitGenerationRequest,
  estimateGenerationSpend,
  generationAdmissionFor
} from "../src/lib/generation-admission.js";

beforeEach(() => {
  admitSpend.mockReset().mockResolvedValue({ allowed: true });
  admitQuota.mockReset().mockResolvedValue({ allowed: true });
  reserveSpend.mockReset();
  releaseSpend.mockReset();
  getModelUnitPrice.mockReset().mockReturnValue(null);
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

describe("estimateGenerationSpend", () => {
  it("prices a managed media call from the catalog and the request size", () => {
    getModelUnitPrice.mockReturnValue({ unit_price: 0.5, declined: false });
    expect(
      estimateGenerationSpend({
        provider: "nodetool",
        capability: "text_to_video",
        model: "veo",
        params: { duration: 8, resolution: "1080p" }
      })
    ).toBe(0.5);
    expect(getModelUnitPrice).toHaveBeenCalledWith(
      { id: "veo", provider: "nodetool" },
      expect.objectContaining({ seconds: 8 })
    );
    expect(
      estimateGenerationSpend({
        provider: "nodetool",
        capability: "text_to_image",
        model: "flux",
        params: { num_images: 3 }
      })
    ).toBe(1.5);
  });

  it("estimates 0 off the managed provider, for token calls and unpriced models", () => {
    getModelUnitPrice.mockReturnValue({ unit_price: 0.5, declined: false });
    expect(
      estimateGenerationSpend({ provider: "fal_ai", capability: "text_to_image", model: "flux" })
    ).toBe(0);
    expect(
      estimateGenerationSpend({ provider: "nodetool", capability: "generate_message", model: "m" })
    ).toBe(0);
    getModelUnitPrice.mockReturnValue(null);
    expect(
      estimateGenerationSpend({ provider: "nodetool", capability: "text_to_image", model: "x" })
    ).toBe(0);
  });
});

describe("generationAdmissionFor", () => {
  function fakeContext(): { context: ProcessingContext; emit: (m: ProcessingMessage) => void } {
    const listeners: Array<(m: ProcessingMessage) => void> = [];
    const context = {
      addMessageListener: (listener: (m: ProcessingMessage) => void) => {
        listeners.push(listener);
        return () => {};
      }
    } as unknown as ProcessingContext;
    return { context, emit: (m) => listeners.forEach((listener) => listener(m)) };
  }

  it("admits against the estimate and holds it until the generation ends", async () => {
    getModelUnitPrice.mockReturnValue({ unit_price: 2, declined: false });
    const { context, emit } = fakeContext();
    const admit = generationAdmissionFor("u1", context);
    await admit(
      { provider: "nodetool", capability: "text_to_video", model: "veo" },
      "gen-1"
    );
    expect(admitSpend).toHaveBeenCalledWith("u1", 2, ["veo"]);
    expect(reserveSpend).toHaveBeenCalledWith("u1", "mcp-generation:gen-1", 2);

    emit({ type: "prediction", id: "gen-1", status: "running" } as unknown as ProcessingMessage);
    expect(releaseSpend).not.toHaveBeenCalled();
    emit({ type: "prediction", id: "gen-1", status: "failed" } as unknown as ProcessingMessage);
    expect(releaseSpend).toHaveBeenCalledWith("u1", "mcp-generation:gen-1");
  });

  it("reserves nothing when the call is refused or has no estimate", async () => {
    const { context } = fakeContext();
    const admit = generationAdmissionFor("u1", context);
    await admit({ provider: "nodetool", capability: "text_to_image", model: "x" }, "gen-2");
    getModelUnitPrice.mockReturnValue({ unit_price: 2, declined: false });
    admitSpend.mockResolvedValue({ allowed: false, refusal: "insufficient_credits", reason: "No credits." });
    await expect(
      admit({ provider: "nodetool", capability: "text_to_video", model: "veo" }, "gen-3")
    ).rejects.toThrow("No credits.");
    expect(reserveSpend).not.toHaveBeenCalled();
  });
});
