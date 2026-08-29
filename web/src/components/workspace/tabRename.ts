import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";

/**
 * Tab types whose title can be renamed in place. Image tabs host the
 * sketch editor in edit mode, so they share the same rename path.
 * Text tabs cover markdown and other text assets. A project's overview tab
 * carries the project's own name, so renaming it renames the project.
 */
const RENAMEABLE_TYPES = new Set<WorkspaceTabType>([
  "workflow",
  "sketch",
  "image",
  "timeline",
  "storyboard",
  "script",
  "jsscript",
  "skill",
  "model3d",
  "chat",
  "application",
  "text",
  "project"
]);

export const tabCanRename = (type: WorkspaceTabType): boolean =>
  RENAMEABLE_TYPES.has(type);
