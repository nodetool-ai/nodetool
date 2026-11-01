/** Command ownership for independently installed CLI features. */
export const COMMAND_FEATURES: Readonly<Record<string, string>> = {
  chat: "cli-chat", agent: "cli-chat", tools: "cli-chat",
  presets: "cli-models", models: "cli-models", providers: "cli-models",
  run: "cli-workflow", validate: "cli-workflow", workflows: "cli-workflow",
  jobs: "cli-workflow", assets: "cli-workflow", secrets: "cli-workflow",
  debug: "cli-workflow", node: "cli-workflow", settings: "cli-workflow",
  runs: "cli-workflow", generate: "cli-workflow", generations: "cli-workflow",
  projects: "cli-workflow", collections: "cli-workflow",
  errors: "cli-workflow", costs: "cli-workflow",
  "export-script": "cli-workflow", "export-dsl": "cli-workflow",
  "export-example": "cli-workflow", examples: "cli-workflow", "export-bundle": "cli-workflow", "import-bundle": "cli-workflow",
  harness: "cli-harness", affected: "cli-harness", eval: "cli-harness", jtbd: "cli-harness", reliability: "cli-harness",
  deploy: "cli-admin", worker: "cli-admin", db: "cli-admin", auth: "cli-admin",
  package: "cli-admin", packs: "cli-admin", runtime: "cli-admin", extension: "cli-admin", extensions: "cli-admin",
  storage: "cli-admin", telemetry: "cli-admin", telegram: "cli-admin",
  "migrate-keys": "cli-admin", "migrate-code-inputs": "cli-admin",
  mcp: "cli-mcp", server: "cli-server", app: "cli-apps", apps: "cli-apps",
  game: "cli-game", timeline: "cli-timeline", sketch: "cli-sketch", jsscript: "cli-script"
};
