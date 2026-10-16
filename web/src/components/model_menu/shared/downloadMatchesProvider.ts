import type { UnifiedModel } from "../../../stores/ApiTypes";

const LLAMA_CPP_PROVIDERS = new Set(["llama_cpp", "node_llama_cpp"]);

/**
 * Whether a recommended download belongs under the provider picked in the
 * model menu's rail. A download names its provider when it has one. Ollama
 * tags (`llama_model`) belong to Ollama, and GGUF files to llama.cpp.
 */
export const downloadMatchesProvider = (
  model: UnifiedModel,
  providerId: string
): boolean => {
  if (model.provider) {
    return model.provider === providerId;
  }
  if (model.type === "llama_model") {
    return providerId === "ollama";
  }
  return LLAMA_CPP_PROVIDERS.has(providerId);
};
