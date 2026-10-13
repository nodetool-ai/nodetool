/** Shared CLI pack tiers from docs/cli-pack-system-design.md section 4 and plan D17–D18. */
export const CORE_PACKAGES = [
  "cli", "protocol", "config", "security", "auth", "storage", "models",
  "node-sdk", "kernel", "runtime", "execution", "agents", "chat", "websocket",
  "dsl", "vectorstore", "app-runtime", "app-export", "compute", "model-pricing",
  "timeline", "gpu", "storyboard", "image-editor", "model3d", "browser",
  "sandbox-compiler", "huggingface", "game-runtime", "deploy", "telegram", "sdk",
  "nodes-utils", "core-nodes", "text-nodes", "data-nodes", "llm-nodes",
  "code-nodes", "node-catalog"
].map((name) => `@nodetool-ai/${name}`);

export const NODE_PACKS = [
  "whisper-cpp", "elevenlabs", "minimax", "transformers-js", "fal", "kie",
  "topaz", "reve", "atlascloud", "higgsfield", "together", "replicate",
  "huggingface", "image", "audio", "video", "document", "game", "blender",
  "manimgx", "automation", "integration"
].map((id) => ({
  id,
  npmName: `@nodetool-ai/${id === "whisper-cpp" ? id : `${id}-nodes`}`,
  provides: id === "game" ? ["@nodetool-ai/game-renderer"]
    : id === "transformers-js" ? ["@nodetool-ai/transformers-js-provider"] : []
}));

export const RUNTIME_LIBRARIES = [
  { id: "imaging", packages: ["sharp", "@napi-rs/canvas"] },
  { id: "node-llama-cpp", packages: ["node-llama-cpp"] },
  { id: "typescript", packages: ["typescript"] },
  { id: "tokenizer", packages: ["js-tiktoken"] },
  { id: "tracing", packages: ["@opentelemetry/core", "@opentelemetry/resources", "@opentelemetry/sdk-trace-base"] },
  { id: "esbuild", packages: ["esbuild"] }
];
