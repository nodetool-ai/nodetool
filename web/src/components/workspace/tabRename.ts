import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";

/**
 * Tab types whose title can be renamed in place. Image tabs host the
 * sketch editor in edit mode, so they share the same rename path.
 */
const RENAMEABLE_TYPES = new Set<WorkspaceTabType>([
  "workflow",
  "sketch",
  "image",
  "timeline",
  "storyboard",
  "script",
  "jsscript",
  "model3d",
  "chat"
]);

export const tabCanRename = (type: WorkspaceTabType): boolean =>
  RENAMEABLE_TYPES.has(type);
