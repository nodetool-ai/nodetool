import { z } from "zod";
import { uiSearchModelsParams } from "@nodetool/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { trpc } from "../../trpc";

type RawModel = {
  id?: string;
  name?: string;
  provider?: string | null;
  type?: string | null;
  repo_id?: string | null;
  description?: string | null;
  downloaded?: boolean | null;
};

// Map agent-facing kinds to the tRPC `recommended*` endpoints. Each query
// returns a list of UnifiedModels for that task.
const KIND_TO_QUERY: Record<string, () => Promise<unknown>> = {
  text_to_image: () => trpc.models.recommendedImageTextToImage.query(),
  image_to_image: () => trpc.models.recommendedImageImageToImage.query(),
  text_to_video: () => trpc.models.recommendedVideoTextToVideo.query(),
  image_to_video: () => trpc.models.recommendedVideoImageToVideo.query(),
  text_to_speech: () => trpc.models.recommendedTts.query(),
  speech_to_text: () => trpc.models.recommendedAsr.query(),
  text_generation: () => trpc.models.recommendedLanguageTextGeneration.query(),
  embedding: () => trpc.models.recommendedLanguageEmbedding.query()
};

FrontendToolRegistry.register({
  name: "ui_search_models",
  description:
    "List recommended AI models for a given task category. Use this to find a `model` value before configuring nodes like nodetool.image.TextToImage, nodetool.audio.TextToSpeech, nodetool.agents.Agent, etc.",
  parameters: z.object(uiSearchModelsParams),
  async execute({ kind, limit }) {
    const query = KIND_TO_QUERY[kind];
    if (!query) {
      throw new Error(`Unknown model kind: ${kind}`);
    }
    const max = Math.max(1, Math.min(50, limit ?? 20));
    const raw = (await query()) as RawModel[];
    const models = (raw ?? []).slice(0, max).map((m) => ({
      id: m.id ?? m.repo_id ?? m.name ?? "",
      name: m.name ?? m.id ?? m.repo_id ?? "",
      provider: m.provider ?? null,
      type: m.type ?? null,
      repo_id: m.repo_id ?? null,
      downloaded: m.downloaded ?? null,
      description: m.description ?? null
    }));
    return {
      ok: true,
      kind,
      count: models.length,
      models
    };
  }
});
