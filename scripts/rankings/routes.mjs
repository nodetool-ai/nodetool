/**
 * The route universe for the model-rankings sync: every `<provider>:<model_id>`
 * NodeTool's own providers list for image, video, speech and music.
 *
 * It is read from the built `@nodetool-ai/runtime` providers — the same
 * `getAvailable*Models()` methods the model picker calls — so a model a user
 * can select is a model the sync can rank, and nothing else (no price catalog)
 * decides that. Those methods answer from node manifests and static lists, so
 * the load needs no network and no real key: each provider gets a placeholder
 * secret, and `fetch` is blocked while they load so a provider that tried to
 * reach out would fail loudly instead of slowing the run.
 *
 * A provider that lists nothing is an error, not an empty answer: its routes
 * would vanish from the artifact without anyone noticing.
 */

/**
 * The providers whose models the leaderboards can rank, keyed by the id the
 * artifact uses, with the export name of each provider class in
 * `@nodetool-ai/runtime`.
 */
export const RANKED_PROVIDERS = {
  atlascloud: "AtlasCloudProvider",
  elevenlabs: "ElevenLabsProvider",
  fal_ai: "FalProvider",
  gemini: "GeminiProvider",
  kie: "KieProvider",
  minimax: "MinimaxProvider",
  openai: "OpenAIProvider",
  replicate: "ReplicateProvider",
  together: "TogetherProvider"
};

/** Provider list method → the task its models serve when they declare none. */
const LIST_METHODS = [
  ["getAvailableImageModels", null],
  ["getAvailableVideoModels", null],
  ["getAvailableTTSModels", "text_to_speech"],
  ["getAvailableMusicModels", "text_to_music"]
];

/** Any secret a provider constructor asks for gets a placeholder. */
const PLACEHOLDER_SECRETS = new Proxy(
  {},
  { get: (_target, name) => (typeof name === "string" ? "placeholder" : undefined) }
);

/**
 * Collect the routes one provider lists. `tasks` is the union of what its
 * models declare per list; a route with any list that declares none keeps an
 * empty `tasks`, which the matcher never filters.
 */
export async function routesOfProvider(providerId, provider) {
  const found = new Map();
  for (const [method, implicitTask] of LIST_METHODS) {
    if (typeof provider[method] !== "function") continue;
    const models = await provider[method]();
    for (const model of models ?? []) {
      if (!model?.id) continue;
      const declared = Array.isArray(model.supportedTasks)
        ? model.supportedTasks.filter((t) => typeof t === "string")
        : [];
      const tasks = declared.length > 0 ? declared : implicitTask ? [implicitTask] : [];
      const entry = found.get(model.id) ?? {
        provider: providerId,
        modelId: model.id,
        name: typeof model.name === "string" ? model.name : undefined,
        taskSet: new Set(),
        unrestricted: false
      };
      if (tasks.length === 0) entry.unrestricted = true;
      for (const task of tasks) entry.taskSet.add(task);
      found.set(model.id, entry);
    }
  }
  return [...found.values()].map(({ taskSet, unrestricted, ...route }) => ({
    ...route,
    tasks: unrestricted ? [] : [...taskSet].sort()
  }));
}

/**
 * Every ranked provider's routes, plus a per-provider count for the run
 * report. Throws when the runtime is not built, or when a provider lists
 * nothing.
 */
export async function loadProviderRoutes({ runtime } = {}) {
  const mod =
    runtime ??
    (await import("@nodetool-ai/runtime").catch((err) => {
      throw new Error(
        `Cannot load @nodetool-ai/runtime — run \`npm run build:packages\` first (${
          err instanceof Error ? err.message : err
        })`
      );
    }));

  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("rankings route listing must not use the network");
  };
  const routes = [];
  const providers = {};
  try {
    for (const [providerId, className] of Object.entries(RANKED_PROVIDERS)) {
      const Provider = mod[className];
      if (typeof Provider !== "function") {
        throw new Error(`@nodetool-ai/runtime does not export ${className}`);
      }
      const listed = await routesOfProvider(
        providerId,
        new Provider(PLACEHOLDER_SECRETS)
      );
      if (listed.length === 0) {
        throw new Error(`${providerId} listed no models — refusing to rank without them`);
      }
      providers[providerId] = listed.length;
      routes.push(...listed);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  return { routes, providers };
}
