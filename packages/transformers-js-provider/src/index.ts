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
  // Runs inside the NodeTool process, so the model picker labels its models
  // as local rather than API. Without metadata the registry assumes a
  // remote API.
  registerProvider(
    "transformers_js",
    TransformersJsProvider,
    {},
    {},
    { access: "in_process", displayName: "Transformers.js" }
  );
  registered = true;
}
