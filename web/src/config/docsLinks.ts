/**
 * Deep links into the documentation site (https://docs.nodetool.ai).
 *
 * One entry per surface that shows a help icon, so a page that moves is
 * renamed here instead of in a dozen components. Paths are extensionless —
 * the docs site's own navigation links that way.
 */

export const DOCS_BASE_URL = "https://docs.nodetool.ai";

export const docsUrl = (path: string): string =>
  `${DOCS_BASE_URL}/${path.replace(/^\//, "")}`;

export const DOCS_PATHS = {
  gettingStarted: "getting-started",
  keyConcepts: "key-concepts",
  userInterface: "user-interface",
  editorPanels: "editor-panels",

  workflows: "workflow-editor",
  nodes: "nodes/",
  nodePacks: "node-packs",
  packages: "packages",
  debugging: "workflow-debugging",
  graphView: "workflow-graph-view",
  chainEditor: "chain-editor",
  templates: "templates-gallery",
  examples: "cookbook",

  chat: "global-chat",
  agents: "global-chat-agents",

  sketches: "sketch-editor",
  timelines: "video-editor",
  storyboards: "creative-agent",
  scripts: "creative-agent",

  apps: "mini-apps",
  appBuilder: "app-builder",

  assets: "asset-management",
  collections: "collections",
  workspaces: "workspaces",
  models: "models",
  modelsManager: "models-manager",
  providers: "models-and-providers",

  configuration: "configuration",
  troubleshooting: "troubleshooting"
} as const;

export type DocsTopic = keyof typeof DOCS_PATHS;

export const docsLink = (topic: DocsTopic): string => docsUrl(DOCS_PATHS[topic]);
