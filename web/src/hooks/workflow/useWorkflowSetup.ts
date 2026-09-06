/**
 * The Workflow flow's state, which lives on the workflow it produces
 * (PRD § 11.5, D19).
 *
 * `settings.setup` is one optional field on a bag the workflow already carries,
 * so a workflow saved before the flow existed reads stage `done` and opens as
 * the editor it always did (criterion 2). Every write merges — the brief as it
 * is typed, then the category, then the plan — and leaves the rest of
 * `settings` untouched, because other surfaces keep their own keys there.
 *
 * The flow is a function of what is on the document plus the live registry, so
 * any host — the New Project tab, a workflow tab — builds the same steps from a
 * workflow id and resumes at the same place.
 */

import { useCallback } from "react";
import {
  readWorkflowSetup,
  writeWorkflowSetup,
  type WorkflowSetup,
  type WorkflowSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  useWorkflowManager,
  useWorkflowManagerStore
} from "../../contexts/WorkflowManagerContext";

/** A workflow that has no `settings.setup` is finished, not mid-flow. */
export const useWorkflowSetupStage = (workflowId: string): WorkflowSetupStage =>
  useWorkflowManager(
    (state) =>
      readWorkflowSetup(state.getWorkflow(workflowId)?.settings)?.stage ?? "done"
  );

/** The whole setup record, or null on a workflow that never went through it. */
export const useWorkflowSetupDocument = (
  workflowId: string
): WorkflowSetup | null =>
  useWorkflowManager(
    (state) => readWorkflowSetup(state.getWorkflow(workflowId)?.settings) ?? null
  );

export interface WorkflowSetupWriter {
  /** Merge a patch into `settings.setup` and persist it. */
  setSetup: (patch: Partial<WorkflowSetup>) => Promise<void>;
}

/**
 * Write setup answers back onto the workflow.
 *
 * The write goes through the manager's `updateWorkflow` (so the open editor and
 * the tab list see it at once) and then `saveWorkflow` (so a reload resumes at
 * the same step). A refused save rejects rather than resolving quietly: the
 * shell puts the reason on the button, and a stage that did not persist would
 * otherwise strand the creator one refresh later.
 */
export const useWorkflowSetupWriter = (
  workflowId: string
): WorkflowSetupWriter => {
  const store = useWorkflowManagerStore();

  const setSetup = useCallback(
    async (patch: Partial<WorkflowSetup>) => {
      const state = store.getState();
      const workflow = state.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} is not open.`);
      }
      const settings = writeWorkflowSetup(workflow.settings, patch);
      state.updateWorkflow({ ...workflow, settings });
      // The row's graph can be behind the canvas — the build places nodes and
      // then writes stage `done` — so save what the editor holds when there is
      // one, and the stored graph when there is not.
      const live = state.getNodeStore(workflowId)?.getState().getWorkflow();
      await state.saveWorkflow({ ...(live ?? workflow), settings });
    },
    [store, workflowId]
  );

  return { setSetup };
};
