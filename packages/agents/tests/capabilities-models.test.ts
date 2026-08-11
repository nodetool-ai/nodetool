/**
 * The `models` capability module: registry hygiene, classification parity with
 * the map the gate reads today, identity parity with the deprecated tool
 * classes, and one behavioral round trip per capability through the adapter.
 */

import { describe, expect, it } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  ImageModel,
  LanguageModel,
  ProcessingContext,
  ProviderId
} from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import {
  MODEL_CAPABILITIES,
  findModel,
  listModels,
  listProviderModels
} from "../src/capabilities/models.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { FindModelTool } from "../src/tools/find-model-tool.js";
import { ListModelsTool } from "../src/tools/list-models-tool.js";
import { ListProviderModelsTool } from "../src/tools/model-tools.js";
import { Tool } from "../src/tools/base-tool.js";

const ctx = { userId: "u1" } as ProcessingContext;

class FakeImageProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: ImageModel[]
  ) {
    super(id);
  }
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.models;
  }
}

class FakeLanguageProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: LanguageModel[]
  ) {
    super(id);
  }
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.models;
  }
}

function asTool(
  entry: CapabilityExport,
  providers: Record<string, BaseProvider> = {}
): Tool {
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate: UNGATED, providers })
  );
}

describe("models capability module", () => {
  it("registers without drift", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
    const mod = await loadCapabilityModule("models");
    expect(mod.module).toBe("models");
    expect(mod.exports.map((e) => e.spec.name)).toEqual([
      "find_model",
      "list_models",
      "list_provider_models"
    ]);
  });

  it("classes every export the way the permission map does", () => {
    for (const entry of MODEL_CAPABILITIES) {
      expect(entry.spec.category).toBe(permissionCategoryFor(entry.spec.name));
    }
  });
});

describe("wire identity against the deprecated classes", () => {
  const pairs: [CapabilityExport, Tool][] = [
    [findModel, new FindModelTool({})],
    [listModels, new ListModelsTool({})],
    [listProviderModels, new ListProviderModelsTool({})]
  ];

  it.each(
    pairs.map(([entry, tool]): [string, CapabilityExport, Tool] => [
      entry.spec.name,
      entry,
      tool
    ])
  )("%s keeps its name, description and schema", (name, entry, tool) => {
    expect(tool.name).toBe(name);
    expect(tool.description).toBe(entry.spec.description);
    expect(tool.inputSchema).toEqual(entry.spec.inputSchema);
  });
});

describe("find_model through the adapter", () => {
  it("ranks a model hint above a recommended default", async () => {
    const openai = new FakeImageProvider("openai" as ProviderId, [
      { id: "dall-e-3", name: "DALL·E 3", provider: "openai" } as ImageModel,
      { id: "gpt-image-1", name: "GPT Image", provider: "openai" } as ImageModel
    ]);
    const tool = asTool(findModel, { openai });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      model_hint: ["gpt-image-1"]
    })) as { total: number; results: { model_id: string }[] };
    expect(result.total).toBe(2);
    expect(result.results[0].model_id).toBe("gpt-image-1");
  });

  it("says so when the run carries no providers", async () => {
    const result = (await asTool(findModel).process(ctx, {
      capability: "text_to_image"
    })) as { note: string; results: unknown[] };
    expect(result.results).toEqual([]);
    expect(result.note).toMatch(/No providers configured/);
  });

  it("reads the providers map at call time", async () => {
    // The MCP mount passes an empty map by reference and fills it lazily.
    const providers: Record<string, BaseProvider> = {};
    const tool = asTool(findModel, providers);
    providers["openai"] = new FakeImageProvider("openai" as ProviderId, [
      { id: "dall-e-3", name: "DALL·E 3", provider: "openai" } as ImageModel
    ]);
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { total: number };
    expect(result.total).toBe(1);
  });
});

describe("list_models through the adapter", () => {
  it("lists every configured provider's models, sorted", async () => {
    const tool = asTool(listModels, {
      openai: new FakeLanguageProvider("openai" as ProviderId, [
        { id: "gpt-5", name: "GPT-5", provider: "openai" } as LanguageModel
      ]),
      ollama: new FakeLanguageProvider("ollama" as ProviderId, [
        { id: "qwen3", name: "Qwen 3", provider: "ollama" } as LanguageModel
      ])
    });
    const result = (await tool.process(ctx, { model_type: "language" })) as {
      total: number;
      results: { provider: string; downloaded: boolean }[];
    };
    expect(result.total).toBe(2);
    expect(result.results.map((r) => r.provider)).toEqual(["ollama", "openai"]);
    // ollama runs locally, so its models report as downloaded.
    expect(result.results[0].downloaded).toBe(true);
  });

  it("rejects an unknown model type", async () => {
    const result = (await asTool(listModels).process(ctx, {
      model_type: "hologram"
    })) as { error: string };
    expect(result.error).toMatch(/model_type must be one of/);
  });
});

describe("list_provider_models through the adapter", () => {
  it("returns the provider's language models", async () => {
    const tool = asTool(listProviderModels, {
      openai: new FakeLanguageProvider("openai" as ProviderId, [
        { id: "gpt-5", name: "GPT-5", provider: "openai" } as LanguageModel
      ])
    });
    expect(await tool.process(ctx, { provider: "openai" })).toEqual({
      success: true,
      provider: "openai",
      models: [{ id: "gpt-5", name: "GPT-5", provider: "openai" }]
    });
  });

  it("names an unconfigured provider", async () => {
    expect(
      await asTool(listProviderModels).process(ctx, { provider: "nope" })
    ).toEqual({ success: false, error: "Unknown provider: nope" });
  });
});
