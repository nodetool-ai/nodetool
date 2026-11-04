export const isTorchWorkflow = (workflow: {
  settings?: Record<string, unknown> | null;
}): boolean => {
  const execution = workflow.settings?.execution;
  return (
    typeof execution === "object" &&
    execution !== null &&
    "kind" in execution &&
    execution.kind === "torch"
  );
};
