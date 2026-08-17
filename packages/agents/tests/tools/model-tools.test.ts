/**
 * Tests for ListProviderModelsTool (model-tools.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { toolForCapabilityName } from "../../src/capabilities/lazy-tool.js";
import { UNGATED, createCapabilityRun } from "../../src/capabilities/index.js";
import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";

/** The provider map was a constructor argument; it now rides on the run. */
function listProviderModelsTool(providers: Record<string, BaseProvider>) {
  return toolForCapabilityName("list_provider_models", (context) =>
    createCapabilityRun({ context, gate: UNGATED, providers })
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const mockContext = {} as ProcessingContext;

function makeProvider(models: string[]) {
  return {
    getAvailableLanguageModels: vi.fn().mockResolvedValue(models)
  };
}

/* ------------------------------------------------------------------ */
/*  Schema / metadata                                                 */
/* ------------------------------------------------------------------ */

describe("ListProviderModelsTool metadata", () => {
  it("has correct name", () => {
    const tool = listProviderModelsTool({});
    expect(tool.name).toBe("list_provider_models");
  });

  it("describes what it lists and what it needs", () => {
    const tool = listProviderModelsTool({});
    expect(tool.description).toMatch(/models/i);
    expect(tool.description).toMatch(/provider/i);
  });

  it("inputSchema requires 'provider' property", () => {
    const tool = listProviderModelsTool({});
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain("provider");
  });

  it("toProviderTool returns correct shape", () => {
    const tool = listProviderModelsTool({});
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("list_provider_models");
    expect(pt.inputSchema).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  process — happy path                                              */
/* ------------------------------------------------------------------ */

describe("ListProviderModelsTool process — happy path", () => {
  it("returns models from the specified provider", async () => {
    const provider = makeProvider(["gpt-4", "gpt-3.5-turbo"]);
    const tool = listProviderModelsTool({ openai: provider as any });

    const result = (await tool.process(mockContext, {
      provider: "openai"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.provider).toBe("openai");
    expect(result.models).toEqual(["gpt-4", "gpt-3.5-turbo"]);
  });

  it("calls getAvailableLanguageModels on the provider", async () => {
    const provider = makeProvider(["claude-3"]);
    const tool = listProviderModelsTool({ anthropic: provider as any });

    await tool.process(mockContext, { provider: "anthropic" });

    expect(provider.getAvailableLanguageModels).toHaveBeenCalledOnce();
  });
});

/* ------------------------------------------------------------------ */
/*  process — error cases                                             */
/* ------------------------------------------------------------------ */

describe("ListProviderModelsTool process — errors", () => {
  it("returns error when provider param is not a string", async () => {
    const tool = listProviderModelsTool({});
    const result = (await tool.process(mockContext, {
      provider: 42
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/string/);
  });

  it("returns error for unknown provider ID", async () => {
    const tool = listProviderModelsTool({});
    const result = (await tool.process(mockContext, {
      provider: "unknown_xyz"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown/i);
  });

  it("returns error when provider lacks getAvailableLanguageModels", async () => {
    const providerWithoutMethod = { someOtherMethod: vi.fn() };
    const tool = listProviderModelsTool({
      broken: providerWithoutMethod as any
    });

    const result = (await tool.process(mockContext, {
      provider: "broken"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not support/i);
  });

  it("returns error when getAvailableLanguageModels throws", async () => {
    const provider = {
      getAvailableLanguageModels: vi
        .fn()
        .mockRejectedValue(new Error("API unavailable"))
    };
    const tool = listProviderModelsTool({ failing: provider as any });

    const result = (await tool.process(mockContext, {
      provider: "failing"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/API unavailable/);
  });

  it("handles non-Error thrown values", async () => {
    const provider = {
      getAvailableLanguageModels: vi.fn().mockRejectedValue("string error")
    };
    const tool = listProviderModelsTool({ failing: provider as any });

    const result = (await tool.process(mockContext, {
      provider: "failing"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/string error/);
  });
});
