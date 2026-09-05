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
  MusicModel,
  ProcessingContext,
  ProviderId,
  TTSModel,
  VideoModel
} from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityCategoryFor,
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
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
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

class FakeVideoProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: VideoModel[]
  ) {
    super(id);
  }
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
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

class FakeMusicProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: MusicModel[]
  ) {
    super(id);
  }
  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    return this.models;
  }
}

class FakeTTSProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: TTSModel[]
  ) {
    super(id);
  }
  override async getAvailableTTSModels(): Promise<TTSModel[]> {
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
      expect(entry.spec.category).toBe(capabilityCategoryFor(entry.spec.name));
    }
  });
});

describe("wire identity: a Tool built from the spec", () => {
  const pairs: [CapabilityExport, Tool][] = [
    [findModel, toolForCapabilityName("find_model")],
    [listModels, toolForCapabilityName("list_models")],
    [listProviderModels, toolForCapabilityName("list_provider_models")]
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
  /**
   * `results[0].ref` reads as if `results` and `ref` were alternatives, and
   * agents wrote `find_model(...).ref`. `undefined` is not an error, so it
   * went into a node's model property and surfaced much later as "Property
   * model requires a language_model to be selected" — on a graph whose model
   * line looked right. The obvious read is the correct one now.
   */
  it("answers the best model's ref at the top level", async () => {
    const openai = new FakeImageProvider("openai" as ProviderId, [
      { id: "dall-e-3", name: "DALL·E 3", provider: "openai" } as ImageModel
    ]);
    const tool = asTool(findModel, { openai });
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { ref?: unknown; results: { ref: unknown }[] };
    expect(result.ref).toBeDefined();
    expect(result.ref).toEqual(result.results[0].ref);
  });

  it("omits the top-level ref when nothing matched", async () => {
    const tool = asTool(findModel, {});
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { ref?: unknown; results: unknown[] };
    expect(result.results).toEqual([]);
    expect(result.ref).toBeUndefined();
  });

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

  it("finds a model by name across the punctuation its id uses", async () => {
    // The session this fixes lost four rounds here: the model was configured
    // the whole time and every search answered with something else.
    const providers = {
      openai: new FakeImageProvider("openai" as ProviderId, [
        {
          id: "gpt-image-2",
          name: "GPT Image 2",
          provider: "openai"
        } as ImageModel
      ]),
      huggingface: new FakeImageProvider("huggingface" as ProviderId, [
        {
          id: "black-forest-labs/FLUX.1-schnell",
          name: "FLUX.1 Schnell",
          provider: "huggingface"
        } as ImageModel,
        {
          id: "black-forest-labs/FLUX.1-dev",
          name: "FLUX.1 Dev",
          provider: "huggingface"
        } as ImageModel
      ])
    };
    const tool = asTool(findModel, providers);

    const byQuery = (await tool.process(ctx, {
      capability: "text_to_image",
      query: "flux schnell"
    })) as {
      total: number;
      query_matched: boolean;
      results: { model_id: string }[];
    };
    expect(byQuery.query_matched).toBe(true);
    expect(byQuery.total).toBe(1);
    expect(byQuery.results[0].model_id).toBe(
      "black-forest-labs/FLUX.1-schnell"
    );

    // A model name typed into `task` used to filter everything out.
    const byTask = (await tool.process(ctx, {
      capability: "text_to_image",
      task: "flux schnell"
    })) as { total: number; note: string; results: { model_id: string }[] };
    expect(byTask.results[0].model_id).toBe("black-forest-labs/FLUX.1-schnell");
    expect(byTask.note).toMatch(/searched model names/);

    // A fragment of an id is enough for model_hint.
    const byHint = (await tool.process(ctx, {
      capability: "text_to_image",
      model_hint: ["FLUX.1-dev"]
    })) as { results: { model_id: string }[] };
    expect(byHint.results[0].model_id).toBe("black-forest-labs/FLUX.1-dev");
  });

  it("does not offer an image-to-video model for text_to_video", async () => {
    // A live session picked `.../image-to-video` for a text-to-video call and
    // the provider answered 422. One video list serves both directions, so the
    // capability has to filter it.
    const fal = new FakeVideoProvider("fal_ai" as ProviderId, [
      {
        id: "alibaba/happy-horse/image-to-video",
        name: "Happy Horse Image To Video",
        provider: "fal_ai",
        supportedTasks: ["image_to_video"]
      } as VideoModel,
      {
        id: "alibaba/happy-horse/text-to-video",
        name: "Happy Horse Text To Video",
        provider: "fal_ai",
        supportedTasks: ["text_to_video"]
      } as VideoModel
    ]);
    const tool = asTool(findModel, { fal_ai: fal });

    const t2v = (await tool.process(ctx, {
      capability: "text_to_video"
    })) as { total: number; results: { model_id: string }[] };
    expect(t2v.results.map((r) => r.model_id)).toEqual([
      "alibaba/happy-horse/text-to-video"
    ]);

    // The query used to pull the wrong direction back in: "fast" (or any word
    // both ids carry) matched the image-to-video endpoint first.
    const queried = (await tool.process(ctx, {
      capability: "text_to_video",
      query: "happy horse"
    })) as { results: { model_id: string }[] };
    expect(queried.results.map((r) => r.model_id)).toEqual([
      "alibaba/happy-horse/text-to-video"
    ]);

    const i2v = (await tool.process(ctx, {
      capability: "image_to_video"
    })) as { results: { model_id: string }[] };
    expect(i2v.results.map((r) => r.model_id)).toEqual([
      "alibaba/happy-horse/image-to-video"
    ]);
  });

  it("says so when every video model declares another direction", async () => {
    const tool = asTool(findModel, {
      fal_ai: new FakeVideoProvider("fal_ai" as ProviderId, [
        {
          id: "topaz/upscale",
          name: "Topaz Upscale",
          provider: "fal_ai",
          supportedTasks: ["video_to_video"]
        } as VideoModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_video"
    })) as { total: number; note: string };
    expect(result.total).toBe(0);
    expect(result.note).toMatch(/none declares text_to_video/);
  });

  it("keeps a model that declares no tasks at all", async () => {
    const tool = asTool(findModel, {
      fal_ai: new FakeVideoProvider("fal_ai" as ProviderId, [
        { id: "some/clip", name: "Some Clip", provider: "fal_ai" } as VideoModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_video"
    })) as { total: number };
    expect(result.total).toBe(1);
  });

  it("reports each row's id under both names", async () => {
    // The ref nested in every result calls it `id`, so a caller reading the
    // rows next to the refs reaches for `id`. A live session printed a whole
    // catalog as `fal_ai/undefined` twice and concluded the install had none.
    const tool = asTool(findModel, {
      openai: new FakeImageProvider("openai" as ProviderId, [
        { id: "gpt-image-2", name: "GPT Image 2", provider: "openai" } as ImageModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { results: { id: string; model_id: string }[] };
    expect(result.results[0].id).toBe("gpt-image-2");
    expect(result.results[0].model_id).toBe("gpt-image-2");
  });

  it("hands back a music_model ref for text_to_music", async () => {
    // A `music_model` property refuses a `tts_model` ref, and the graph
    // validator then checks the id against the TTS catalog and reports a real
    // music model as one the provider does not offer. A live session lost
    // three rounds to that, retrying the same model under three ids.
    const tool = asTool(findModel, {
      fal_ai: new FakeMusicProvider("fal_ai" as ProviderId, [
        {
          id: "beatoven/music-generation",
          name: "Beatoven Music Generation",
          provider: "fal_ai"
        } as MusicModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_music"
    })) as { results: { ref: { type: string; id: string } }[] };
    expect(result.results[0].ref.type).toBe("music_model");
    expect(result.results[0].ref.id).toBe("beatoven/music-generation");
  });

  it("does not score a music search on a speech leaderboard", async () => {
    // The rankings artifact has no text_to_music task at all, so a candidate
    // ranked for text_to_speech used to take the whole rank bonus in a music
    // search: ElevenLabs' dialogue model (rank 13 of 100 for speech) came
    // back as the best music model this install had.
    const tool = asTool(findModel, {
      fal_ai: new FakeMusicProvider("fal_ai" as ProviderId, [
        {
          id: "fal-ai/elevenlabs/text-to-dialogue/eleven-v3",
          name: "Eleven Labs Text To Dialogue V3",
          provider: "fal_ai"
        } as MusicModel,
        {
          id: "beatoven/music-generation",
          name: "Beatoven Music Generation",
          provider: "fal_ai"
        } as MusicModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_music"
    })) as { results: { model_id: string; ranked_task?: string }[] };
    expect(result.results.some((r) => r.ranked_task === "text_to_speech")).toBe(
      false
    );
    expect(result.results[0].model_id).not.toBe(
      "fal-ai/elevenlabs/text-to-dialogue/eleven-v3"
    );
  });

  it("reads the speech leaderboard for a speech search", async () => {
    // The other half of the same rule: with no task from the caller, the
    // capability's own task is the one the leaderboard is read for.
    const tool = asTool(findModel, {
      fal_ai: new FakeTTSProvider("fal_ai" as ProviderId, [
        {
          id: "fal-ai/gemini-3.1-flash-tts",
          name: "Gemini 3.1 Flash TTS",
          provider: "fal_ai"
        } as TTSModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_speech"
    })) as { results: { ranked_task?: string; ref: { type: string } }[] };
    expect(result.results[0].ranked_task).toBe("text_to_speech");
    expect(result.results[0].ref.type).toBe("tts_model");
  });

  it("reports a missed search instead of ranking an unrelated model first", async () => {
    const tool = asTool(findModel, {
      openai: new FakeImageProvider("openai" as ProviderId, [
        {
          id: "gpt-image-2",
          name: "GPT Image 2",
          provider: "openai"
        } as ImageModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      query: "flux schnell"
    })) as { total: number; query_matched: boolean; note: string };
    expect(result.query_matched).toBe(false);
    expect(result.total).toBe(1);
    expect(result.note).toMatch(/No model name matched/);
  });

  it("does not rank a remote provider as if its models were downloaded", async () => {
    // `huggingface` is the HF Inference API. Counting it as local gave every
    // HF model a +30 bonus and put FLUX.1-schnell ahead of the fal_ai copy
    // that could actually run.
    const tool = asTool(findModel, {
      fal_ai: new FakeImageProvider("fal_ai" as ProviderId, [
        {
          id: "fal-ai/flux/schnell",
          name: "Flux Schnell",
          provider: "fal_ai"
        } as ImageModel
      ]),
      huggingface: new FakeImageProvider("huggingface" as ProviderId, [
        {
          id: "black-forest-labs/FLUX.1-schnell",
          name: "FLUX.1 Schnell",
          provider: "huggingface"
        } as ImageModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      query: "flux schnell"
    })) as { results: { provider: string; downloaded: boolean }[] };
    expect(result.results.map((r) => r.downloaded)).toEqual([false, false]);
    expect(result.results[0].provider).toBe("fal_ai");
  });

  it("skips a provider that cannot run here, and says which", async () => {
    // A configured provider whose optional SDK was never installed. The old
    // ranking offered it first and the failure surfaced on the paid call.
    class BrokenImageProvider extends FakeImageProvider {
      override async unavailableReason(): Promise<string | null> {
        return "@huggingface/inference is required for HuggingFaceProvider.";
      }
    }
    const tool = asTool(findModel, {
      fal_ai: new FakeImageProvider("fal_ai" as ProviderId, [
        {
          id: "fal-ai/flux/schnell",
          name: "Flux Schnell",
          provider: "fal_ai"
        } as ImageModel
      ]),
      huggingface: new BrokenImageProvider("huggingface" as ProviderId, [
        {
          id: "black-forest-labs/FLUX.1-schnell",
          name: "FLUX.1 Schnell",
          provider: "huggingface"
        } as ImageModel
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      query: "flux schnell"
    })) as {
      total: number;
      note: string;
      results: { provider: string }[];
    };
    expect(result.results.map((r) => r.provider)).toEqual(["fal_ai"]);
    expect(result.note).toMatch(/huggingface .*@huggingface\/inference/);
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
      results: { provider: string; id: string; downloaded: boolean }[];
    };
    expect(result.total).toBe(2);
    expect(result.results.map((r) => r.provider)).toEqual(["ollama", "openai"]);
    // Rows carry the id under both names — see find_model's `id` alias.
    expect(result.results.map((r) => r.id)).toEqual(["qwen3", "gpt-5"]);
    // ollama runs locally, so its models report as downloaded.
    expect(result.results[0].downloaded).toBe(true);
  });

  it("drops a provider that cannot run here from the listing", async () => {
    class BrokenLanguageProvider extends FakeLanguageProvider {
      override async unavailableReason(): Promise<string | null> {
        return "missing SDK";
      }
    }
    const result = (await asTool(listModels, {
      openai: new FakeLanguageProvider("openai" as ProviderId, [
        { id: "gpt-5", name: "GPT-5", provider: "openai" } as LanguageModel
      ]),
      huggingface: new BrokenLanguageProvider("huggingface" as ProviderId, [
        { id: "hf-1", name: "HF One", provider: "huggingface" } as LanguageModel
      ])
    }).process(ctx, { model_type: "language" })) as {
      total: number;
      note: string;
      results: { provider: string }[];
    };
    expect(result.results.map((r) => r.provider)).toEqual(["openai"]);
    expect(result.note).toMatch(/huggingface \(missing SDK\)/);
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
