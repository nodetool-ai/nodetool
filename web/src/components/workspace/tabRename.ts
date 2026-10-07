import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";

/** Every advertised rename action names its persistence implementation. */
const RENAME_STRATEGIES = {
  workflow: "workflow",
  sketch: "sketch",
  image: "image",
  svg: "asset",
  timeline: "timeline",
  storyboard: "storyboard",
  script: "script",
  jsscript: "jsscript",
  skill: "skill",
  model3d: "asset",
  chat: "chat",
  application: "application",
  text: "asset",
  project: "project",
  audio: null,
  "workspace-file": null,
  game: null,
  "example-app": null,
  page: null,
  "project-list": null,
  "guided-flow": null,
  "project-new": null
} as const satisfies Record<WorkspaceTabType, string | null>;

export const renameStrategy = (type: WorkspaceTabType) =>
  RENAME_STRATEGIES[type];
export const tabCanRename = (type: WorkspaceTabType): boolean =>
  renameStrategy(type) !== null;
