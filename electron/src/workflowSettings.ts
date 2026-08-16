import { Workflow } from "./types";
import { isNonEmptyString } from "./typePredicates";

// `settings` is unvalidated server-side, so a non-string shortcut would reach
// `globalShortcut.register`/`unregister` and throw.
export function workflowShortcut(workflow: Workflow): string | undefined {
  const shortcut = workflow.settings?.shortcut;
  return isNonEmptyString(shortcut) ? shortcut : undefined;
}
