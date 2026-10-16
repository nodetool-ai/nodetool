import type { RunState } from "../../../stores/WorkflowRunsStore";

/**
 * What an Output with no value says. A finished run that sent nothing here
 * must not look like no run at all.
 */
export const emptyOutputMessage = (runState: RunState | undefined): string =>
  runState === "completed"
    ? "The last run sent nothing here"
    : "Run to see the output";
