import { describe, it, expect, vi } from "vitest";
import { MoonshotProvider } from "../../src/providers/moonshot-provider.js";

describe("MoonshotProvider", () => {
  it("reports required secrets and container env", () => {
    const provider = new MoonshotProvider(
      { MOONSHOT_API_KEY: "k" },
      { client: {} as any }
    );

    expect(MoonshotProvider.requiredSecrets()).toEqual(["MOONSHOT_API_KEY"]);
    expect(provider.getContainerEnv()).toEqual({
      MOONSHOT_API_KEY: "k",
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding"
    });
    expect((provider as unknown as { provider: string }).provider).toBe(
      "moonshot"
    );
  });

  it("throws when MOONSHOT_API_KEY is missing", () => {
    expect(() => new MoonshotProvider({}, { client: {} as any })).toThrow(
      "MOONSHOT_API_KEY is not configured"
    );
  });

  it("uses custom clientFactory with Kimi baseURL", () => {
    const clientFactory = vi.fn().mockReturnValue({ messages: { create: vi.fn() } });
    const provider = new MoonshotProvider(
      { MOONSHOT_API_KEY: "kimi-key" },
      { clientFactory }
    );

    // Force lazy client creation
    provider.getClient();
    expect(clientFactory).toHaveBeenCalledWith("kimi-key");
  });

  it("reports tool support for kimi models", async () => {
    const provider = new MoonshotProvider(
      { MOONSHOT_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("kimi-k2-turbo-preview")).toBe(true);
  });

  it("returns known Kimi models", async () => {
    const provider = new MoonshotProvider(
      { MOONSHOT_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableLanguageModels();
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.provider).toBe("moonshot");
      expect(model.id).toMatch(/^kimi-/);
    }
  });

  it("generates messages through the underlying Anthropic client", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "hello from kimi" }]
    });

    const provider = new MoonshotProvider(
      { MOONSHOT_API_KEY: "k" },
      {
        client: {
          messages: { create }
        } as any
      }
    );

    await expect(
      provider.generateMessage({
        model: "kimi-k2-turbo-preview",
        messages: [{ role: "user", content: "hi" }]
      })
    ).resolves.toEqual({
      role: "assistant",
      content: "hello from kimi",
      toolCalls: []
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
