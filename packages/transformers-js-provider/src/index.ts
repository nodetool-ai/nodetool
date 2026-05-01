import { registerProvider } from "@nodetool-ai/runtime";
import { TransformersJsProvider } from "./transformers-js-provider.js";

export { TransformersJsProvider } from "./transformers-js-provider.js";
export {
  discoverASRModels,
  discoverEmbeddingModels,
  discoverLanguageModels,
  discoverTTSModels
} from "./model-discovery.js";

let registered = false;

/**
 * Register the transformers.js provider with the global runtime registry.
 * Idempotent — safe to call multiple times. Server bootstrap calls this
 * once during startup.
 */
export function registerTransformersJsProvider(): void {
  if (registered) return;
  registerProvider("transformers_js", TransformersJsProvider);
  registered = true;
}
