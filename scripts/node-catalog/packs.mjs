import { NODE_PACKS } from "./tiers.mjs";

const registrars = {
  "whisper-cpp": "registerWhisperCppNodes",
  elevenlabs: "registerElevenLabsNodes",
  minimax: "registerMinimaxNodes",
  "transformers-js": "registerTransformersJsNodes",
  fal: "registerFalNodes",
  kie: "registerKieNodes",
  topaz: "registerTopazNodes",
  reve: "registerReveNodes",
  atlascloud: "registerAtlasCloudNodes",
  higgsfield: "registerHiggsfieldNodes",
  together: "registerTogetherNodes",
  replicate: "registerReplicateNodes",
  huggingface: "registerHuggingFaceNodes",
  image: "registerImageNodes",
  audio: "registerAudioNodes",
  video: "registerVideoNodes",
  document: "registerDocumentNodes",
  game: "registerGameNodes",
  blender: "registerBlenderNodes",
  manimgx: "registerManimgxNodes",
  automation: "registerAutomationNodes",
  integration: "registerIntegrationNodes"
};

const secrets = {
  llm: ["GEMINI_API_KEY", "MISTRAL_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY"],
  integration: ["KIE_API_KEY", "COMFY_API_KEY", "DISCORD_BOT_TOKEN", "TELEGRAM_BOT_TOKEN"],
  elevenlabs: ["ELEVENLABS_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  fal: ["FAL_API_KEY"],
  kie: ["KIE_API_KEY"],
  topaz: ["TOPAZ_API_KEY"],
  reve: ["REVE_API_KEY"],
  atlascloud: ["ATLASCLOUD_API_KEY"],
  higgsfield: ["HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET"],
  together: ["TOGETHER_API_KEY"],
  replicate: ["REPLICATE_API_TOKEN"],
  huggingface: ["HF_TOKEN"]
};

// Packs whose nodes decode or encode media need "media-codecs" (node-av), and
// packs that render on the GPU need "webgpu". The default CLI and cli-chat
// leave both out.
const runtimeLibraries = {
  "whisper-cpp": ["whisper-cpp"],
  "transformers-js": ["transformers-js", "media-codecs"],
  image: ["imaging"],
  audio: ["imaging", "media-codecs"],
  video: ["imaging", "media-codecs", "webgpu"],
  game: ["imaging", "rapier", "media-codecs", "webgpu"],
  document: ["imaging", "pdf-js"],
  automation: ["imaging"],
  blender: ["media-codecs"],
  topaz: ["media-codecs"]
};

const featureRuntimeLibraries = {
  "cli-server": ["media-codecs", "webgpu"],
  "cli-timeline": ["media-codecs", "webgpu"],
  "cli-game": ["media-codecs", "webgpu"]
};

export const CLI_FEATURE_PACKS = [
  "cli-workflow", "cli-harness", "cli-chat", "cli-models", "cli-admin", "cli-mcp",
  "cli-server", "cli-apps", "cli-game", "cli-timeline", "cli-sketch", "cli-script"
].map(id => ({
  id, npmName: `@nodetool-ai/${id}`, registrar: "feature", kind: "cli-feature",
  requires: ["cli-workflow", "cli-mcp", "cli-server"].includes(id) ? ["core", "text"] : [], provides: [], runtimeLibraries: featureRuntimeLibraries[id] ?? [], secrets: []
}));

export const CATALOG_PACKS = [
  ...CLI_FEATURE_PACKS,
  ...[
    ["core", "registerCoreNodes"],
    ["text", "registerTextNodes"],
    ["data", "registerDataNodes"],
    ["llm", "registerLlmNodes"],
    ["code", "registerCodeNodes"]
  ].map(([id, registrar]) => ({
    id,
    npmName: `@nodetool-ai/${id}-nodes`,
    registrar,
    kind: "core",
    provides: [],
    runtimeLibraries: id === "data" ? ["imaging"] : [],
    secrets: secrets[id] ?? []
  })),
  ...NODE_PACKS.map((pack) => ({
    ...pack,
    kind: "node-pack",
    registrar: registrars[pack.id],
    runtimeLibraries: runtimeLibraries[pack.id] ?? [],
    secrets: secrets[pack.id] ?? []
  }))
];
