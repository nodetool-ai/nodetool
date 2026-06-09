/**
 * Mutation-hardening for the Moonshot (Kimi) provider — an Anthropic-SDK
 * subclass pointed at Moonshot's Claude-compatible endpoint. Pins the
 * whitespace-key rejection and the default client baseURL. See MUTATION_TESTING.md.
 */
import { describe, it, expect } from "vitest";
import { MoonshotProvider } from "../../src/providers/moonshot-provider.js";

describe("MoonshotProvider hardening", () => {
  it("rejects a whitespace-only API key (not just a missing one)", () => {
    expect(() => new MoonshotProvider({ KIMI_API_KEY: "   " })).toThrow(
      "KIMI_API_KEY is not configured"
    );
  });

  it("builds an Anthropic client at the Moonshot base URL by default", () => {
    const p = new MoonshotProvider({ KIMI_API_KEY: "k" });
    expect(p.getClient().baseURL).toBe("https://api.kimi.com/coding");
  });
});
