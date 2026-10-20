/**
 * Inert `useWorkflowRunner` module for widget tests that never run a workflow.
 * Use inside a `jest.mock` factory, which is hoisted above imports:
 *
 *   jest.mock("../../../stores/WorkflowRunner", () =>
 *     jest.requireActual("../../../test-utils/workflowRunnerMock").workflowRunnerMock()
 *   );
 */
export function workflowRunnerMock() {
  return {
    useWorkflowRunner: () => ({
      getState: () => ({
        job_id: null,
        run: jest.fn().mockResolvedValue(undefined),
        cancel: jest.fn().mockResolvedValue(undefined)
      }),
      subscribe: () => () => {}
    })
  };
}
