/**
 * The model catalog behind `ModelSelect`: every model the providers with a key
 * in `.env` can list, as model references a graph property accepts.
 *
 * Listing asks each configured provider once per model kind and keeps the
 * answer for the life of the process. Restart the server after changing keys.
 */
import {
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";

/** Model reference type → the provider method that lists that kind. */
const LISTERS = {
  language_model: "getAvailableLanguageModels",
  image_model: "getAvailableImageModels",
  video_model: "getAvailableVideoModels",
  tts_model: "getAvailableTTSModels",
  asr_model: "getAvailableASRModels",
  music_model: "getAvailableMusicModels",
  embedding_model: "getAvailableEmbeddingModels",
  audio_to_audio_model: "getAvailableAudioToAudioModels"
};

export const MODEL_KINDS = Object.keys(LISTERS);

const getSecret = (key) => Promise.resolve(process.env[key] ?? null);

export function createModelCatalog() {
  const cache = new Map();

  async function listKind(kind) {
    const method = LISTERS[kind];
    const out = [];
    for (const providerId of listRegisteredProviderIds()) {
      try {
        if (!(await isProviderConfigured(providerId, getSecret))) continue;
        const provider = await getProvider(providerId, getSecret);
        if (typeof provider[method] !== "function") continue;
        for (const model of await provider[method]()) {
          out.push({
            type: kind,
            provider: model.provider ?? providerId,
            id: model.id,
            name: model.name ?? model.id,
            ...(Array.isArray(model.supportedTasks) ? { supported_tasks: model.supportedTasks } : {})
          });
        }
      } catch (error) {
        console.warn(`[models] ${providerId} could not list ${kind}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return out;
  }

  /** Models of one kind, narrowed to a task (`image_to_image`, ...) when given. */
  async function list(kind, task) {
    if (!LISTERS[kind]) return [];
    if (!cache.has(kind)) {
      const pending = listKind(kind);
      cache.set(kind, pending);
      pending.catch(() => cache.delete(kind));
    }
    const models = await cache.get(kind);
    return task
      ? models.filter((model) => !model.supported_tasks || model.supported_tasks.length === 0 || model.supported_tasks.includes(task))
      : models;
  }

  return { list };
}
