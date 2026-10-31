import { z } from "zod";
import { unifiedModel } from "@nodetool-ai/protocol/api-schemas/models.js";
import { createRpcClient } from "@nodetool-ai/cli-common/rpc-client";

const modelsOutput = z.array(unifiedModel);
const recommendedOutput = z.array(unifiedModel.extend({
  modality: z.enum(["language", "image", "tts", "asr", "video", "music", "audio_to_audio"]),
  task: z.enum(["text_generation", "embedding", "text_to_image", "image_to_image", "text_to_video", "image_to_video", "video_to_video"]).optional(),
  supported_systems: z.array(z.enum(["darwin", "linux", "windows"])).optional()
}));

/** Validate remote model records without importing the server application. */
export function createApiClient(apiUrl: string) {
  const client = createRpcClient(apiUrl);
  const query = (path: string) => ({ query: async (input?: unknown) => modelsOutput.parse(await client.query(path, input)) });
  return { models: {
    all: query("models.all"),
    ollama: query("models.ollama"),
    huggingfaceSearch: query("models.huggingfaceSearch"),
    huggingfaceList: query("models.huggingfaceList"),
    recommended: { query: async (input?: unknown) => recommendedOutput.parse(await client.query("models.recommended", input)) }
  } };
}
