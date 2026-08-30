/**
 * The models NodeTool can actually run, asked of the providers themselves.
 *
 * Every provider already answers `getAvailableImageModels` /
 * `getAvailableVideoModels` / `getAvailableTTSModels` — that list is what the
 * model picker shows, so it is the only correct answer to "which ids can land
 * on a node". Reading it here means the GenSpend sync can never invent an id
 * NodeTool does not ship, and never goes stale against a provider's catalog.
 *
 * The listings are static or manifest-backed, so a placeholder key is enough:
 * providers that would need a real key (or a network call) to enumerate simply
 * return nothing and are reported as uncovered.
 *
 * Needs `npm run build:packages` — it imports the built runtime.
 */

const PROVIDER_SPECS = [
  { providerId: "fal_ai", className: "FalProvider", keyName: "FAL_API_KEY" },
  { providerId: "replicate", className: "ReplicateProvider", keyName: "REPLICATE_API_TOKEN" },
  { providerId: "kie", className: "KieProvider", keyName: "KIE_API_KEY" },
  { providerId: "atlascloud", className: "AtlasCloudProvider", keyName: "ATLASCLOUD_API_KEY" },
  { providerId: "together", className: "TogetherProvider", keyName: "TOGETHER_API_KEY" },
  { providerId: "gemini", className: "GeminiProvider", keyName: "GEMINI_API_KEY" },
  { providerId: "openai", className: "OpenAIProvider", keyName: "OPENAI_API_KEY" },
  { providerId: "minimax", className: "MinimaxProvider", keyName: "MINIMAX_API_KEY" },
  { providerId: "elevenlabs", className: "ElevenLabsProvider", keyName: "ELEVENLABS_API_KEY" },
  { providerId: "xai", className: "XAIProvider", keyName: "XAI_API_KEY" },
  { providerId: "topaz", className: "TopazProvider", keyName: "TOPAZ_API_KEY" },
  { providerId: "reve", className: "ReveProvider", keyName: "REVE_API_KEY" },
  { providerId: "aki", className: "AkiProvider", keyName: "AKI_API_KEY" },
  { providerId: "meshy", className: "MeshyProvider", keyName: "MESHY_API_KEY" },
  { providerId: "rodin", className: "RodinProvider", keyName: "RODIN_API_KEY" }
];

const MODALITY_METHODS = [
  ["image", "getAvailableImageModels"],
  ["video", "getAvailableVideoModels"],
  ["audio", "getAvailableTTSModels"],
  ["3d", "getAvailable3DModels"]
];

/** Providers reject a missing key at construction; a placeholder is never sent. */
const PLACEHOLDER_KEY = "genspend-sync-offline";

const LISTING_TIMEOUT_MS = 15_000;

function instantiate(ProviderClass, keyName) {
  for (const args of [
    { [keyName]: PLACEHOLDER_KEY },
    { env: { [keyName]: PLACEHOLDER_KEY } },
    { api_key: PLACEHOLDER_KEY }
  ]) {
    try {
      return new ProviderClass(args);
    } catch {
      // Next constructor shape.
    }
  }
  return null;
}

async function listModels(provider, method) {
  if (typeof provider[method] !== "function") return [];
  const models = await Promise.race([
    provider[method](),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("listing timed out")), LISTING_TIMEOUT_MS)
    )
  ]);
  return Array.isArray(models) ? models : [];
}

/**
 * `{ inventory: {providerId: {modality: [{id, name}]}}, uncovered: [...] }`.
 *
 * A provider that cannot enumerate offline lands in `uncovered` with the reason
 * rather than failing the run — its offerings are then reported as unpriced,
 * which is the honest outcome.
 */
export async function collectProviderInventory({ importRuntime } = {}) {
  const load = importRuntime ?? (() => import("@nodetool-ai/runtime"));
  let runtime;
  try {
    runtime = await load();
  } catch (err) {
    throw new Error(
      `Could not import @nodetool-ai/runtime (run \`npm run build:packages\` first): ${
        err instanceof Error ? err.message : err
      }`
    );
  }

  const inventory = {};
  const uncovered = [];

  for (const { providerId, className, keyName } of PROVIDER_SPECS) {
    const ProviderClass = runtime[className];
    if (typeof ProviderClass !== "function") {
      uncovered.push({ providerId, reason: `no ${className} export` });
      continue;
    }
    const provider = instantiate(ProviderClass, keyName);
    if (!provider) {
      uncovered.push({ providerId, reason: "provider needs a real API key to construct" });
      continue;
    }

    const modalities = {};
    let total = 0;
    for (const [modality, method] of MODALITY_METHODS) {
      try {
        const models = await listModels(provider, method);
        modalities[modality] = models
          .filter((model) => typeof model?.id === "string")
          .map((model) => ({ id: model.id, name: model.name ?? model.id }));
        total += modalities[modality].length;
      } catch {
        // A provider that needs the network to enumerate this modality.
        modalities[modality] = [];
      }
    }

    if (total === 0) {
      uncovered.push({ providerId, reason: "enumerates no models offline" });
      continue;
    }
    inventory[providerId] = modalities;
  }

  return { inventory, uncovered };
}

export { PROVIDER_SPECS };
