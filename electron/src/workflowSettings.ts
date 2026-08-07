import { Workflow } from "./types";

// `settings` is unvalidated server-side, so a non-string shortcut would reach
// `globalShortcut.register`/`unregister` and throw.
export function workflowShortcut(workflow: Workflow): string | undefined {
  const shortcut = workflow.settings?.shortcut;
  return typeof shortcut === "string" && shortcut.length > 0
    ? shortcut
    : undefined;
}
